# =========================
# Imports
# =========================
import datetime
from sqlalchemy import (
    create_engine, Column, Integer, Float, Enum, Numeric,
    ForeignKey, String, DateTime, JSON, Boolean, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

from pydantic import BaseModel
from app.core.config import SQLALCHEMY_DATABASE_URL
from app.core.schemas import FieldType
import enum
from geoalchemy2 import Geometry

# =========================
# Engine / Session
# =========================
engine = create_engine(
    SQLALCHEMY_DATABASE_URL
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

    locations = relationship("UserLocation", back_populates="owner")
    sensors = relationship("SensorsDB", back_populates="owner")


class UserLocation(Base):
    __tablename__ = "user_locations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    label = Column(String)

    location = Column(Geometry(geometry_type='POINT', srid=4326))

    last_image_date = Column(DateTime, nullable=True)
    last_image_url = Column(String, nullable=True)
    segmentation_status = Column(Boolean, default=None, nullable=True)
    last_segm_mask_url = Column(String, nullable=True)
    last_grid_mask_url = Column(String, nullable=True)

    weather_history = relationship("WeatherHistory", back_populates="location")
    weather_metrics = relationship("WeatherMetrics", back_populates="location")
    analyses = relationship("FieldAnalysis", back_populates="location")


class FieldAnalysis(Base):
    __tablename__ = "field_analysis_history"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("user_locations.id"))

    nc_filename = Column(String)
    mask_filename = Column(String, nullable=True)
    last_data_request_date = Column(DateTime, default=datetime.datetime.utcnow)

    is_valid = Column(Float, nullable=True, default=None)
    quality_report = Column(String, nullable=True)
    results_json = Column(JSON, nullable=True)

    metrics_status = Column(Boolean, default=None, nullable=True)
    metrics_filename = Column(String, nullable=True)

    fields_count = Column(Integer, default=0)

    location = relationship("UserLocation", back_populates="analyses")


class FieldUnit(Base):
    __tablename__ = "field_units"

    id = Column(Integer, primary_key=True, index=True)

    location_id = Column(
        Integer,
        ForeignKey("user_locations.id"),
        nullable=False,
        index=True
    )

    label = Column(String, nullable=False)

    geometry = Column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326),
        nullable=False
    )

    area_ha = Column(Numeric(12, 2), nullable=True)

    field_type = Column(
        Enum(FieldType),
        nullable=False,
        index=True
    )

    manual_added = Column(Boolean, default=False)

    source = Column(String, nullable=True)

    crop_type = Column(String, nullable=True)

    season_year = Column(Integer, nullable=True)

    status = Column(String, default="active", index=True)

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        nullable=False
    )

    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow
    )

    deleted_at = Column(DateTime, nullable=True)

    location = relationship("UserLocation", back_populates="fields")
    field_data = relationship("FieldData", back_populates="field")


class FieldData(Base):
    __tablename__ = "field_data"
    id = Column(Integer, primary_key=True, index=True)

    field_id = Column(
        Integer,
        ForeignKey("field_units.id"),
        nullable=False,
        index=True
    )

    timestamp = Column(DateTime, nullable=False, index=True)

    metric_type = Column(String(50), nullable=False, index=True)
    mean_metric = Column(Numeric(6, 4), nullable=True)
    min_metric = Column(Numeric(6, 4), nullable=True)
    max_metric = Column(Numeric(6, 4), nullable=True)
    std_metric = Column(Numeric(6, 4), nullable=True)


    extra = Column(JSON, nullable=True)

    field = relationship("FieldUnit", back_populates="field_data")


class WeatherHistory(Base):
    __tablename__ = "weather_history"

    id = Column(Integer, primary_key=True)

    location_id = Column(Integer, ForeignKey("user_locations.id"))

    timestamp = Column(DateTime, nullable=False, index=True)

    temp = Column(Float)

    humidity = Column(Float)

    precipitation = Column(Float)
    rain = Column(Float)
    showers = Column(Float)
    snowfall = Column(Float)

    soil_temperature_0cm = Column(Float)
    soil_moisture_0_to_1cm = Column(Float)

    pressure = Column(Float)

    cloud_coverage = Column(Float)

    wind_speed = Column(Float)
    wind_deg = Column(Float)

    dew_point = Column(Float)
    vapour_pressure_deficit = Column(Float)

    sunrise = Column(DateTime)
    sunset = Column(DateTime)
    is_night = Column(Boolean, default=False)

    data_source = Column(String, default="open-meteo")

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    metrics_status = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint(
            "location_id",
            "timestamp",
            name="uq_weather_location_timestamp"
        ),
    )

    location = relationship("UserLocation", back_populates="weather_history")
    metrics = relationship("WeatherMetrics", back_populates="weather")


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

    spi_1m = Column(Float)

    ra_mj_m2_day = Column(Float)
    rs_mj_m2_day = Column(Float)

    location = relationship("UserLocation", back_populates="weather_metrics")
    weather = relationship("WeatherHistory", back_populates="metrics")


class SensorsDB(Base):
    __tablename__ = "sensors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    location = Column(Geometry(geometry_type='POINT', srid=4326))
    label = Column(String)

    hashed_key = Column(String, unique=True, index=True, nullable=False)

    added_at = Column(DateTime, nullable=True, default=datetime.datetime.utcnow)
    meteorological = Column(Boolean, nullable=True)
    activation_status = Column(Boolean, nullable=True, default=True)

    extra_data = Column(JSON, nullable=True)

    owner = relationship("UserDB")


class WeatherSensors(Base):
    __tablename__ = "weather_sensors"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"))

    timestamp = Column(DateTime, nullable=False, index=True)

    temp = Column(Float)
    pressure = Column(Float)
    humidity = Column(Float)

    sensor_status = Column(Boolean, nullable=True)

    extra_data = Column(JSON, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "sensor_id",
            "timestamp",
            name="uq_sensor_timestamp"
        ),
    )

    sensor = relationship("SensorsDB")


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
