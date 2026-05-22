from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.executors.pool import ThreadPoolExecutor
from app.core.database import SessionLocal
from app.services.orchestrator import full_sync_process, short_sync_process
from app.events.morning_briefing_email import run_morning_briefing
import logging

executors = {
    'default': ThreadPoolExecutor(2)
}

scheduler = BackgroundScheduler(executors=executors, timezone="UTC")
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
    replace_existing=True,
)

scheduler.add_job(
    scheduled_update_short,
    "cron",
    hour="0,4,8,12,16,20",
    minute=15,
    id="hourly_sync_job",
    replace_existing=True,
)

scheduler.add_job(
    run_morning_briefing,
    "cron",
    hour=7,
    minute=0,
    id="morning_briefing",
    replace_existing=True,
    misfire_grace_time=3600,
)