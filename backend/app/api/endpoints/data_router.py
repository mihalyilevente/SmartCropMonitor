import os
import numpy as np
import xarray as xr

from fastapi import Depends, APIRouter, HTTPException

from sqlalchemy.orm import Session
from sqlalchemy import func, desc
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


@router.get("/user/locations")
async def get_user_locations(user_id: int, db: Session = Depends(get_db)):
    from geoalchemy2.shape import to_shape
    locations = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id)
        .all()
    )

    result = []
    for loc in locations:
        lat, lon = None, None
        if loc.location is not None:
            try:
                pt = to_shape(loc.location)
                lon, lat = pt.x, pt.y
            except Exception:
                pass
        result.append({"id": loc.id, "label": loc.label, "lat": lat, "lon": lon})
    return result


@router.get("/location/{location_id}/latest-metrics/{metric}")
def get_latest_plotly_data(
    location_id: int,
    metric: str,
    user_id: int,
    step: int = 3,
    db: Session = Depends(get_db)
):
    analysis = (
        db.query(FieldAnalysis)
        .join(UserLocation, FieldAnalysis.location_id == UserLocation.id)
        .filter(
            UserLocation.id == location_id,
            UserLocation.user_id == user_id,
            FieldAnalysis.metrics_status == True
        )
        .order_by(desc(FieldAnalysis.id))
        .first()
    )

    if not analysis or not analysis.metrics_filename:
        raise HTTPException(
            status_code=404,
            detail="No successful analysis found for this location"
        )

    file_path = os.path.join(NDVI_DIR, analysis.metrics_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Metrics file not found on disk")

    try:
        with xr.open_dataset(file_path) as ds:
            if metric not in ds:
                raise HTTPException(status_code=400, detail=f"Metric {metric} not found in file")

            data = ds[metric].values
            y_coords = ds.coords['y'].values
            x_coords = ds.coords['x'].values

            step = max(1, min(step, 10))

            data    = data[::step, ::step]
            y_coords = y_coords[::step]
            x_coords = x_coords[::step]

            data_cleaned = np.where(np.isnan(data), None, data).tolist()
            y_list = y_coords.tolist()
            x_list = x_coords.tolist()

            return {
                "analysis_id": analysis.id,
                "z": data_cleaned,
                "x": x_list,
                "y": y_list,
                "metric_name": metric.upper(),
                "bounds": {
                    "min_lat": float(min(y_list)),
                    "max_lat": float(max(y_list)),
                    "min_lon": float(min(x_list)),
                    "max_lon": float(max(x_list))
                }
            }
    except Exception as e:
        print(f"[ERROR] Plotly extraction failed: {e}")
        raise HTTPException(status_code=500, detail="Error processing NetCDF data")


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

@router.get("/user/fields-list")
def get_user_fields_list(
    user_id: int,
    location_id: int = None,
    db: Session = Depends(get_db)
):
    """GET /api/v1/user/fields-list?user_id=1&location_id=2
    Full field info for the management panel (not GeoJSON)."""
    query = (
        db.query(FieldUnit)
        .join(UserLocation, FieldUnit.location_id == UserLocation.id)
        .filter(UserLocation.user_id == user_id)
    )
    if location_id:
        query = query.filter(FieldUnit.location_id == location_id)

    # exclude soft-deleted
    try:
        query = query.filter(FieldUnit.deleted_at.is_(None))
    except Exception:
        pass

    fields = query.order_by(FieldUnit.created_at.desc()).all()

    return [
        {
            "id":           f.id,
            "location_id":  f.location_id,
            "label":        f.label,
            "field_type":   f.field_type.value if hasattr(f.field_type, "value") else f.field_type,
            "crop_type":    f.crop_type,
            "season_year":  f.season_year,
            "area_ha":      float(f.area_ha) if f.area_ha is not None else None,
            "status":       f.status,
            "source":       f.source,
            "manual_added": f.manual_added,
            "created_at":   f.created_at.isoformat() if f.created_at else None,
            "updated_at":   f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in fields
    ]


from pydantic import BaseModel as _BaseModel

class _FieldUpdate(_BaseModel):
    label: str = None
    field_type: str = None
    crop_type: str = None
    season_year: int = None
    status: str = None

@router.patch("/fields/{field_id}")
def patch_field(
    field_id: int,
    payload: _FieldUpdate,
    user_id: int,
    db: Session = Depends(get_db),
):
    """PATCH /api/v1/fields/{field_id}?user_id=1"""
    from sqlalchemy import and_
    field = (
        db.query(FieldUnit)
        .join(UserLocation, FieldUnit.location_id == UserLocation.id)
        .filter(FieldUnit.id == field_id, UserLocation.user_id == user_id)
        .first()
    )
    if not field:
        raise HTTPException(status_code=404, detail="Field not found or access denied")

    import datetime
    if payload.label       is not None: field.label       = payload.label.strip()
    if payload.crop_type   is not None: field.crop_type   = payload.crop_type or None
    if payload.season_year is not None: field.season_year = payload.season_year
    if payload.status      is not None: field.status      = payload.status
    if payload.field_type  is not None:
        field.field_type = payload.field_type
    field.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(field)
    return {
        "message":     "Field updated",
        "id":          field.id,
        "label":       field.label,
        "field_type":  field.field_type.value if hasattr(field.field_type, "value") else field.field_type,
        "crop_type":   field.crop_type,
        "season_year": field.season_year,
        "status":      field.status,
    }