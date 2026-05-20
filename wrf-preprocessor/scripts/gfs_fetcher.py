import os
import datetime
import logging
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
FORECAST_HOURS  = int(os.environ.get("GFS_FORECAST_HOURS", 48))
INTERVAL_HOURS  = int(os.environ.get("GFS_INTERVAL_HOURS", 3))
GRIB_INPUT_DIR  = os.environ.get("GRIB_INPUT_DIR", "/app/shared/grib_input")

NOMADS_BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"


REQUIRED_VARS = [
    "var_HGT",
    "var_TMP",
    "var_UGRD",
    "var_VGRD",
    "var_RH",
    "var_SPFH",
    "var_PRES",
    "var_PRMSL",
    "var_PWAT",
    "var_LAND",
    "var_ICEC",
    "var_SKINTEMP",
    "var_SOILW",
    "var_TSOIL",
    "var_WEASD",
]

PRESSURE_LEVELS = [
    "lev_1000_mb", "lev_975_mb", "lev_950_mb", "lev_925_mb",
    "lev_900_mb",  "lev_850_mb", "lev_800_mb", "lev_750_mb",
    "lev_700_mb",  "lev_600_mb", "lev_500_mb", "lev_400_mb",
    "lev_300_mb",  "lev_250_mb", "lev_200_mb", "lev_150_mb",
    "lev_100_mb",  "lev_50_mb",
]

SURFACE_LEVELS = [
    "lev_surface",
    "lev_mean_sea_level",
    "lev_2_m_above_ground",
    "lev_10_m_above_ground",
    "lev_entire_atmosphere_%5C%28considered_as_a_single_layer%5C%29",
]


def _latest_gfs_run(max_age_hours: int = 6) -> tuple[datetime.datetime, int]:
    """
    Return (run_datetime, run_hour) for the most recent available GFS run.
    GFS publishes ~3-4h after the nominal run time, so we look back up to
    max_age_hours to find a run that is actually on NOMADS.
    """
    now = datetime.datetime.utcnow()

    for hours_back in range(0, max_age_hours * 4 + 1):
        candidate = now - datetime.timedelta(hours=hours_back)
        run_hour  = (candidate.hour // 6) * 6
        run_dt    = candidate.replace(hour=run_hour, minute=0, second=0, microsecond=0)

        probe_url = (
            f"{NOMADS_BASE}/gfs.{run_dt.strftime('%Y%m%d')}"
            f"/{run_hour:02d}/atmos/gfs.t{run_hour:02d}z.pgrb2.0p25.f000"
        )
        try:
            resp = requests.head(probe_url, timeout=10)
            if resp.status_code == 200:
                return run_dt, run_hour
        except requests.RequestException:
            continue

    raise RuntimeError("No recent GFS run found on NOMADS after checking 24 hours back.")


def _build_filter_url(run_dt: datetime.datetime, run_hour: int, fhour: int) -> str:
    date_str  = run_dt.strftime("%Y%m%d")
    file_name = f"gfs.t{run_hour:02d}z.pgrb2.0p25.f{fhour:03d}"
    dir_path  = f"%2Fgfs.{date_str}%2F{run_hour:02d}%2Fatmos"

    params = ["file=" + file_name, "dir=" + dir_path]
    params += REQUIRED_VARS
    params += PRESSURE_LEVELS
    params += SURFACE_LEVELS

    return f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?" + "&".join(params)


def _download_file(url: str, dest: Path, retries: int = 3) -> bool:
    for attempt in range(1, retries + 1):
        try:
            with requests.get(url, stream=True, timeout=120) as resp:
                resp.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                with open(dest, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=1 << 20):
                        f.write(chunk)

            size_mb = dest.stat().st_size / 1024 ** 2
            if size_mb < 0.5:
                logger.warning(f"Suspiciously small file ({size_mb:.1f} MB): {dest.name}")

            logger.info(f"  Downloaded {dest.name} ({size_mb:.1f} MB)")
            return True

        except Exception as e:
            logger.warning(f"  Attempt {attempt}/{retries} failed for {dest.name}: {e}")
            if dest.exists():
                dest.unlink()

    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_gfs_for_wrf(
    output_dir: str = GRIB_INPUT_DIR,
    forecast_hours: int = FORECAST_HOURS,
    interval_hours: int = INTERVAL_HOURS,
) -> list[str]:
    """
    Download GFS GRIB2 files for the latest available run.

    Returns a list of absolute paths to the downloaded files.
    Skips files that already exist and are larger than 1 MB.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    logger.info("[gfs] Detecting latest GFS run on NOMADS...")
    run_dt, run_hour = _latest_gfs_run()
    logger.info(f"[gfs] Using run: {run_dt.strftime('%Y-%m-%d')} {run_hour:02d}z")

    forecast_steps = list(range(0, forecast_hours + 1, interval_hours))
    logger.info(f"[gfs] Downloading {len(forecast_steps)} files (f000–f{forecast_hours:03d}, every {interval_hours}h)")

    downloaded = []
    failed     = []

    for fhour in forecast_steps:
        fname = f"gfs.t{run_hour:02d}z.pgrb2.0p25.f{fhour:03d}.grib2"
        dest  = out / fname

        if dest.exists() and dest.stat().st_size > 1_000_000:
            logger.info(f"  Skipping {fname} (already exists)")
            downloaded.append(str(dest))
            continue

        url = _build_filter_url(run_dt, run_hour, fhour)
        ok  = _download_file(url, dest)

        if ok:
            downloaded.append(str(dest))
        else:
            failed.append(fname)
            logger.error(f"  FAILED: {fname}")

    logger.info(
        f"[gfs] Done — {len(downloaded)} downloaded, {len(failed)} failed. "
        f"Output: {output_dir}"
    )

    if failed:
        raise RuntimeError(f"GFS download incomplete. Failed files: {failed}")

    # Write a marker file so WPS pipeline knows which run was used
    marker = out / "gfs_run.txt"
    marker.write_text(
        f"run_date={run_dt.strftime('%Y-%m-%d')}\n"
        f"run_hour={run_hour:02d}\n"
        f"forecast_hours={forecast_hours}\n"
        f"files={len(downloaded)}\n"
    )

    return downloaded


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    paths = fetch_gfs_for_wrf()
    print(f"\nReady for ungrib: {len(paths)} files in {GRIB_INPUT_DIR}")