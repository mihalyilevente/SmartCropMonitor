#!/bin/bash
set -euo pipefail

cd /app/WPS

echo "[ungrib] Cleaning previous intermediate files..."
rm -f GRIBFILE.* FILE:* ungrib.log*

GRIB_DIR="/app/shared/grib_input"

if ! ls "${GRIB_DIR}"/*.grib2 1>/dev/null 2>&1; then
    echo "[ungrib] ERROR: No .grib2 files found in ${GRIB_DIR}"
    exit 1
fi

echo "[ungrib] Linking GRIB files from ${GRIB_DIR}..."
./link_grib.csh "${GRIB_DIR}"/*.grib2

echo "[ungrib] Linking Vtable for GFS..."
ln -sf ungrib/Variable_Tables/Vtable.GFS Vtable

echo "[ungrib] Running ungrib.exe..."
./ungrib.exe 2>&1 | tee ungrib.log

if ! ls FILE:* 1>/dev/null 2>&1; then
    echo "[ungrib] ERROR: No intermediate FILE:* output found. Check ungrib.log for details."
    exit 1
fi

echo "[ungrib] Done."
