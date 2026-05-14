from app.monitoring import alerting
from app.monitoring.alerting import AlertService, format_alert


def test_format_alert_includes_type_message_and_context():
    message = format_alert(
        "ETL_STALE",
        "No successful run for 6h",
        {"location_id": 12, "source": "scheduler"},
    )

    assert "[ALERT][ETL]" in message
    assert "Type: ETL_STALE" in message
    assert "Message:\nNo successful run for 6h" in message
    assert "- location_id: 12" in message
    assert "- source: scheduler" in message


def test_alert_service_cooldown_blocks_duplicate_keys(monkeypatch):
    timestamps = iter([1000.0, 1020.0, 1400.0])
    monkeypatch.setattr(alerting.time, "time", lambda: next(timestamps))
    service = AlertService("https://example.invalid/webhook", cooldown_seconds=300)

    assert service._should_send("etl_stale") is True
    assert service._should_send("etl_stale") is False
    assert service._should_send("etl_stale") is True


def test_alert_service_send_posts_payload_when_cooldown_allows(monkeypatch):
    posted = []

    class Response:
        def raise_for_status(self):
            return None

    def fake_post(url, json, timeout):
        posted.append({"url": url, "json": json, "timeout": timeout})
        return Response()

    monkeypatch.setattr(alerting.requests, "post", fake_post)
    service = AlertService("https://example.invalid/webhook", cooldown_seconds=300)

    service.send("etl_stale", "wake up")

    assert posted == [
        {
            "url": "https://example.invalid/webhook",
            "json": {"text": "wake up"},
            "timeout": 5,
        }
    ]
