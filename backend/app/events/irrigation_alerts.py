import datetime
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import Events, FieldUnit, IrrigationRecommendation, UserLocation
from app.core.schemas import EventType, StatusType
from app.services.irrigation_service import run_irrigation_recommendations
from app.utils.general import _make_event_hash
from app.api.endpoints.alert_suppression import is_suppressed

logger = logging.getLogger(__name__)

_EVENT_TYPE = EventType.LOW_SOIL_MOISTURE
_MIN_ALERT_URGENCY = {"MODERATE", "HIGH", "CRITICAL"}
_SEVERITY_BY_URGENCY = {
    "MODERATE": "WARNING",
    "HIGH": "HIGH",
    "CRITICAL": "CRITICAL",
}


def _dedup_key(field_id: int) -> str:
    return f"irrigation:{field_id}"


def _get_active_irrigation_event(db: Session, field_id: int) -> Events | None:
    return db.execute(
        select(Events).where(
            Events.dedup_key == _dedup_key(field_id),
            Events.status == StatusType.ACTIVE,
        )
    ).scalar_one_or_none()


def _field_and_location(
    db: Session,
    rec: IrrigationRecommendation,
) -> tuple[FieldUnit | None, UserLocation | None]:
    field = db.query(FieldUnit).filter(FieldUnit.id == rec.field_id).first()
    location = db.query(UserLocation).filter(UserLocation.id == rec.location_id).first()
    return field, location


def _create_or_update_irrigation_event(
    db: Session,
    rec: IrrigationRecommendation,
) -> bool | None:
    field, location = _field_and_location(db, rec)
    if not location:
        logger.warning(
            "Skipping irrigation alert for field=%s: location=%s not found",
            rec.field_id,
            rec.location_id,
        )
        return None

    now = datetime.datetime.utcnow()
    key = _dedup_key(rec.field_id)
    event_hash = _make_event_hash(rec.field_id, _EVENT_TYPE, key)
    severity = _SEVERITY_BY_URGENCY.get(rec.urgency, "WARNING")
    metadata = {
        "field_id": rec.field_id,
        "field_label": field.label if field else None,
        "location_id": rec.location_id,
        "location_label": location.label,
        "urgency": rec.urgency,
        "score": rec.score,
        "recommended_mm": rec.recommended_mm,
        "total_volume_m3": rec.total_volume_m3,
        "rain_cum_7d": rec.rain_cum_7d,
        "water_deficit_7d": rec.water_deficit_7d,
        "soil_moisture": rec.soil_moisture,
        "reason": rec.reason,
        "window_end_date": rec.window_end_date.isoformat() if rec.window_end_date else None,
    }

    existing = db.execute(
        select(Events).where(Events.event_hash == event_hash)
    ).scalar_one_or_none()

    if existing:
        existing.status = StatusType.ACTIVE
        existing.severity = severity
        existing.updated_at = now
        existing.expires_at = now + datetime.timedelta(days=2)
        existing.extra_metadata = metadata
        return False

    db.add(
        Events(
            user_id=location.user_id,
            event_type=_EVENT_TYPE,
            event_hash=event_hash,
            dedup_key=key,
            severity=severity,
            status=StatusType.ACTIVE,
            expires_at=now + datetime.timedelta(days=2),
            extra_metadata=metadata,
        )
    )
    return True


def _resolve_irrigation_event(db: Session, field_id: int) -> bool:
    event = _get_active_irrigation_event(db, field_id)
    if not event:
        return False

    now = datetime.datetime.utcnow()
    event.status = StatusType.RESOLVED
    event.updated_at = now
    meta = dict(event.extra_metadata or {})
    meta["resolved_at"] = now.isoformat()
    event.extra_metadata = meta
    return True


def check_irrigation_alerts(db: Session) -> dict:
    recs = run_irrigation_recommendations(db)
    stats = {
        "recommendations_checked": len(recs),
        "created": 0,
        "updated": 0,
        "resolved": 0,
    }

    for rec in recs:
        needs_alert = rec.should_irrigate and rec.urgency in _MIN_ALERT_URGENCY
        if needs_alert:
            # ── suppression check ──────────────────────────────────────────
            field, location = _field_and_location(db, rec)
            if location and is_suppressed(
                db,
                user_id=location.user_id,
                alert_type=_EVENT_TYPE.value,
                field_id=rec.field_id,
                crop_type=field.crop_type if field else None,
                location_id=rec.location_id,
            ):
                stats["suppressed"] = stats.get("suppressed", 0) + 1
                logger.debug(
                    "[SUPPRESSED] irrigation alert field=%d suppressed by user rule",
                    rec.field_id,
                )
                continue
            # ──────────────────────────────────────────────────────────────
            created = _create_or_update_irrigation_event(db, rec)
            if created is not None:
                stats["created" if created else "updated"] += 1
        else:
            if _resolve_irrigation_event(db, rec.field_id):
                stats["resolved"] += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("check_irrigation_alerts: commit failed: %s", exc)
        raise

    logger.info("check_irrigation_alerts finished: %s", stats)
    return stats