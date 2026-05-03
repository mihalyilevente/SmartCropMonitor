import requests
from time import sleep
import datetime
from datetime import datetime, timedelta
import math
from sqlalchemy.orm import Session
from app.core.database import WeatherHistory, UserLocation, WeatherMetrics
from app.utils.general import safe_float, safe_int
from sqlalchemy import desc
from app.core.config import MIN_RECORDS_7D, WEATHER_API_KEY, HASKELL_SERVICE_URL

# =========================
# Config
# =========================



def fetch_and_save_weather(db: Session, location: UserLocation):
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={location.lat}&lon={location.lon}&appid={WEATHER_API_KEY}&units=metric"

    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        weather_entry = WeatherHistory(
            location_id=location.id,
            timestamp=datetime.fromtimestamp(data.get("dt")),
            lat=data["coord"]["lat"],
            lon=data["coord"]["lon"],
            temp=data["main"]["temp"],
            feels_like=data["main"]["feels_like"],
            pressure=data["main"]["pressure"],
            humidity=data["main"]["humidity"],
            wind_speed=data["wind"]["speed"],
            wind_deg=data["wind"]["deg"],
            cloud_coverage=data["clouds"]["all"],
            weather_id=data["weather"][0]["id"],
            weather_main=data["weather"][0]["main"],
            weather_description=data["weather"][0]["description"],
            raw_json=data
        )

        db.add(weather_entry)
        db.commit()
        print(f"[INFO] Weather saved for {location.label} (Temp: {data['main']['temp']}°C)")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Weather fetch failed for loc {location.id}: {e}")


def request_elevation(lat, lon, retries=3):
    url = "https://api.open-elevation.com/api/v1/lookup"
    params = {"locations": f"{lat},{lon}"}

    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=10)
            r.raise_for_status()

            return float(r.json()["results"][0]["elevation"])

        except Exception:
            sleep(1.5 * (attempt + 1))

    return None


def weather_metrics(db: Session, location: UserLocation):
    pending_list = db.query(WeatherHistory).filter(
        WeatherHistory.location_id == location.id,
        WeatherHistory.metrics_status == False
    ).order_by(WeatherHistory.timestamp.asc()).all()

    if not pending_list:
        return

    elevation = request_elevation(location.lat, location.lon) or 0.0

    for weather_record in pending_list:

        end_date = weather_record.timestamp
        start_7d = end_date - timedelta(days=7)
        start_30d = end_date - timedelta(days=30)

        day_of_year = weather_record.timestamp.timetuple().tm_yday

        history_7d = db.query(WeatherHistory).filter(
            WeatherHistory.location_id == location.id,
            WeatherHistory.timestamp.between(start_7d, end_date)
        ).order_by(WeatherHistory.timestamp.asc()).all()

        history_30d = db.query(WeatherHistory).filter(
            WeatherHistory.location_id == location.id,
            WeatherHistory.timestamp.between(start_30d, end_date)
        ).order_by(WeatherHistory.timestamp.asc()).all()

        # -----------------------------
        # DERIVED BASIC FEATURES
        # -----------------------------

        temps = [h.temp for h in history_7d if h.temp is not None]

        rain_7d = sum(h.rain_1h or 0.0 for h in history_7d)
        rain_30d = sum(h.rain_1h or 0.0 for h in history_30d)

        humidity_7d = [h.humidity for h in history_7d if h.humidity is not None]

        gdd_base_10 = sum(max(0, h.temp - 10) for h in history_7d if h.temp is not None)

        heat_days_7d = sum(1 for h in history_7d if h.temp and h.temp > 30)
        frost_days_7d = sum(1 for h in history_7d if h.temp is not None and h.temp < 0)

        heat_days_30d = sum(1 for h in history_30d if h.temp and h.temp > 30)
        frost_days_30d = sum(1 for h in history_30d if h.temp is not None and h.temp < 0)

        # -----------------------------
        # INPUT FOR HASKELL MODULE
        # -----------------------------

        location_data = {
            "metadata": {
                "lat": safe_float(location.lat),
                "lon": safe_float(location.lon),
                "elevation": safe_float(elevation),
                "day_of_year": day_of_year
            },
            "current": {
                "temp": weather_record.temp,
                "pressure": weather_record.pressure,
                "humidity": weather_record.humidity,
                "wind_speed": weather_record.wind_speed,
                "clouds": weather_record.cloud_coverage,
                "timestamp": weather_record.timestamp.isoformat()
            },
            "history_7d": [
                {
                    "t": h.temp,
                    "h": h.humidity,
                    "p": h.pressure,
                    "ws": h.wind_speed,
                    "wd": h.wind_deg,
                    "cc": h.cloud_coverage,
                    "r": h.rain_1h or 0.0,
                    "s": h.snow_1h or 0.0,
                    "dt": h.timestamp.isoformat()
                } for h in history_7d
            ],
            "history_30d": [
                {
                    "t": h.temp,
                    "r": h.rain_1h or 0.0,
                    "h": h.humidity,
                    "dt": h.timestamp.isoformat()
                } for h in history_30d
            ]
        }

        result = perform_haskell_weather_metrics(location_data)

        if (not result) or len(history_7d) < MIN_RECORDS_7D:

            metrics_entry = WeatherMetrics(
                location_id=location.id,
                reference_weather_id=weather_record.id,
                window_end_date=end_date,

                temp_min_day_7d=min(temps) if temps else None,
                temp_max_day_7d=max(temps) if temps else None,

                gdd_base_10=gdd_base_10,

                rain_cum_7d=rain_7d,
                rain_cum_30d=rain_30d,

                humidity_mean_7d=sum(humidity_7d)/len(humidity_7d) if humidity_7d else None,

                heat_days_count_7d=heat_days_7d,
                frost_days_count_7d=frost_days_7d,
                heat_days_count_30d=heat_days_30d,
                frost_days_count_30d=frost_days_30d,

                et0=None,
                water_deficit_7d=None,
                water_deficit_30d=None,
                spi_3m=None,

                ra_mj_m2_day=None,
                rs_mj_m2_day=None
            )

        else:

            metrics_entry = WeatherMetrics(
                location_id=location.id,
                reference_weather_id=weather_record.id,
                window_end_date=end_date,

                temp_min_day_7d=result.get("temp_min_7d"),
                temp_max_day_7d=result.get("temp_max_7d"),
                temp_min_night_7d=result.get("temp_min_night_7d"),
                temp_max_night_7d=result.get("temp_max_night_7d"),

                gdd_base_10=result.get("gdd"),

                rain_cum_7d=rain_7d,
                rain_cum_30d=rain_30d,

                humidity_mean_7d=result.get("hum_mean_7d"),
                humidity_mean_30d=result.get("hum_mean_30d"),

                heat_days_count_7d=heat_days_7d,
                frost_days_count_7d=frost_days_7d,
                heat_days_count_30d=heat_days_30d,
                frost_days_count_30d=frost_days_30d,

                et0=result.get("et0"),
                water_deficit_7d=result.get("water_deficit_7d"),
                water_deficit_30d=result.get("water_deficit_30d"),

                spi_3m=result.get("spi_3m"),

                ra_mj_m2_day=result.get("ra"),
                rs_mj_m2_day=result.get("rs")
            )

        db.add(metrics_entry)
        weather_record.metrics_status = True

        try:
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[ERROR] Failed to save metrics: {e}")


def perform_haskell_weather_metrics(location_data):
    try:
        payload = {
            "dataField": location_data,
            "config": 3
        }

        response = requests.post(
            HASKELL_SERVICE_URL,
            json=payload,
            timeout=10
        )

        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"[ERROR] Haskell service communication error: {e}")
        return None