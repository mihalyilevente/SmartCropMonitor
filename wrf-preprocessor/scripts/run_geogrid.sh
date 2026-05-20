#!/bin/bash
set -euo pipefail

cd /app/WPS

echo "[geogrid] Cleaning previous output..."
rm -f geo_em.d0*.nc geogrid.log*

echo "[geogrid] Running geogrid.exe..."
./geogrid.exe 2>&1 | tee geogrid.log

if ! ls geo_em.d01.nc 1>/dev/null 2>&1; then
    echo "[geogrid] ERROR: geo_em.d01.nc was not created. Check geogrid.log for details."
    exit 1
fi

echo "[geogrid] Done."
