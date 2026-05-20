#!/bin/bash
set -euo pipefail

WRF_RUN_DIR="/app/WRF/test/em_real"
INPUT_DIR="${WRF_RUN_DIR}/input_data"
SHARED_DIR="/app/shared"
WRF_OUTPUT_DIR="${SHARED_DIR}/wrf_output"
SCRIPTS_DIR="/app/scripts"

notify() { bash "${SCRIPTS_DIR}/slack_notify.sh" "$1" "$2" || true; }

cd "${WRF_RUN_DIR}"

notify "info" ":gear: WRF runner started"

echo "[wrf] Linking met_em input files..."
if ! ls "${INPUT_DIR}"/met_em.d01.* 1>/dev/null 2>&1; then
    notify "error" ":x: *No met_em files found* — preprocessor must run first"
    exit 1
fi
ln -sf "${INPUT_DIR}"/met_em.d01.* .

echo "[wrf] Running real.exe..."
notify "info" ":hourglass: real.exe started (vertical interpolation)..."
./real.exe 2>&1 | tee rsl.out.0000

if [ ! -f "wrfinput_d01" ] || [ ! -f "wrfbdy_d01" ]; then
    ERROR=$(tail -20 rsl.error.0000 2>/dev/null | tr '\n' ' ')
    notify "error" ":x: *real.exe failed*\n\`\`\`${ERROR}\`\`\`"
    cat rsl.error.0000 2>/dev/null || true
    exit 1
fi
notify "success" ":white_check_mark: real.exe complete — wrfinput_d01 ready"

echo "[wrf] Running wrf.exe..."
notify "info" ":hourglass_flowing_sand: wrf.exe started — this takes a while..."
./wrf.exe 2>&1 | tee -a rsl.out.0000

if ! ls wrfout_d01_* 1>/dev/null 2>&1; then
    ERROR=$(tail -20 rsl.error.0000 2>/dev/null | tr '\n' ' ')
    notify "error" ":x: *wrf.exe failed*\n\`\`\`${ERROR}\`\`\`"
    cat rsl.error.0000 2>/dev/null || true
    exit 1
fi

WRFOUT_COUNT=$(ls wrfout_d01_* | wc -l)
WRFOUT_SIZE=$(du -sh wrfout_d01_* | tail -1 | cut -f1)

mkdir -p "${WRF_OUTPUT_DIR}"
cp wrfout_d01_* "${WRF_OUTPUT_DIR}/"

notify "success" ":tada: *WRF complete* — ${WRFOUT_COUNT} output files (${WRFOUT_SIZE}) copied to shared volume"

echo "[wrf] Done:"
ls -lh "${WRF_OUTPUT_DIR}"/wrfout_d01_*