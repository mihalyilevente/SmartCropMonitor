from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import UserLocation, FieldAnalysis, get_db, WeatherHistory, WeatherMetrics
from app.services.weather_service import current_weather_request
from app.services.spraying_service import calculate_spraying_window
from typing import Any

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


@router.get("/location/{location_id}/latest-weather", tags=["Weather"])
async def get_latest_location_weather(
    location_id: int,
    user_id: int,
    db: Session = Depends(get_db)
):
    location = db.query(UserLocation).filter(
        UserLocation.id == location_id,
        UserLocation.user_id == user_id
    ).first()

    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    latest_history = (
        db.query(WeatherHistory)
        .filter(WeatherHistory.location_id == location_id)
        .order_by(WeatherHistory.timestamp.desc())
        .first()
    )

    if not latest_history:
        return {"history": None, "metrics": None}

    latest_metrics = (
        db.query(WeatherMetrics)
        .filter(WeatherMetrics.reference_weather_id == latest_history.id)
        .first()
    )

    return {
        "history": latest_history,
        "metrics": latest_metrics
    }


@router.get("/location/{location_id}/weather-charts", tags=["Weather"])
async def get_weather_chart_data(
    location_id: int,
    user_id: int,
    db: Session = Depends(get_db)
):
    location = db.query(UserLocation).filter(
        UserLocation.id == location_id,
        UserLocation.user_id == user_id
    ).first()

    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    results = (
        db.query(WeatherHistory, WeatherMetrics)
        .outerjoin(WeatherMetrics, WeatherHistory.id == WeatherMetrics.reference_weather_id)
        .filter(WeatherHistory.location_id == location_id)
        .order_by(WeatherHistory.timestamp.asc())
        .all()
    )

    chart_data = []
    for history, metrics in results:
        chart_data.append({
            "timestamp": history.timestamp,
            "weather_data": {
                "temp": history.temp,
                "humidity": history.humidity,
                "precipitation": history.precipitation,
                "soil_moisture": history.soil_moisture_0_to_1cm,
                "soil_temperature": history.soil_temperature_0cm,
                "wind_speed": history.wind_speed
            },
            "metrics_data": {
                "gdd": metrics.gdd_base_10 if metrics else None,
                "rain_cum_30d": metrics.rain_cum_30d if metrics else None,
                "et0": metrics.et0 if metrics else None,
                "water_deficit": metrics.water_deficit_7d if metrics else None,
                "spi_1m": metrics.spi_1m if metrics else None,
                "rs_mj_m2_day": metrics.rs_mj_m2_day if metrics else None

            }
        })

    return chart_data


@router.get("/{location_id}/spraying-windows", tags=["Spaying"])
def get_location_spraying_windows(
    location_id: int,
    db: Session = Depends(get_db)
) -> Any:
    location = db.query(UserLocation).filter(
        UserLocation.id == location_id
    ).first()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location with id {location_id} not found"
        )

    result = calculate_spraying_window(db, location)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Spraying windows calculation failed. Check weather data availability."
        )

    return result