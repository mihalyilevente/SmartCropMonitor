from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from geoalchemy2.shape import to_shape
from geoalchemy2.elements import WKTElement

from app.core.database import get_db, Events, UserTask
from app.core.schemas import (
    EventType, StatusType, Status_task, Priority_task
)
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/alerts-tasks", tags=["Alerts & Tasks"])


# =========================
# Pydantic Schemas
# =========================

class EventRead(BaseModel):
    id: int
    user_id: int
    event_type: EventType
    event_hash: str
    dedup_key: str
    severity: str
    status: StatusType
    created_at: datetime
    updated_at: datetime
    expires_at: Optional[datetime] = None
    extra_metadata: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class TaskRead(BaseModel):
    id: int
    user_id: int
    field_id: Optional[int] = None
    event_id: Optional[int] = None
    task_type: str
    status: Status_task
    priority: Priority_task
    task_timestamp: datetime
    created_at: datetime
    updated_at: datetime
    extra_metadata: Optional[dict] = None
    # Coordinates extracted from Geometry POINT
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, **kwargs):
        instance = super().model_validate(obj, **kwargs)
        if hasattr(obj, "location") and obj.location is not None:
            point = to_shape(obj.location)
            instance.longitude = point.x
            instance.latitude = point.y
        return instance


class TaskCreate(BaseModel):
    user_id: int
    field_id: Optional[int] = None
    event_id: Optional[int] = None
    task_type: str
    status: Status_task = Status_task.TODO
    priority: Priority_task = Priority_task.MEDIUM
    task_timestamp: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    extra_metadata: Optional[dict] = None


class ManualAlertCreate(BaseModel):
    user_id: int
    event_type: EventType
    severity: str = "INFO"
    dedup_key: str
    extra_metadata: Optional[dict] = None


class TaskUpdate(BaseModel):
    status: Optional[Status_task] = None
    priority: Optional[Priority_task] = None


# =========================
# Alert Endpoints
# =========================

@router.get("/alerts", response_model=List[EventRead])
def get_all_alerts(user_id: int, db: Session = Depends(get_db)):
    return db.query(Events).filter(Events.user_id == user_id).all()


@router.get("/alerts/active", response_model=List[EventRead])
def get_active_alerts(user_id: int, db: Session = Depends(get_db)):
    return db.query(Events).filter(
        Events.user_id == user_id,
        Events.status == StatusType.ACTIVE
    ).all()


@router.patch("/alerts/{event_id}/status")
def update_alert_status(event_id: int, status: StatusType, db: Session = Depends(get_db)):
    db_event = db.query(Events).filter(Events.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Alert not found")

    db_event.status = status
    db_event.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Alert status updated", "new_status": status}


@router.post("/alerts/manual", response_model=EventRead)
def create_manual_alert(alert_data: ManualAlertCreate, db: Session = Depends(get_db)):
    event_hash = f"manual_{alert_data.dedup_key}_{28}"

    new_event = Events(
        user_id=alert_data.user_id,
        event_type=alert_data.event_type,
        event_hash=event_hash,
        dedup_key=alert_data.dedup_key,
        severity=alert_data.severity,
        status=StatusType.ACTIVE,
        extra_metadata=alert_data.extra_metadata
    )
    db.add(new_event)
    try:
        db.commit()
        db.refresh(new_event)
        return new_event
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Event already exists or invalid data")


# =========================
# Task Endpoints
# =========================

@router.get("/tasks", response_model=List[TaskRead])
def get_user_tasks(user_id: int, db: Session = Depends(get_db)):
    tasks = db.query(UserTask).filter(UserTask.user_id == user_id).all()
    return [TaskRead.model_validate(t) for t in tasks]


@router.post("/tasks", response_model=TaskRead)
def create_task(task_data: TaskCreate, db: Session = Depends(get_db)):
    """Full task creation including location coordinates."""
    location_geom = None
    if task_data.longitude is not None and task_data.latitude is not None:
        location_geom = WKTElement(f'POINT({task_data.longitude} {task_data.latitude})', srid=4326)

    new_task = UserTask(
        user_id=task_data.user_id,
        field_id=task_data.field_id,
        event_id=task_data.event_id,
        location=location_geom,
        task_type=task_data.task_type,
        status=task_data.status,
        priority=task_data.priority,
        task_timestamp=task_data.task_timestamp,
        extra_metadata=task_data.extra_metadata
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return TaskRead.model_validate(new_task)


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, task_update: TaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(UserTask).filter(UserTask.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task_update.status:
        db_task.status = task_update.status
    if task_update.priority:
        db_task.priority = task_update.priority

    db_task.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Task updated successfully"}