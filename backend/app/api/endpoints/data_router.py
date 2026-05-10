import os
import numpy as np
import xarray as xr

from fastapi import Depends, APIRouter, HTTPException

from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import UserLocation, FieldAnalysis, get_db,FieldUnit
import json
from app.core.config import STORAGE_PATH,NDVI_DIR

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


@router.get("/analysis/{analysis_id}/plotly/{metric}")
def get_plotly_data(analysis_id: int, metric: str, db: Session = Depends(get_db)):
    analysis = db.query(FieldAnalysis).filter(FieldAnalysis.id == analysis_id).first()

    if not analysis or not analysis.metrics_filename:
        raise HTTPException(status_code=404, detail="Analysis result not found")

    file_path = os.path.join(NDVI_DIR, analysis.metrics_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File on disk not found")

    try:
        with xr.open_dataset(file_path) as ds:
            if metric not in ds:
                raise HTTPException(status_code=400, detail=f"Metric {metric} not found")

            data = ds[metric].values
            y_coords = ds.coords['y'].values.tolist()
            x_coords = ds.coords['x'].values.tolist()

            data_cleaned = np.where(np.isnan(data), None, data).tolist()

            return {
                "z": data_cleaned,
                "x": x_coords,
                "y": y_coords,
                "metric_name": metric.upper(),
                "bounds": {
                    "min_lat": min(y_coords),
                    "max_lat": max(y_coords),
                    "min_lon": min(x_coords),
                    "max_lon": max(x_coords)
                }
            }
    except Exception as e:
        print(f"[ERROR] Plotly data prep failed: {e}")
        raise HTTPException(status_code=500, detail="Internal processing error")


@router.get("/user/fields")
def get_user_fields(user_id: int, db: Session = Depends(get_db)):
    fields = (
        db.query(
            FieldUnit.id,
            FieldUnit.label,
            FieldUnit.field_type,
            FieldUnit.crop_type,
            func.ST_AsGeoJSON(FieldUnit.geometry).label("geom_json")
        )
        .join(UserLocation, FieldUnit.location_id == UserLocation.id)
        .filter(UserLocation.user_id == user_id)
        .all()
    )

    if not fields:
        return {"type": "FeatureCollection", "features": []}

    features = []
    for f in fields:
        features.append({
            "type": "Feature",
            "id": f.id,
            "geometry": json.loads(f.geom_json),
            "properties": {
                "id": f.id,
                "label": f.label,
                "field_type": f.field_type.value if hasattr(f.field_type, "value") else f.field_type,
                "crop_type": f.crop_type,
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }