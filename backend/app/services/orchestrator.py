import os
import subprocess
import datetime
import xarray as xr
import rioxarray

from sqlalchemy.orm import Session
from pystac_client import Client

import logging
from app.core.config import DATA_DIR, MASK_DIR, VIS_DIR, REQUIRED_BANDS, AUX_LAYERS, VISUAL_ASSET, STAC_API_URL
from app.services.field_analysis import validate_pending_analyses
from app.core.database import UserLocation, FieldAnalysis
from app.services.ndvi_processor import sateline_metrics, run_per_field_metrics
from app.services.weather_service import fetch_and_save_weather, weather_metrics
from app.services.wrf_service import ingest_wrf_output
from app.services.biomass_service import run_biomass_estimation
from app.monitoring.alerting import format_alert, AlertService
from app.services.anomaly_processor import find_all_anomaly
from app.services.spot_anomaly_processor import find_all_satellite_anomaly
from app.services.irrigation_service import run_irrigation_recommendations
from app.events.alerts_orchestrator import run_all_alert_checks
from app.services.dem_service import ensure_dem_for_all_locations
from app.services.disease_service import disease_risk
from app.core.config import WEBHOOK_URL
from geoalchemy2.shape import to_shape

alert_service = AlertService(webhook_url=WEBHOOK_URL)
logger = logging.getLogger(__name__)

# Path to docker-compose.yml on the host (mounted into backend container)
COMPOSE_FILE = os.environ.get("COMPOSE_FILE", "/app/docker-compose.yml")
DOCKER_SOCKET = "/var/run/docker.sock"


def _run_wrf_for_location(lat: float, lon: float, location_id: int) -> bool:
    """
    Run wrf-preprocessor + wrf-runner sequentially for one location.
    Passes coordinates and location_id via environment variables.
    Returns True on success, False on failure.
    """
    env = {
        **os.environ,
        "WRF_CENTER_LAT":  str(lat),
        "WRF_CENTER_LON":  str(lon),
        "WRF_LOCATION_ID": str(location_id),
    }

    logger.info(f"[wrf] Starting preprocessor for loc {location_id} ({lat}, {lon})")

    # Step 1: preprocessor (GFS download + WPS)
    result = subprocess.run(
        ["docker", "compose", "-f", COMPOSE_FILE,
         "run", "--rm",
         "-e", f"WRF_CENTER_LAT={lat}",
         "-e", f"WRF_CENTER_LON={lon}",
         "-e", f"WRF_LOCATION_ID={location_id}",
         "wrf-preprocessor"],
        capture_output=True, text=True, env=env
    )

    if result.returncode != 0:
        logger.error(f"[wrf] Preprocessor failed for loc {location_id}:\n{result.stderr}")
        alert_service.send(
            key=f"wrf_preprocessor_fail_{location_id}",
            message=format_alert(
                "WRF_PREPROCESSOR_FAILED",
                f"WRF preprocessor failed for location {location_id}",
                {"location_id": location_id, "stderr": result.stderr[-500:]}
            )
        )
        return False

    logger.info(f"[wrf] Preprocessor done for loc {location_id}. Starting runner...")

    # Step 2: runner (real.exe + wrf.exe)
    result = subprocess.run(
        ["docker", "compose", "-f", COMPOSE_FILE,
         "run", "--rm",
         "-e", f"WRF_CENTER_LAT={lat}",
         "-e", f"WRF_CENTER_LON={lon}",
         "-e", f"WRF_LOCATION_ID={location_id}",
         "wrf-runner"],
        capture_output=True, text=True, env=env
    )

    if result.returncode != 0:
        logger.error(f"[wrf] Runner failed for loc {location_id}:\n{result.stderr}")
        alert_service.send(
            key=f"wrf_runner_fail_{location_id}",
            message=format_alert(
                "WRF_RUNNER_FAILED",
                f"WRF runner failed for location {location_id}",
                {"location_id": location_id, "stderr": result.stderr[-500:]}
            )
        )
        return False

    logger.info(f"[wrf] Runner done for loc {location_id}")
    return True


def full_sync_process(db: Session):
    try:
        ensure_dem_for_all_locations(db)
        download_sentinel_data(db)
        validate_pending_analyses(db)
        sateline_metrics(db)
        run_per_field_metrics(db)
        run_biomass_estimation(db)
        find_all_anomaly(db)
        find_all_satellite_anomaly(db)

    except Exception as e:
        logger.error(f"Critical orchestrator failure: {e}", exc_info=True)
        try:
            alert_service.send(
                key="orchestrator_failure",
                message=format_alert(
                    "ORCHESTRATOR_CRITICAL",
                    f"Full sync process failed: {str(e)}"
                )
            )
        except Exception as alert_error:
            logger.critical(f"Failed to send alert: {alert_error}")
        raise


def short_sync_process(db: Session):
    try:
        all_locations = db.query(UserLocation).all()

        for loc in all_locations:
            point = to_shape(loc.location)
            lat, lon = point.y, point.x

            logger.info(f"[sync] Processing location: {loc.label} ({lat}, {lon})")

            wrf_ok = _run_wrf_for_location(lat, lon, loc.id)

            if not wrf_ok:
                logger.warning(f"[sync] WRF failed for {loc.label} — falling back to Open-Meteo only")

            if wrf_ok:
                wrf_count = ingest_wrf_output(db, loc)
                logger.info(f"[sync] WRF ingested {wrf_count} records for {loc.label}")

            fetch_and_save_weather(db, loc)

            weather_metrics(db, loc)

            disease_risk(db, loc)

        run_irrigation_recommendations(db)
        run_all_alert_checks()

    except Exception as e:
        logger.error(f"Critical orchestrator failure: {e}", exc_info=True)
        try:
            alert_service.send(
                key="orchestrator_failure",
                message=format_alert(
                    "ORCHESTRATOR_CRITICAL",
                    f"Short sync process failed: {str(e)}"
                )
            )
        except Exception as alert_error:
            logger.critical(f"Failed to send alert: {alert_error}")
        raise


def download_sentinel_data(db: Session):

    client = Client.open(STAC_API_URL)
    locations = db.query(UserLocation).all()

    end_date   = datetime.datetime.now(datetime.UTC)
    start_date = end_date - datetime.timedelta(days=60)
    date_range = (
        f"{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}/"
        f"{end_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    )

    for loc in locations:
        try:
            point    = to_shape(loc.location)
            lon, lat = point.x, point.y
            logger.debug(f"[sentinel] location_id={loc.id} at ({lat}, {lon})")

            search = client.search(
                collections=["sentinel-2-l2a"],
                bbox=[lon - 0.1, lat - 0.1, lon + 0.1, lat + 0.1],
                datetime=date_range,
                max_items=20,
                sortby=[{"field": "properties.datetime", "direction": "desc"}]
            )

            items = list(search.items())

            if not items:
                logger.warning(f"[sentinel] No items for loc={loc.id}")
                alert_service.send(
                    key=f"no_data_{loc.id}",
                    message=format_alert(
                        "DATA_MISSING",
                        f"No Sentinel items for {loc.label}",
                        {"location_id": loc.id, "coords": f"{lat}, {lon}"}
                    )
                )
                continue

            items = sorted(
                items,
                key=lambda x: x.datetime or datetime.datetime.min.replace(tzinfo=datetime.UTC),
                reverse=True
            )[:10]

            for item in items:
                timestamp = item.datetime
                base_name = f"user_{loc.user_id}_loc_{loc.id}_{timestamp.strftime('%Y%m%dT%H%M%S')}"

                nc_path  = os.path.join(DATA_DIR,  f"{base_name}.nc")
                scl_path = os.path.join(MASK_DIR,  f"scl_{base_name}.nc")
                aot_path = os.path.join(MASK_DIR,  f"aot_{base_name}.nc")
                wvp_path = os.path.join(MASK_DIR,  f"wvp_{base_name}.nc")
                vis_path = os.path.join(VIS_DIR,   f"vis_{base_name}.tif")

                if os.path.exists(nc_path):
                    logger.debug(f"[sentinel] Skip existing {base_name}")
                    continue

                datasets     = []
                reference_da = None

                for band_name in REQUIRED_BANDS:
                    asset = item.assets.get(band_name)
                    if not asset:
                        logger.warning(f"[sentinel] Missing band: {band_name}")
                        continue

                    da = rioxarray.open_rasterio(asset.href, chunks=True)
                    clipped = da.rio.clip_box(
                        minx=lon - 0.05, miny=lat - 0.05,
                        maxx=lon + 0.05, maxy=lat + 0.05,
                        crs="EPSG:4326",
                        allow_one_dimensional_raster=True,
                    )

                    if reference_da is None:
                        reference_da = clipped
                        final_da     = clipped
                    else:
                        final_da = clipped.rio.reproject_match(reference_da)

                    final_da = final_da.squeeze().drop_vars(["band", "spatial_ref"], errors="ignore")
                    datasets.append(final_da)

                if len(datasets) != len(REQUIRED_BANDS):
                    logger.warning(f"[sentinel] Incomplete bands {len(datasets)}/{len(REQUIRED_BANDS)} for {base_name}")
                    continue

                ds = xr.concat(datasets, dim="band")
                ds = ds.assign_coords(band=REQUIRED_BANDS)

                if reference_da is not None and reference_da.rio.crs:
                    ds = ds.rio.set_spatial_dims(x_dim="x", y_dim="y").rio.write_crs(reference_da.rio.crs)

                ds.to_netcdf(nc_path)

                scl_asset = item.assets.get("scl")
                if scl_asset:
                    try:
                        da      = rioxarray.open_rasterio(scl_asset.href, chunks=True)
                        clipped = da.rio.clip_box(
                            minx=lon - 0.05, miny=lat - 0.05,
                            maxx=lon + 0.05, maxy=lat + 0.05,
                            crs="EPSG:4326", allow_one_dimensional_raster=True,
                        )
                        scl_da = clipped.rio.reproject_match(reference_da)
                        scl_da = scl_da.squeeze().drop_vars(["band", "spatial_ref"], errors="ignore")
                        scl_da.to_netcdf(scl_path)
                    except Exception as e:
                        logger.warning(f"[sentinel] SCL failed: {e}")

                for layer, path in [("aot", aot_path), ("wvp", wvp_path)]:
                    asset = item.assets.get(layer)
                    if not asset:
                        continue
                    try:
                        da      = rioxarray.open_rasterio(asset.href, chunks=True)
                        clipped = da.rio.clip_box(
                            minx=lon - 0.05, miny=lat - 0.05,
                            maxx=lon + 0.05, maxy=lat + 0.05,
                            crs="EPSG:4326", allow_one_dimensional_raster=True,
                        )
                        final_da = clipped.rio.reproject_match(reference_da)
                        final_da = final_da.squeeze().drop_vars(["band", "spatial_ref"], errors="ignore")
                        final_da.to_netcdf(path)
                    except Exception as e:
                        logger.warning(f"[sentinel] {layer} failed: {e}")

                visual_asset = item.assets.get(VISUAL_ASSET)
                if visual_asset:
                    try:
                        da      = rioxarray.open_rasterio(visual_asset.href)
                        clipped = da.rio.clip_box(
                            minx=lon - 0.05, miny=lat - 0.05,
                            maxx=lon + 0.05, maxy=lat + 0.05,
                            crs="EPSG:4326", allow_one_dimensional_raster=True,
                        )
                        clipped.rio.to_raster(vis_path)
                    except Exception as e:
                        logger.warning(f"[sentinel] Visual failed: {e}")

                new_entry = FieldAnalysis(
                    location_id=loc.id,
                    nc_filename=os.path.basename(nc_path),
                    mask_filename=os.path.basename(scl_path) if os.path.exists(scl_path) else None,
                    last_data_request_date=timestamp,
                )
                db.add(new_entry)
                db.commit()

                logger.info(f"[sentinel] Saved: {base_name}")

        except Exception as e:
            logger.error(f"[sentinel] Failed loc {loc.id}: {e}", exc_info=True)
            alert_service.send(
                key=f"loc_err_{loc.id}",
                message=format_alert(
                    "LOCATION_SYNC_ERROR",
                    f"Failed to process location: {str(e)}",
                    {"location_id": loc.id}
                )
            )
            db.rollback()