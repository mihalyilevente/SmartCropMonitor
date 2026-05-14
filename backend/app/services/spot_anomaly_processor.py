import datetime
import logging
import time
from collections import defaultdict
from typing import Optional

import numpy as np
import requests
import xarray as xr
import os

import geopandas as gpd
from shapely import wkb
from shapely.geometry import MultiPolygon, Polygon

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.core.database import (
    FieldData,
    FieldStatAnomalyAnalysis,
    FieldUnit,
    UserLocation,
    Events,
)
from app.core.schemas import AnomalyType, StatusType, EventType
from app.core.config import HASKELL_SERVICE_URL, NDVI_DIR, SAT_METRICS, CONFIDENCE_HIGH, CONFIDENCE_CRITICAL, DEFAULT_AREA_THRESHOLD_RATIO,SMALL_FIELD_HA, SMALL_FIELD_RATIO
from app.utils.general import _safe_float, _make_event_hash, _make_dedup_key
from app.utils.fields import calculate_field_area

logger = logging.getLogger(__name__)

def _call_haskell_snapshot(payload: dict) -> Optional[dict]:
    for attempt in range(3):
        try:
            resp = requests.post(HASKELL_SERVICE_URL, json=payload, timeout=20)
            if resp.status_code == 200:
                return resp.json()
            logger.warning(
                f"[HASKELL] attempt={attempt+1} status={resp.status_code} body={resp.text[:200]}"
            )
        except requests.RequestException as e:
            logger.warning(f"[HASKELL] attempt={attempt+1} error: {e}")
        time.sleep(1)
    logger.error("[HASKELL] All retries failed for snapshot anomaly")
    return None



def _load_and_clip_metric(
    metrics_filename: str,
    metric_name: str,
    field_geom_wkb,
) -> Optional[list]:

    file_path = os.path.join(NDVI_DIR, metrics_filename)
    if not os.path.exists(file_path):
        logger.error(f"[MAP] File not found: {file_path}")
        return None

    try:
        field_shape = wkb.loads(bytes(field_geom_wkb.data))
        field_gdf   = gpd.GeoSeries([field_shape], crs="EPSG:4326")

        with xr.open_dataset(file_path) as ds:
            if metric_name not in ds.data_vars:
                logger.warning(f"[MAP] '{metric_name}' not found in {metrics_filename}")
                return None

            da = ds[metric_name].rio.set_spatial_dims(x_dim="x", y_dim="y")

            if not da.rio.crs:
                if "spatial_ref" in ds:
                    crs_wkt  = ds["spatial_ref"].attrs.get("crs_wkt")
                    proj4    = ds["spatial_ref"].attrs.get("proj4")
                    crs_str  = crs_wkt or proj4
                    if crs_str:
                        da = da.rio.write_crs(crs_str)
                if not da.rio.crs:
                    x_val  = float(ds.x.mean())
                    assumed = "EPSG:4326" if abs(x_val) <= 180 else "EPSG:32634"
                    da = da.rio.write_crs(assumed)
                    logger.warning(f"[MAP] CRS assumed: {assumed}")

            raster_crs = da.rio.crs
            field_proj = field_gdf.to_crs(raster_crs)

            clipped = da.rio.clip(
                field_proj.geometry,
                field_proj.crs,
                drop=True,
                all_touched=True,
            )

            arr = clipped.values
            arr = np.where(np.isfinite(arr), arr, 0.0)

            if arr.size == 0:
                logger.warning(f"[MAP] Empty clip for {metric_name} in {metrics_filename}")
                return None

            return arr.tolist()

    except Exception as e:
        logger.error(f"[MAP] clip failed for {metric_name} / {metrics_filename}: {e}")
        return None



def _get_two_snapshots_db(
    db: Session,
    field_id: int,
    since: datetime.datetime,
) -> dict[str, list[FieldData]]:
    rows = (
        db.query(FieldData)
        .filter(
            and_(
                FieldData.field_id == field_id,
                FieldData.timestamp >= since,
                FieldData.metric_type.in_(SAT_METRICS),
                FieldData.mean_metric.isnot(None),
            )
        )
        .order_by(FieldData.metric_type, FieldData.timestamp)
        .all()
    )

    groups: dict[str, list[FieldData]] = defaultdict(list)
    for row in rows:
        groups[row.metric_type].append(row)

    return {k: v for k, v in groups.items() if len(v) >= 2}



def _build_haskell_payload(
    groups: dict[str, list[FieldData]],
    field_geom_wkb,
    area_threshold_ratio: float,
) -> Optional[dict]:

    raw_data: dict = {}

    for metric in SAT_METRICS:
        if metric not in groups:
            raw_data[f"prev_{metric}"] = [[0.0]]
            raw_data[f"last_{metric}"] = [[0.0]]
            continue

        prev_row = groups[metric][-2]
        last_row = groups[metric][-1]

        prev_src = prev_row.extra.get("source_file") if prev_row.extra else None
        last_src = last_row.extra.get("source_file") if last_row.extra else None

        prev_map = _load_and_clip_metric(prev_src, metric, field_geom_wkb) if prev_src else None
        last_map = _load_and_clip_metric(last_src, metric, field_geom_wkb) if last_src else None

        if prev_map is None:
            v = _safe_float(prev_row.mean_metric)
            prev_map = [[v if v is not None else 0.0]]

        if last_map is None:
            v = _safe_float(last_row.mean_metric)
            last_map = [[v if v is not None else 0.0]]

        raw_data[f"prev_{metric}"] = prev_map
        raw_data[f"last_{metric}"] = last_map

    return {
        "config": 5,
        "raw_data": {
            **raw_data,
            "area_threshold_ratio": area_threshold_ratio,
        },
    }


def _analyze_field_satellite(
    db: Session,
    field: FieldUnit,
    now: datetime.datetime,
    lookback_days: int = 30,
) -> list[tuple]:
    since  = now - datetime.timedelta(days=lookback_days)
    groups = _get_two_snapshots_db(db, field.id, since)

    if not groups:
        logger.info(f"[SAT] field={field.id}: no sufficient data")
        return []

    try:
        area_ha = calculate_field_area(field.geometry)
    except Exception as e:
        logger.warning(f"[SAT] field={field.id}: area calculation failed ({e}), using default threshold")
        area_ha = 999.0

    area_threshold_ratio = (
        SMALL_FIELD_RATIO if area_ha < SMALL_FIELD_HA else DEFAULT_AREA_THRESHOLD_RATIO
    )
    logger.debug(
        f"[SAT] field={field.id} area={area_ha:.2f}ha "
        f"area_threshold_ratio={area_threshold_ratio}"
    )

    payload = _build_haskell_payload(groups, field.geometry, area_threshold_ratio)
    if payload is None:
        return []

    result = _call_haskell_snapshot(payload)
    if result is None:
        logger.error(f"[SAT] field={field.id}: Haskell call failed")
        return []

    created_records = []

    for metric_result in result.get("metrics", []):
        if not metric_result.get("is_anomaly", False):
            continue

        metric_name   = metric_result["metric_name"]
        confidence    = float(metric_result.get("confidence", 0.60))
        kind          = metric_result.get("anomaly_kind", "drop")
        atype         = AnomalyType.SUDDEN_CHANGE

        last_row      = groups[metric_name][-1] if metric_name in groups else None
        prev_row      = groups[metric_name][-2] if metric_name in groups else None
        field_data_id = last_row.id if last_row else None

        summary = {
            "metric_type":         metric_name,
            "prev_timestamp":      str(prev_row.timestamp) if prev_row else None,
            "last_timestamp":      str(last_row.timestamp) if last_row else None,
            "prev_mean":           metric_result.get("prev_mean"),
            "last_mean":           metric_result.get("last_mean"),
            "abs_delta":           metric_result.get("abs_delta"),
            "rel_change":          metric_result.get("rel_change"),
            "direction":           kind,
            "anomaly_pixel_count": metric_result.get("anomaly_pixel_count"),
            "total_pixel_count":   metric_result.get("total_pixel_count"),
            "anomaly_ratio":       metric_result.get("anomaly_ratio"),
            "area_ha":             round(area_ha, 2),
            "area_threshold_ratio": area_threshold_ratio,
            "detector":            "satellite_snapshot_diff_haskell",
        }

        rec = FieldStatAnomalyAnalysis(
            field_id=field.id,
            field_data_id=field_data_id,
            analysis_date=now,
            anomaly_type=atype,
            metrics_summary=summary,
            confidence_score=round(confidence, 4),
            status=StatusType.ACTIVE,
            extra={"haskell_raw": metric_result},
        )
        db.add(rec)
        created_records.append((rec, summary, atype))

        logger.info(
            f"[SAT ANOMALY] field={field.id} metric={metric_name} "
            f"delta={metric_result.get('abs_delta', 0):.4f} "
            f"rel={metric_result.get('rel_change', 0):.2%} "
            f"anomaly_ratio={metric_result.get('anomaly_ratio', 0):.2%} "
            f"kind={kind} conf={confidence:.4f}"
        )

    return created_records


def _event_type_for_metric(metric_name: str) -> EventType:
    if "ndvi" in metric_name:
        return EventType.NDVI_DROP
    if "evi" in metric_name:
        return EventType.EVI_ANOMALY
    return EventType.METRIC_ANOMALY


def _create_satellite_event_if_needed(
    db: Session,
    field_id: int,
    user_id: int,
    metric_type: str,
    anomaly_type: AnomalyType,
    confidence: float,
    summary: dict,
    now: datetime.datetime,
) -> None:
    window_day = now.strftime("%Y-%m-%d")
    dedup_key  = _make_dedup_key(field_id, metric_type, anomaly_type.value, window_day)
    event_hash = _make_event_hash(field_id, metric_type, anomaly_type.value, window_day)

    existing = db.query(Events).filter(Events.event_hash == event_hash).first()
    if existing:
        logger.debug(f"[SAT EVENT] duplicate skipped: {dedup_key}")
        return

    severity = "WARNING"
    if confidence >= CONFIDENCE_CRITICAL:
        severity = "CRITICAL"
    elif confidence >= CONFIDENCE_HIGH:
        severity = "HIGH"

    event = Events(
        user_id=user_id,
        event_type=_event_type_for_metric(metric_type),
        event_hash=event_hash,
        dedup_key=dedup_key,
        severity=severity,
        status=StatusType.ACTIVE,
        expires_at=now + datetime.timedelta(days=7),
        extra_metadata={
            "field_id":     field_id,
            "metric_type":  metric_type,
            "anomaly_type": anomaly_type.value,
            "confidence":   confidence,
            "summary":      summary,
        },
    )
    db.add(event)
    logger.info(
        f"[SAT EVENT] field={field_id} metric={metric_type} "
        f"event={_event_type_for_metric(metric_type).value} severity={severity}"
    )


def find_satellite_anomaly(
    db: Session,
    field_id: int,
    lookback_days: int = 30,
    generate_events: bool = True,
) -> dict:

    now = datetime.datetime.utcnow()

    field = db.query(FieldUnit).filter(FieldUnit.id == field_id).first()
    if not field:
        logger.warning(f"[SAT] field_id={field_id} not found")
        return {}

    stats_summary: dict[str, int] = defaultdict(int)

    try:
        created = _analyze_field_satellite(db, field, now, lookback_days)
        db.flush()

        if generate_events and created:
            loc = (
                db.query(UserLocation)
                .filter(UserLocation.id == field.location_id)
                .first()
            )
            user_id = loc.user_id if loc else None

            if user_id:
                for rec, summary, atype in created:
                    _create_satellite_event_if_needed(
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
                logger.warning(f"[SAT] user_id not found for field={field_id}, Events skipped")

        db.commit()

        for _, _, atype in created:
            stats_summary[atype.value] += 1

        logger.info(
            f"[SAT DONE] field={field_id}: "
            + (", ".join(f"{k}={v}" for k, v in stats_summary.items()) or "no anomalies")
            + f" (total={len(created)})"
        )

    except Exception as e:
        db.rollback()
        logger.error(f"[SAT ERROR] field={field_id}: {e}", exc_info=True)
        raise

    return dict(stats_summary)


def find_all_satellite_anomaly(
    db: Session,
    location_id: Optional[int] = None,
    lookback_days: int = 30,
    generate_events: bool = True,
) -> dict:
    q = db.query(FieldUnit).filter(FieldUnit.status == "active")
    if location_id:
        q = q.filter(FieldUnit.location_id == location_id)

    fields = q.all()
    logger.info(f"[SAT START] {len(fields)} fields to process")

    all_results: dict[int, dict] = {}
    for field in fields:
        try:
            result = find_satellite_anomaly(
                db=db,
                field_id=field.id,
                lookback_days=lookback_days,
                generate_events=generate_events,
            )
            if result:
                all_results[field.id] = result
        except Exception as e:
            logger.error(f"[SAT ERROR] field={field.id}: {e}")
            continue

    total = sum(sum(v.values()) for v in all_results.values())
    logger.info(
        f"[SAT DONE] {len(all_results)} fields with anomalies, {total} total records"
    )
    return all_results