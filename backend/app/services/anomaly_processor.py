import datetime
import logging
from collections import defaultdict
from typing import Optional

import numpy as np
from scipy import stats
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.utils.general import _safe_float, _make_event_hash, _make_dedup_key
from app.core.database import (
    FieldData,
    FieldStatAnomalyAnalysis,
    FieldUnit,
    Events,
)
from app.core.schemas import (
    AnomalyType,
    StatusType,
    EventType,
)
from app.core.config import (
    Z_SCORE_THRESHOLD,
    DELTA_SCORE_THRESHOLD,
    DRIFT_SLOPE_THRESHOLD,
    DRIFT_P_VALUE_THRESHOLD,
    MIN_POINTS_FOR_ANALYSIS,
    CONFIDENCE_SCALE,
)

logger = logging.getLogger(__name__)


def _confidence_from_z(z: float) -> float:
    return float(min(0.9999, 1.0 - 2 * (1 - stats.norm.cdf(abs(z)))))


def _event_type_for_anomaly(metric_type: str, anomaly_type: AnomalyType) -> EventType:
    metric_lower = metric_type.lower()
    if "ndvi" in metric_lower and anomaly_type in (AnomalyType.OUT_OF_BOUNDS, AnomalyType.SUDDEN_CHANGE):
        return EventType.NDVI_DROP
    if "evi" in metric_lower:
        return EventType.EVI_ANOMALY
    return EventType.METRIC_ANOMALY


# =========================
# Statistical detectors
# =========================

def _detect_out_of_bounds(values: np.ndarray, timestamps, threshold: float = Z_SCORE_THRESHOLD):
    if len(values) < MIN_POINTS_FOR_ANALYSIS:
        return []

    mu = np.nanmean(values)
    sigma = np.nanstd(values)
    if sigma < 1e-9:
        return []

    z_scores = (values - mu) / sigma
    anomalies = []
    for i, z in enumerate(z_scores):
        if abs(z) >= threshold:
            anomalies.append({
                "idx": i,
                "timestamp": timestamps[i],
                "value": float(values[i]),
                "z_score": float(z),
                "mu": float(mu),
                "sigma": float(sigma),
            })
    return anomalies


def _detect_sudden_change(values: np.ndarray, timestamps, threshold: float = DELTA_SCORE_THRESHOLD):
    if len(values) < MIN_POINTS_FOR_ANALYSIS:
        return []

    deltas = np.diff(values)
    mu_d = np.nanmean(deltas)
    sigma_d = np.nanstd(deltas)
    if sigma_d < 1e-9:
        return []

    anomalies = []
    for i, d in enumerate(deltas):
        z = (d - mu_d) / sigma_d
        if abs(z) >= threshold:
            anomalies.append({
                "idx": i + 1,
                "timestamp": timestamps[i + 1],
                "value": float(values[i + 1]),
                "prev_value": float(values[i]),
                "delta": float(d),
                "z_score": float(z),
            })
    return anomalies


def _detect_drift(values: np.ndarray, timestamps) -> Optional[dict]:
    n = len(values)
    if n < MIN_POINTS_FOR_ANALYSIS:
        return None

    x = np.arange(n, dtype=float)
    slope, intercept, r_value, p_value, std_err = stats.linregress(x, values)

    value_range = np.nanmax(values) - np.nanmin(values)
    norm_slope = abs(slope) / (value_range + 1e-9)

    if p_value <= DRIFT_P_VALUE_THRESHOLD and norm_slope >= DRIFT_SLOPE_THRESHOLD:
        return {
            "slope": float(slope),
            "intercept": float(intercept),
            "r_squared": float(r_value ** 2),
            "p_value": float(p_value),
            "norm_slope": float(norm_slope),
            "direction": "up" if slope > 0 else "down",
            "period_start": str(timestamps[0]),
            "period_end": str(timestamps[-1]),
            "n_points": n,
        }
    return None


# =========================
# Core: single field + metric
# =========================

def _analyze_field_metric(
    db: Session,
    field_id: int,
    metric_type: str,
    rows: list,
    now: datetime.datetime,
) -> list:
    if len(rows) < MIN_POINTS_FOR_ANALYSIS:
        return []

    values = np.array([_safe_float(r.mean_metric) for r in rows], dtype=float)
    timestamps = [r.timestamp for r in rows]
    field_data_ids = [r.id for r in rows]

    nan_mask = np.isnan(values)
    if nan_mask.all():
        return []
    if nan_mask.any():
        values[nan_mask] = np.nanmean(values)

    created_records = []

    oob_hits = _detect_out_of_bounds(values, timestamps)
    for hit in oob_hits:
        idx = hit["idx"]
        confidence = _confidence_from_z(hit["z_score"])
        summary = {
            "metric_type": metric_type,
            "anomaly_point": str(hit["timestamp"]),
            "value": hit["value"],
            "mean": hit["mu"],
            "std": hit["sigma"],
            "z_score": hit["z_score"],
            "n_points": len(rows),
        }
        rec = FieldStatAnomalyAnalysis(
            field_id=field_id,
            field_data_id=field_data_ids[idx],
            analysis_date=now,
            anomaly_type=AnomalyType.OUT_OF_BOUNDS,
            metrics_summary=summary,
            confidence_score=round(confidence, 4),
            status=StatusType.ACTIVE,
        )
        db.add(rec)
        created_records.append((rec, summary, AnomalyType.OUT_OF_BOUNDS))
        logger.info(
            f"[ANOMALY] field={field_id} metric={metric_type} OUT_OF_BOUNDS "
            f"ts={hit['timestamp']} z={hit['z_score']:.2f}"
        )

    sc_hits = _detect_sudden_change(values, timestamps)
    for hit in sc_hits:
        idx = hit["idx"]
        confidence = _confidence_from_z(hit["z_score"])
        summary = {
            "metric_type": metric_type,
            "anomaly_point": str(hit["timestamp"]),
            "value": hit["value"],
            "prev_value": hit["prev_value"],
            "delta": hit["delta"],
            "z_score": hit["z_score"],
            "n_points": len(rows),
        }
        rec = FieldStatAnomalyAnalysis(
            field_id=field_id,
            field_data_id=field_data_ids[idx],
            analysis_date=now,
            anomaly_type=AnomalyType.SUDDEN_CHANGE,
            metrics_summary=summary,
            confidence_score=round(confidence, 4),
            status=StatusType.ACTIVE,
        )
        db.add(rec)
        created_records.append((rec, summary, AnomalyType.SUDDEN_CHANGE))
        logger.info(
            f"[ANOMALY] field={field_id} metric={metric_type} SUDDEN_CHANGE "
            f"ts={hit['timestamp']} delta={hit['delta']:.4f} z={hit['z_score']:.2f}"
        )

    drift = _detect_drift(values, timestamps)
    if drift:
        confidence = min(0.9999, float(drift["r_squared"]) * CONFIDENCE_SCALE)
        summary = {"metric_type": metric_type, **drift}
        rec = FieldStatAnomalyAnalysis(
            field_id=field_id,
            field_data_id=None,
            analysis_date=now,
            anomaly_type=AnomalyType.DATA_DRIFT,
            metrics_summary=summary,
            confidence_score=round(confidence, 4),
            status=StatusType.ACTIVE,
        )
        db.add(rec)
        created_records.append((rec, summary, AnomalyType.DATA_DRIFT))
        logger.info(
            f"[ANOMALY] field={field_id} metric={metric_type} DATA_DRIFT "
            f"slope={drift['slope']:.4f} direction={drift['direction']} "
            f"p={drift['p_value']:.4f}"
        )

    return created_records


# =========================
# Event generation
# =========================

def _create_event_if_needed(
    db: Session,
    field_id: int,
    user_id: int,
    metric_type: str,
    anomaly_type: AnomalyType,
    confidence: float,
    summary: dict,
    now: datetime.datetime,
):

    window_day = now.strftime("%Y-%m-%d")
    dedup_key = _make_dedup_key(field_id, metric_type, anomaly_type.value, window_day)
    event_hash = _make_event_hash(field_id, metric_type, anomaly_type.value, window_day)

    existing = (
        db.query(Events)
        .filter(Events.event_hash == event_hash)
        .first()
    )
    if existing:
        logger.debug(f"[EVENT] Duplicate: {dedup_key}")
        return

    severity = "WARNING"
    if confidence >= 0.95:
        severity = "CRITICAL"
    elif confidence >= 0.80:
        severity = "HIGH"

    event_type = _event_type_for_anomaly(metric_type, anomaly_type)

    event = Events(
        user_id=user_id,
        event_type=event_type,
        event_hash=event_hash,
        dedup_key=dedup_key,
        severity=severity,
        status=StatusType.ACTIVE,
        expires_at=now + datetime.timedelta(days=7),
        extra_metadata={
            "field_id": field_id,
            "metric_type": metric_type,
            "anomaly_type": anomaly_type.value,
            "confidence": confidence,
            "summary": summary,
        },
    )
    db.add(event)
    logger.info(
        f"[EVENT] Alert generated field={field_id} metric={metric_type} "
        f"type={event_type.value} severity={severity}"
    )


def find_stat_anomaly(
    db: Session,
    field_id: int,
    metric_type: Optional[str] = None,
    lookback_days: int = 90,
    generate_events: bool = True,
) -> dict:
    now = datetime.datetime.utcnow()
    since = now - datetime.timedelta(days=lookback_days)

    field = db.query(FieldUnit).filter(FieldUnit.id == field_id).first()
    if not field:
        logger.warning(f"[SKIP] field_id={field_id} not found")
        return {}

    q = (
        db.query(FieldData)
        .filter(
            and_(
                FieldData.field_id == field_id,
                FieldData.timestamp >= since,
                FieldData.mean_metric.isnot(None),
            )
        )
    )
    if metric_type:
        q = q.filter(FieldData.metric_type == metric_type)

    rows_all = q.order_by(FieldData.metric_type, FieldData.timestamp).all()

    if not rows_all:
        logger.info(f"[INFO] No data field_id={field_id}")
        return {}

    groups: dict[str, list] = defaultdict(list)
    for row in rows_all:
        groups[row.metric_type].append(row)

    stats_summary = defaultdict(int)
    all_created = []

    try:
        for mtype, mrows in groups.items():
            created = _analyze_field_metric(db, field_id, mtype, mrows, now)
            all_created.extend(created)

        db.flush()

        if generate_events:
            from app.core.database import UserLocation
            loc = db.query(UserLocation).filter(
                UserLocation.id == field.location_id
            ).first()
            user_id = loc.user_id if loc else None

            if user_id:
                for rec, summary, atype in all_created:
                    _create_event_if_needed(
                        db=db,
                        field_id=field_id,
                        user_id=user_id,
                        metric_type=summary["metric_type"],
                        anomaly_type=atype,
                        confidence=float(rec.confidence_score),
                        summary=summary,
                        now=now,
                    )
            else:
                logger.warning(f"[WARN] Error in user_id for field_id={field_id}, Events not generated")

        db.commit()

        for _, _, atype in all_created:
            stats_summary[atype.value] += 1

        logger.info(
            f"[DONE] field={field_id}: "
            + ", ".join(f"{k}={v}" for k, v in stats_summary.items())
            + f" (total={len(all_created)})"
        )

    except Exception as e:
        db.rollback()
        logger.error(f"[ERROR] find_stat_anomaly field={field_id}: {e}", exc_info=True)
        raise

    return dict(stats_summary)


def find_all_anomaly(
    db: Session,
    location_id: Optional[int] = None,
    metric_type: Optional[str] = None,
    lookback_days: int = 90,
    generate_events: bool = True,
) -> dict:

    q = db.query(FieldUnit).filter(FieldUnit.status == "active")
    if location_id:
        q = q.filter(FieldUnit.location_id == location_id)

    fields = q.all()
    logger.info(f"[START] find_all_anomaly: {len(fields)} fields")

    all_results = {}
    for field in fields:
        try:
            result = find_stat_anomaly(
                db=db,
                field_id=field.id,
                metric_type=metric_type,
                lookback_days=lookback_days,
                generate_events=generate_events,
            )
            if result:
                all_results[field.id] = result
        except Exception as e:
            logger.error(f"[ERROR] Error field={field.id}: {e}")
            continue

    total = sum(sum(v.values()) for v in all_results.values())
    logger.info(f"[DONE] find_all_anomaly: {len(all_results)} fields with anomaly, {total} records")

    return all_results