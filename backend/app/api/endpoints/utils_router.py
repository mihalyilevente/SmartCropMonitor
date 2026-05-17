from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import UserLocation, FieldAnalysis, get_db
from app.services.orchestrator import full_sync_process, short_sync_process
from app.services.biomass_service import run_biomass_estimation


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


@router.get("/test_func")
def test_function(db: Session = Depends(get_db)):
    run_biomass_estimation(db)
    return 0


@router.post("/sync/full", tags=["Synchronisation"])
async def manual_full_sync(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    def run_sync():
        full_sync_process(db)
    background_tasks.add_task(run_sync)
    return {"status": "Full synchronization started in background"}


@router.post("/sync/short", tags=["Synchronisation"])
async def manual_short_sync(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    def run_sync():
        short_sync_process(db)
    background_tasks.add_task(run_sync)
    return {"status": "Short sync (weather) started in background"}
