import os
import datetime
import xarray as xr
import rioxarray

from sqlalchemy.orm import Session
from pystac_client import Client

from app.core.config import DATA_DIR, MASK_DIR, VIS_DIR, REQUIRED_BANDS, AUX_LAYERS, VISUAL_ASSET,  STAC_API_URL
from app.services.field_analysis import validate_pending_analyses
from app.core.database import UserLocation, FieldAnalysis
from app.services.ndvi_processor import sateline_metrics
from app.services.weather_service import fetch_and_save_weather, weather_metrics
from app.monitoring.alerting import format_alert, AlertService
from app.core.config import WEBHOOK_URL
from geoalchemy2.shape import to_shape


alert_service = AlertService(webhook_url=WEBHOOK_URL)


def full_sync_process(db: Session):
    try:
        download_sentinel_data(db)
        validate_pending_analyses(db)
        sateline_metrics(db)
        run_full_data_cycle(db)

        locations = db.query(UserLocation).all()
        for loc in locations:
            weather_metrics(db, loc)

    except Exception as e:
        alert_service.send(
            key="orchestrator_failure",
            message=format_alert(
                "ORCHESTRATOR_CRITICAL",
                f"Full sync process failed: {str(e)}"
            )
        )
        raise e


def run_full_data_cycle(db: Session):
    print("[INFO] Starting data download cycle...")

    all_locations = db.query(UserLocation).all()
    for loc in all_locations:
        print(f"[PROCESS] Fetching weather for: {loc.label}")
        fetch_and_save_weather(db, loc)


def download_sentinel_data(db: Session):

    client = Client.open(STAC_API_URL)
    locations = db.query(UserLocation).all()

    end_date = datetime.datetime.now(datetime.UTC)
    start_date = end_date - datetime.timedelta(days=60)

    date_range = f"{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    for loc in locations:
        try:
            point = to_shape(loc.location)
            lon, lat = point.x, point.y
            print(f"[DEBUG] Processing location_id={loc.id} at ({lat}, {lon})")

            search = client.search(
                collections=["sentinel-2-l2a"],
                bbox=[lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05],
                datetime=date_range,
                max_items=20,
                sortby=[{"field": "properties.datetime", "direction": "desc"}]
            )

            items = list(search.items())

            if not items:
                print(f"[DEBUG] No items for loc={loc.id}")
                alert_service.send(
                    key=f"no_data_{loc.id}",
                    message=format_alert("DATA_MISSING",
                                         f"No items for {loc.label}",
                                         {"location_id": loc.id, "coords": f"{lat}, {lon}"})
                )
                continue

            items = sorted(
                items,
                key=lambda x: x.datetime or datetime.datetime.min.replace(tzinfo=datetime.UTC),
                reverse=True
            )[:6]

            for item in items:
                timestamp = item.datetime

                base_name = f"user_{loc.user_id}_loc_{loc.id}_{timestamp.strftime('%Y%m%dT%H%M%S')}"

                nc_path = os.path.join(DATA_DIR, f"{base_name}.nc")
                scl_path = os.path.join(MASK_DIR, f"scl_{base_name}.nc")
                aot_path = os.path.join(MASK_DIR, f"aot_{base_name}.nc")
                wvp_path = os.path.join(MASK_DIR, f"wvp_{base_name}.nc")
                vis_path = os.path.join(VIS_DIR, f"vis_{base_name}.tif")

                if os.path.exists(nc_path):
                    print(f"[DEBUG] Skip existing {base_name}")
                    continue

                # ---------------------------
                # 1. Spectral bands (10)
                # ---------------------------
                datasets = []
                reference_da = None

                for band_name in REQUIRED_BANDS:
                    asset = item.assets.get(band_name)
                    if not asset:
                        print(f"[WARN] Missing band: {band_name}")
                        continue

                    da = rioxarray.open_rasterio(asset.href, chunks=True)

                    clipped = da.rio.clip_box(
                        minx=lon - 0.02,
                        miny=lat - 0.02,
                        maxx=lon + 0.02,
                        maxy=lat + 0.02,
                        crs="EPSG:4326"
                    )

                    if reference_da is None:
                        reference_da = clipped
                        final_da = clipped
                    else:
                        final_da = clipped.rio.reproject_match(reference_da)

                    final_da = final_da.squeeze().drop_vars(
                        ["band", "spatial_ref"], errors="ignore"
                    )

                    datasets.append(final_da)

                if len(datasets) != len(REQUIRED_BANDS):
                    print(f"[DEBUG] Incomplete spectral set: {len(datasets)}/10")
                    continue

                ds = xr.concat(datasets, dim="band")
                ds = ds.assign_coords(band=REQUIRED_BANDS)

                ds.to_netcdf(nc_path)

                # ---------------------------
                # 2. SCL
                # ---------------------------
                scl_asset = item.assets.get("scl")
                if scl_asset:
                    try:
                        da = rioxarray.open_rasterio(scl_asset.href, chunks=True)

                        clipped = da.rio.clip_box(
                            minx=lon - 0.02,
                            miny=lat - 0.02,
                            maxx=lon + 0.02,
                            maxy=lat + 0.02,
                            crs="EPSG:4326"
                        )

                        scl_da = clipped.rio.reproject_match(reference_da)

                        scl_da = scl_da.squeeze().drop_vars(
                            ["band", "spatial_ref"], errors="ignore"
                        )

                        scl_da.to_netcdf(scl_path)

                    except Exception as e:
                        print(f"[WARN] SCL failed: {e}")

                # ---------------------------
                # 3. AOT / WVP
                # ---------------------------
                for layer, path in [("aot", aot_path), ("wvp", wvp_path)]:
                    asset = item.assets.get(layer)
                    if not asset:
                        continue

                    try:
                        da = rioxarray.open_rasterio(asset.href, chunks=True)

                        clipped = da.rio.clip_box(
                            minx=lon - 0.02,
                            miny=lat - 0.02,
                            maxx=lon + 0.02,
                            maxy=lat + 0.02,
                            crs="EPSG:4326"
                        )

                        final_da = clipped.rio.reproject_match(reference_da)

                        final_da = final_da.squeeze().drop_vars(
                            ["band", "spatial_ref"], errors="ignore"
                        )

                        final_da.to_netcdf(path)

                    except Exception as e:
                        print(f"[WARN] {layer} failed: {e}")

                # ---------------------------
                # 4. Visual
                # ---------------------------
                visual_asset = item.assets.get(VISUAL_ASSET)

                if visual_asset:
                    try:
                        da = rioxarray.open_rasterio(visual_asset.href)

                        clipped = da.rio.clip_box(
                            minx=lon - 0.02,
                            miny=lat - 0.02,
                            maxx=lon + 0.02,
                            maxy=lat + 0.02,
                            crs="EPSG:4326"
                        )

                        clipped.rio.to_raster(vis_path)

                    except Exception as e:
                        print(f"[WARN] Visual failed: {e}")

                # ---------------------------
                # 5. DB
                # ---------------------------
                new_entry = FieldAnalysis(
                    location_id=loc.id,
                    nc_filename=os.path.basename(nc_path),
                    mask_filename=os.path.basename(scl_path) if os.path.exists(scl_path) else None,
                    last_data_request_date=timestamp
                )

                db.add(new_entry)
                db.commit()

                print(f"[INFO] Saved: {base_name}")

        except Exception as e:
            print(f"[CRITICAL] Failed loc {loc.id}: {e}")
            alert_service.send(
                key=f"loc_err_{loc.id}",
                message=format_alert(
                    "LOCATION_SYNC_ERROR",
                    f"Failed to process location: {str(e)}",
                    {"location_id": loc.id}
                )
            )
            db.rollback()