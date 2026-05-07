from apscheduler.schedulers.background import BackgroundScheduler
from app.core.database import SessionLocal
from app.services.orchestrator import run_full_data_cycle, download_sentinel_data
from app.services.weather_service import weather_metrics
from app.core.database import UserLocation


scheduler = BackgroundScheduler()


def scheduled_update():
    db = SessionLocal()
    try:
        download_sentinel_data(db)

        run_full_data_cycle(db)

        locations = db.query(UserLocation).all()
        for loc in locations:
            weather_metrics(db, loc)

        print("[INFO] Scheduled update completed successfully.")
    except Exception as e:
        print(f"[ERROR] Scheduled update failed: {e}")
    finally:
        db.close()


scheduler.add_job(
    scheduled_update,
    "cron",
    hour=1,
    minute=0,
    id="daily_sync_job",
    replace_existing=True
)