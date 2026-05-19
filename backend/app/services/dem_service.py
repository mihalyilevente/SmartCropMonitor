from __future__ import annotations

import logging
import os
from typing import Optional

import numpy as np
import rioxarray
from pystac_client import Client
from sqlalchemy.orm import Session

from app.core.config import TOPO_DIR
from app.core.database import UserLocation
from geoalchemy2.shape import to_shape

logger = logging.getLogger(__name__)

COPERNICUS_STAC_URL = "https://stac.element84.com"
COPERNICUS_COLLECTION = "cop-dem-glo-30"


def _dem_path(loc: UserLocation) -> str:
    os.makedirs(TOPO_DIR, exist_ok=True)
    return os.path.join(
        TOPO_DIR,
        f"dem_user_{loc.user_id}_loc_{loc.id}.tif",
    )


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

    logger.info(
        "Downloading Copernicus DEM for loc=%d (user=%d) at (%.5f, %.5f) → %s",
        loc.id, loc.user_id, lat, lon, tif_path,
    )

    try:
        client = Client.open(COPERNICUS_STAC_URL)
        search = client.search(
            collections=[COPERNICUS_COLLECTION],
            bbox=[lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05],
            max_items=1,
        )
        items = list(search.items())
    except Exception as exc:
        logger.error("STAC search failed for loc=%d: %s", loc.id, exc)
        return False

    if not items:
        logger.warning(
            "No Copernicus DEM tile found for loc=%d at (%.5f, %.5f).",
            loc.id, lat, lon,
        )
        return False

    item = items[0]
    asset = item.assets.get("data") or item.assets.get("dem")

    if asset is None:
        logger.error(
            "DEM item for loc=%d has no 'data'/'dem' asset. Available: %s",
            loc.id, list(item.assets.keys()),
        )
        return False

    try:
        da = rioxarray.open_rasterio(asset.href, chunks=True)

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


def ensure_dem_for_all_locations(db: Session) -> dict[int, bool]:
    locations = db.query(UserLocation).all()
    results: dict[int, bool] = {}
    for loc in locations:
        results[loc.id] = ensure_dem_for_location(db, loc)
    return results