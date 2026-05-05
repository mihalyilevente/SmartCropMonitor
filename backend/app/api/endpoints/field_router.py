# =========================
# Imports
# =========================
import os

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.services.field_analysis import FieldAnalyzer, validate_pending_analyses, analyzer
from app.core.database import UserLocation, FieldAnalysis, get_db, WeatherHistory
from app.services.segmentation import perform_segmentation_and_save, perform_temp_segmentation_and_save
from app.services.orchestrator import full_sync_process
from app.services.spatial_harmonizer import process_and_align_nc
from app.core.config import MODEL_WEIGHTS


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
# Analysis Endpoint
# =========================
@router.get("/analyze-fields/{filename}")
async def analyze_fields(filename: str):
    path = os.path.join("data", "storage", filename)

    # check file existence
    if not os.path.exists(path):
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {filename}"
        )

    try:
        results = analyzer.run_analysis(path)

        return {
            "status": "success",
            "filename": filename,
            "fields_count": len(results),
            "data": results
        }

    except Exception as e:
        # debug output
        print(f"[ERROR] Analysis failed for {filename}: {e}")
        raise HTTPException(status_code=500, detail="Analysis failed")

# =========================
# Location Endpoints
# =========================
@router.post("/locations")
async def add_location(
    loc: LocationCreate,
    user_id: int,
    db: Session = Depends(get_db)
):
    new_loc = UserLocation(
        user_id=user_id,
        label=loc.label,
        lat=loc.lat,
        lon=loc.lon
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
            "date": h.analysis_date,
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


@router.get("/user/weather-history", tags=["Weather"])
async def get_weather_history(user_id: int, db: Session = Depends(get_db)):
    history = (
        db.query(WeatherHistory)
        .join(UserLocation)
        .filter(UserLocation.user_id == user_id)
        .order_by(WeatherHistory.timestamp.desc())
        .all()
    )
    return history


@router.post("/sync-manual", tags=["Data"])
async def manual_sync(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(full_sync_process, db)
    return {"status": "sync started"}