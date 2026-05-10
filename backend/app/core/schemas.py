import enum
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class UserCreate(BaseModel):
    username: str
    password: str

class FieldType(str, enum.Enum):
    pasture = "pasture"
    crop = "crop"
    vineyard = "vineyard"
    orchard = "orchard"
    other = "other"


class SensorCreate(BaseModel):
    label: str
    latitude: float
    longitude: float
    user_id: int
    meteorological: Optional[bool] = True

class SingleReading(BaseModel):
    ts: datetime  # ISO format: 2026-05-09T10:00:00
    t: Optional[float] = None # temperature
    p: Optional[float] = None # pressure
    h: Optional[float] = None # humidity
    extra: Optional[dict] = None

class SensorDataBatch(BaseModel):
    key: str
    data: List[SingleReading]

class SensorUpdate(BaseModel):
    label: Optional[str] = None
    longitude: Optional[float] = None
    latitude: Optional[float] = None
    meteorological: Optional[bool] = None
    activation_status: Optional[bool] = None