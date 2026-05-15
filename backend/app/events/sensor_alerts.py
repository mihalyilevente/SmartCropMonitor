import datetime
import statistics
import logging
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import SensorsDB, WeatherSensors, Events
from app.core.config import SENSOR_OFFLINE_INTERVAL_SAMPLE, SENSOR_OFFLINE_MULTIPLIER, SENSOR_OFFLINE_MIN_DELTA_MINUTES
from app.core.schemas import EventType, StatusType
from app.utils.general import _make_event_hash


logger = logging.getLogger(__name__)


def _compute_median_delta(timestamps: list[datetime.datetime]) -> Optional[datetime.timedelta]:
    if len(timestamps) < 2:
        return None
    sorted_ts = sorted(timestamps)
    deltas = [
        (sorted_ts[i + 1] - sorted_ts[i]).total_seconds()
        for i in range(len(sorted_ts) - 1)
    ]
    deltas = [d for d in deltas if d > 0]
    if not deltas:
        return None
    return datetime.timedelta(seconds=statistics.median(deltas))


def _build_sensor_event_hash(sensor_id: int, event_type: EventType, dedup_key: str) -> str:
    return _make_event_hash(sensor_id, event_type, dedup_key)


def _get_active_sensor_offline_event(db: Session, sensor_id: int) -> Optional[Events]:
    dedup_key = f"sensor_offline:{sensor_id}"
    return db.execute(
        select(Events).where(
            Events.dedup_key == dedup_key,
            Events.status == StatusType.ACTIVE,
        )
    ).scalar_one_or_none()


def _create_sensor_offline_event(db: Session, sensor: SensorsDB, threshold: datetime.timedelta) -> None:
    dedup_key = f"sensor_offline:{sensor.id}"
    event_hash = _build_sensor_event_hash(sensor.id, EventType.SENSOR_OFFLINE, dedup_key)

    existing = db.execute(
        select(Events).where(Events.event_hash == event_hash)
    ).scalar_one_or_none()
    if existing:
        return

    event = Events(
        user_id=sensor.user_id,
        event_type=EventType.SENSOR_OFFLINE,
        event_hash=event_hash,
        dedup_key=dedup_key,
        severity="WARNING",
        status=StatusType.ACTIVE,
        extra_metadata={
            "sensor_id": sensor.id,
            "sensor_label": sensor.label,
            "offline_threshold_seconds": threshold.total_seconds(),
        },
    )
    db.add(event)
    logger.warning(
        "Sensor %d (%s) is OFFLINE. Created SENSOR_OFFLINE event.",
        sensor.id, sensor.label
    )


def _resolve_sensor_offline_event(db: Session, sensor_id: int) -> None:
    event = _get_active_sensor_offline_event(db, sensor_id)
    if event:
        event.status = StatusType.RESOLVED
        event.updated_at = datetime.datetime.utcnow()
        logger.info("Sensor %d came back ONLINE. SENSOR_OFFLINE event resolved.", sensor_id)


def check_sensors_offline(db: Session) -> dict:
    now = datetime.datetime.utcnow()
    stats = {"checked": 0, "went_offline": 0, "already_offline": 0}

    sensors = db.execute(select(SensorsDB)).scalars().all()

    for sensor in sensors:
        stats["checked"] += 1

        recent_timestamps = db.execute(
            select(WeatherSensors.timestamp)
            .where(WeatherSensors.sensor_id == sensor.id)
            .order_by(WeatherSensors.timestamp.desc())
            .limit(SENSOR_OFFLINE_INTERVAL_SAMPLE + 1)
        ).scalars().all()

        if not recent_timestamps:
            continue

        last_seen: datetime.datetime = recent_timestamps[0]

        median_delta = _compute_median_delta(recent_timestamps)

        if median_delta is None or median_delta.total_seconds() < SENSOR_OFFLINE_MIN_DELTA_MINUTES * 60:
            median_delta = datetime.timedelta(minutes=SENSOR_OFFLINE_MIN_DELTA_MINUTES)

        offline_threshold = SENSOR_OFFLINE_MULTIPLIER * median_delta
        silence_duration = now - last_seen

        if silence_duration > offline_threshold:
            if sensor.activation_status:
                sensor.activation_status = False
                _create_sensor_offline_event(db, sensor, offline_threshold)
                stats["went_offline"] += 1
            else:
                stats["already_offline"] += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("check_sensors_offline: commit failed: %s", e)
        raise

    logger.info("check_sensors_offline finished: %s", stats)
    return stats


def handle_sensor_came_online(db: Session, sensor_id: int) -> None:
    sensor = db.get(SensorsDB, sensor_id)
    if sensor and not sensor.activation_status:
        sensor.activation_status = True
        _resolve_sensor_offline_event(db, sensor_id)
        logger.info("Sensor %d marked back as ONLINE.", sensor_id)