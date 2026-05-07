import os
import time
import numpy as np
import requests
import xarray as xr
from app.core.config import DATA_DIR,NDVI_DIR, HASKELL_SERVICE_URL, QUALITY_THRESHOLD
from app.core.database import FieldAnalysis
from app.utils.general import safe_array
from sqlalchemy.orm import Session
from sqlalchemy import and_


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
