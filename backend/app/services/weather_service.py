import requests
from time import sleep
import datetime
from datetime import datetime, timedelta
import math
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from app.core.database import WeatherHistory, UserLocation, WeatherMetrics
from app.utils.general import safe_float, safe_int
from sqlalchemy import desc
from geoalchemy2.shape import to_shape
from app.monitoring.alerting import AlertService, format_alert
from app.core.config import MIN_RECORDS_7D, HASKELL_SERVICE_URL, WEBHOOK_URL, WEATHER_API_KEY

alert_service = AlertService(webhook_url=WEBHOOK_URL)

def fetch_and_save_weather(db: Session, location: UserLocation):
    point = to_shape(location.location)
    lon, lat = point.x, point.y
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}"
        f"&longitude={lon}"
        "&hourly="
        "temperature_2m,"
        "relative_humidity_2m,"
        "dew_point_2m,"
        "vapour_pressure_deficit,"
        "precipitation,"
        "rain,"
        "showers,"
        "snowfall,"
        "soil_temperature_0cm,"
        "soil_moisture_0_to_1cm,"
        "surface_pressure,"
        "cloud_cover,"
        "wind_speed_10m,"
        "wind_direction_10m"
        "&daily=sunrise,sunset"
        "&timezone=UTC"
    )

    try:

        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        hourly = data["hourly"]
        times = hourly["time"]
        daily = data.get("daily", {})

        sun_map = {
            daily["time"][i]: (daily["sunrise"][i], daily["sunset"][i])
            for i in range(len(daily.get("time", [])))
        }

        for i, ts in enumerate(times):
            timestamp = datetime.fromisoformat(ts)
            date_key = ts.split("T")[0]  # Get YYYY-MM-DD

            sunrise_str, sunset_str = sun_map.get(date_key, (None, None))
            sunrise_dt = datetime.fromisoformat(sunrise_str) if sunrise_str else None
            sunset_dt = datetime.fromisoformat(sunset_str) if sunset_str else None

            is_night = True
            if sunrise_dt and sunset_dt:
                is_night = not (sunrise_dt <= timestamp <= sunset_dt)

            insert_data = {
                "location_id": location.id,
                "timestamp": timestamp,
                "temp": hourly["temperature_2m"][i],
                "humidity": hourly["relative_humidity_2m"][i],
                "dew_point": hourly["dew_point_2m"][i],
                "vapour_pressure_deficit": hourly["vapour_pressure_deficit"][i],
                "precipitation": hourly["precipitation"][i],
                "rain": hourly["rain"][i],
                "showers": hourly["showers"][i],
                "snowfall": hourly["snowfall"][i],
                "soil_temperature_0cm": hourly["soil_temperature_0cm"][i],
                "soil_moisture_0_to_1cm": hourly["soil_moisture_0_to_1cm"][i],
                "pressure": hourly["surface_pressure"][i],
                "cloud_coverage": hourly["cloud_cover"][i],
                "wind_speed": hourly["wind_speed_10m"][i],
                "wind_deg": hourly["wind_direction_10m"][i],
                "sunrise": sunrise_dt,
                "sunset": sunset_dt,
                "is_night": is_night,
                "metrics_status": False
            }

            stmt = insert(WeatherHistory).values(insert_data)

            stmt = stmt.on_conflict_do_update(
                constraint="uq_weather_location_timestamp",
                set_={
                    "temp": stmt.excluded.temp,
                    "humidity": stmt.excluded.humidity,
                    "dew_point": stmt.excluded.dew_point,
                    "vapour_pressure_deficit": stmt.excluded.vapour_pressure_deficit,
                    "precipitation": stmt.excluded.precipitation,
                    "rain": stmt.excluded.rain,
                    "showers": stmt.excluded.showers,
                    "snowfall": stmt.excluded.snowfall,
                    "soil_temperature_0cm": stmt.excluded.soil_temperature_0cm,
                    "soil_moisture_0_to_1cm": stmt.excluded.soil_moisture_0_to_1cm,
                    "pressure": stmt.excluded.pressure,
                    "cloud_coverage": stmt.excluded.cloud_coverage,
                    "wind_speed": stmt.excluded.wind_speed,
                    "wind_deg": stmt.excluded.wind_deg,
                    "sunrise": stmt.excluded.sunrise,
                    "sunset": stmt.excluded.sunset,
                    "is_night": stmt.excluded.is_night,
                    "metrics_status": stmt.excluded.metrics_status
                }
            )

            db.execute(stmt)

        db.commit()

        print(
            f"[INFO] Saved {len(times)} hourly records "
            f"for {location.label}"
        )


    except Exception as e:

        db.rollback()
        alert_service.send(
            key=f"weather_fetch_error_{location.id}",
            message=format_alert(
                "WEATHER_SYNC_FAILURE",
                f"Could not fetch weather for {location.label}: {str(e)}",
                {"location_id": location.id, "url": url}

            )
        )
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

    point = to_shape(location.location)
    lon, lat = point.x, point.y
    elevation = request_elevation(lat, lon) or 0.0

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

        rain_7d = sum(h.rain or 0.0 for h in history_7d)
        rain_30d = sum(h.rain or 0.0 for h in history_30d)

        humidity_7d = [h.humidity for h in history_7d if h.humidity is not None]

        gdd_base_10 = sum(max(0, h.temp - 10) for h in history_7d if h.temp is not None) / 24

        heat_days_7d = sum(1 for h in history_7d if h.temp and h.temp > 30)
        frost_days_7d = sum(1 for h in history_7d if h.temp is not None and h.temp < 0)

        heat_days_30d = sum(1 for h in history_30d if h.temp and h.temp > 30)
        frost_days_30d = sum(1 for h in history_30d if h.temp is not None and h.temp < 0)

        # -----------------------------
        # INPUT FOR HASKELL MODULE
        # -----------------------------

        location_data = {
            "metadata": {
                "lat": safe_float(lat),
                "lon": safe_float(lon),
                "elevation": safe_float(elevation),
                "day_of_year": day_of_year
            },
            "current": {
                "t": weather_record.temp,
                "h": weather_record.humidity,
                "p": weather_record.pressure,
                "ws": weather_record.wind_speed,
                "wd": weather_record.wind_deg,
                "cc": weather_record.cloud_coverage,
                "r": weather_record.rain or 0.0,
                "s": weather_record.snowfall or 0.0,
                "dt": weather_record.timestamp.isoformat(),
                "is_night": weather_record.is_night
            },
            "history_7d": [
                {
                    "t": h.temp,
                    "h": h.humidity,
                    "p": h.pressure,
                    "ws": h.wind_speed,
                    "wd": h.wind_deg,
                    "cc": h.cloud_coverage,
                    "r": h.rain or 0.0,
                    "s": h.snowfall or 0.0,
                    "dt": h.timestamp.isoformat(),
                    "is_night": h.is_night
                } for h in history_7d
            ],
            "history_30d": [
                {
                    "t": h.temp,
                    "h": h.humidity,
                    "p": h.pressure,
                    "ws": h.wind_speed,
                    "wd": h.wind_deg,
                    "cc": h.cloud_coverage,
                    "r": h.rain or 0.0,
                    "s": h.snowfall or 0.0,
                    "dt": h.timestamp.isoformat(),
                    "is_night": h.is_night
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
                spi_1m=None,

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

                spi_1m=result.get("spi1m"),

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
        else:
            print(f"[ERROR] Haskell service returned status {response.status_code}: {response.text}")
        return None
    except Exception as e:
        print(f"[ERROR] Haskell service communication error: {e}")
        return None


def current_weather_request(location: UserLocation):
    point = to_shape(location.location)
    lon, lat = point.x, point.y

    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={WEATHER_API_KEY}&units=metric"

    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        weather_current = WeatherHistory(
            timestamp=datetime.fromtimestamp(data.get("dt")),
            temp=data["main"]["temp"],
            pressure=data["main"]["pressure"],
            humidity=data["main"]["humidity"],
            wind_speed=data["wind"]["speed"],
            wind_deg=data["wind"]["deg"],
            cloud_coverage=data["clouds"]["all"],
            weather_id=data["weather"][0]["id"],
            weather_main=data["weather"][0]["main"],
            weather_description=data["weather"][0]["description"],
        )

        print(f"[INFO] Weather received for {location.label}")
        return weather_current
    except Exception as e:
        alert_service.send(
            key=f"weather_err_{location.id}",
            message=f"Error for {location.label}: {str(e)}"
        )
        return None