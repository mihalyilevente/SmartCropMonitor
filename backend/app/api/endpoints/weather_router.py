from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import UserLocation, FieldAnalysis, get_db, WeatherHistory
from app.services.weather_service import current_weather_request
from app.services.segmentation import perform_temp_segmentation_and_save
from app.services.orchestrator import full_sync_process
from app.services.spatial_harmonizer import process_and_align_nc
from geoalchemy2.elements import WKTElement


router = APIRouter()

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


@router.get("/user/weather-current", tags=["Weather"])
async def get_current_weather(
        location_id: int,
        user_id: int,
        db: Session = Depends(get_db)
):
    location = db.query(UserLocation).filter(
        UserLocation.id == location_id,
        UserLocation.user_id == user_id
    ).first()

    if not location:
        raise HTTPException(
            status_code=404,
            detail="Location not found or access denied"
        )

    weather = current_weather_request(location)

    if not weather:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch weather data"
        )

    return weather