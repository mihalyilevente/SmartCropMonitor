import os
import time
import datetime
import numpy as np
import requests
import xarray as xr
import rioxarray as rxr
from app.core.config import DATA_DIR,NDVI_DIR, HASKELL_SERVICE_URL, QUALITY_THRESHOLD
from app.core.database import FieldAnalysis, FieldUnit, FieldData
from shapely import wkb
import geopandas as gpd
from app.utils.general import safe_array
from sqlalchemy.orm import Session
from sqlalchemy import and_,or_


def perform_haskell_calculation(payload):
    try:
        for _ in range(3):
            try:
                response = requests.post(
                    HASKELL_SERVICE_URL,
                    json=payload,
                    timeout=10
                )
                if response.status_code == 200:
                    return response.json()
            except requests.RequestException:
                time.sleep(1)
        return None

    except Exception as e:
        print(f"[ERROR] Haskell communication failed: {e}")
        return None


def sateline_metrics(db: Session):
    pending_list = (
        db.query(FieldAnalysis)
        .filter(
            and_(
                FieldAnalysis.metrics_status == None,
                FieldAnalysis.is_valid != None,
                FieldAnalysis.is_valid >= QUALITY_THRESHOLD
            )
        )
        .all()
    )

    if not pending_list:
        print("[INFO] No pending NDVI calculation to processed.")
        return

    for data in pending_list:
        nc_path = os.path.join(DATA_DIR, data.nc_filename) if data.nc_filename else None

        if not nc_path or not os.path.exists(nc_path):
            print(f"[ERROR] File {nc_path} not found")
            continue

        try:
            with xr.open_dataset(nc_path) as ds:
                data_array = ds['__xarray_dataarray_variable__']

                payload = {
                    "config": 1,
                    "raw_data": {
                        "green": data_array.sel(band='green').values.tolist(),
                        "red": data_array.sel(band='red').values.tolist(),
                        "rededge2": data_array.sel(band='rededge2').values.tolist(),
                        "nir": data_array.sel(band='nir').values.tolist(),
                        "swir16": data_array.sel(band='swir16').values.tolist(),
                        "swir22": data_array.sel(band='swir22').values.tolist()
                    }
                }

                result = perform_haskell_calculation(payload)

                if result:
                    metrics_data = {
                        "ndvi": (["y", "x"], np.array(result["ndvi_map"], dtype=float)),
                        "gndvi": (["y", "x"], np.array(result["gndvi_map"], dtype=float)),
                        "ndre": (["y", "x"], np.array(result["ndre_map"], dtype=float)),
                        "ndwi": (["y", "x"], np.array(result["ndwi_map"], dtype=float)),
                        "nmdi": (["y", "x"], np.array(result["nmdi_map"], dtype=float))
                    }

                    metrics_ds = xr.Dataset(
                        data_vars=metrics_data,
                        coords={
                            "y": ds.coords["y"],
                            "x": ds.coords["x"]
                        }
                    )

                    output_filename = f"metrics_{data.nc_filename}"
                    output_path = os.path.join(NDVI_DIR, output_filename)

                    metrics_ds.to_netcdf(output_path)

                    data.metrics_status = True
                    data.analysis_result_path = output_path
                    data.metrics_filename = output_filename

                    db.commit()
                    print(f"[SUCCESS] Processed {data.nc_filename}, saved to {output_filename}")
                else:
                    print(f"[ERROR] Failed to get metrics from Haskell for {data.nc_filename}")

        except Exception as e:
            db.rollback()
            print(f"[ERROR] Error processing {data.nc_filename}: {e}")


def get_pending_per_field_metric_tasks(db: Session):

    analyses = (
        db.query(FieldAnalysis)
        .filter(
            FieldAnalysis.metrics_status == True,
            or_(
                FieldAnalysis.per_metrics_status == False,
                FieldAnalysis.per_metrics_status.is_(None)
            )
        )
        .all()
    )

    tasks = []

    for a in analyses:
        tasks.append({
            "analysis_id": a.id,
            "location_id": a.location_id,
            "nc_filename": a.nc_filename,
            "metrics_filename": a.metrics_filename
        })

    return tasks


def get_fields_for_analysis(db: Session, analysis_id: int):

    analysis = (
        db.query(FieldAnalysis)
        .filter(FieldAnalysis.id == analysis_id)
        .first()
    )

    if not analysis:
        return {"analysis": None, "fields": []}

    fields = (
        db.query(FieldUnit)
        .filter(FieldUnit.location_id == analysis.location_id)
        .all()
    )

    return {
        "analysis": analysis,
        "fields": fields
    }


def run_per_field_metrics(db: Session):
    tasks = get_pending_per_field_metric_tasks(db)
    print(f"[DEBUG] Found {len(tasks)} pending tasks")
    for task in tasks:
        data = get_fields_for_analysis(db, task["analysis_id"])
        analysis, fields = data["analysis"], data["fields"]

        if not fields:
            analysis.per_metrics_status = True
            db.commit()
            continue

        file_path = os.path.join(NDVI_DIR, analysis.metrics_filename)
        if not os.path.exists(file_path):
            print(f"[ERROR] Metrics file not found: {file_path}")
            analysis.per_metrics_status = False
            db.commit()
            continue

        try:
            with rxr.open_rasterio(file_path, masked=True) as ds:
                print(f"[DEBUG] Opened raster: {file_path}")
                print(f"[DEBUG] CRS before assignment: {ds.rio.crs}")
                print(f"[DEBUG] Raster bounds: {ds.rio.bounds()}")
                print(f"[DEBUG] Raster shape: {ds.shape}")

                if not ds.rio.crs:
                    ds.rio.write_crs("EPSG:4326", inplace=True)

                raster_crs = ds.rio.crs
                all_results = []

                for field in fields:
                    prepared_geom = gpd.GeoSeries(
                        [wkb.loads(bytes(field.geometry.data))],
                        crs="EPSG:4326"
                    ).to_crs(raster_crs)

                    print(f"[DEBUG] Field {field.id} bounds: {prepared_geom.total_bounds}")

                    results = calculate_per_field_metrics(
                        field=field,
                        ds=ds,
                        nc_filename=analysis.metrics_filename,
                        timestamp=analysis.last_data_request_date,
                        prepared_geom=prepared_geom
                    )
                    all_results.extend(results)

                if all_results:
                    db.add_all(all_results)

                analysis.per_metrics_status = True
                db.commit()
                print(f"[SUCCESS] Per-field metrics for analysis {analysis.id} completed.")
        except Exception as e:
            db.rollback()
            print(f"[ERROR] Error processing analysis {analysis.id}: {e}")
            analysis.per_metrics_status = False
            db.commit()


def calculate_per_field_metrics(field, ds, nc_filename, timestamp, prepared_geom):
    try:
        results_to_insert = []

        for var in ds.data_vars:
            try:
                da = ds[var]

                clipped = da.rio.clip(prepared_geom.geometry, prepared_geom.crs, drop=True)

                values = clipped.values.flatten()
                values = values[np.isfinite(values)]

                if values.size == 0:
                    continue

                results_to_insert.append(FieldData(
                    field_id=field.id,
                    timestamp=timestamp,
                    metric_type=var,
                    mean_metric=float(np.mean(values)),
                    min_metric=float(np.min(values)),
                    max_metric=float(np.max(values)),
                    std_metric=float(np.std(values)),
                    extra={"count": int(values.size), "source_file": nc_filename}
                ))
            except Exception as e:
                print(f"[ERROR] var={var} in field={field.id}: {e}")

        return results_to_insert
    except Exception as e:
        print(f"[ERROR] calculate_per_field_metrics failed for field={field.id}: {e}")
        return []