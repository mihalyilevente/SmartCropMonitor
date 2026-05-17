import os

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, Field
from decimal import Decimal
from typing import List, Optional
from app.core.database import UserLocation, FieldAnalysis, get_db, FieldUnit, Biomass
from app.core.schemas import FieldType
from app.services.segmentation import (
    perform_temp_segmentation_and_save,
    run_segmentation_preview,
    confirm_segmentation_fields,
)
from app.services.orchestrator import full_sync_process
from app.services.spatial_harmonizer import process_and_align_nc
from app.utils.fields import (
    validate_field_shape,
    calculate_field_area,
    detect_intersections_single
)

from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import shape, MultiPolygon
from shapely.validation import explain_validity


router = APIRouter()

class LocationCreate(BaseModel):
    label: str
    lat: float
    lon: float


class SegmentationConfirmPayload(BaseModel):
    selected_ids: List[int]
    fields_data: List[dict]

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

@router.post("/segment-preview/{location_id}", tags=["Segmentation"])
async def segment_preview(location_id: int, db: Session = Depends(get_db)):
    try:
        result = run_segmentation_preview(location_id, db)
        return {
            "status": "ok",
            "location_id": location_id,
            "num_detected": result["num_detected"],
            "fields": result["fields"],
            "preview_b64": result["preview_b64"],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation error: {str(e)}")


@router.post("/segment-confirm/{location_id}", tags=["Segmentation"])
async def segment_confirm(
    location_id: int,
    payload: SegmentationConfirmPayload,
    db: Session = Depends(get_db)
):
    try:
        result = confirm_segmentation_fields(
            location_id=location_id,
            selected_field_ids=payload.selected_ids,
            fields_data=payload.fields_data,
            db=db,
        )
        return {
            "status": "ok",
            "location_id": location_id,
            "saved_count": result["saved_count"],
            "field_ids": result["field_ids"],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Confirm error: {str(e)}")


@router.post("/segment-fields/{location_id}", tags=["Segmentation"])
async def segment_fields(location_id: int, db: Session = Depends(get_db)):
    try:
        perform_temp_segmentation_and_save(location_id, db)
        return {"status": "success", "message": f"Segmentation completed for location {location_id}"}
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

    existing_fields = (
        db.query(FieldUnit)
        .filter(FieldUnit.location_id == payload.location_id)
        .all()
    )

    existing_geoms = [
        to_shape(f.geometry) for f in existing_fields
    ]

    conflicts = detect_intersections_single(
        shapely_geometry,
        existing_geoms
    )

    if conflicts:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Field intersects with existing fields",
                "conflicts": conflicts
            }
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


# =========================
# Biomass Endpoints
# =========================

@router.get("/locations/{location_id}/biomass", tags=["Biomass"])
async def get_biomass_for_location(
    location_id: int,
    db: Session = Depends(get_db)
):

    location = db.query(UserLocation).filter(UserLocation.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    fields = (
        db.query(FieldUnit)
        .filter(
            FieldUnit.location_id == location_id,
            FieldUnit.status == "active",
        )
        .all()
    )

    if not fields:
        raise HTTPException(status_code=404, detail="No active fields for this location")

    field_ids = [f.id for f in fields]
    field_map  = {f.id: f for f in fields}

    latest_subq = (
        db.query(
            Biomass.field_id,
            func.max(Biomass.analysis_date).label("max_date")
        )
        .filter(Biomass.field_id.in_(field_ids))
        .group_by(Biomass.field_id)
        .subquery()
    )

    records = (
        db.query(Biomass)
        .join(
            latest_subq,
            (Biomass.field_id    == latest_subq.c.field_id) &
            (Biomass.analysis_date == latest_subq.c.max_date)
        )
        .all()
    )

    return {
        "location_id": location_id,
        "location_label": location.label,
        "fields": [
            {
                "field_id":    r.field_id,
                "field_label": field_map[r.field_id].label,
                "field_type":  field_map[r.field_id].field_type,
                "area_ha":     float(field_map[r.field_id].area_ha or 0),
                "analysis_date": r.analysis_date,
                "biomass_tha": float(r.biomass_tha),
                "confidence":  float(r.confidence),
                "evi":  float(r.evi),
                "msi":  float(r.msi),
                "ci":   float(r.ci),
                "ground_truth": float(r.ground_truth) if r.ground_truth is not None else None,
                "extra": r.extra,
            }
            for r in records
        ]
    }


@router.get("/fields/{field_id}/biomass", tags=["Biomass"])
async def get_biomass_history_for_field(
    field_id: int,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    field = db.query(FieldUnit).filter(FieldUnit.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    records = (
        db.query(Biomass)
        .filter(Biomass.field_id == field_id)
        .order_by(Biomass.analysis_date.desc())
        .limit(limit)
        .all()
    )

    return {
        "field_id":    field.id,
        "field_label": field.label,
        "field_type":  field.field_type,
        "area_ha":     float(field.area_ha or 0),
        "history": [
            {
                "id":            r.id,
                "analysis_date": r.analysis_date,
                "biomass_tha":   float(r.biomass_tha),
                "confidence":    float(r.confidence),
                "evi":  float(r.evi),
                "msi":  float(r.msi),
                "ci":   float(r.ci),
                "ground_truth": float(r.ground_truth) if r.ground_truth is not None else None,
                "extra": r.extra,
            }
            for r in records
        ]
    }

# =========================
# Field Management Endpoints
# =========================

class FieldUpdate(BaseModel):
    label: Optional[str] = None
    field_type: Optional[FieldType] = None
    crop_type: Optional[str] = None
    season_year: Optional[int] = None
    status: Optional[str] = None


@router.get("/user_fields", tags=["Fields"])
def get_user_fields_list(
    user_id: int,
    location_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """GET /api/v1/fields/user_fields?user_id=1&location_id=2
    Returns full field info list (not GeoJSON) for the management panel."""
    query = (
        db.query(FieldUnit)
        .join(UserLocation, FieldUnit.location_id == UserLocation.id)
        .filter(UserLocation.user_id == user_id, FieldUnit.deleted_at.is_(None))
    )
    if location_id:
        query = query.filter(FieldUnit.location_id == location_id)

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


@router.patch("/{field_id}", tags=["Fields"])
def update_field(
    field_id: int,
    payload: FieldUpdate,
    user_id: int,
    db: Session = Depends(get_db),
):
    """PATCH /api/v1/fields/{field_id}?user_id=1"""
    field = (
        db.query(FieldUnit)
        .join(UserLocation, FieldUnit.location_id == UserLocation.id)
        .filter(FieldUnit.id == field_id, UserLocation.user_id == user_id)
        .first()
    )
    if not field:
        raise HTTPException(status_code=404, detail="Field not found or access denied")

    if payload.label       is not None: field.label       = payload.label.strip()
    if payload.field_type  is not None: field.field_type  = payload.field_type
    if payload.crop_type   is not None: field.crop_type   = payload.crop_type or None
    if payload.season_year is not None: field.season_year = payload.season_year
    if payload.status      is not None:
        if payload.status not in ("active", "inactive", "archived"):
            raise HTTPException(status_code=400, detail="Invalid status value")
        field.status = payload.status

    import datetime
    field.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(field)

    return {
        "message":     "Field updated successfully",
        "id":          field.id,
        "label":       field.label,
        "field_type":  field.field_type.value if hasattr(field.field_type, "value") else field.field_type,
        "crop_type":   field.crop_type,
        "season_year": field.season_year,
        "status":      field.status,
    }