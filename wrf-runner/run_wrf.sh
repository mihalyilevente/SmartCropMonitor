#!/bin/bash
set -euo pipefail

WRF_RUN_DIR="/app/WRF/test/em_real"
INPUT_DIR="${WRF_RUN_DIR}/input_data"
SHARED_DIR="/app/shared"
LOCATION_ID="${WRF_LOCATION_ID:-0}"
WRF_OUTPUT_DIR="${SHARED_DIR}/wrf_output/loc_${LOCATION_ID}"
SCRIPTS_DIR="/app/scripts"

notify() { bash "${SCRIPTS_DIR}/slack_notify.sh" "$1" "$2" || true; }

cd "${WRF_RUN_DIR}"

notify "info" ":gear: WRF runner started for location *${LOCATION_ID}*"

echo "[wrf] Linking met_em input files..."
if ! ls "${INPUT_DIR}"/met_em.d01.* 1>/dev/null 2>&1; then
    notify "error" ":x: *No met_em files* for loc ${LOCATION_ID} — preprocessor must run first"
    exit 1
fi
ln -sf "${INPUT_DIR}"/met_em.d01.* .

if [ -f "${SHARED_DIR}/namelist.input" ]; then
    echo "[wrf] Using namelist.input from shared volume..."
    cp "${SHARED_DIR}/namelist.input" namelist.input
else
    echo "[wrf] WARNING: No namelist.input in shared volume, using default"
fi

MET_FILE=$(ls "${INPUT_DIR}"/met_em.d01.* 2>/dev/null | head -1)
if [ -n "${MET_FILE}" ]; then
    NUM_LEVELS=$(ncdump -h "${MET_FILE}" 2>/dev/null | grep 'num_metgrid_levels' | head -1 | grep -o '[0-9]*' | head -1)
    if [ -n "${NUM_LEVELS}" ]; then
        echo "[wrf] Detected num_metgrid_levels = ${NUM_LEVELS}"
        sed -i "s/num_metgrid_levels\s*=\s*[0-9]*/num_metgrid_levels                  = ${NUM_LEVELS}/" namelist.input
    fi
fi

echo "[wrf] Running real.exe..."
notify "info" ":hourglass: real.exe started for loc *${LOCATION_ID}*..."
./real.exe 2>&1 | tee rsl.out.0000

if [ ! -f "wrfinput_d01" ] || [ ! -f "wrfbdy_d01" ]; then
    ERROR=$(tail -20 rsl.error.0000 2>/dev/null | tr '\n' ' ')
    notify "error" ":x: *real.exe failed* for loc ${LOCATION_ID}\n\`\`\`${ERROR}\`\`\`"
    cat rsl.error.0000 2>/dev/null || true
    exit 1
fi
notify "success" ":white_check_mark: real.exe complete for loc *${LOCATION_ID}*"

echo "[wrf] Running wrf.exe..."
notify "info" ":hourglass_flowing_sand: wrf.exe started for loc *${LOCATION_ID}*..."
./wrf.exe 2>&1 | tee -a rsl.out.0000

if ! ls wrfout_d01_* 1>/dev/null 2>&1; then
    ERROR=$(tail -20 rsl.error.0000 2>/dev/null | tr '\n' ' ')
    notify "error" ":x: *wrf.exe failed* for loc ${LOCATION_ID}\n\`\`\`${ERROR}\`\`\`"
    cat rsl.error.0000 2>/dev/null || true
    exit 1
fi

WRFOUT_COUNT=$(ls wrfout_d01_* | wc -l)
WRFOUT_SIZE=$(du -sh wrfout_d01_* 2>/dev/null | tail -1 | cut -f1)

mkdir -p "${WRF_OUTPUT_DIR}"
cp wrfout_d01_* "${WRF_OUTPUT_DIR}/"

rm -f met_em.d01.* wrfinput_d01 wrfbdy_d01

notify "success" ":tada: *WRF complete* loc ${LOCATION_ID} — ${WRFOUT_COUNT} files (${WRFOUT_SIZE}) → \`wrf_output/loc_${LOCATION_ID}/\`"

echo "[wrf] Done. Output:"
ls -lh "${WRF_OUTPUT_DIR}"/wrfout_d01_*
