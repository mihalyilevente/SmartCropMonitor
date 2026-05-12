from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import UserLocation, FieldAnalysis, get_db
from app.services.ndvi_processor import run_per_field_metrics



router = APIRouter()


@router.get("/users/{user_id}/locations/{location_id}/stats")
def get_location_analysis_stats(
    user_id: int,
    location_id: int,
    db: Session = Depends(get_db)
):
    location = db.query(UserLocation).filter(
        UserLocation.id == location_id,
        UserLocation.user_id == user_id
    ).first()

    if not location:
        raise HTTPException(status_code=404, detail="Location not found for this user")

    analyses = db.query(FieldAnalysis).filter(
        FieldAnalysis.location_id == location_id
    ).all()

    segmentation_only = 0
    ndvi_and_segmentation = 0
    total_valid = 0

    for analysis in analyses:
        if analysis.is_valid is not None:
            if analysis.is_valid >= 0.75:
                ndvi_and_segmentation += 1
                total_valid += 1
            elif analysis.is_valid >= 0.5:
                segmentation_only += 1
                total_valid += 1

    return {
        "location_label": location.label,
        "stats": {
            "suitable_for_segmentation_only": segmentation_only,
            "suitable_for_ndvi_and_segmentation": ndvi_and_segmentation,
            "total_suitable_images": total_valid,
            "total_records_checked": len(analyses)
        }
    }


@router.get("/users/{user_id}/locations/{location_id}/stats")
def test_function(db: Session = Depends(get_db)):
    run_per_field_metrics(db)
    return 0