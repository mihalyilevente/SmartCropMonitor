from __future__ import annotations

import datetime
import logging
from typing import Optional

import requests
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import HASKELL_SERVICE_URL
from app.core.database import (
    FieldData, FieldUnit, UserLocation,
    WeatherHistory, WeatherMetrics, IrrigationRecommendation
)

logger = logging.getLogger(__name__)

# HASKELL config = 8

IRRIGATION_WINDOW_DAYS = 7
SOIL_MOISTURE_MAX_AGE = datetime.timedelta(hours=36)
FIELD_METRIC_MAX_AGE = datetime.timedelta(days=21)

def _call_haskell_irrigation(payload: dict) -> Optional[dict]:

    try:
        response = requests.post(
            HASKELL_SERVICE_URL,
            json={"config": 8, "raw_data": payload},
            timeout=15,
        )
        if response.status_code == 200:
            return response.json()
        logger.error(
            "[IRRIGATION] Haskell returned %d: %s",
            response.status_code, response.text[:300],
        )
    except Exception as exc:
        logger.error("[IRRIGATION] Haskell communication error: %s", exc)
    return None


def _latest_metrics(
    db: Session,
    location_id: int,
    as_of: datetime.datetime,
) -> Optional[WeatherMetrics]:
    return (
        db.query(WeatherMetrics)
        .filter(
            WeatherMetrics.location_id == location_id,
            WeatherMetrics.window_end_date <= as_of,
        )
        .order_by(WeatherMetrics.window_end_date.desc())
        .first()
    )


def _latest_weather(
    db: Session,
    location_id: int,
    as_of: datetime.datetime,
) -> Optional[WeatherHistory]:
    return (
        db.query(WeatherHistory)
        .filter(
            WeatherHistory.location_id == location_id,
            WeatherHistory.timestamp <= as_of,
        )
        .order_by(WeatherHistory.timestamp.desc())
        .first()
    )


def _latest_field_metric(
    db: Session,
    field_id: int,
    metric: str,
    as_of: datetime.datetime,
) -> Optional[float]:
    min_ts = as_of - FIELD_METRIC_MAX_AGE
    row = (
        db.query(FieldData)
        .filter(
            FieldData.field_id == field_id,
            FieldData.metric_type == metric,
            FieldData.timestamp <= as_of,
            FieldData.timestamp >= min_ts,
        )
        .order_by(FieldData.timestamp.desc())
        .first()
    )
    return float(row.mean_metric) if row and row.mean_metric is not None else None


def _precipitation_mm(record: WeatherHistory) -> float:
    if record.precipitation is not None:
        return max(0.0, float(record.precipitation))

    components = (record.rain, record.showers, record.snowfall)
    return sum(max(0.0, float(v)) for v in components if v is not None)


def _recent_weather_window(
    db: Session,
    location_id: int,
    end_date: datetime.datetime,
    days: int = IRRIGATION_WINDOW_DAYS,
) -> list[WeatherHistory]:
    start_date = end_date - datetime.timedelta(days=days)
    return (
        db.query(WeatherHistory)
        .filter(
            WeatherHistory.location_id == location_id,
            WeatherHistory.timestamp > start_date,
            WeatherHistory.timestamp <= end_date,
        )
        .order_by(WeatherHistory.timestamp.asc())
        .all()
    )


def _latest_fresh_soil_moisture(
    weather_window: list[WeatherHistory],
    as_of: datetime.datetime,
) -> Optional[float]:
    min_ts = as_of - SOIL_MOISTURE_MAX_AGE
    for record in reversed(weather_window):
        if record.timestamp < min_ts:
            break
        if record.soil_moisture_0_to_1cm is not None:
            return float(record.soil_moisture_0_to_1cm)
    return None


def _recent_precipitation(weather_window: list[WeatherHistory]) -> Optional[float]:
    if not weather_window:
        return None
    return round(sum(_precipitation_mm(record) for record in weather_window), 6)


def _adjust_water_deficit_for_recent_precip(
    metrics: WeatherMetrics,
    rain_cum_7d: Optional[float],
) -> Optional[float]:
    if metrics.water_deficit_7d is None:
        return None
    if rain_cum_7d is None or metrics.rain_cum_7d is None:
        return metrics.water_deficit_7d

    extra_precip = max(0.0, rain_cum_7d - metrics.rain_cum_7d)
    return round(metrics.water_deficit_7d - extra_precip, 6)


def _build_weather_context(
    metrics: WeatherMetrics,
    weather_window: list[WeatherHistory],
    as_of: datetime.datetime,
) -> dict:
    temp_mean_7d = None
    if metrics.temp_min_day_7d is not None and metrics.temp_max_day_7d is not None:
        temp_mean_7d = round((metrics.temp_min_day_7d + metrics.temp_max_day_7d) / 2.0, 2)

    rain_cum_7d = _recent_precipitation(weather_window)
    if rain_cum_7d is None:
        rain_cum_7d = metrics.rain_cum_7d

    latest_weather = weather_window[-1] if weather_window else None

    return {
        "et0":              metrics.et0,
        "water_deficit_7d": _adjust_water_deficit_for_recent_precip(metrics, rain_cum_7d),
        "water_deficit_30d":metrics.water_deficit_30d,
        "rain_cum_7d":      rain_cum_7d,
        "rain_cum_30d":     metrics.rain_cum_30d,
        "spi_1m":           metrics.spi_1m,
        "soil_moisture":    _latest_fresh_soil_moisture(weather_window, as_of),
        "vpd":              latest_weather.vapour_pressure_deficit if latest_weather else None,
        "temp_mean_7d":     temp_mean_7d,
        "hum_mean_7d":      metrics.humidity_mean_7d,
    }


def _build_field_inputs(
    db: Session,
    fields: list[FieldUnit],
    as_of: datetime.datetime,
) -> list[dict]:
    result = []
    for f in fields:
        result.append({
            "field_id":    f.id,
            "field_label": f.label or str(f.id),
            "field_type":  f.field_type.value if f.field_type else "other",
            "crop_type":   f.crop_type,
            "area_ha":     float(f.area_ha) if f.area_ha else None,
            "ndwi_mean":   _latest_field_metric(db, f.id, "ndwi", as_of),
            "ndvi_mean":   _latest_field_metric(db, f.id, "ndvi", as_of),
        })
    return result


def _upsert_recommendation(
    db: Session,
    field_advice: dict,
    location_id: int,
    window_end_date: datetime.datetime,
) -> Optional[IrrigationRecommendation]:
    field_id = field_advice.get("field_id")
    if field_id is None:
        return None

    reason_list: list[str] = field_advice.get("reason", [])
    reason_str = "; ".join(reason_list) if reason_list else "No stress signals detected."

    values = dict(
        urgency           = field_advice.get("urgency", "NONE"),
        should_irrigate   = field_advice.get("should_irrigate", False),
        score             = field_advice.get("score"),
        recommended_mm    = field_advice.get("recommended_mm"),
        recommended_m3_ha = field_advice.get("recommended_m3_ha"),
        total_volume_m3   = field_advice.get("total_volume_m3"),
        et0               = field_advice.get("et0"),
        water_deficit_7d  = field_advice.get("water_deficit_7d"),
        rain_cum_7d       = field_advice.get("rain_cum_7d"),
        soil_moisture     = field_advice.get("soil_moisture"),
        ndwi_mean         = field_advice.get("ndwi_mean"),
        spi_1m            = field_advice.get("spi_1m"),
        reason            = reason_str,
        haskell_snapshot  = field_advice,
        computed_at       = datetime.datetime.utcnow(),
    )

    existing = (
        db.query(IrrigationRecommendation)
        .filter(
            IrrigationRecommendation.field_id == field_id,
            IrrigationRecommendation.window_end_date == window_end_date,
        )
        .first()
    )

    if existing:
        for k, v in values.items():
            setattr(existing, k, v)
        return existing

    rec = IrrigationRecommendation(
        field_id        = field_id,
        location_id     = location_id,
        window_end_date = window_end_date,
        **values,
    )
    db.add(rec)
    return rec


def run_irrigation_recommendations(db: Session) -> list[IrrigationRecommendation]:
    as_of = datetime.datetime.utcnow()
    locations: list[UserLocation] = db.query(UserLocation).all()
    all_recs: list[IrrigationRecommendation] = []

    for loc in locations:
        metrics = _latest_metrics(db, loc.id, as_of)
        if not metrics:
            logger.info("[IRRIGATION] No WeatherMetrics for loc=%d — skipping.", loc.id)
            continue

        weather_window = _recent_weather_window(db, loc.id, metrics.window_end_date)
        if not weather_window:
            latest_weather = _latest_weather(db, loc.id, as_of)
            weather_window = [latest_weather] if latest_weather else []

        fields: list[FieldUnit] = (
            db.query(FieldUnit)
            .filter(FieldUnit.location_id == loc.id, FieldUnit.status == "active")
            .all()
        )
        if not fields:
            continue

        payload = {
            "weather": _build_weather_context(metrics, weather_window, as_of),
            "fields":  _build_field_inputs(db, fields, as_of),
        }

        result = _call_haskell_irrigation(payload)
        if not result:
            logger.warning("[IRRIGATION] No Haskell result for loc=%d.", loc.id)
            continue

        recs = _persist_results(db, result, loc.id, metrics.window_end_date)
        all_recs.extend(recs)

        logger.info(
            "[IRRIGATION] loc=%d — %d fields | action: %d | water: %.1f m³ "
            "| CRITICAL=%d HIGH=%d MODERATE=%d",
            loc.id,
            result.get("fields_total", 0),
            result.get("fields_need_action", 0),
            result.get("total_water_m3", 0.0),
            result.get("critical_count", 0),
            result.get("high_count", 0),
            result.get("moderate_count", 0),
        )

    return all_recs


def _persist_results(
    db: Session,
    haskell_result: dict,
    location_id: int,
    window_end_date: datetime.datetime,
) -> list[IrrigationRecommendation]:
    recs = []
    for field_advice in haskell_result.get("fields", []):
        rec = _upsert_recommendation(db, field_advice, location_id, window_end_date)
        if rec:
            recs.append(rec)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("[IRRIGATION] DB commit failed for loc=%d: %s", location_id, exc)
        return []
    return recs


_URGENCY_RANK = {"NONE": 0, "LOW": 1, "MODERATE": 2, "HIGH": 3, "CRITICAL": 4}


def get_active_irrigation_alerts(
    db: Session,
    location_id: Optional[int] = None,
    min_urgency: str = "MODERATE",
) -> list[IrrigationRecommendation]:
    min_rank = _URGENCY_RANK.get(min_urgency, 2)
    eligible = [u for u, r in _URGENCY_RANK.items() if r >= min_rank]

    subq = (
        db.query(
            IrrigationRecommendation.field_id,
            func.max(IrrigationRecommendation.window_end_date).label("max_date"),
        )
        .group_by(IrrigationRecommendation.field_id)
        .subquery()
    )

    q = (
        db.query(IrrigationRecommendation)
        .join(
            subq,
            (IrrigationRecommendation.field_id == subq.c.field_id)
            & (IrrigationRecommendation.window_end_date == subq.c.max_date),
        )
        .filter(IrrigationRecommendation.urgency.in_(eligible))
    )
    if location_id is not None:
        q = q.filter(IrrigationRecommendation.location_id == location_id)

    return q.order_by(IrrigationRecommendation.urgency.desc()).all()


def get_irrigation_summary(db: Session, location_id: int) -> dict:
    recs = get_active_irrigation_alerts(db, location_id=location_id, min_urgency="LOW")

    breakdown = {u: 0 for u in _URGENCY_RANK}
    total_water = 0.0
    field_rows = []

    for r in recs:
        breakdown[r.urgency] = breakdown.get(r.urgency, 0) + 1
        total_water += r.total_volume_m3 or 0.0
        field_rows.append({
            "field_id":          r.field_id,
            "urgency":           r.urgency,
            "should_irrigate":   r.should_irrigate,
            "score":             r.score,
            "recommended_mm":    r.recommended_mm,
            "recommended_m3_ha": r.recommended_m3_ha,
            "total_volume_m3":   r.total_volume_m3,
            "soil_moisture":     r.soil_moisture,
            "et0":               r.et0,
            "water_deficit_7d":  r.water_deficit_7d,
            "rain_cum_7d":       r.rain_cum_7d,
            "ndwi_mean":         r.ndwi_mean,
            "spi_1m":            r.spi_1m,
            "reason":            r.reason,
            "window_end_date":   r.window_end_date.isoformat() if r.window_end_date else None,
        })

    return {
        "location_id":             location_id,
        "generated_at":            datetime.datetime.utcnow().isoformat(),
        "fields_total":            len(recs),
        "fields_requiring_action": sum(1 for r in recs if r.should_irrigate),
        "total_water_needed_m3":   round(total_water, 1),
        "priority_breakdown":      breakdown,
        "fields":                  field_rows,
    }
