# =========================
# Imports
# =========================
import os

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.services.field_analysis import FieldAnalyzer, validate_pending_analyses
from app.core.database import UserLocation, FieldAnalysis, get_db
from app.services.segmentation import perform_segmentation_and_save

# =========================
# Config
# =========================
MODEL_WEIGHTS = "app/models/unet_ai4boundaries.pth"

# =========================
# Init
# =========================
router = APIRouter()
analyzer = FieldAnalyzer(model_path=MODEL_WEIGHTS)

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


@router.post("/segment-fields/{analysis_id}", tags=["Segmentation"])
async def segment_fields(analysis_id: int, db: Session = Depends(get_db)):
    try:
        perform_segmentation_and_save(analysis_id, db, analyzer)
        return {"status": "success", "message": f"Segmentation completed for analysis {analysis_id}"}
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