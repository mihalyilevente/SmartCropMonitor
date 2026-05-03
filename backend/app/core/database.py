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
from app.core.config import SQLALCHEMY_DATABASE_URL


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


class WeatherHistory(Base):
    __tablename__ = "weather_history"

    id = Column(Integer, primary_key=True, index=True)

    location_id = Column(Integer, ForeignKey("user_locations.id"), index=True)

    timestamp = Column(DateTime, index=True)

    lat = Column(Float)
    lon = Column(Float)

    temp = Column(Float)
    feels_like = Column(Float)

    pressure = Column(Float)
    humidity = Column(Float)

    wind_speed = Column(Float)
    wind_deg = Column(Float)

    cloud_coverage = Column(Float)
    rain_1h = Column(Float, nullable=True)
    snow_1h = Column(Float, nullable=True)

    weather_id = Column(Integer)
    weather_main = Column(String)
    weather_description = Column(String)

    data_source = Column(String, default="openweathermap")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    metrics_status = Column(Boolean, default=False)

    raw_json = Column(JSON, nullable=True)

    location = relationship("UserLocation")


class WeatherMetrics(Base):
    __tablename__ = "weather_metrics"

    id = Column(Integer, primary_key=True, index=True)

    location_id = Column(Integer, ForeignKey("user_locations.id"), index=True)
    reference_weather_id = Column(Integer, ForeignKey("weather_history.id"), index=True)

    window_end_date = Column(DateTime, default=datetime.datetime.utcnow)

    temp_min_day_7d = Column(Float)
    temp_max_day_7d = Column(Float)
    temp_min_night_7d = Column(Float)
    temp_max_night_7d = Column(Float)

    gdd_base_10 = Column(Float)

    rain_cum_7d = Column(Float)
    rain_cum_30d = Column(Float)

    water_deficit_7d = Column(Float)
    water_deficit_30d = Column(Float)

    et0 = Column(Float)

    humidity_mean_7d = Column(Float)
    humidity_mean_30d = Column(Float)

    heat_days_count_7d = Column(Integer)
    heat_days_count_30d = Column(Integer)
    frost_days_count_7d = Column(Integer)
    frost_days_count_30d = Column(Integer)

    spi_3m = Column(Float)

    ra_mj_m2_day = Column(Float)
    rs_mj_m2_day = Column(Float)

    location = relationship("UserLocation")
    weather = relationship("WeatherHistory")

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