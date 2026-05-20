import os
import glob
import logging
import datetime

import numpy as np

try:
    import netCDF4 as nc
except ImportError:
    nc = None

from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from app.core.database import WeatherHistory, UserLocation
from app.monitoring.alerting import AlertService, format_alert
from app.core.config import WEBHOOK_URL

logger = logging.getLogger(__name__)
alert_service = AlertService(webhook_url=WEBHOOK_URL)

WRF_OUTPUT_DIR = os.environ.get("WRF_OUTPUT_DIR", "/app/shared/wrf_output")
WRF_SOURCE_TAG = "wrf"

_WRF_EPOCH = datetime.datetime(1900, 1, 1)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _wrf_times(ds) -> list[datetime.datetime]:
    """Return list of datetime objects from WRF Times variable."""
    raw = ds.variables["Times"][:]
    result = []
    for row in raw:
        s = b"".join(row.data).decode("utf-8").replace("_", "T")
        result.append(datetime.datetime.fromisoformat(s))
    return result


def _get(ds, name, t_idx, j, i):
    """Safely extract scalar float from a WRF variable at [t, j, i]."""
    var = ds.variables.get(name)
    if var is None:
        return None
    try:
        val = float(var[t_idx, j, i])
        if np.isnan(val) or np.isinf(val):
            return None
        return round(val, 4)
    except Exception:
        return None


def _kelvin_to_celsius(k):
    if k is None:
        return None
    return round(k - 273.15, 3)


def _find_nearest_grid_point(ds, lat: float, lon: float):
    """Return (j, i) indices of the grid cell closest to (lat, lon)."""
    xlat = ds.variables["XLAT"][0]   # (ny, nx)
    xlon = ds.variables["XLONG"][0]  # (ny, nx)
    dist = (xlat - lat) ** 2 + (xlon - lon) ** 2
    j, i = np.unravel_index(np.argmin(dist), dist.shape)
    return int(j), int(i)


def _wind_direction(u, v) -> float | None:
    """Convert U/V wind components to meteorological degrees (0-360)."""
    if u is None or v is None:
        return None
    deg = (270 - np.degrees(np.arctan2(v, u))) % 360
    return round(float(deg), 1)


def _wind_speed(u, v) -> float | None:
    if u is None or v is None:
        return None
    return round(float(np.sqrt(u ** 2 + v ** 2)), 3)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def ingest_wrf_output(db: Session, location: UserLocation) -> int:
    if nc is None:
        logger.error("netCDF4 not installed — cannot read WRF output")
        return 0

    from geoalchemy2.shape import to_shape
    point = to_shape(location.location)
    lon, lat = point.x, point.y

    pattern = os.path.join(WRF_OUTPUT_DIR, f"loc_{location.id}", "wrfout_d01_*")
    files = sorted(glob.glob(pattern))

    if not files:
        # Try shared folder without per-location subdirectory
        pattern = os.path.join(WRF_OUTPUT_DIR, "wrfout_d01_*")
        files = sorted(glob.glob(pattern))

    if not files:
        logger.info(f"[wrf] No wrfout files found for loc {location.id} at {pattern}")
        return 0

    written = 0

    for fpath in files:
        try:
            written += _ingest_file(db, location, lat, lon, fpath)
        except Exception as e:
            logger.error(f"[wrf] Failed to ingest {fpath}: {e}", exc_info=True)
            alert_service.send(
                key=f"wrf_ingest_error_{location.id}",
                message=format_alert(
                    "WRF_INGEST_ERROR",
                    f"Failed to parse {os.path.basename(fpath)}: {e}",
                    {"location_id": location.id}
                )
            )

    return written


def _ingest_file(db: Session, location: UserLocation, lat: float, lon: float, fpath: str) -> int:
    ds = nc.Dataset(fpath)

    try:
        times = _wrf_times(ds)
        j, i  = _find_nearest_grid_point(ds, lat, lon)

        rows = []
        for t_idx, timestamp in enumerate(times):

            # T2: 2-m temperature in Kelvin
            t2_k = _get(ds, "T2", t_idx, j, i)
            temp  = _kelvin_to_celsius(t2_k)

            # Q2: 2-m water vapour mixing ratio (kg/kg)
            q2  = _get(ds, "Q2", t_idx, j, i)

            # PSFC: surface pressure (Pa → hPa)
            psfc_pa = _get(ds, "PSFC", t_idx, j, i)
            pressure = round(psfc_pa / 100.0, 2) if psfc_pa else None

            # Wind: U10 / V10 (m/s, grid-relative)
            u10 = _get(ds, "U10", t_idx, j, i)
            v10 = _get(ds, "V10", t_idx, j, i)
            wind_spd = _wind_speed(u10, v10)
            wind_dir = _wind_direction(u10, v10)

            # RAINNC: accumulated non-convective rain (mm)
            rain_acc = _get(ds, "RAINNC", t_idx, j, i)

            # CLDFRA: column-average cloud fraction (0-1 → 0-100)
            cldfra_raw = ds.variables.get("CLDFRA")
            cloud_cov = None
            if cldfra_raw is not None:
                try:
                    col = float(np.mean(cldfra_raw[t_idx, :, j, i]))
                    cloud_cov = round(col * 100, 1)
                except Exception:
                    pass

            # TSLB: soil temperature layer 1 (K → °C)
            tslb_raw = ds.variables.get("TSLB")
            soil_temp = None
            if tslb_raw is not None:
                try:
                    soil_temp = _kelvin_to_celsius(float(tslb_raw[t_idx, 0, j, i]))
                except Exception:
                    pass

            # SMOIS: volumetric soil moisture layer 1 (m³/m³)
            smois_raw = ds.variables.get("SMOIS")
            soil_moist = None
            if smois_raw is not None:
                try:
                    soil_moist = round(float(smois_raw[t_idx, 0, j, i]), 4)
                except Exception:
                    pass

            # Relative humidity from T and Q2 (approximate)
            humidity = None
            if temp is not None and q2 is not None and psfc_pa is not None:
                try:
                    t_k    = temp + 273.15
                    e_s    = 6.112 * np.exp(17.67 * temp / (temp + 243.5))  # hPa
                    w_s    = 0.622 * e_s / (psfc_pa / 100.0 - e_s)
                    humidity = round(min(100.0, max(0.0, q2 / w_s * 100.0)), 1)
                except Exception:
                    pass

            # Dew point (Magnus formula)
            dew_point = None
            if temp is not None and humidity is not None:
                try:
                    a, b = 17.27, 237.7
                    gamma  = (a * temp / (b + temp)) + np.log(humidity / 100.0)
                    dew_point = round(b * gamma / (a - gamma), 2)
                except Exception:
                    pass

            rows.append({
                "location_id":           location.id,
                "timestamp":             timestamp,
                "temp":                  temp,
                "humidity":              humidity,
                "dew_point":             dew_point,
                "vapour_pressure_deficit": None,  # computed downstream by Haskell
                "precipitation":         rain_acc,
                "rain":                  rain_acc,
                "showers":               None,
                "snowfall":              None,
                "soil_temperature_0cm":  soil_temp,
                "soil_moisture_0_to_1cm": soil_moist,
                "pressure":              pressure,
                "cloud_coverage":        cloud_cov,
                "wind_speed":            wind_spd,
                "wind_deg":              wind_dir,
                "sunrise":               None,
                "sunset":                None,
                "is_night":              False,
                "data_source":           WRF_SOURCE_TAG,
                "metrics_status":        False,
            })

        if not rows:
            return 0

        stmt = insert(WeatherHistory).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_weather_location_timestamp",
            set_={
                # Only overwrite if existing record is NOT also from WRF
                # (WRF always wins over open-meteo; newer WRF run wins over older)
                "temp":                   stmt.excluded.temp,
                "humidity":               stmt.excluded.humidity,
                "dew_point":              stmt.excluded.dew_point,
                "precipitation":          stmt.excluded.precipitation,
                "rain":                   stmt.excluded.rain,
                "soil_temperature_0cm":   stmt.excluded.soil_temperature_0cm,
                "soil_moisture_0_to_1cm": stmt.excluded.soil_moisture_0_to_1cm,
                "pressure":               stmt.excluded.pressure,
                "cloud_coverage":         stmt.excluded.cloud_coverage,
                "wind_speed":             stmt.excluded.wind_speed,
                "wind_deg":               stmt.excluded.wind_deg,
                "data_source":            stmt.excluded.data_source,
                "metrics_status":         False,
            }
        )

        db.execute(stmt)
        db.commit()

        logger.info(f"[wrf] Wrote {len(rows)} records for loc {location.id} from {os.path.basename(fpath)}")
        return len(rows)

    finally:
        ds.close()


def has_wrf_coverage(db: Session, location_id: int, timestamp: datetime.datetime) -> bool:
    """Return True if a WRF record already exists for this location + hour."""
    return db.query(WeatherHistory).filter(
        WeatherHistory.location_id == location_id,
        WeatherHistory.timestamp   == timestamp,
        WeatherHistory.data_source == WRF_SOURCE_TAG,
    ).first() is not None


def wrf_covered_timestamps(db: Session, location_id: int) -> set[datetime.datetime]:
    """Return the full set of timestamps already covered by WRF for this location."""
    rows = db.query(WeatherHistory.timestamp).filter(
        WeatherHistory.location_id == location_id,
        WeatherHistory.data_source == WRF_SOURCE_TAG,
    ).all()
    return {r.timestamp for r in rows}
