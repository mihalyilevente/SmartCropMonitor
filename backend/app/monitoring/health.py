from datetime import datetime, timedelta
from app.monitoring.alerting import AlertService, format_alert


def check_staleness(status, alert: AlertService):
    now = datetime.utcnow()

    if status.last_success_at < now - timedelta(hours=6):
        alert.send(
            key="etl_stale",
            message=format_alert(
                "ETL_STALE",
                "No successful run for 6h"
            )
        )

    if status.last_scene_at < now - timedelta(days=2):
        alert.send(
            key="no_new_scenes",
            message=format_alert(
                "NO_NEW_SCENES",
                "No new Sentinel-2 scenes for 48h"
            )
        )
