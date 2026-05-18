import logging
import datetime
from datetime import timedelta

import requests
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import (
    WeatherHistory,
    UserLocation,
    DiseaseRisk,
    Events,
)
from app.core.schemas import EventType, StatusType
from app.core.config import HASKELL_SERVICE_URL, MIN_RECORDS_7D
from app.utils.general import r, _make_event_hash

logger = logging.getLogger(__name__)

MIN_RECORDS_48H = 24
MIN_RECORDS_10D = 168


def _serialize_wp(record: WeatherHistory) -> dict:
    return {
        "t":  record.temp,
        "h":  record.humidity,
        "r":  record.rain or 0.0,
        "dt": record.timestamp.isoformat(),
        "p":       record.pressure,
        "ws":      record.wind_speed,
        "wd":      record.wind_deg,
        "cc":      record.cloud_coverage,
        "s":       record.snowfall or 0.0,
        "is_night": record.is_night,
    }


def _call_haskell_disease(payload: dict) -> dict | None:
    try:
        response = requests.post(
            HASKELL_SERVICE_URL,
            json={"config": 7, "raw_data": payload},
            timeout=15,
        )
        if response.status_code == 200:
            return response.json()
        logger.error(
            "Haskell disease service returned %d: %s",
            response.status_code, response.text,
        )
        return None
    except Exception as exc:
        logger.error("Haskell disease service error: %s", exc)
        return None


_DISEASE_EVENT_TYPE = EventType.DISEASE_DETECTION

_ALERT_MODELS = [
    ("botrytis_action",   "botrytis_risk_level",    "botrytis_hours_48h",   "Botrytis"),
    ("tomcast_action",    None,                      "tomcast_dsv_7d",       "TOMCAST"),
    ("blitecast_action",  "blitecast_risk_level",    "blitecast_p_value_7d", "Blitecast"),
    ("plasmopara_action", "plasmopara_risk_level",   "plasmopara_epi",       "Plasmopara viticola"),
]

_SEVERITY_MAP = {
    "NO_RISK":  None,
    "LOW":      None,
    "MODERATE": "WARNING",
    "HIGH":     "CRITICAL",
    "VERY_HIGH": "CRITICAL",
}


def _dedup_key(location_id: int, model: str) -> str:
    return f"disease:{model.lower().replace(' ', '_')}:{location_id}"


def _get_active_disease_event(db: Session, location_id: int, model: str) -> Events | None:
    key = _dedup_key(location_id, model)
    return db.execute(
        select(Events).where(
            Events.dedup_key == key,
            Events.status == StatusType.ACTIVE,
        )
    ).scalar_one_or_none()


def _create_disease_event(
    db: Session,
    location: UserLocation,
    model: str,
    severity: str,
    extra: dict,
) -> None:
    key = _dedup_key(location.id, model)
    event_hash = _make_event_hash(location.id, _DISEASE_EVENT_TYPE, key)

    existing = db.execute(
        select(Events).where(Events.event_hash == event_hash)
    ).scalar_one_or_none()
    if existing:
        existing.extra_metadata = {**(existing.extra_metadata or {}), **extra}
        existing.updated_at = datetime.datetime.utcnow()
        return

    event = Events(
        user_id=location.user_id,
        event_type=_DISEASE_EVENT_TYPE,
        event_hash=event_hash,
        dedup_key=key,
        severity=severity,
        status=StatusType.ACTIVE,
        extra_metadata={
            "location_id": location.id,
            "location_label": location.label,
            "model": model,
            **extra,
        },
    )
    db.add(event)
    logger.warning(
        "Disease alert [%s] %s for location %d (%s)",
        severity, model, location.id, location.label,
    )


def _resolve_disease_event(db: Session, location_id: int, model: str) -> None:
    event = _get_active_disease_event(db, location_id, model)
    if event:
        event.status = StatusType.RESOLVED
        event.updated_at = datetime.datetime.utcnow()
        logger.info(
            "Disease risk [%s] resolved for location %d", model, location_id
        )


def _process_alerts(
    db: Session,
    location: UserLocation,
    result: dict,
) -> None:
    for action_key, level_key, value_key, label in _ALERT_MODELS:
        action  = result.get(action_key, False)
        level   = result.get(level_key, "LOW") if level_key else ("HIGH" if action else "LOW")
        value   = result.get(value_key)
        severity = _SEVERITY_MAP.get(level)

        if action and severity:
            _create_disease_event(
                db, location, label, severity,
                extra={
                    "risk_level": level,
                    "value": value,
                    "action_key": action_key,
                },
            )
        else:
            _resolve_disease_event(db, location.id, label)



def _null_entry(location: UserLocation, record: WeatherHistory) -> DiseaseRisk:
    return DiseaseRisk(
        location_id=location.id,
        reference_weather_id=record.id,
        window_end_date=record.timestamp,
        any_action_required=False,
    )


def disease_risk(db: Session, location: UserLocation) -> None:

    pending = (
        db.query(WeatherHistory)
        .filter(
            WeatherHistory.location_id == location.id,
            WeatherHistory.metrics_status == True,
        )
        .outerjoin(
            DiseaseRisk,
            (DiseaseRisk.reference_weather_id == WeatherHistory.id),
        )
        .filter(DiseaseRisk.id == None)
        .order_by(WeatherHistory.timestamp.asc())
        .all()
    )

    if not pending:
        return

    for record in pending:
        end_date  = record.timestamp
        start_48h = end_date - timedelta(hours=48)
        start_7d  = end_date - timedelta(days=7)
        start_10d = end_date - timedelta(days=10)

        def _window(start):
            return (
                db.query(WeatherHistory)
                .filter(
                    WeatherHistory.location_id == location.id,
                    WeatherHistory.timestamp.between(start, end_date),
                )
                .order_by(WeatherHistory.timestamp.asc())
                .all()
            )

        h48  = _window(start_48h)
        h7d  = _window(start_7d)
        h10d = _window(start_10d)

        bbch_stage: int | None = None
        if location.fields:
            active_fields = [
                f for f in location.fields
                if f.status == "active" and f.bbch_stage is not None
            ] if hasattr(location.fields[0], "bbch_stage") else []
            if active_fields:
                bbch_stage = max(active_fields, key=lambda f: f.updated_at).bbch_stage


        if len(h48) < MIN_RECORDS_48H or len(h7d) < MIN_RECORDS_7D:
            db.add(_null_entry(location, record))
            try:
                db.commit()
            except Exception as exc:
                db.rollback()
                logger.error("Failed to save null DiseaseRisk: %s", exc)
            continue

        payload = {
            "history_48h":  [_serialize_wp(h) for h in h48],
            "history_7d":   [_serialize_wp(h) for h in h7d],
            "history_10d":  [_serialize_wp(h) for h in h10d],
            "bbch_stage":   bbch_stage,
        }

        result = _call_haskell_disease(payload)

        if result:
            entry = DiseaseRisk(
                location_id=location.id,
                reference_weather_id=record.id,
                window_end_date=end_date,

                botrytis_hours_48h      = result.get("botrytis_hours_48h"),
                botrytis_risk_level     = result.get("botrytis_risk_level"),
                botrytis_action_required= result.get("botrytis_action"),

                tomcast_dsv_7d          = r(result.get("tomcast_dsv_7d")),
                tomcast_action_required = result.get("tomcast_action"),

                blitecast_p_value_day   = result.get("blitecast_p_value_day"),
                blitecast_p_value_7d    = r(result.get("blitecast_p_value_7d")),
                blitecast_dsv_7d        = r(result.get("blitecast_dsv_7d")),
                blitecast_risk_level    = result.get("blitecast_risk_level"),
                blitecast_action_required = result.get("blitecast_action"),

                plasmopara_bbch_stage   = bbch_stage,
                plasmopara_leaf_wetness_hours = result.get("plasmopara_wetness_24h"),
                plasmopara_rain_10d     = r(result.get("plasmopara_rain_10d")),
                plasmopara_rule_triggered = result.get("plasmopara_rule_ok"),
                plasmopara_epi          = r(result.get("plasmopara_epi")),
                plasmopara_risk_level   = result.get("plasmopara_risk_level"),
                plasmopara_action_required = result.get("plasmopara_action"),

                any_action_required     = result.get("any_action_required", False),
                computed_at             = datetime.datetime.utcnow(),
            )
        else:
            entry = _null_entry(location, record)

        db.add(entry)

        if result:
            _process_alerts(db, location, result)

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error(
                "Failed to save DiseaseRisk for record %d: %s", record.id, exc
            )