import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.database import SensorsDB, WeatherSensors


def process_and_add_sensor_data(db: Session, payload: dict):
    """
    JSON:
    {
        "key": "sensor_secret_hash",
        "data": [
            {"ts": "2026-05-09T10:00:00", "t": 22.5, "p": 750, "h": 45},
            {"ts": "2026-05-09T10:10:00", "t": 22.6, "p": 749, "h": 46}
        ]
    }
    """
    sensor = db.execute(
        select(SensorsDB).where(SensorsDB.hashed_key == payload.get("key"))
    ).scalar_one_or_none()

    if not sensor:
        raise ValueError("Invalid sensor key")

    new_records = []
    for item in payload.get("data", []):
        new_record = WeatherSensors(
            sensor_id=sensor.id,
            timestamp=item["ts"],
            temp=item.get("t"),
            pressure=item.get("p"),
            humidity=item.get("h"),
            sensor_status=True,
            extra_data=item.get("extra")
        )
        new_records.append(new_record)

    if new_records:
        db.add_all(new_records)
        try:
            db.commit()
            return len(new_records)
        except Exception as e:
            db.rollback()
            raise e
    return 0