"""
Environment variables:
    GFS_FORECAST_HOURS     (default: 48)
    GFS_INTERVAL_HOURS     (default: 3)
    GRIB_INPUT_DIR         (default: /app/shared/grib_input)
    SHARED_DIR             (default: /app/shared)
    NAMELIST_WPS_PATH      (default: /app/WPS/namelist.wps)
    WRF_BBOX_PADDING_DEG   (default: 2.5)
    WRF_CENTER_LAT         fallback if namelist.wps has placeholders
    WRF_CENTER_LON         fallback if namelist.wps has placeholders
"""

import os
import re
import datetime
import logging
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

FORECAST_HOURS   = int(os.environ.get("GFS_FORECAST_HOURS", 48))
INTERVAL_HOURS   = int(os.environ.get("GFS_INTERVAL_HOURS", 3))
GRIB_INPUT_DIR   = os.environ.get("GRIB_INPUT_DIR", "/app/shared/grib_input")
SHARED_DIR       = os.environ.get("SHARED_DIR", "/app/shared")
NAMELIST_WPS     = os.environ.get("NAMELIST_WPS_PATH", "/app/WPS/namelist.wps")
BBOX_PADDING_DEG = float(os.environ.get("WRF_BBOX_PADDING_DEG", 2.5))

NOMADS_BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"

REQUIRED_VARS = [
    "var_HGT", "var_TMP", "var_UGRD", "var_VGRD",
    "var_RH", "var_SPFH", "var_PRES", "var_PRMSL",
    "var_PWAT", "var_LAND", "var_SOILW", "var_TSOIL", "var_MSLET",
]

PRESSURE_LEVELS = [
    "lev_1000_mb", "lev_925_mb", "lev_850_mb",
    "lev_700_mb",  "lev_500_mb", "lev_300_mb",
    "lev_200_mb",  "lev_100_mb",
]

SURFACE_LEVELS = [
    "lev_surface",
    "lev_mean_sea_level",
    "lev_2_m_above_ground",
    "lev_10_m_above_ground",
    "lev_0-0.1_m_below_ground",
    "lev_0.1-0.4_m_below_ground",
    "lev_0.4-1_m_below_ground",
    "lev_1-2_m_below_ground",
]


def _parse_nml(text, key):
    m = re.search(rf"{key}\s*=\s*([\-0-9.]+)", text)
    if m:
        return float(m.group(1))
    return None


def _domain_bbox():
    center_lat = center_lon = None
    half_lat = half_lon = 0.0

    wps = Path(NAMELIST_WPS)
    if wps.exists():
        text = wps.read_text()
        center_lat = _parse_nml(text, "ref_lat")
        center_lon = _parse_nml(text, "ref_lon")
        e_we = _parse_nml(text, "e_we")
        e_sn = _parse_nml(text, "e_sn")
        dx   = _parse_nml(text, "dx")
        dy   = _parse_nml(text, "dy")
        if e_we and dx:
            half_lon = (e_we * dx / 2) / 111_320
        if e_sn and dy:
            half_lat = (e_sn * dy / 2) / 111_320

    center_lat = center_lat or float(os.environ.get("WRF_CENTER_LAT", 0))
    center_lon = center_lon or float(os.environ.get("WRF_CENTER_LON", 0))

    if center_lat == 0 and center_lon == 0:
        raise RuntimeError("Domain center unknown. Set WRF_CENTER_LAT / WRF_CENTER_LON env vars.")

    p = BBOX_PADDING_DEG
    lat_min = max(round(center_lat - half_lat - p, 2), -90.0)
    lat_max = min(round(center_lat + half_lat + p, 2),  90.0)
    lon_min = max(round(center_lon - half_lon - p, 2), -180.0)
    lon_max = min(round(center_lon + half_lon + p, 2),  180.0)

    logger.info(f"[gfs] bbox  lat[{lat_min}, {lat_max}]  lon[{lon_min}, {lon_max}]")
    return lat_min, lon_min, lat_max, lon_max


def _latest_gfs_run(max_age_hours=6):
    now = datetime.datetime.utcnow()
    for h in range(0, max_age_hours * 4 + 1):
        candidate = now - datetime.timedelta(hours=h)
        run_hour  = (candidate.hour // 6) * 6
        run_dt    = candidate.replace(hour=run_hour, minute=0, second=0, microsecond=0)
        probe     = (
            f"{NOMADS_BASE}/gfs.{run_dt.strftime('%Y%m%d')}"
            f"/{run_hour:02d}/atmos/gfs.t{run_hour:02d}z.pgrb2.0p25.f000"
        )
        try:
            if requests.head(probe, timeout=10).status_code == 200:
                return run_dt, run_hour
        except requests.RequestException:
            continue
    raise RuntimeError("No recent GFS run found on NOMADS (checked 24h back).")


def _build_url(run_dt, run_hour, fhour, lat_min, lon_min, lat_max, lon_max):
    date_str  = run_dt.strftime("%Y%m%d")
    file_name = f"gfs.t{run_hour:02d}z.pgrb2.0p25.f{fhour:03d}"
    dir_path  = f"%2Fgfs.{date_str}%2F{run_hour:02d}%2Fatmos"
    params = [
        "file=" + file_name, "dir=" + dir_path,
        "subregion=",
        f"leftlon={lon_min}", f"rightlon={lon_max}",
        f"toplat={lat_max}",  f"bottomlat={lat_min}",
    ] + [v + "=on" for v in REQUIRED_VARS] + [v + "=on" for v in PRESSURE_LEVELS] + [v + "=on" for v in SURFACE_LEVELS]
    return "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?" + "&".join(params)


def _download(url, dest, retries=3):
    for attempt in range(1, retries + 1):
        try:
            with requests.get(url, stream=True, timeout=120) as r:
                r.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            size_mb = dest.stat().st_size / 1024 ** 2
            if size_mb < 0.1:
                logger.warning(f"  Small file ({size_mb:.2f} MB): {dest.name}")
            logger.info(f"  {dest.name}  ({size_mb:.1f} MB)")
            return True
        except Exception as e:
            logger.warning(f"  Attempt {attempt}/{retries} failed: {e}")
            if dest.exists():
                dest.unlink()
    return False


def fetch_gfs_for_wrf(
    output_dir=GRIB_INPUT_DIR,
    forecast_hours=FORECAST_HOURS,
    interval_hours=INTERVAL_HOURS,
):
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    lat_min, lon_min, lat_max, lon_max = _domain_bbox()

    logger.info("[gfs] Detecting latest GFS run on NOMADS...")
    run_dt, run_hour = _latest_gfs_run()
    logger.info(f"[gfs] Run: {run_dt.strftime('%Y-%m-%d')} {run_hour:02d}z")

    steps = list(range(0, forecast_hours + 1, interval_hours))
    logger.info(f"[gfs] {len(steps)} files  f000-f{forecast_hours:03d}  step={interval_hours}h")

    downloaded, failed = [], []
    for fhour in steps:
        fname = f"gfs.t{run_hour:02d}z.pgrb2.0p25.f{fhour:03d}.grib2"
        dest  = out / fname
        if dest.exists() and dest.stat().st_size > 100_000:
            logger.info(f"  Skip {fname} (exists)")
            downloaded.append(str(dest))
            continue
        url = _build_url(run_dt, run_hour, fhour, lat_min, lon_min, lat_max, lon_max)
        if _download(url, dest):
            downloaded.append(str(dest))
        else:
            failed.append(fname)

    if failed:
        raise RuntimeError(f"GFS download incomplete. Failed: {failed}")

    run_end   = run_dt + datetime.timedelta(hours=forecast_hours)
    info_path = Path(SHARED_DIR) / "gfs_run_info.txt"
    info_path.parent.mkdir(parents=True, exist_ok=True)
    info_path.write_text(
        f"run_date={run_dt.strftime('%Y-%m-%d')}\n"
        f"run_hour={run_hour:02d}\n"
        f"start_date={run_dt.strftime('%Y-%m-%d_%H:00:00')}\n"
        f"end_date={run_end.strftime('%Y-%m-%d_%H:00:00')}\n"
        f"forecast_hours={forecast_hours}\n"
        f"files={len(downloaded)}\n"
        f"bbox={lat_min},{lon_min},{lat_max},{lon_max}\n"
    )
    logger.info(f"[gfs] Run info → {info_path}")
    logger.info(f"[gfs] Done — {len(downloaded)} files in {output_dir}")
    return downloaded


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    paths = fetch_gfs_for_wrf()
    print(f"\nReady: {len(paths)} files in {GRIB_INPUT_DIR}")