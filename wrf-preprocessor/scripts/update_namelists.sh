#!/bin/bash
set -euo pipefail

INFO_FILE="/app/shared/gfs_run_info.txt"
WPS_NML="/app/WPS/namelist.wps"
WRF_NML="/app/WRF/test/em_real/namelist.input"

if [ ! -f "${INFO_FILE}" ]; then
    echo "[update_namelists] ERROR: ${INFO_FILE} not found."
    exit 1
fi

START_DATE=$(grep "^start_date=" "${INFO_FILE}" | cut -d= -f2)
END_DATE=$(grep "^end_date="   "${INFO_FILE}" | cut -d= -f2)

START_YEAR=$(echo  "${START_DATE}" | cut -c1-4)
START_MONTH=$(echo "${START_DATE}" | cut -c6-7)
START_DAY=$(echo   "${START_DATE}" | cut -c9-10)
START_HOUR=$(echo  "${START_DATE}" | cut -c12-13)

END_YEAR=$(echo  "${END_DATE}" | cut -c1-4)
END_MONTH=$(echo "${END_DATE}" | cut -c6-7)
END_DAY=$(echo   "${END_DATE}" | cut -c9-10)
END_HOUR=$(echo  "${END_DATE}" | cut -c12-13)

echo "[update_namelists] start=${START_DATE}  end=${END_DATE}"

if [ -f "${WPS_NML}" ]; then
    sed -i "s/start_date\s*=\s*'[^']*'/start_date = '${START_DATE}'/" "${WPS_NML}"
    sed -i "s/end_date\s*=\s*'[^']*'/end_date   = '${END_DATE}'/"     "${WPS_NML}"
    echo "[update_namelists] namelist.wps patched"
fi

if [ -f "${WRF_NML}" ]; then
    sed -i "s/start_year\s*=\s*[0-9]*/start_year   = ${START_YEAR}/"   "${WRF_NML}"
    sed -i "s/start_month\s*=\s*[0-9]*/start_month  = ${START_MONTH}/" "${WRF_NML}"
    sed -i "s/start_day\s*=\s*[0-9]*/start_day    = ${START_DAY}/"     "${WRF_NML}"
    sed -i "s/start_hour\s*=\s*[0-9]*/start_hour   = ${START_HOUR}/"   "${WRF_NML}"
    sed -i "s/end_year\s*=\s*[0-9]*/end_year     = ${END_YEAR}/"       "${WRF_NML}"
    sed -i "s/end_month\s*=\s*[0-9]*/end_month    = ${END_MONTH}/"     "${WRF_NML}"
    sed -i "s/end_day\s*=\s*[0-9]*/end_day      = ${END_DAY}/"         "${WRF_NML}"
    sed -i "s/end_hour\s*=\s*[0-9]*/end_hour     = ${END_HOUR}/"       "${WRF_NML}"
    echo "[update_namelists] namelist.input patched"
fi