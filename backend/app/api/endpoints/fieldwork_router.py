from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

from app.core.database import get_db, FieldWork, FieldUnit
from app.core.schemas import FieldWorkType, FieldWorkStatus
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/fieldwork", tags=["Field Work"])


# =========================
# Pydantic Schemas
# =========================

class FieldWorkRead(BaseModel):
    id: int
    field_id: int
    user_id: int
    work_date: datetime
    work_type: FieldWorkType
    work_status: FieldWorkStatus
    work_cost: Optional[float] = None
    harvest_ton: Optional[float] = None
    extra_metadata: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    field_label: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_with_label(cls, obj: FieldWork) -> "FieldWorkRead":
        data = cls.model_validate(obj)
        if obj.field and obj.field.label:
            data.field_label = obj.field.label
        # Convert Decimal → float for JSON serialisation
        if isinstance(obj.work_cost, Decimal):
            data.work_cost = float(obj.work_cost)
        if isinstance(obj.harvest_ton, Decimal):
            data.harvest_ton = float(obj.harvest_ton)
        return data


class FieldWorkCreate(BaseModel):
    user_id: int
    field_id: int
    work_type: FieldWorkType
    work_status: FieldWorkStatus = FieldWorkStatus.PLANNED
    work_date: datetime
    work_cost: Optional[float] = None
    harvest_ton: Optional[float] = None
    extra_metadata: Optional[dict] = None


class FieldWorkUpdate(BaseModel):
    work_status: Optional[FieldWorkStatus] = None
    work_cost: Optional[float] = None
    harvest_ton: Optional[float] = None
    extra_metadata: Optional[dict] = None


# =========================
# Endpoints
# =========================

@router.get("/user/{user_id}", response_model=List[FieldWorkRead])
def get_user_fieldwork(
    user_id: int,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """
    GET /api/v1/fieldwork/user/{user_id}?limit=100&offset=0
    All field work records for the user, newest first.
    Joins FieldUnit to include field_label.
    """
    records = (
        db.execute(
            select(FieldWork)
            .where(FieldWork.user_id == user_id)
            .order_by(FieldWork.work_date.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return [FieldWorkRead.from_orm_with_label(r) for r in records]


@router.get("/field/{field_id}", response_model=List[FieldWorkRead])
def get_field_fieldwork(
    field_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    GET /api/v1/fieldwork/field/{field_id}
    Work records for a specific field.
    """
    records = (
        db.execute(
            select(FieldWork)
            .where(FieldWork.field_id == field_id)
            .order_by(FieldWork.work_date.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return [FieldWorkRead.from_orm_with_label(r) for r in records]


@router.get("/{work_id}", response_model=FieldWorkRead)
def get_fieldwork(work_id: int, db: Session = Depends(get_db)):
    """GET /api/v1/fieldwork/{work_id}"""
    record = db.get(FieldWork, work_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return FieldWorkRead.from_orm_with_label(record)


@router.post("/create", response_model=FieldWorkRead)
def create_fieldwork(data: FieldWorkCreate, db: Session = Depends(get_db)):
    """
    POST /api/v1/fieldwork/create
    Body:
      {
        "user_id": 1,
        "field_id": 3,
        "work_type": "PLOWING",
        "work_status": "PLANNED",
        "work_date": "2026-05-16T08:00:00",
        "work_cost": 250.00,
        "harvest_ton": null,
        "extra_metadata": { "note": "North section only" }
      }
    """
    field = db.get(FieldUnit, data.field_id)
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    if field.location_id is not None:
        pass

    record = FieldWork(
        user_id=data.user_id,
        field_id=data.field_id,
        work_type=data.work_type,
        work_status=data.work_status,
        work_date=data.work_date,
        work_cost=data.work_cost,
        harvest_ton=data.harvest_ton,
        extra_metadata=data.extra_metadata,
    )
    db.add(record)
    try:
        db.commit()
        db.refresh(record)
        return FieldWorkRead.from_orm_with_label(record)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to create field work record")


@router.patch("/{work_id}", response_model=FieldWorkRead)
def update_fieldwork(
    work_id: int,
    data: FieldWorkUpdate,
    db: Session = Depends(get_db),
):
    """
    PATCH /api/v1/fieldwork/{work_id}
    Partial update: status, cost, harvest, metadata.
    Body (all optional):
      {
        "work_status": "COMPLETED",
        "work_cost": 310.50,
        "harvest_ton": 4.2,
        "extra_metadata": { "note": "Finished early" }
      }
    """
    record = db.get(FieldWork, work_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if data.work_status is not None:
        record.work_status = data.work_status
    if data.work_cost is not None:
        record.work_cost = data.work_cost
    if data.harvest_ton is not None:
        record.harvest_ton = data.harvest_ton
    if data.extra_metadata is not None:
        record.extra_metadata = {**(record.extra_metadata or {}), **data.extra_metadata}

    db.commit()
    db.refresh(record)
    return FieldWorkRead.from_orm_with_label(record)


@router.delete("/{work_id}")
def delete_fieldwork(
    work_id: int,
    user_id: int,
    db: Session = Depends(get_db),
):
    """
    DELETE /api/v1/fieldwork/{work_id}?user_id=1
    user_id guard prevents cross-user deletion.
    """
    record = db.get(FieldWork, work_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your record")
    db.delete(record)
    db.commit()
    return {"message": "Record deleted", "id": work_id}