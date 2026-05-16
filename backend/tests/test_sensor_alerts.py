import datetime
import importlib.util
import sys
import types
import enum
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SENSOR_ALERTS_PATH      = BACKEND_ROOT / "app" / "events" / "sensor_alerts.py"
ALERTS_ORCHESTRATOR_PATH = BACKEND_ROOT / "app" / "events" / "alerts_orchestrator.py"

for _p in (SENSOR_ALERTS_PATH, ALERTS_ORCHESTRATOR_PATH):
    if not _p.exists():
        pytest.skip(f"{_p.name} not found", allow_module_level=True)


# ---------------------------------------------------------------------------
# Inline enums — mirrors app.core.schemas without importing it
# ---------------------------------------------------------------------------

class EventType(str, enum.Enum):
    SENSOR_OFFLINE = "SENSOR_OFFLINE"


class StatusType(str, enum.Enum):
    ACTIVE   = "ACTIVE"
    RESOLVED = "RESOLVED"


# ---------------------------------------------------------------------------
# Fake-module helpers (same pattern as test_anomaly_processor.py)
# ---------------------------------------------------------------------------

def _make_package(name: str) -> types.ModuleType:
    mod = types.ModuleType(name)
    mod.__path__ = []
    return mod


def _make_module(name: str) -> types.ModuleType:
    return types.ModuleType(name)


def _build_fake_sqlalchemy() -> dict:
    sa = _make_package("sqlalchemy")
    sa.select = MagicMock(return_value=MagicMock())

    sa_orm = _make_package("sqlalchemy.orm")
    sa_orm.Session = MagicMock

    sa_ext     = _make_package("sqlalchemy.ext")
    sa_ext_dec = _make_package("sqlalchemy.ext.declarative")

    return {
        "sqlalchemy":                    sa,
        "sqlalchemy.orm":                sa_orm,
        "sqlalchemy.ext":                sa_ext,
        "sqlalchemy.ext.declarative":    sa_ext_dec,
    }


def _build_fake_app(config_overrides: dict | None = None) -> dict:
    """Return fake app.* modules with all dependencies sensor_alerts needs."""

    db_mod = _make_module("app.core.database")
    db_mod.SensorsDB      = MagicMock()
    db_mod.WeatherSensors = MagicMock()
    db_mod.Events         = MagicMock()
    db_mod.get_db         = MagicMock()

    schemas_mod = _make_module("app.core.schemas")
    schemas_mod.EventType  = EventType
    schemas_mod.StatusType = StatusType

    cfg = {
        "SENSOR_OFFLINE_INTERVAL_SAMPLE":   10,
        "SENSOR_OFFLINE_MULTIPLIER":        3,
        "SENSOR_OFFLINE_MIN_DELTA_MINUTES": 15,
    }
    if config_overrides:
        cfg.update(config_overrides)
    config_mod = _make_module("app.core.config")
    for k, v in cfg.items():
        setattr(config_mod, k, v)

    utils_general = _make_module("app.utils.general")
    utils_general._make_event_hash = lambda *p: "hash_" + "_".join(str(x) for x in p)

    return {
        "app":               _make_package("app"),
        "app.core":          _make_package("app.core"),
        "app.utils":         _make_package("app.utils"),
        "app.events":        _make_package("app.events"),
        "app.core.database": db_mod,
        "app.core.schemas":  schemas_mod,
        "app.core.config":   config_mod,
        "app.utils.general": utils_general,
        **_build_fake_sqlalchemy(),
    }


def _load_sensor_alerts(fake_modules: dict):
    spec   = importlib.util.spec_from_file_location("sensor_alerts_under_test", SENSOR_ALERTS_PATH)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, fake_modules):
        spec.loader.exec_module(module)
    return module


def _load_alerts_orchestrator(fake_modules: dict, sensor_alerts_module):
    """Load orchestrator; inject already-loaded sensor_alerts so it doesn't re-import."""
    extended = dict(fake_modules)
    extended["app.events.sensor_alerts"] = sensor_alerts_module

    spec   = importlib.util.spec_from_file_location("alerts_orchestrator_under_test", ALERTS_ORCHESTRATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, extended):
        spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# Module-level load
# ---------------------------------------------------------------------------

_fake = _build_fake_app()
sa    = _load_sensor_alerts(_fake)
orch  = _load_alerts_orchestrator(_fake, sa)

_compute_median_delta    = sa._compute_median_delta
check_sensors_offline    = sa.check_sensors_offline
handle_sensor_came_online = sa.handle_sensor_came_online
run_all_alert_checks     = orch.run_all_alert_checks


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

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
        assert abs(delta.total_seconds() - 600) < 1  # 10 min = 600 s

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

        # Patch inside the loaded module's own namespace
        with patch.object(sa, "select", mock_select):
            if patch_create:
                with patch.object(sa, "_create_sensor_offline_event") as mock_create:
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

        with patch.object(sa, "_resolve_sensor_offline_event") as mock_resolve:
            handle_sensor_came_online(db, sensor.id)

        assert sensor.activation_status is True
        mock_resolve.assert_called_once_with(db, sensor.id)

    def test_online_sensor_not_modified(self):
        sensor = _make_sensor(activation_status=True)
        db = MagicMock()
        db.get.return_value = sensor

        with patch.object(sa, "_resolve_sensor_offline_event") as mock_resolve:
            handle_sensor_came_online(db, sensor.id)

        assert sensor.activation_status is True
        mock_resolve.assert_not_called()


# ---------------------------------------------------------------------------
# 4. alerts_orchestrator.run_all_alert_checks
# ---------------------------------------------------------------------------

class TestRunAllAlertChecks:

    def test_registered_check_is_called(self):
        db_mock    = MagicMock()
        mock_check = MagicMock(return_value={"checked": 3, "went_offline": 1})

        orch.ALERT_CHECKS = [("test_check", mock_check)]
        orch.get_db = lambda: iter([db_mock])

        results = run_all_alert_checks()

        mock_check.assert_called_once_with(db_mock)
        assert results["test_check"]["status"] == "ok"
        assert results["test_check"]["result"]["went_offline"] == 1

    def test_failing_check_does_not_block_others(self):
        db_mock   = MagicMock()
        bad_check = MagicMock(side_effect=RuntimeError("boom"))
        ok_check  = MagicMock(return_value={"checked": 2})

        orch.ALERT_CHECKS = [("bad", bad_check), ("ok", ok_check)]
        orch.get_db = lambda: iter([db_mock])

        results = run_all_alert_checks()

        assert results["bad"]["status"] == "error"
        assert "boom" in results["bad"]["error"]
        assert results["ok"]["status"] == "ok"