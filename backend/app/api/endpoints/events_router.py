from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
from geoalchemy2.shape import to_shape
from geoalchemy2.elements import WKTElement
import hashlib

from app.core.database import get_db, Events, EventsRules, UserTask
from app.core.schemas import (
    EventType, StatusType, Status_task, Priority_task
)
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/events", tags=["Alerts & Tasks"])


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


class EventStatusUpdate(BaseModel):
    status: StatusType


class ManualAlertCreate(BaseModel):
    user_id: int
    event_type: EventType
    severity: str = "INFO"
    dedup_key: str
    extra_metadata: Optional[dict] = None


class RuleCondition(BaseModel):
    metric: str
    operator: str
    value: float
    sensor_id: Optional[int] = None
    location_id: Optional[int] = None


class RuleAction(BaseModel):
    notify: bool = True
    severity: str = "WARNING"


class RuleCreate(BaseModel):
    user_id: int
    location_id: Optional[int] = None
    name: str
    event_type: EventType
    condition: RuleCondition
    action: RuleAction
    is_active: bool = True


class RuleRead(BaseModel):
    id: int
    user_id: int
    name: str
    is_active: bool
    event_type: EventType
    condition: dict
    action: dict
    created_at: datetime
    updated_at: datetime
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


class TaskUpdate(BaseModel):
    status: Optional[Status_task] = None
    priority: Optional[Priority_task] = None

# ── Event

@router.get("/user/{user_id}", response_model=List[EventRead])
def get_all_alerts(user_id: int, db: Session = Depends(get_db)):
    """GET /api/v1/events/user/{user_id} — все события, новые первые."""
    return (
        db.execute(
            select(Events)
            .where(Events.user_id == user_id)
            .order_by(Events.created_at.desc())
        )
        .scalars().all()
    )


@router.get("/user/{user_id}/active", response_model=List[EventRead])
def get_active_alerts(user_id: int, db: Session = Depends(get_db)):
    """GET /api/v1/events/user/{user_id}/active — только ACTIVE."""
    return (
        db.execute(
            select(Events)
            .where(Events.user_id == user_id, Events.status == StatusType.ACTIVE)
            .order_by(Events.created_at.desc())
        )
        .scalars().all()
    )


@router.post("/manual", response_model=EventRead)
def create_manual_alert(alert_data: ManualAlertCreate, db: Session = Depends(get_db)):
    """POST /api/v1/events/manual"""
    raw = f"manual|{alert_data.user_id}|{alert_data.dedup_key}"
    event_hash = hashlib.sha256(raw.encode()).hexdigest()

    existing = db.execute(
        select(Events).where(
            Events.dedup_key == alert_data.dedup_key,
            Events.status == StatusType.ACTIVE,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Active alert with this dedup_key already exists")

    new_event = Events(
        user_id=alert_data.user_id,
        event_type=alert_data.event_type,
        event_hash=event_hash,
        dedup_key=alert_data.dedup_key,
        severity=alert_data.severity,
        status=StatusType.ACTIVE,
        extra_metadata=alert_data.extra_metadata,
    )
    db.add(new_event)
    try:
        db.commit()
        db.refresh(new_event)
        return new_event
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create alert")


# ── Rules

@router.get("/rules/user/{user_id}", response_model=List[RuleRead])
def get_user_rules(user_id: int, db: Session = Depends(get_db)):
    """GET /api/v1/events/rules/user/{user_id}"""
    return (
        db.execute(
            select(EventsRules)
            .where(EventsRules.user_id == user_id)
            .order_by(EventsRules.created_at.desc())
        )
        .scalars().all()
    )


@router.post("/rules/create", response_model=RuleRead)
def create_rule(rule_data: RuleCreate, db: Session = Depends(get_db)):
    """POST /api/v1/events/rules/create"""
    new_rule = EventsRules(
        user_id=rule_data.user_id,
        name=rule_data.name,
        is_active=rule_data.is_active,
        event_type=rule_data.event_type,
        condition={
            **rule_data.condition.model_dump(),
            **({"location_id": rule_data.location_id} if rule_data.location_id else {}),
        },
        action=rule_data.action.model_dump(),
    )
    db.add(new_rule)
    try:
        db.commit()
        db.refresh(new_rule)
        return new_rule
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create rule")


@router.patch("/rules/{rule_id}/toggle")
def toggle_rule(rule_id: int, db: Session = Depends(get_db)):
    """PATCH /api/v1/events/rules/{rule_id}/toggle"""
    rule = db.get(EventsRules, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.is_active = not rule.is_active
    db.commit()
    return {"id": rule_id, "is_active": rule.is_active}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, user_id: int, db: Session = Depends(get_db)):
    """DELETE /api/v1/events/rules/{rule_id}?user_id=1"""
    rule = db.get(EventsRules, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your rule")
    db.delete(rule)
    db.commit()
    return {"message": "Rule deleted", "id": rule_id}


# ── Tasks

@router.get("/tasks", response_model=List[TaskRead])
def get_user_tasks(
    user_id: int = Query(..., description="User ID"),
    db: Session = Depends(get_db),
):
    """GET /api/v1/events/tasks?user_id=1"""
    tasks = (
        db.execute(
            select(UserTask)
            .where(UserTask.user_id == user_id)
            .order_by(UserTask.task_timestamp.desc())
        )
        .scalars().all()
    )
    return [TaskRead.model_validate(t) for t in tasks]


@router.post("/tasks", response_model=TaskRead)
def create_task(task_data: TaskCreate, db: Session = Depends(get_db)):
    """POST /api/v1/events/tasks"""
    location_geom = None
    if task_data.longitude is not None and task_data.latitude is not None:
        location_geom = WKTElement(
            f"POINT({task_data.longitude} {task_data.latitude})", srid=4326
        )
    new_task = UserTask(
        user_id=task_data.user_id,
        field_id=task_data.field_id,
        event_id=task_data.event_id,
        location=location_geom,
        task_type=task_data.task_type,
        status=task_data.status,
        priority=task_data.priority,
        task_timestamp=task_data.task_timestamp,
        extra_metadata=task_data.extra_metadata,
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return TaskRead.model_validate(new_task)


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, task_update: TaskUpdate, db: Session = Depends(get_db)):
    """PATCH /api/v1/events/tasks/{task_id}"""
    task = db.get(UserTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task_update.status is not None:
        task.status = task_update.status
    if task_update.priority is not None:
        task.priority = task_update.priority
    task.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Task updated successfully"}


# ── Events

@router.get("/{event_id}", response_model=EventRead)
def get_alert(event_id: int, db: Session = Depends(get_db)):
    """GET /api/v1/events/{event_id}"""
    event = db.get(Events, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Alert not found")
    return event


@router.patch("/{event_id}/status")
def update_alert_status(
    event_id: int,
    body: EventStatusUpdate,
    db: Session = Depends(get_db),
):
    """PATCH /api/v1/events/{event_id}/status  body: { "status": "ACKNOWLEDGED" }"""
    event = db.get(Events, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Alert not found")
    event.status = body.status
    event.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Alert status updated", "new_status": body.status}