import os
import datetime
import xarray as xr
import rioxarray

from sqlalchemy.orm import Session
from pystac_client import Client

from app.core.config import DATA_DIR, MASK_DIR, REQUIRED_BANDS, STAC_API_URL
from app.services.field_analysis import validate_pending_analyses, analyzer
from app.core.database import UserLocation, FieldAnalysis
from app.services.segmentation import perform_segmentation_and_save
from app.services.weather_service import fetch_and_save_weather, weather_metrics

def full_sync_process(db: Session):
    download_sentinel_data(db)
    run_full_data_cycle(db)
    locations = db.query(UserLocation).all()
    for loc in locations:
        weather_metrics(db, loc)


def run_full_data_cycle(db: Session):
    print("[INFO] Starting data download cycle...")

    all_locations = db.query(UserLocation).all()
    for loc in all_locations:
        print(f"[PROCESS] Fetching weather for: {loc.label}")
        fetch_and_save_weather(db, loc)

    pending_segmentation = (
        db.query(FieldAnalysis)
        .join(UserLocation)
        .filter(UserLocation.segmentation_status == None)
        .all()
    )

    if not pending_segmentation:
        print("[INFO] No locations pending segmentation.")
        return

    print(f"[INFO] Found {len(pending_segmentation)} analysis records for segmentation.")

    for analysis in pending_segmentation:
        try:
            print(f"[PROCESS] Segmenting location ID: {analysis.location_id} (Analysis ID: {analysis.id})")

            perform_segmentation_and_save(analysis.id, db, analyzer)

        except Exception as e:
            print(f"[ERROR] Failed to segment analysis {analysis.id}: {e}")
            loc = db.query(UserLocation).filter(UserLocation.id == analysis.location_id).first()
            if loc:
                loc.segmentation_status = False
                db.commit()


def download_sentinel_data(db: Session):
    client = Client.open(STAC_API_URL)
    locations = db.query(UserLocation).all()

    end_date = datetime.datetime.now()
    start_date = end_date - datetime.timedelta(days=30)
    date_range = f"{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    for loc in locations:
        try:
            print(f"[DEBUG] Processing location_id={loc.id}")

            search = client.search(
                collections=["sentinel-2-l2a"],
                bbox=[loc.lon - 0.05, loc.lat - 0.05, loc.lon + 0.05, loc.lat + 0.05],
                datetime=date_range,
                max_items=1,
                sortby=[{"field": "properties.datetime", "direction": "desc"}]
            )

            items = list(search.items())
            if not items:
                print(f"[DEBUG] No items found for loc={loc.id}")
                continue

            latest = items[0]
            dt_str = latest.properties["datetime"].replace("Z", "+00:00")
            timestamp = datetime.datetime.fromisoformat(dt_str)

            base_name = f"user_{loc.user_id}_loc_{loc.id}_{timestamp.strftime('%Y%m%d')}"
            nc_filename = f"{base_name}.nc"
            mask_filename = f"mask_{base_name}.nc"

            file_path = os.path.join(DATA_DIR, nc_filename)
            mask_path = os.path.join(MASK_DIR, mask_filename)

            if os.path.exists(file_path):
                print(f"[DEBUG] Skipping: {nc_filename} already exists.")
                continue

            scl_final = None
            asset_scl = latest.assets.get("scl")
            if asset_scl:
                try:
                    scl_da = rioxarray.open_rasterio(asset_scl.href, chunks=True)
                    scl_clipped = scl_da.rio.clip_box(
                        minx=loc.lon - 0.02, miny=loc.lat - 0.02,
                        maxx=loc.lon + 0.02, maxy=loc.lat + 0.02, crs="EPSG:4326"
                    )
                    scl_final = scl_clipped.rio.reproject(
                        scl_clipped.rio.crs, shape=(256, 256), resampling=0
                    ).squeeze().drop_vars(["band", "spatial_ref"], errors="ignore")
                except Exception as e:
                    print(f"[ERROR] SCL processing failed: {e}")

            datasets = []

            for band_name in REQUIRED_BANDS:
                asset = latest.assets.get(band_name)
                if not asset: continue

                da = rioxarray.open_rasterio(asset.href, chunks=True)

                try:

                    clipped = da.rio.clip_box(
                        minx=loc.lon - 0.02,
                        miny=loc.lat - 0.02,
                        maxx=loc.lon + 0.02,
                        maxy=loc.lat + 0.02,
                        crs="EPSG:4326"
                    )

                    if not datasets:
                        reference_da = clipped
                        final_da = clipped
                    else:
                        final_da = clipped.rio.reproject_match(reference_da)

                    final_da = final_da.squeeze().drop_vars(["band", "spatial_ref"], errors="ignore")
                    datasets.append(final_da)

                except Exception as e:
                    print(f"[ERROR] Band {band_name} failed: {e}")
                    continue

            if len(datasets) == len(REQUIRED_BANDS):
                ds = xr.concat(datasets, dim="band")
                ds = ds.assign_coords(band=REQUIRED_BANDS)

                ds.to_netcdf(file_path)

                if scl_final is not None:
                    scl_final.to_netcdf(mask_path)

                new_entry = FieldAnalysis(
                    location_id=loc.id,
                    nc_filename=nc_filename,
                    mask_filename=mask_filename if scl_final is not None else None,
                    last_data_request_date=timestamp
                )
                db.add(new_entry)
                db.commit()
                print(f"[INFO] Successfully saved NC: {nc_filename}")
                print("[INFO] Starting post-download validation...")
                validate_pending_analyses(db)
            else:
                print(f"[DEBUG] Incomplete bands for loc={loc.id}. Found {len(datasets)}/{len(REQUIRED_BANDS)}")

        except Exception as e:
            print(f"[CRITICAL] Failed loc {loc.id}: {e}")
            db.rollback()