import os
import numpy as np
import xarray as xr

from fastapi import Depends, APIRouter, HTTPException

from sqlalchemy.orm import Session

from app.core.database import UserLocation, FieldAnalysis, get_db

from app.core.config import STORAGE_PATH

router = APIRouter()


@router.get("/user/files", tags=["History"])
async def get_user_files(user_id: int, db: Session = Depends(get_db)):
    history = (
        db.query(FieldAnalysis)
        .join(UserLocation)
        .filter(UserLocation.user_id == user_id)
        .all()
    )

    return [
        {
            "id": h.id,
            "location": h.location.label,
            "filename": h.nc_filename,
            "date": h.last_data_request_date
        }
        for h in history
    ]



@router.get("/api/v1/plot-data/{filename}")
async def get_plot_data(
    filename: str,
    mode: str = "heatmap",   # heatmap | raw
    filter: str = "none"     # none | ndvi | log
):
    file_path = os.path.join(STORAGE_PATH, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with xr.open_dataset(file_path) as ds:

            if len(ds.data_vars) == 0:
                return {"ok": False, "error": "no_data_vars"}

            var_name = list(ds.data_vars)[0]
            da = ds[var_name]

            if "band" in da.coords:
                try:
                    da = da.sel(band="red")
                except Exception:
                    da = da.isel(band=0)

            data = np.asarray(da.values)

            # -------------------------
            # scalar protection
            # -------------------------
            if data.ndim == 0:
                return {"ok": False, "error": "scalar_raster"}

            # -------------------------
            # normalize dimensions
            # -------------------------
            if data.ndim == 1:
                data = data.reshape(1, -1)

            elif data.ndim >= 3:
                data = data[0]

            if data.size == 0:
                return {"ok": False, "error": "empty_raster"}

            data = np.nan_to_num(data).astype(np.float32)

            # =========================
            # FILTERS
            # =========================

            if filter == "log":
                data = np.log1p(np.maximum(data, 0))

            elif filter == "ndvi":
                # placeholder NDVI-like transform (safe fallback)
                data = data / (np.max(data) + 1e-6)

            # =========================
            # RAW MODE
            # =========================
            if mode == "raw":
                return {
                    "ok": True,
                    "mode": "raw",
                    "z": data.tolist()
                }

            # =========================
            # HEATMAP MODE
            # =========================
            dmin, dmax = float(np.min(data)), float(np.max(data))

            if dmax > dmin:
                data = (data - dmin) / (dmax - dmin)
            else:
                data = np.zeros_like(data)

            return {
                "ok": True,
                "mode": "heatmap",
                "filter": filter,
                "z": data.tolist()
            }

    except Exception as e:
        return {
            "ok": False,
            "error": "backend_exception",
            "message": str(e)
        }