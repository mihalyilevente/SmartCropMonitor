import os
import time
import datetime
import numpy as np
import xarray as xr
import requests

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from shapely import wkb
import geopandas as gpd

from app.core.config import NDVI_DIR, HASKELL_SERVICE_URL, QUALITY_THRESHOLD_NDVI
from app.core.database import (
    Biomass,
    FieldAnalysis,
    FieldData,
    FieldUnit,
    WeatherHistory,
    WeatherMetrics,
)


def _call_haskell_biomass(payload: dict, retries: int = 3) -> dict | None:
    for attempt in range(retries):
        try:
            response = requests.post(
                HASKELL_SERVICE_URL,
                json=payload,
                timeout=20,
            )
            if response.status_code == 200:
                return response.json()
            print(f"[WARN] Haskell returned {response.status_code}: {response.text[:200]}")
        except requests.RequestException as exc:
            print(f"[WARN] Haskell request attempt {attempt + 1} failed: {exc}")
            time.sleep(1)
    return None


def _get_pending_analyses(db: Session) -> list[FieldAnalysis]:
    existing_ids = {
        row[0]
        for row in db.query(Biomass.analysis_id).distinct().all()
    }

    analyses = (
        db.query(FieldAnalysis)
        .filter(
            FieldAnalysis.per_metrics_status == True,
            FieldAnalysis.metrics_filename.isnot(None),
        )
        .all()
    )

    return [a for a in analyses if a.id not in existing_ids]


def _get_field_pixel_data_from_nc(
    ds: xr.Dataset,
    field: FieldUnit,
    raster_crs,
) -> dict[str, list[float]]:
    required = {"ndvi", "gndvi", "ndre", "ndwi"}
    available = set(ds.data_vars) & required
    if len(available) < 4:
        print(f"[WARN] Missing bands in NetCDF: {required - available}")
        return {}

    geom = gpd.GeoSeries(
        [wkb.loads(bytes(field.geometry.data))],
        crs="EPSG:4326",
    ).to_crs(raster_crs)

    result: dict[str, list[float]] = {}
    for var in required:
        try:
            clipped = (
                ds[var]
                .rio.set_spatial_dims(x_dim="x", y_dim="y")
                .rio.clip(geom.geometry, geom.crs, drop=True, all_touched=True)
            )
            vals = clipped.values.flatten()
            vals = vals[np.isfinite(vals)].tolist()
            if not vals:
                return {}
            result[var] = vals
        except Exception as exc:
            print(f"[ERROR] Clipping {var} for field {field.id}: {exc}")
            return {}

    return result


def _get_nearest_weather(
    db: Session,
    location_id: int,
    timestamp: datetime.datetime,
) -> tuple[WeatherHistory | None, WeatherMetrics | None]:
    weather = (
        db.query(WeatherHistory)
        .filter(WeatherHistory.location_id == location_id)
        .order_by(
            (WeatherHistory.timestamp - timestamp)
            .__abs__()
        )
        .first()
    )
    if weather is None:
        return None, None

    metrics = (
        db.query(WeatherMetrics)
        .filter(WeatherMetrics.reference_weather_id == weather.id)
        .first()
    )
    return weather, metrics


def _build_payload(pixel_data: dict[str, list[float]]) -> dict:
    return {
        "config": 6,
        "raw_data": {
            "ndvi_vals":  pixel_data["ndvi"],
            "gndvi_vals": pixel_data["gndvi"],
            "ndre_vals":  pixel_data["ndre"],
            "ndwi_vals":  pixel_data["ndwi"],
        },
    }


def _process_single_analysis(db: Session, analysis: FieldAnalysis) -> None:
    file_path = os.path.join(NDVI_DIR, analysis.metrics_filename)
    if not os.path.exists(file_path):
        print(f"[ERROR] Metrics file missing: {file_path}")
        return

    fields = (
        db.query(FieldUnit)
        .filter(FieldUnit.location_id == analysis.location_id)
        .all()
    )
    if not fields:
        print(f"[WARN] No fields for analysis {analysis.id}")
        return

    weather, weather_metrics = _get_nearest_weather(
        db, analysis.location_id, analysis.last_data_request_date
    )

    try:
        with xr.open_dataset(file_path) as ds:
            ds = ds.rio.set_spatial_dims(x_dim="x", y_dim="y")

            if not ds.rio.crs:
                crs_str = None
                if "spatial_ref" in ds:
                    crs_str = (
                        ds["spatial_ref"].attrs.get("crs_wkt")
                        or ds["spatial_ref"].attrs.get("proj4")
                    )
                if crs_str:
                    ds = ds.rio.write_crs(crs_str)
                else:
                    x_val = float(ds.x.mean())
                    assumed = "EPSG:4326" if abs(x_val) <= 180 else "EPSG:32634"
                    ds = ds.rio.write_crs(assumed)
                    print(f"[WARN] Assumed CRS {assumed} for analysis {analysis.id}")

            raster_crs = ds.rio.crs
            new_records: list[Biomass] = []

            for field in fields:
                pixel_data = _get_field_pixel_data_from_nc(ds, field, raster_crs)
                if not pixel_data:
                    print(f"[WARN] No pixel data for field {field.id}, skipping.")
                    continue

                payload = _build_payload(pixel_data)
                result  = _call_haskell_biomass(payload)

                if result is None:
                    print(f"[ERROR] Haskell returned nothing for field {field.id}")
                    continue

                record = Biomass(
                    field_id              = field.id,
                    analysis_id           = analysis.id,
                    reference_weather_id  = weather.id    if weather         else None,
                    reference_metrics_id  = weather_metrics.id if weather_metrics else None,
                    analysis_date         = analysis.last_data_request_date,

                    evi   = round(result.get("evi_mean",   0.0), 4),
                    msi   = round(result.get("msi_mean",   0.0), 4),
                    ci    = round(result.get("ci_mean",    0.0), 4),

                    biomass_tha = round(result.get("biomass_tha", 0.0), 4),
                    confidence  = round(result.get("confidence",  0.0), 4),

                    ground_truth = None,

                    extra={
                        "ndvi_mean":   result.get("ndvi_mean"),
                        "biomass_min": result.get("biomass_min"),
                        "biomass_max": result.get("biomass_max"),
                        "biomass_std": result.get("biomass_std"),
                        "pixel_count": result.get("pixel_count"),
                        "source_file": analysis.metrics_filename,
                    },
                )
                new_records.append(record)
                print(
                    f"[INFO] Field {field.id}: biomass={record.biomass_tha:.2f} t/ha "
                    f"(confidence={record.confidence:.2f})"
                )

            if new_records:
                db.add_all(new_records)
                db.commit()
                print(
                    f"[SUCCESS] Biomass saved for analysis {analysis.id}: "
                    f"{len(new_records)} field(s)."
                )

    except Exception as exc:
        db.rollback()
        print(f"[ERROR] biomass processing for analysis {analysis.id}: {exc}")


def run_biomass_estimation(db: Session) -> None:
    pending = _get_pending_analyses(db)
    print(f"[INFO] Biomass: {len(pending)} analysis record(s) to process.")

    for analysis in pending:
        _process_single_analysis(db, analysis)