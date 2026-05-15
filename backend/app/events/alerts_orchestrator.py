import logging
import datetime
from typing import Callable

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.events.sensor_alerts import check_sensors_offline

logger = logging.getLogger(__name__)


ALERT_CHECKS: list[tuple[str, Callable[[Session], dict | None]]] = [
    ("sensor_offline_check", check_sensors_offline),
    # ("frost_hazard_check", check_frost_hazard),
    # ("drought_warning_check", check_drought_warning),
]


def run_all_alert_checks() -> None:
    started_at = datetime.datetime.utcnow()
    logger.info("=== Alert orchestrator started at %s ===", started_at.isoformat())

    results = {}

    for check_name, check_fn in ALERT_CHECKS:
        db_gen = get_db()
        db: Session = next(db_gen)
        try:
            logger.info("Running check: %s", check_name)
            result = check_fn(db)
            results[check_name] = {"status": "ok", "result": result}
        except Exception as exc:
            logger.exception("Check '%s' failed: %s", check_name, exc)
            results[check_name] = {"status": "error", "error": str(exc)}
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass

    finished_at = datetime.datetime.utcnow()
    elapsed = (finished_at - started_at).total_seconds()
    logger.info(
        "=== Alert orchestrator finished in %.2fs. Results: %s ===",
        elapsed, results
    )
    return results