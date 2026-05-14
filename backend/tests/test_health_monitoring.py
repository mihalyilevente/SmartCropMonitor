from datetime import datetime, timedelta
from types import SimpleNamespace

from app.monitoring.health import check_staleness


class RecordingAlert:
    def __init__(self):
        self.sent = []

    def send(self, key, message):
        self.sent.append({"key": key, "message": message})


def test_check_staleness_alerts_when_etl_and_scene_data_are_old():
    now = datetime.utcnow()
    status = SimpleNamespace(
        last_success_at=now - timedelta(hours=7),
        last_scene_at=now - timedelta(days=3),
    )
    alert = RecordingAlert()

    check_staleness(status, alert)

    assert [item["key"] for item in alert.sent] == ["etl_stale", "no_new_scenes"]
    assert "No successful run for 6h" in alert.sent[0]["message"]
    assert "No new Sentinel-2 scenes for 48h" in alert.sent[1]["message"]


def test_check_staleness_does_not_alert_for_fresh_status():
    now = datetime.utcnow()
    status = SimpleNamespace(
        last_success_at=now - timedelta(hours=1),
        last_scene_at=now - timedelta(hours=4),
    )
    alert = RecordingAlert()

    check_staleness(status, alert)

    assert alert.sent == []
