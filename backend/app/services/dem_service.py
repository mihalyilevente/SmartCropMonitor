"""
Copernicus DEM (GLO-30, 30m) — download & cache service.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import numpy as np
import requests
import rioxarray
from sqlalchemy.orm import Session

from app.core.config import TOPO_DIR
from app.core.database import UserLocation
from geoalchemy2.shape import to_shape

logger = logging.getLogger(__name__)

S3_BASE = "https://copernicus-dem-30m.s3.amazonaws.com"


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _tile_url(lat: float, lon: float) -> str:
    """
    Build the direct S3 URL for the GLO-30 tile that contains (lat, lon).

    GLO-30 tiles are 1°×1° cells. The tile is identified by the floor of
    the coordinates, e.g. lat=47.728 → N47, lon=19.648 → E019.
    """
    lat_floor = int(lat // 1)   # floor toward zero for negative latitudes
    lon_floor = int(lon // 1)

    ns = "N" if lat_floor >= 0 else "S"
    ew = "E" if lon_floor >= 0 else "W"

    lat_abs = abs(lat_floor)
    lon_abs = abs(lon_floor)

    tile_name = (
        f"Copernicus_DSM_COG_10_{ns}{lat_abs:02d}_00_{ew}{lon_abs:03d}_00_DEM"
    )
    return f"{S3_BASE}/{tile_name}/{tile_name}.tif"


# ---------------------------------------------------------------------------
# File path
# ---------------------------------------------------------------------------

def _dem_path(loc: UserLocation) -> str:
    os.makedirs(TOPO_DIR, exist_ok=True)
    return os.path.join(
        TOPO_DIR,
        f"dem_user_{loc.user_id}_loc_{loc.id}.tif",
    )


# ---------------------------------------------------------------------------
# Public API — download
# ---------------------------------------------------------------------------

def ensure_dem_for_location(db: Session, loc: UserLocation) -> bool:
    tif_path = _dem_path(loc)

    if os.path.exists(tif_path):
        logger.debug("DEM already cached for loc=%d — skipping.", loc.id)
        return True

    try:
        point = to_shape(loc.location)
        lon, lat = point.x, point.y
    except Exception as exc:
        logger.error("Cannot resolve geometry for loc=%d: %s", loc.id, exc)
        return False

    url = _tile_url(lat, lon)
    logger.info(
        "Downloading Copernicus DEM for loc=%d (user=%d) at (%.5f, %.5f)\n  → %s",
        loc.id, loc.user_id, lat, lon, url,
    )

    try:
        head = requests.head(url, timeout=10)
        if head.status_code == 404:
            logger.warning(
                "DEM tile not found on S3 for loc=%d (%.5f, %.5f). "
                "Tile may be in restricted country list.",
                loc.id, lat, lon,
            )
            return False
        head.raise_for_status()
    except requests.RequestException as exc:
        logger.error("HEAD check failed for loc=%d: %s", loc.id, exc)
        return False

    try:
        da = rioxarray.open_rasterio(url, chunks=True)

        clipped = da.rio.clip_box(
            minx=lon - 0.05,
            miny=lat - 0.05,
            maxx=lon + 0.05,
            maxy=lat + 0.05,
            crs="EPSG:4326",
        )

        clipped.rio.to_raster(tif_path)
        logger.info("DEM saved: %s", tif_path)
        return True

    except Exception as exc:
        logger.error("Failed to download/clip DEM for loc=%d: %s", loc.id, exc)
        if os.path.exists(tif_path):
            os.remove(tif_path)
        return False


# ---------------------------------------------------------------------------
# Public API — read elevation
# ---------------------------------------------------------------------------

def get_elevation_for_location(loc: UserLocation) -> Optional[float]:
    tif_path = _dem_path(loc)

    if not os.path.exists(tif_path):
        logger.warning("DEM tile not found for loc=%d at %s.", loc.id, tif_path)
        return None

    try:
        point = to_shape(loc.location)
        lon, lat = point.x, point.y
    except Exception as exc:
        logger.error("Cannot resolve geometry for loc=%d: %s", loc.id, exc)
        return None

    try:
        da = rioxarray.open_rasterio(tif_path, masked=True)
        val = da.sel(x=lon, y=lat, method="nearest").values
        elev = float(np.squeeze(val))

        if np.isnan(elev):
            logger.warning("DEM returned NaN at (%.5f, %.5f) for loc=%d.", lat, lon, loc.id)
            return None

        logger.debug("DEM elevation for loc=%d: %.1f m", loc.id, elev)
        return elev

    except Exception as exc:
        logger.error("Failed to read elevation for loc=%d: %s", loc.id, exc)
        return None


# ---------------------------------------------------------------------------
# Batch helper
# ---------------------------------------------------------------------------

def ensure_dem_for_all_locations(db: Session) -> dict[int, bool]:
    locations = db.query(UserLocation).all()
    results: dict[int, bool] = {}
    for loc in locations:
        results[loc.id] = ensure_dem_for_location(db, loc)
    return results
