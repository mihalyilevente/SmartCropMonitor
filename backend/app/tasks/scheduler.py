from apscheduler.schedulers.background import BackgroundScheduler
from app.core.database import SessionLocal
from app.services.orchestrator import full_sync_process,short_sync_process
import logging

scheduler = BackgroundScheduler()
logger = logging.getLogger(__name__)


def scheduled_update_full():
    db = SessionLocal()
    try:
        full_sync_process(db)
        logger.info("Full sync completed successfully.")
    except Exception as e:
        logger.error(f"Full sync failed: {e}")
    finally:
        db.close()

def scheduled_update_short():
    db = SessionLocal()
    try:
        short_sync_process(db)
        logger.info("Short sync completed successfully.")
    except Exception as e:
        logger.error(f"Short sync failed: {e}")
    finally:
        db.close()


scheduler.add_job(
    scheduled_update_full,
    "cron",
    hour=23,
    minute=45,
    id="daily_sync_job",
    replace_existing=True
)


scheduler.add_job(
    scheduled_update_short,
    "cron",
    hour="*",
    minute=15,
    id="hourly_sync_job",
    replace_existing=True
)