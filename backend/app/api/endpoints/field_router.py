# =========================
# Imports
# =========================
import os

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from decimal import Decimal
from app.core.database import UserLocation, FieldAnalysis, get_db, FieldUnit
from app.core.schemas import FieldType
from app.services.segmentation import perform_temp_segmentation_and_save
from app.services.orchestrator import full_sync_process
from app.services.spatial_harmonizer import process_and_align_nc
from app.utils.fields import (
    validate_field_shape,
    calculate_field_area
)

from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import from_shape
from shapely.geometry import shape, MultiPolygon
from shapely.validation import explain_validity


# =========================
# Init
# =========================
router = APIRouter()

# =========================
# Schemas
# =========================
class LocationCreate(BaseModel):
    label: str
    lat: float
    lon: float

# =========================
# Location Endpoints
# =========================
@router.post("/locations")
async def add_location(
    loc: LocationCreate,
    user_id: int,
    db: Session = Depends(get_db)
):
    point = f"POINT({loc.lon} {loc.lat})"

    new_loc = UserLocation(
        user_id=user_id,
        label=loc.label,
        location=WKTElement(point, srid=4326)
    )

    db.add(new_loc)
    db.commit()
    db.refresh(new_loc)

    return {
        "status": "location added",
        "id": new_loc.id
    }


@router.post("/segment-fields/{location_id}", tags=["Segmentation"])
async def segment_fields(location_id: int, db: Session = Depends(get_db)):
    try:
        perform_temp_segmentation_and_save(location_id, db)
        return {"status": "success", "message": f"Segmentation completed for analysis {location_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation error: {str(e)}")

# =========================
# History Endpoint
# =========================
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
            "location_label": h.location.label,
            "date": h.last_data_request_date,
            "filename": h.nc_filename,
            "fields_found": h.fields_count,
            "download_url": f"/api/v1/download/{h.nc_filename}"
        }
        for h in history
    ]


@router.post("/locations/{location_id}/generate-grid", tags=["Data"])
async def generate_location_grid(
        location_id: int,
        use_sr: bool = False,
        db: Session = Depends(get_db)
):
    try:
        grid_path = process_and_align_nc(db, location_id, use_sr=use_sr)

        if not grid_path:
            raise HTTPException(
                status_code=404,
                detail="No files available for grid generation"
            )

        return {
            "status": "success",
            "message": "Grid timeseries generated successfully",
            "location_id": location_id,
            "grid_path": grid_path
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"[ERROR] Grid generation failed: {e}")
        raise HTTPException(status_code=500, detail="Internal processing error")


@router.post("/sync-manual", tags=["Data"])
async def manual_sync(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(full_sync_process, db)
    return {"status": "sync started"}


class ManualFieldCreate(BaseModel):
    location_id: int

    label: str = Field(..., min_length=1, max_length=128)

    field_type: FieldType

    geometry: dict

    crop_type: str | None = None

    season_year: int | None = None


@router.post("/manual-add-field", tags=["Fields"])
async def manual_add_field(
    payload: ManualFieldCreate,
    db: Session = Depends(get_db)
):

    location = (
        db.query(UserLocation)
        .filter(UserLocation.id == payload.location_id)
        .first()
    )

    if not location:
        raise HTTPException(
            status_code=404,
            detail="Location not found"
        )

    try:
        shapely_geometry = shape(payload.geometry)

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid GeoJSON: {str(e)}"
        )

    if not isinstance(shapely_geometry, MultiPolygon):
        raise HTTPException(
            status_code=400,
            detail="Geometry must be MULTIPOLYGON"
        )

    validation_result = validate_field_shape(shapely_geometry)

    if not validation_result["valid"]:
        raise HTTPException(
            status_code=400,
            detail=validation_result["error"]
        )

    area_ha = calculate_field_area(shapely_geometry)

    geometry_db = from_shape(
        shapely_geometry,
        srid=4326
    )

    field = FieldUnit(
        location_id=payload.location_id,

        label=payload.label,

        geometry=geometry_db,

        area_ha=Decimal(str(round(area_ha, 2))),

        field_type=payload.field_type,

        manual_added=True,

        source="manual",

        crop_type=payload.crop_type,

        season_year=payload.season_year,

        status="active"
    )

    db.add(field)

    db.commit()

    db.refresh(field)

    return {
        "message": "Field created successfully",

        "field": {
            "id": field.id,
            "label": field.label,
            "field_type": field.field_type,
            "area_ha": float(field.area_ha),
            "manual_added": field.manual_added,
            "status": field.status
        }
    }