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

# =========================
# Analytics – by work type
# =========================

from sqlalchemy import func as _func, extract as _extract, case as _case
from collections import defaultdict as _dd
import datetime as _dt


def _wt(r):
    return r.work_type.value if hasattr(r.work_type, "value") else str(r.work_type)

def _ws(r):
    return r.work_status.value if hasattr(r.work_status, "value") else str(r.work_status)

def _is_done(r):
    return _ws(r) in ("COMPLETED", "VERIFIED")


@router.get("/analytics/work-types/user/{user_id}")
def get_work_type_analytics(
    user_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    GET /api/v1/fieldwork/analytics/work-types/user/{user_id}?year=2026

    Deep statistics broken down by work type.

    Response shape:
    {
      "year_filter": 2026,
      "types": [
        {
          "work_type": "PLOWING",
          "count": 8,
          "completed": 6,
          "completion_rate": 0.75,
          "cancelled": 1,
          "failed": 0,
          "total_cost": 480.0,
          "avg_cost": 60.0,
          "min_cost": 40.0,
          "max_cost": 90.0,
          "total_harvest_ton": 0.0,
          "avg_harvest_ton": 0.0,
          "fields_involved": 3,
          "by_month": [
            {"month": "2026-03", "count": 2, "total_cost": 120.0}
          ],
          "by_status": [
            {"status": "COMPLETED", "count": 6},
            {"status": "CANCELLED", "count": 1},
            {"status": "PLANNED",   "count": 1}
          ]
        }
      ],
      "summary": {
        "most_frequent": "PLOWING",
        "most_expensive_avg": "HARVESTING",
        "best_completion_rate": "FERTILIZATION",
        "worst_completion_rate": "SPRAYING",
        "total_cost": 2100.0,
        "total_harvest_ton": 22.4
      }
    }
    """
    q = db.query(FieldWork).filter(FieldWork.user_id == user_id)
    if year:
        q = q.filter(_extract("year", FieldWork.work_date) == year)
    records = q.order_by(FieldWork.work_date).all()

    if not records:
        return {"year_filter": year, "types": [], "summary": {}}

    # bucket by work_type
    buckets = _dd(lambda: {
        "count": 0, "completed": 0, "cancelled": 0, "failed": 0,
        "costs": [], "harvests": [], "fields": set(),
        "months": _dd(lambda: {"count": 0, "total_cost": 0.0}),
        "statuses": _dd(int),
    })

    for r in records:
        wt = _wt(r)
        ws = _ws(r)
        b  = buckets[wt]
        b["count"]     += 1
        b["statuses"][ws] += 1
        b["fields"].add(r.field_id)
        month = r.work_date.strftime("%Y-%m")
        b["months"][month]["count"]      += 1
        b["months"][month]["total_cost"] += float(r.work_cost or 0)
        if r.work_cost:    b["costs"].append(float(r.work_cost))
        if r.harvest_ton:  b["harvests"].append(float(r.harvest_ton))
        if _is_done(r):    b["completed"] += 1
        if ws == "CANCELLED": b["cancelled"] += 1
        if ws == "FAILED":    b["failed"]    += 1

    types_out = []
    for wt, b in sorted(buckets.items(), key=lambda x: -x[1]["count"]):
        costs    = b["costs"]
        harvests = b["harvests"]
        count    = b["count"]
        types_out.append({
            "work_type":         wt,
            "count":             count,
            "completed":         b["completed"],
            "completion_rate":   round(b["completed"] / count, 3) if count else 0,
            "cancelled":         b["cancelled"],
            "failed":            b["failed"],
            "total_cost":        round(sum(costs), 2),
            "avg_cost":          round(sum(costs) / len(costs), 2) if costs else 0,
            "min_cost":          round(min(costs), 2) if costs else 0,
            "max_cost":          round(max(costs), 2) if costs else 0,
            "total_harvest_ton": round(sum(harvests), 3),
            "avg_harvest_ton":   round(sum(harvests) / len(harvests), 3) if harvests else 0,
            "fields_involved":   len(b["fields"]),
            "by_month": [
                {"month": m, "count": v["count"], "total_cost": round(v["total_cost"], 2)}
                for m, v in sorted(b["months"].items())
            ],
            "by_status": [
                {"status": s, "count": c}
                for s, c in sorted(b["statuses"].items(), key=lambda x: -x[1])
            ],
        })

    # summary picks
    def _pick(lst, key, best=True):
        filtered = [t for t in lst if t[key] > 0]
        if not filtered: return None
        return (max if best else min)(filtered, key=lambda x: x[key])["work_type"]

    summary = {
        "most_frequent":        types_out[0]["work_type"] if types_out else None,
        "most_expensive_avg":   _pick(types_out, "avg_cost"),
        "best_completion_rate": _pick(types_out, "completion_rate"),
        "worst_completion_rate":_pick([t for t in types_out if t["count"] >= 2], "completion_rate", best=False),
        "total_cost":           round(sum(t["total_cost"] for t in types_out), 2),
        "total_harvest_ton":    round(sum(t["total_harvest_ton"] for t in types_out), 3),
    }

    return {"year_filter": year, "types": types_out, "summary": summary}


# =========================
# Analytics – by location / farm
# =========================

@router.get("/analytics/locations/user/{user_id}")
def get_location_analytics(
    user_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    GET /api/v1/fieldwork/analytics/locations/user/{user_id}?year=2026

    Farm-level and per-location breakdown of field work.

    Response shape:
    {
      "farm": {
        "farm_name": "Smith Farm",
        "farm_size_ha": 120.0,
        "total_ops": 42,
        "total_cost": 2800.0,
        "cost_per_ha": 23.3,
        "total_harvest_ton": 38.0,
        "harvest_per_ha": 0.317,
        "completion_rate": 0.81
      },
      "locations": [
        {
          "location_id": 1,
          "location_label": "North Block",
          "total_ops": 18,
          "completed": 15,
          "completion_rate": 0.83,
          "total_cost": 1100.0,
          "avg_cost_per_op": 61.1,
          "total_harvest_ton": 22.0,
          "fields_count": 4,
          "total_area_ha": 45.2,
          "cost_per_ha": 24.3,
          "harvest_per_ha": 0.487,
          "most_common_type": "PLOWING",
          "by_type": [
            {"work_type": "PLOWING", "count": 5, "total_cost": 300.0}
          ],
          "by_month": [
            {"month": "2026-04", "count": 3, "total_cost": 180.0}
          ]
        }
      ]
    }
    """
    from app.core.database import UserLocation, FieldUnit, UserDB

    # Fetch user farm info
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    farm_name    = getattr(user, "farm_name",    None) if user else None
    farm_size_ha = float(getattr(user, "farm_size_ha", 0) or 0) if user else 0

    # All locations for this user
    locations = (
        db.query(UserLocation)
        .filter(UserLocation.user_id == user_id)
        .all()
    )
    loc_map = {loc.id: loc for loc in locations}

    # All fields grouped by location
    all_fields = (
        db.query(FieldUnit)
        .filter(FieldUnit.location_id.in_(list(loc_map.keys())))
        .all()
    )
    fields_by_loc   = _dd(list)
    area_by_loc     = _dd(float)
    for f in all_fields:
        fields_by_loc[f.location_id].append(f.id)
        area_by_loc[f.location_id] += float(f.area_ha or 0)

    # Fetch all relevant FieldWork records joined through FieldUnit → location
    field_ids_all = [f.id for f in all_fields]
    if not field_ids_all:
        return {"farm": {}, "locations": []}

    q = db.query(FieldWork).filter(
        FieldWork.user_id  == user_id,
        FieldWork.field_id.in_(field_ids_all),
    )
    if year:
        q = q.filter(_extract("year", FieldWork.work_date) == year)
    records = q.order_by(FieldWork.work_date).all()

    # Build field_id → location_id map
    fid_to_loc = {f.id: f.location_id for f in all_fields}

    # Bucket by location
    loc_buckets = _dd(lambda: {
        "ops": 0, "completed": 0, "cost": 0.0, "harvest": 0.0,
        "types": _dd(lambda: {"count": 0, "cost": 0.0}),
        "months": _dd(lambda: {"count": 0, "cost": 0.0}),
    })

    for r in records:
        lid = fid_to_loc.get(r.field_id)
        if lid is None:
            continue
        b   = loc_buckets[lid]
        wt  = _wt(r)
        mon = r.work_date.strftime("%Y-%m")
        cost = float(r.work_cost or 0)
        harv = float(r.harvest_ton or 0)

        b["ops"]     += 1
        b["cost"]    += cost
        b["harvest"] += harv
        if _is_done(r): b["completed"] += 1
        b["types"][wt]["count"] += 1
        b["types"][wt]["cost"]  += cost
        b["months"][mon]["count"] += 1
        b["months"][mon]["cost"]  += cost

    locations_out = []
    for loc in locations:
        lid  = loc.id
        b    = loc_buckets[lid]
        area = area_by_loc[lid]
        ops  = b["ops"]
        cost = b["cost"]
        harv = b["harvest"]

        by_type_sorted = sorted(b["types"].items(), key=lambda x: -x[1]["count"])
        most_common    = by_type_sorted[0][0] if by_type_sorted else None

        locations_out.append({
            "location_id":      lid,
            "location_label":   loc.label or f"Location {lid}",
            "total_ops":        ops,
            "completed":        b["completed"],
            "completion_rate":  round(b["completed"] / ops, 3) if ops else 0,
            "total_cost":       round(cost, 2),
            "avg_cost_per_op":  round(cost / ops, 2) if ops else 0,
            "total_harvest_ton": round(harv, 3),
            "fields_count":     len(fields_by_loc[lid]),
            "total_area_ha":    round(area, 2),
            "cost_per_ha":      round(cost / area, 2) if area else None,
            "harvest_per_ha":   round(harv / area, 3) if area else None,
            "most_common_type": most_common,
            "by_type": [
                {"work_type": wt, "count": v["count"], "total_cost": round(v["cost"], 2)}
                for wt, v in by_type_sorted
            ],
            "by_month": [
                {"month": m, "count": v["count"], "total_cost": round(v["cost"], 2)}
                for m, v in sorted(b["months"].items())
            ],
        })

    # Sort locations by total_ops desc
    locations_out.sort(key=lambda x: -x["total_ops"])

    # Farm-level aggregates
    total_ops    = sum(x["total_ops"]        for x in locations_out)
    total_cost   = sum(x["total_cost"]       for x in locations_out)
    total_harv   = sum(x["total_harvest_ton"] for x in locations_out)
    total_compl  = sum(x["completed"]        for x in locations_out)
    total_area   = sum(area_by_loc[loc.id]   for loc in locations)

    farm = {
        "farm_name":        farm_name,
        "farm_size_ha":     round(farm_size_ha, 2) if farm_size_ha else None,
        "total_ops":        total_ops,
        "total_cost":       round(total_cost, 2),
        "cost_per_ha":      round(total_cost / total_area, 2) if total_area else None,
        "total_harvest_ton": round(total_harv, 3),
        "harvest_per_ha":   round(total_harv / total_area, 3) if total_area else None,
        "completion_rate":  round(total_compl / total_ops, 3) if total_ops else 0,
        "locations_count":  len(locations),
        "total_area_ha":    round(total_area, 2),
    }

    return {"farm": farm, "locations": locations_out}