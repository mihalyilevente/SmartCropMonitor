#!/bin/bash
set -euo pipefail

cd /app/WPS

echo "[metgrid] Cleaning previous output..."
rm -f met_em.d0*.* metgrid.log*

echo "[metgrid] Running metgrid.exe..."
./metgrid.exe 2>&1 | tee metgrid.log

if ! ls met_em.d01.* 1>/dev/null 2>&1; then
    echo "[metgrid] ERROR: No met_em files were created. Check metgrid.log for details."
    exit 1
fi

echo "[metgrid] Done. Files created:"
ls -lh met_em.d01.*
