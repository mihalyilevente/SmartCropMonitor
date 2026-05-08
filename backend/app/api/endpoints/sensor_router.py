from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db, SensorsDB
from app.services.sensor_servise import process_and_add_sensor_data
from app.core.schemas import SensorCreate, SensorDataBatch
from geoalchemy2.elements import WKTElement
import secrets

router = APIRouter()


@router.post("/add_sensor", tags=["sensor_management"])
async def add_sensor(payload: SensorCreate, db: Session = Depends(get_db)):
    unique_key = secrets.token_urlsafe(24)

    point = f'POINT({payload.longitude} {payload.latitude})'

    new_sensor = SensorsDB(
        hashed_key=unique_key,
        label=payload.label,
        location=WKTElement(point, srid=4326),
        user_id=payload.user_id,
        meteorological=payload.meteorological,
        activation_status=True
    )

    db.add(new_sensor)
    try:
        db.commit()
        db.refresh(new_sensor)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error creating sensor")

    return {
        "status": "sensor added",
        "sensor_id": new_sensor.id,
        "sensor_api_key": unique_key  # Return plain key once
    }


@router.post("/sensor_data", tags=["sensor_data"])
async def add_sensor_data(payload: SensorDataBatch, db: Session = Depends(get_db)):
    try:
        count = process_and_add_sensor_data(db, payload.model_dump())
        return {"status": "success", "processed_items": count}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error during processing")