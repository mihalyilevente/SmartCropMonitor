from apscheduler.schedulers.background import BackgroundScheduler
from app.core.database import SessionLocal
from app.services.orchestrator import full_sync_process
from app.services.weather_service import weather_metrics
from app.core.database import UserLocation


scheduler = BackgroundScheduler()


def scheduled_update():
    db = SessionLocal()
    try:
        full_sync_process(db)
        print("[INFO] Scheduled update completed successfully.")
    except Exception as e:
        print(f"[ERROR] Scheduled update failed: {e}")
    finally:
        db.close()


scheduler.add_job(
    scheduled_update,
    "cron",
    hour=23,
    minute=45,
    id="daily_sync_job",
    replace_existing=True
)