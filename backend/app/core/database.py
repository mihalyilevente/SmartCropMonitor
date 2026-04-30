# =========================
# Imports
# =========================
import datetime
from asyncio.windows_events import NULL

from sqlalchemy import (
    create_engine, Column, Integer, Float,
    ForeignKey, String, DateTime, JSON, Boolean
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

from pydantic import BaseModel

# =========================
# Config
# =========================
SQLALCHEMY_DATABASE_URL = "sqlite:///./users.db"

# =========================
# Engine / Session
# =========================
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}  # required for SQLite
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# =========================
# Base
# =========================
Base = declarative_base()

# =========================
# Models
# =========================
class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    # relationship to locations
    locations = relationship("UserLocation", back_populates="owner")


class UserLocation(Base):
    __tablename__ = "user_locations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    label = Column(String)
    lat = Column(Float)
    lon = Column(Float)

    last_image_date = Column(DateTime, nullable=True)
    last_image_url = Column(String, nullable=True)
    segmentation_status = Column(Boolean, default=None, nullable=True)
    last_segm_mask_url = Column(String, nullable=True)

    # relationship to user
    owner = relationship("UserDB", back_populates="locations")


class FieldAnalysis(Base):
    __tablename__ = "field_analysis_history"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("user_locations.id"))

    nc_filename = Column(String)
    mask_filename = Column(String, nullable=True)
    last_data_request_date = Column(DateTime, default=datetime.datetime.utcnow)

    is_valid = Column(Boolean, default=None)
    quality_report = Column(String, nullable=True)

    results_json = Column(JSON, nullable=True)
    fields_count = Column(Integer, default=0)

    # relationship to location
    location = relationship("UserLocation")


class FieldUnit(Base):
    __tablename__ = "field_units"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("user_locations.id"))

    field_index = Column(Integer)

    area_ha = Column(Float, nullable=True)

    is_active = Column(Boolean, default=True)
    crop_type = Column(String, nullable=True)
    extra_data = Column(JSON, nullable=True)

    location = relationship("UserLocation", back_populates="fields")


UserLocation.fields = relationship("FieldUnit", back_populates="location")

# =========================
# Schemas
# =========================
class UserCreate(BaseModel):
    username: str
    password: str

# =========================
# DB Dependency
# =========================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# =========================
# Init DB
# =========================
Base.metadata.create_all(bind=engine)