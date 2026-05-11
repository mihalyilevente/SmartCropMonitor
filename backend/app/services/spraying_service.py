import requests
import logging
import datetime
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.core.database import WeatherHistory, UserLocation, WeatherMetrics
from app.utils.general import clean_f

from app.core.config import HASKELL_SERVICE_URL


logger = logging.getLogger(__name__)


def _serialize_spraying_point(weather: WeatherHistory, metric: Optional[WeatherMetrics]) -> Dict[str, Any]:

    return {
        "t": clean_f(weather.temp),
        "h": clean_f(weather.humidity),
        "ws": clean_f(weather.wind_speed),
        "r": clean_f(weather.rain),
        "et0": clean_f(metric.et0) if metric else 0.0,
        "vapour_pressure_deficit": clean_f(weather.vapour_pressure_deficit) if metric else 0.0,
        "dt": weather.timestamp.strftime('%Y-%m-%dT%H:%M:%SZ')
    }


def calculate_spraying_window(db: Session, location: UserLocation) -> Optional[Dict[str, Any]]:
    now = datetime.utcnow()
    end_date = now + timedelta(days=8)

    forecast_7d = db.query(WeatherHistory).filter(
        and_(
            WeatherHistory.location_id == location.id,
            WeatherHistory.timestamp >= now,
            WeatherHistory.timestamp <= end_date
        )
    ).order_by(WeatherHistory.timestamp.asc()).all()

    if not forecast_7d:
        logger.warning(f"No weather forecast found for location {location.id}")
        return None

    metrics_7d = db.query(WeatherMetrics).filter(
        and_(
            WeatherMetrics.location_id == location.id,
            WeatherMetrics.window_end_date >= now,
            WeatherMetrics.window_end_date <= end_date
        )
    ).all()

    metrics_map = {m.window_end_date.strftime("%Y-%m-%d %H"): m for m in metrics_7d}

    payload_data = []
    for h in forecast_7d:
        hour_key = h.timestamp.strftime("%Y-%m-%d %H")
        metric = metrics_map.get(hour_key)
        payload_data.append(_serialize_spraying_point(h, metric))

    if len(payload_data) < 12:
        logger.error(f"Insufficient data points for spraying analysis: {len(payload_data)}")
        return None

    return perform_haskell_spraying_validation({"forecast_7d": payload_data})


def perform_haskell_spraying_validation(forecast: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        payload = {
            "raw_data": forecast,
            "config": 4
        }

        response = requests.post(
            HASKELL_SERVICE_URL,
            json=payload,
            timeout=10
        )

        if response.status_code == 200:
            return response.json()

        logger.error(f"Haskell service error {response.status_code}: {response.text}")
        return None

    except requests.exceptions.Timeout:
        logger.error("Haskell service timeout")
    except Exception as e:
        logger.error(f"Failed to communicate with Haskell service: {e}")

    return None