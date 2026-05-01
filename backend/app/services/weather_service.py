import requests
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import WeatherHistory, UserLocation

WEATHER_API_KEY = "62fac38da0cb452e42ea7171b9586e60"


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