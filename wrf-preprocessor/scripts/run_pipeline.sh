#!/bin/bash
set -euo pipefail

SHARED_DIR="/app/shared"
WPS_DIR="/app/WPS"
SCRIPTS_DIR="/app/scripts"
GRIB_DIR="${SHARED_DIR}/grib_input"

notify() { bash "${SCRIPTS_DIR}/slack_notify.sh" "$1" "$2" || true; }

echo "=== WPS PRE-PROCESSING PIPELINE START ==="
notify "info" ":rocket: WPS pipeline started for loc *${WRF_LOCATION_ID:-0}*"

echo "[pipeline] Copying namelist.wps..."
if [ ! -f "${SHARED_DIR}/namelist.wps" ]; then
    notify "error" ":x: *namelist.wps not found* in shared volume"
    exit 1
fi
cp "${SHARED_DIR}/namelist.wps" "${WPS_DIR}/namelist.wps"

# Clean stale GRIB files from previous location run
echo "[pipeline] Cleaning stale GRIB files from previous run..."
rm -f "${GRIB_DIR}"/*.grib2 "${GRIB_DIR}"/gfs_run_info.txt 2>/dev/null || true

echo "[pipeline] Step 1/4 — Downloading GFS GRIB2 from NOMADS..."
if python3 "${SCRIPTS_DIR}/gfs_fetcher.py"; then
    GFS_COUNT=$(ls "${GRIB_DIR}"/*.grib2 2>/dev/null | wc -l)
    notify "success" ":satellite: GFS download complete — *${GFS_COUNT} files*"
else
    notify "error" ":x: *GFS download failed* — check NOMADS or network"
    exit 1
fi

if [ -f "${SHARED_DIR}/gfs_run_info.txt" ]; then
    echo "[pipeline] Patching namelist dates and coordinates..."
    bash "${SCRIPTS_DIR}/update_namelists.sh"
    RUN_INFO=$(cat "${SHARED_DIR}/gfs_run_info.txt" | tr '\n' ' ')
    notify "info" ":calendar: Namelists patched — \`${RUN_INFO}\`"
fi

echo "[pipeline] Step 2/4 — Geogrid..."
if bash "${SCRIPTS_DIR}/run_geogrid.sh"; then
    notify "success" ":world_map: Geogrid complete"
else
    notify "error" ":x: *Geogrid failed* — check geogrid.log"
    exit 1
fi

echo "[pipeline] Step 3/4 — Ungrib..."
if bash "${SCRIPTS_DIR}/run_ungrib.sh"; then
    notify "success" ":package: Ungrib complete"
else
    notify "error" ":x: *Ungrib failed* — check ungrib.log"
    exit 1
fi

echo "[pipeline] Step 4/4 — Metgrid..."
if bash "${SCRIPTS_DIR}/run_metgrid.sh"; then
    MET_COUNT=$(ls "${WPS_DIR}"/met_em.d01.* 2>/dev/null | wc -l)
    notify "success" ":bar_chart: Metgrid complete — *${MET_COUNT} met_em files*"
else
    notify "error" ":x: *Metgrid failed* — check metgrid.log"
    exit 1
fi

echo "[pipeline] Exporting met_em to shared volume..."
cp "${WPS_DIR}"/met_em.d01.* "${SHARED_DIR}/"

notify "success" ":white_check_mark: *WPS pipeline complete* loc *${WRF_LOCATION_ID:-0}* — met_em ready"
echo "=== WPS PRE-PROCESSING PIPELINE COMPLETE ==="