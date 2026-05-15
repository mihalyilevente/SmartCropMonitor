import datetime
import pytest
from unittest.mock import MagicMock, patch, call

from app.events.sensor_alerts import (
    _compute_median_delta,
    check_sensors_offline,
    handle_sensor_came_online,
)
from app.events.alerts_orchestrator import run_all_alert_checks
import app.events.alerts_orchestrator as orchestrator
from app.core.schemas import EventType, StatusType


def _make_sensor(sensor_id=1, user_id=42, label="S1", activation_status=True):
    s = MagicMock()
    s.id = sensor_id
    s.user_id = user_id
    s.label = label
    s.activation_status = activation_status
    return s


def _regular_timestamps(n: int, interval_minutes: float, last_minutes_ago: float):
    base = datetime.datetime.utcnow() - datetime.timedelta(minutes=last_minutes_ago)
    return [base - datetime.timedelta(minutes=interval_minutes * i) for i in range(n)]


def _make_db(sensors, timestamps_per_sensor):
    db = MagicMock()
    db.execute.return_value.scalars.return_value.all.side_effect = (
        [sensors] + timestamps_per_sensor
    )
    return db


# ---------------------------------------------------------------------------
# 1. _compute_median_delta
# ---------------------------------------------------------------------------

class TestComputeMedianDelta:

    def test_single_timestamp_returns_none(self):
        assert _compute_median_delta([datetime.datetime.utcnow()]) is None

    def test_uniform_intervals_correct_median(self):
        ts = _regular_timestamps(5, interval_minutes=10, last_minutes_ago=0)
        delta = _compute_median_delta(ts)
        assert delta is not None
        assert abs(delta.total_seconds() - 600) < 1  # 10 мин = 600 с

    def test_duplicate_timestamps_filtered(self):
        now = datetime.datetime.utcnow()
        ts = [now, now,
              now - datetime.timedelta(minutes=10),
              now - datetime.timedelta(minutes=20)]
        delta = _compute_median_delta(ts)
        assert delta is not None
        assert abs(delta.total_seconds() - 600) < 1


# ---------------------------------------------------------------------------
# 2. check_sensors_offline
# ---------------------------------------------------------------------------

class TestCheckSensorsOffline:

    def _run(self, sensor, timestamps, *, patch_create=True):
        db = _make_db([sensor], [timestamps])
        mock_select = MagicMock(return_value=MagicMock())

        patches = [
            patch("app.events.sensor_alerts.select", mock_select),
        ]
        if patch_create:
            patches.append(
                patch("app.events.sensor_alerts._create_sensor_offline_event")
            )

        with patches[0]:
            if patch_create:
                with patches[1] as mock_create:
                    stats = check_sensors_offline(db)
                return stats, mock_create
            else:
                stats = check_sensors_offline(db)
                return stats, None

    def test_active_sensor_goes_offline(self):
        sensor = _make_sensor(activation_status=True)
        ts = _regular_timestamps(5, interval_minutes=10, last_minutes_ago=200)
        stats, mock_create = self._run(sensor, ts)

        assert stats["went_offline"] == 1
        assert stats["already_offline"] == 0
        assert sensor.activation_status is False
        mock_create.assert_called_once()

    def test_already_offline_no_duplicate_alert(self):
        sensor = _make_sensor(activation_status=False)
        ts = _regular_timestamps(5, interval_minutes=10, last_minutes_ago=200)
        stats, mock_create = self._run(sensor, ts)

        assert stats["already_offline"] == 1
        assert stats["went_offline"] == 0
        mock_create.assert_not_called()

    def test_online_sensor_not_touched(self):
        sensor = _make_sensor(activation_status=True)
        ts = _regular_timestamps(5, interval_minutes=10, last_minutes_ago=5)
        stats, mock_create = self._run(sensor, ts)

        assert stats["went_offline"] == 0
        assert sensor.activation_status is True
        mock_create.assert_not_called()

    def test_sensor_without_data_skipped(self):
        sensor = _make_sensor(activation_status=True)
        stats, mock_create = self._run(sensor, [])

        assert stats["checked"] == 1
        assert stats["went_offline"] == 0
        mock_create.assert_not_called()

    def test_min_delta_floor_prevents_false_offline(self):
        sensor = _make_sensor(activation_status=True)
        now = datetime.datetime.utcnow()
        ts = [now - datetime.timedelta(minutes=5)] + [
            now - datetime.timedelta(minutes=5, seconds=5 * i) for i in range(1, 5)
        ]
        stats, mock_create = self._run(sensor, ts)

        assert stats["went_offline"] == 0
        mock_create.assert_not_called()


# ---------------------------------------------------------------------------
# 3. handle_sensor_came_online
# ---------------------------------------------------------------------------

class TestHandleSensorCameOnline:

    def test_offline_sensor_restored_and_event_resolved(self):
        sensor = _make_sensor(activation_status=False)
        db = MagicMock()
        db.get.return_value = sensor

        with patch("app.events.sensor_alerts._resolve_sensor_offline_event") as mock_resolve:
            handle_sensor_came_online(db, sensor.id)

        assert sensor.activation_status is True
        mock_resolve.assert_called_once_with(db, sensor.id)

    def test_online_sensor_not_modified(self):
        sensor = _make_sensor(activation_status=True)
        db = MagicMock()
        db.get.return_value = sensor

        with patch("app.events.sensor_alerts._resolve_sensor_offline_event") as mock_resolve:
            handle_sensor_came_online(db, sensor.id)

        assert sensor.activation_status is True
        mock_resolve.assert_not_called()


# ---------------------------------------------------------------------------
# 4. alerts_orchestrator.run_all_alert_checks
# ---------------------------------------------------------------------------

class TestRunAllAlertChecks:

    def test_registered_check_is_called(self, monkeypatch):
        db_mock = MagicMock()
        mock_check = MagicMock(return_value={"checked": 3, "went_offline": 1})

        monkeypatch.setattr(orchestrator, "ALERT_CHECKS", [("test_check", mock_check)])
        monkeypatch.setattr(orchestrator, "get_db", lambda: iter([db_mock]))

        results = run_all_alert_checks()

        mock_check.assert_called_once_with(db_mock)
        assert results["test_check"]["status"] == "ok"
        assert results["test_check"]["result"]["went_offline"] == 1

    def test_failing_check_does_not_block_others(self, monkeypatch):
        db_mock = MagicMock()
        bad_check = MagicMock(side_effect=RuntimeError("boom"))
        ok_check  = MagicMock(return_value={"checked": 2})

        monkeypatch.setattr(orchestrator, "ALERT_CHECKS", [
            ("bad", bad_check),
            ("ok",  ok_check),
        ])
        monkeypatch.setattr(orchestrator, "get_db", lambda: iter([db_mock]))

        results = run_all_alert_checks()

        assert results["bad"]["status"] == "error"
        assert "boom" in results["bad"]["error"]
        assert results["ok"]["status"] == "ok"