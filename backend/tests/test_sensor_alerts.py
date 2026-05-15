import datetime
import pytest
from unittest.mock import MagicMock, patch, call

import sys

for mod in [
    "app", "app.core", "app.core.database", "app.core.config",
    "app.core.schemas", "app.utils", "app.utils.general", "app.events",
]:
    sys.modules.setdefault(mod, MagicMock())

import app.core.config as _cfg
_cfg.SENSOR_OFFLINE_INTERVAL_SAMPLE  = 10
_cfg.SENSOR_OFFLINE_MULTIPLIER       = 10
_cfg.SENSOR_OFFLINE_MIN_DELTA_MINUTES = 1

import app.core.schemas as _schemas
class _EventType:
    SENSOR_OFFLINE = "SENSOR_OFFLINE"

class _StatusType:
    ACTIVE   = "ACTIVE"
    RESOLVED = "RESOLVED"

_schemas.EventType  = _EventType
_schemas.StatusType = _StatusType

import app.utils.general as _general
_general._make_event_hash = lambda *parts: "hash_" + "|".join(str(p) for p in parts)

import app.core.database as _db
_db.SensorsDB      = MagicMock()
_db.WeatherSensors = MagicMock()
_db.Events         = MagicMock()

from app.events import sensor_alerts


def _make_sensor(sensor_id=1, user_id=42, label="S1", activation_status=True):
    s = MagicMock()
    s.id = sensor_id
    s.user_id = user_id
    s.label = label
    s.activation_status = activation_status
    return s


def _ts(minutes_ago: float, base: datetime.datetime | None = None) -> datetime.datetime:
    base = base or datetime.datetime.utcnow()
    return base - datetime.timedelta(minutes=minutes_ago)


def _regular_timestamps(n: int, interval_minutes: float, last_minutes_ago: float = 5):
    base = datetime.datetime.utcnow() - datetime.timedelta(minutes=last_minutes_ago)
    return [base - datetime.timedelta(minutes=interval_minutes * i) for i in range(n)]


# ---------------------------------------------------------------------------
# 1. _compute_median_delta
# ---------------------------------------------------------------------------

class TestComputeMedianDelta:

    def test_returns_none_for_single_timestamp(self):
        result = sensor_alerts._compute_median_delta([datetime.datetime.utcnow()])
        assert result is None

    def test_correct_median_for_uniform_intervals(self):
        # 5 точек с интервалом ровно 10 минут
        ts = _regular_timestamps(5, interval_minutes=10, last_minutes_ago=0)
        delta = sensor_alerts._compute_median_delta(ts)
        assert delta is not None
        assert abs(delta.total_seconds() - 600) < 1   # 600 sec

    def test_median_ignores_duplicate_timestamps(self):
        now = datetime.datetime.utcnow()
        ts = [now, now, now - datetime.timedelta(minutes=10), now - datetime.timedelta(minutes=20)]
        delta = sensor_alerts._compute_median_delta(ts)
        assert delta is not None
        assert abs(delta.total_seconds() - 600) < 1


# ---------------------------------------------------------------------------
# 2. check_sensors_offline
# ---------------------------------------------------------------------------

class TestCheckSensorsOffline:

    def _make_db(self, sensor, timestamps):
        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.side_effect = [
            [sensor],
            timestamps,
        ]
        return db

    def test_sensor_goes_offline(self):
        sensor = _make_sensor(activation_status=True)
        timestamps = _regular_timestamps(5, interval_minutes=10, last_minutes_ago=200)
        db = self._make_db(sensor, timestamps)

        with patch.object(sensor_alerts, "_create_sensor_offline_event") as mock_create:
            stats = sensor_alerts.check_sensors_offline(db)

        assert stats["went_offline"] == 1
        assert stats["already_offline"] == 0
        assert sensor.activation_status is False
        mock_create.assert_called_once()

    def test_sensor_already_offline_not_doubled(self):
        sensor = _make_sensor(activation_status=False)
        timestamps = _regular_timestamps(5, interval_minutes=10, last_minutes_ago=200)
        db = self._make_db(sensor, timestamps)

        with patch.object(sensor_alerts, "_create_sensor_offline_event") as mock_create:
            stats = sensor_alerts.check_sensors_offline(db)

        assert stats["already_offline"] == 1
        assert stats["went_offline"] == 0
        mock_create.assert_not_called()

    def test_online_sensor_not_touched(self):
        sensor = _make_sensor(activation_status=True)
        timestamps = _regular_timestamps(5, interval_minutes=10, last_minutes_ago=5)
        db = self._make_db(sensor, timestamps)

        with patch.object(sensor_alerts, "_create_sensor_offline_event") as mock_create:
            stats = sensor_alerts.check_sensors_offline(db)

        assert stats["went_offline"] == 0
        assert sensor.activation_status is True
        mock_create.assert_not_called()

    def test_sensor_without_data_skipped(self):
        sensor = _make_sensor(activation_status=True)
        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.side_effect = [
            [sensor],
            [],
        ]
        stats = sensor_alerts.check_sensors_offline(db)
        assert stats["checked"] == 1
        assert stats["went_offline"] == 0

    def test_min_delta_floor_applied(self):
        sensor = _make_sensor(activation_status=True)
        now = datetime.datetime.utcnow()
        timestamps = [now - datetime.timedelta(seconds=5 * i) for i in range(5)]
        timestamps[0] = now - datetime.timedelta(minutes=5)

        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.side_effect = [[sensor], timestamps]

        with patch.object(sensor_alerts, "_create_sensor_offline_event") as mock_create:
            stats = sensor_alerts.check_sensors_offline(db)

        mock_create.assert_not_called()
        assert stats["went_offline"] == 0

# ---------------------------------------------------------------------------
# 3. handle_sensor_came_online
# ---------------------------------------------------------------------------

class TestHandleSensorCameOnline:

    def test_restores_status_and_resolves_event(self):
        sensor = _make_sensor(activation_status=False)
        db = MagicMock()
        db.get.return_value = sensor

        with patch.object(sensor_alerts, "_resolve_sensor_offline_event") as mock_resolve:
            sensor_alerts.handle_sensor_came_online(db, sensor.id)

        assert sensor.activation_status is True
        mock_resolve.assert_called_once_with(db, sensor.id)

    def test_online_sensor_not_touched(self):
        sensor = _make_sensor(activation_status=True)
        db = MagicMock()
        db.get.return_value = sensor

        with patch.object(sensor_alerts, "_resolve_sensor_offline_event") as mock_resolve:
            sensor_alerts.handle_sensor_came_online(db, sensor.id)

        assert sensor.activation_status is True
        mock_resolve.assert_not_called()

# ---------------------------------------------------------------------------
# 4. alerts_orchestrator.run_all_alert_checks
# ---------------------------------------------------------------------------

class TestRunAllAlertChecks:

    def test_orchestrator_calls_all_checks(self):
        import app.events.alerts_orchestrator as orch

        mock_check = MagicMock(return_value={"checked": 3, "went_offline": 1})
        orch.ALERT_CHECKS = [("test_check", mock_check)]

        db_mock = MagicMock()
        with patch("app.events.alerts_orchestrator.get_db") as mock_get_db:
            gen = iter([db_mock])
            mock_get_db.return_value = gen
            results = orch.run_all_alert_checks()

        mock_check.assert_called_once_with(db_mock)
        assert results["test_check"]["status"] == "ok"

    def test_orchestrator_isolates_check_failures(self):
        import app.events.alerts_orchestrator as orch

        ok_check   = MagicMock(return_value={"checked": 1})
        bad_check  = MagicMock(side_effect=RuntimeError("boom"))

        orch.ALERT_CHECKS = [("bad", bad_check), ("ok", ok_check)]

        def _fake_get_db():
            yield MagicMock()

        with patch("app.events.alerts_orchestrator.get_db", side_effect=_fake_get_db):
            results = orch.run_all_alert_checks()

        assert results["bad"]["status"] == "error"
        assert results["ok"]["status"] == "ok"