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
    hayfield = "hayfield"

    orchard = "orchard"
    vineyard = "vineyard"
    berry_patch = "berry_patch"
    nursery = "nursery"

    greenhouse = "greenhouse"

    fallow = "fallow"
    fallow_land = "fallow_land"
    forest_belt = "forest_belt"
    storage = "storage"
    water_body = "water_body"

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


class FieldCrop(str, enum.Enum):
    WHEAT_WINTER = "WHEAT_WINTER"
    WHEAT_SPRING = "WHEAT_SPRING"
    BARLEY = "BARLEY"
    CORN = "CORN"
    OATS = "OATS"
    RYE = "RYE"
    RICE = "RICE"

    PEAS = "PEAS"
    SOYBEANS = "SOYBEANS"
    CHICKPEAS = "CHICKPEAS"
    LENTILS = "LENTILS"

    SUNFLOWER = "SUNFLOWER"
    RAPESEED_WINTER = "RAPESEED_WINTER"
    RAPESEED_SPRING = "RAPESEED_SPRING"
    FLAX = "FLAX"

    SUGAR_BEET = "SUGAR_BEET"
    POTATOES = "POTATOES"
    COTTON = "COTTON"

    ALFALFA = "ALFALFA"
    SILAGE_CORN = "SILAGE_CORN"
    CLOVER = "CLOVER"
    GRASS_MIX = "GRASS_MIX"

    APPLE = "APPLE"
    PEAR = "PEAR"
    CHERRY = "CHERRY"
    GRAPES_WINE = "GRAPES_WINE"
    GRAPES_TABLE = "GRAPES_TABLE"
    STRAWBERRY = "STRAWBERRY"
    BLUEBERRY = "BLUEBERRY"

    TOMATO = "TOMATO"
    ONION = "ONION"
    CARROT = "CARROT"
    CABBAGE = "CABBAGE"

    FALLOW = "FALLOW"
    COVER_CROP = "COVER_CROP"
    OTHER = "OTHER"


class FieldWorkType(str, enum.Enum):
    PLOWING = "PLOWING"
    SUBSOILING = "SUBSOILING"
    DISCING = "DISCING"
    HARROWING = "HARROWING"
    CULTIVATION = "CULTIVATION"
    ROLLING = "ROLLING"

    SOWING = "SOWING"
    PLANTING = "PLANTING"

    FERTILIZATION = "FERTILIZATION"
    SPRAYING = "SPRAYING"
    IRRIGATION = "IRRIGATION"
    WEEDING = "WEEDING"

    PRUNING = "PRUNING"
    GRAFTING = "GRAFTING"
    MULCHING = "MULCHING"
    THINNING = "THINNING"
    TRELLIS_REPAIR = "TRELLIS_REPAIR"

    MOWING = "MOWING"
    RAKING = "RAKING"
    BALING = "BALING"
    GRAZING = "GRAZING"

    HARVESTING = "HARVESTING"
    DESICCATION = "DESICCATION"

    SOIL_SAMPLING = "SOIL_SAMPLING"
    MAINTENANCE = "MAINTENANCE"


class FieldWorkStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PLANNED = "PLANNED"
    SCHEDULED = "SCHEDULED"

    ON_HOLD = "ON_HOLD"
    IN_PROGRESS = "IN_PROGRESS"

    COMPLETED = "COMPLETED"
    VERIFIED = "VERIFIED"

    CANCELLED = "CANCELLED"
    FAILED = "FAILED"