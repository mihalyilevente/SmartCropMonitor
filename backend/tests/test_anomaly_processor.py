import datetime
import enum
import importlib.util
import sys
import types
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest


ANOMALY_PROCESSOR_PATH = (
    Path(__file__).resolve().parents[1] / "app" / "services" / "anomaly_processor.py"
)

if not ANOMALY_PROCESSOR_PATH.exists():
    pytest.skip(
        "anomaly_processor.py is not present in this branch",
        allow_module_level=True,
    )

from sqlalchemy import true as sa_true


class AnomalyType(str, enum.Enum):
    OUT_OF_BOUNDS = "out_of_bounds"
    SUDDEN_CHANGE = "sudden_change"
    DATA_DRIFT = "data_drift"
    UNKNOWN = "unknown"


class StatusType(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


class EventType(str, enum.Enum):
    NDVI_DROP = "NDVI_DROP"
    EVI_ANOMALY = "EVI_ANOMALY"
    METRIC_ANOMALY = "METRIC_ANOMALY"


class SACol:
    def __ge__(self, other):
        return sa_true()

    def __le__(self, other):
        return sa_true()

    def __eq__(self, other):
        return sa_true()

    def __ne__(self, other):
        return sa_true()

    def __gt__(self, other):
        return sa_true()

    def __lt__(self, other):
        return sa_true()

    def isnot(self, other):
        return sa_true()

    def is_(self, other):
        return sa_true()

    def in_(self, other):
        return sa_true()

    def __bool__(self):
        return True

    def __hash__(self):
        return id(self)


class SAModel:
    def __getattr__(self, name):
        return SACol()


FieldStatAnomalyStub = MagicMock()


def _make_package(name):
    mod = types.ModuleType(name)
    mod.__path__ = []
    return mod


def _make_module(name):
    return types.ModuleType(name)


def _load_anomaly_processor():
    utils_general = _make_module("app.utils.general")
    utils_general._safe_float = lambda v: float(v) if v is not None else None
    utils_general._make_event_hash = lambda *p: "hash_" + "_".join(str(x) for x in p)
    utils_general._make_dedup_key = lambda *p: "dedup_" + "_".join(str(x) for x in p)

    db_mod = _make_module("app.core.database")
    db_mod.FieldData = SAModel()
    db_mod.FieldStatAnomalyAnalysis = FieldStatAnomalyStub
    db_mod.FieldUnit = SAModel()
    db_mod.Events = MagicMock()
    db_mod.UserLocation = SAModel()

    schemas_mod = _make_module("app.core.schemas")
    schemas_mod.AnomalyType = AnomalyType
    schemas_mod.StatusType = StatusType
    schemas_mod.EventType = EventType

    config_mod = _make_module("app.core.config")
    config_mod.Z_SCORE_THRESHOLD = 2.5
    config_mod.DELTA_SCORE_THRESHOLD = 2.5
    config_mod.DRIFT_SLOPE_THRESHOLD = 0.05
    config_mod.DRIFT_P_VALUE_THRESHOLD = 0.05
    config_mod.MIN_POINTS_FOR_ANALYSIS = 5
    config_mod.CONFIDENCE_SCALE = 0.95

    fake_modules = {
        "app": _make_package("app"),
        "app.core": _make_package("app.core"),
        "app.utils": _make_package("app.utils"),
        "app.services": _make_package("app.services"),
        "app.core.config": config_mod,
        "app.core.database": db_mod,
        "app.core.schemas": schemas_mod,
        "app.utils.general": utils_general,
    }

    spec = importlib.util.spec_from_file_location(
        "anomaly_processor_under_test",
        ANOMALY_PROCESSOR_PATH,
    )
    module = importlib.util.module_from_spec(spec)

    with patch.dict(sys.modules, fake_modules):
        spec.loader.exec_module(module)

    return module


ap = _load_anomaly_processor() if ANOMALY_PROCESSOR_PATH.exists() else None

if ap:
    _detect_out_of_bounds = ap._detect_out_of_bounds
    _detect_sudden_change = ap._detect_sudden_change
    _detect_drift = ap._detect_drift
    _confidence_from_z = ap._confidence_from_z
    _event_type_for_anomaly = ap._event_type_for_anomaly
    find_stat_anomaly = ap.find_stat_anomaly
    find_all_anomaly = ap.find_all_anomaly


def _ts(offset: int = 0) -> datetime.datetime:
    return datetime.datetime(2024, 6, 1) + datetime.timedelta(days=offset)


def _timestamps(n: int):
    return [_ts(i) for i in range(n)]


def _make_row(field_id, metric_type, mean_val, ts, row_id):
    row = MagicMock()
    row.id = row_id
    row.field_id = field_id
    row.metric_type = metric_type
    row.mean_metric = Decimal(str(mean_val))
    row.timestamp = ts
    return row


def _make_db_for_find(field, rows, loc=None):
    db = MagicMock()

    fq = MagicMock()
    fq.filter.return_value.first.return_value = field

    dq = MagicMock()
    dq.filter.return_value.order_by.return_value.all.return_value = rows

    lq = MagicMock()
    lq.filter.return_value.first.return_value = loc

    db.query.side_effect = [fq, dq, lq, MagicMock(), MagicMock()]
    return db


class TestDetectOutOfBounds(unittest.TestCase):
    def test_uniform_no_anomaly(self):
        values = np.array([0.5] * 10, dtype=float)
        self.assertEqual(_detect_out_of_bounds(values, _timestamps(10)), [])

    def test_detects_positive_spike(self):
        values = np.array([0.5] * 9 + [10.0], dtype=float)
        result = _detect_out_of_bounds(values, _timestamps(10))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["idx"], 9)
        self.assertGreater(abs(result[0]["z_score"]), 2.5)

    def test_detects_negative_spike(self):
        values = np.array([0.5] * 9 + [-10.0], dtype=float)
        result = _detect_out_of_bounds(values, _timestamps(10))
        self.assertEqual(len(result), 1)
        self.assertLess(result[0]["z_score"], -2.5)

    def test_too_few_points(self):
        values = np.array([1.0, 2.0, 3.0], dtype=float)
        self.assertEqual(_detect_out_of_bounds(values, _timestamps(3)), [])

    def test_zero_variance(self):
        values = np.array([1.0] * 10, dtype=float)
        self.assertEqual(_detect_out_of_bounds(values, _timestamps(10)), [])

    def test_custom_threshold_wider_catches_more(self):
        values = np.array([0.0] * 5 + [2.0], dtype=float)
        strict = _detect_out_of_bounds(values, _timestamps(6), threshold=3.0)
        loose = _detect_out_of_bounds(values, _timestamps(6), threshold=1.0)
        self.assertLessEqual(len(strict), len(loose))

    def test_result_has_required_keys(self):
        values = np.array([0.5] * 9 + [10.0], dtype=float)
        result = _detect_out_of_bounds(values, _timestamps(10))
        for key in ("idx", "timestamp", "value", "z_score", "mu", "sigma"):
            self.assertIn(key, result[0])


class TestDetectSuddenChange(unittest.TestCase):
    def test_smooth_series_no_anomaly(self):
        values = np.linspace(0.3, 0.6, 10)
        self.assertEqual(_detect_sudden_change(values, _timestamps(10)), [])

    def test_detects_single_jump(self):
        values = np.array(
            [0.5, 0.51, 0.49, 0.50, 0.51, 0.52, 0.50, 0.51, 0.49, 5.0],
            dtype=float,
        )
        result = _detect_sudden_change(values, _timestamps(10))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["idx"], 9)

    def test_result_has_prev_value_key(self):
        values = np.array(
            [0.5, 0.51, 0.49, 0.50, 0.51, 0.52, 0.50, 0.51, 0.49, 5.0],
            dtype=float,
        )
        result = _detect_sudden_change(values, _timestamps(10))
        self.assertIn("prev_value", result[0])
        self.assertAlmostEqual(result[0]["prev_value"], 0.49, places=2)

    def test_too_few_points(self):
        values = np.array([1.0, 5.0, 1.0], dtype=float)
        self.assertEqual(_detect_sudden_change(values, _timestamps(3)), [])

    def test_constant_delta_no_anomaly(self):
        values = np.arange(1.0, 8.0, dtype=float)
        self.assertEqual(_detect_sudden_change(values, _timestamps(7)), [])

    def test_symmetric_spike_and_drop_below_threshold(self):
        values = np.array([0.4] * 4 + [9.0] + [0.4] * 5, dtype=float)
        result = _detect_sudden_change(values, _timestamps(10))
        self.assertEqual(
            result,
            [],
            "Symmetrical spike+drop does not exceed the 2.5 sigma threshold",
        )


class TestDetectDrift(unittest.TestCase):
    def test_strong_downward_trend(self):
        values = np.linspace(0.8, 0.2, 20)
        result = _detect_drift(values, _timestamps(20))
        self.assertIsNotNone(result)
        self.assertEqual(result["direction"], "down")
        self.assertLess(result["p_value"], 0.05)

    def test_strong_upward_trend(self):
        values = np.linspace(0.2, 0.9, 20)
        result = _detect_drift(values, _timestamps(20))
        self.assertIsNotNone(result)
        self.assertEqual(result["direction"], "up")

    def test_too_few_points(self):
        values = np.linspace(0.8, 0.2, 3)
        self.assertIsNone(_detect_drift(values, _timestamps(3)))

    def test_flat_series_no_drift(self):
        values = np.array([0.5] * 20, dtype=float)
        self.assertIsNone(_detect_drift(values, _timestamps(20)))

    def test_result_has_required_keys(self):
        values = np.linspace(0.8, 0.1, 20)
        result = _detect_drift(values, _timestamps(20))
        self.assertIsNotNone(result)
        for key in (
            "slope",
            "intercept",
            "r_squared",
            "p_value",
            "norm_slope",
            "direction",
            "period_start",
            "period_end",
            "n_points",
        ):
            self.assertIn(key, result)


class TestConfidenceFromZ(unittest.TestCase):
    def test_high_z_high_confidence(self):
        self.assertGreater(_confidence_from_z(4.0), 0.99)

    def test_low_z_low_confidence(self):
        self.assertLess(_confidence_from_z(1.0), 0.70)

    def test_symmetric(self):
        self.assertAlmostEqual(_confidence_from_z(2.0), _confidence_from_z(-2.0), places=6)

    def test_capped_below_one(self):
        self.assertLessEqual(_confidence_from_z(100.0), 1.0)


class TestEventTypeForAnomaly(unittest.TestCase):
    def test_ndvi_oob_is_ndvi_drop(self):
        self.assertEqual(
            _event_type_for_anomaly("ndvi", AnomalyType.OUT_OF_BOUNDS),
            EventType.NDVI_DROP,
        )

    def test_ndvi_sudden_change_is_ndvi_drop(self):
        self.assertEqual(
            _event_type_for_anomaly("ndvi", AnomalyType.SUDDEN_CHANGE),
            EventType.NDVI_DROP,
        )

    def test_ndvi_drift_is_metric_anomaly(self):
        self.assertEqual(
            _event_type_for_anomaly("ndvi", AnomalyType.DATA_DRIFT),
            EventType.METRIC_ANOMALY,
        )

    def test_evi_is_evi_anomaly(self):
        self.assertEqual(
            _event_type_for_anomaly("evi", AnomalyType.OUT_OF_BOUNDS),
            EventType.EVI_ANOMALY,
        )

    def test_gndvi_matches_ndvi_substring(self):
        self.assertEqual(
            _event_type_for_anomaly("gndvi", AnomalyType.OUT_OF_BOUNDS),
            EventType.NDVI_DROP,
        )

    def test_nmdi_is_metric_anomaly(self):
        self.assertEqual(
            _event_type_for_anomaly("nmdi", AnomalyType.OUT_OF_BOUNDS),
            EventType.METRIC_ANOMALY,
        )


class TestFindStatAnomaly(unittest.TestCase):
    def test_missing_field_returns_empty(self):
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value.first.return_value = None
        db.query.return_value = q

        result = find_stat_anomaly(db, field_id=999)
        self.assertEqual(result, {})

    def test_no_data_returns_empty(self):
        field = MagicMock()
        field.id = 1
        field.location_id = 1
        db = _make_db_for_find(field, rows=[])

        result = find_stat_anomaly(db, field_id=1)
        self.assertEqual(result, {})

    def test_rollback_on_exception(self):
        field = MagicMock()
        field.id = 1
        field.location_id = 1
        rows = [_make_row(1, "ndvi", 0.5, _ts(i), i) for i in range(3)]
        db = _make_db_for_find(field, rows)
        db.flush.side_effect = RuntimeError("flush error")

        with self.assertRaises(RuntimeError):
            find_stat_anomaly(db, field_id=1, generate_events=False)

        db.rollback.assert_called_once()

    def test_oob_detected_end_to_end(self):
        field_id = 1
        loc_id = 10
        user_id = 42

        raw = [0.5] * 9 + [10.0]
        rows = [_make_row(field_id, "ndvi", v, _ts(i), i + 1) for i, v in enumerate(raw)]

        field = MagicMock()
        field.id = field_id
        field.location_id = loc_id
        loc = MagicMock()
        loc.user_id = user_id
        db = _make_db_for_find(field, rows, loc)

        def make_anomaly_rec(**kw):
            obj = MagicMock()
            obj.confidence_score = kw.get("confidence_score", 0.99)
            return obj

        FieldStatAnomalyStub.side_effect = make_anomaly_rec

        result = find_stat_anomaly(db, field_id=field_id, generate_events=False)

        self.assertIn(AnomalyType.OUT_OF_BOUNDS.value, result)
        self.assertGreater(result[AnomalyType.OUT_OF_BOUNDS.value], 0)
        db.commit.assert_called_once()

    def test_commit_called_when_no_anomalies(self):
        field = MagicMock()
        field.id = 1
        field.location_id = 1
        rows = [_make_row(1, "ndvi", 0.5, _ts(i), i) for i in range(3)]
        db = _make_db_for_find(field, rows)

        find_stat_anomaly(db, field_id=1, generate_events=False)
        db.commit.assert_called_once()


class TestFindAllAnomaly(unittest.TestCase):
    def _db_with_fields(self, fields):
        db = MagicMock()
        fq = MagicMock()
        fq.filter.return_value.all.return_value = fields
        db.query.return_value = fq
        return db

    def test_no_fields_returns_empty(self):
        self.assertEqual(find_all_anomaly(self._db_with_fields([])), {})

    def test_skips_errored_field_continues(self):
        f1 = MagicMock()
        f1.id = 1
        f2 = MagicMock()
        f2.id = 2

        db = self._db_with_fields([f1, f2])

        with patch.object(ap, "find_stat_anomaly", side_effect=[RuntimeError("boom"), {}]):
            result = find_all_anomaly(db)

        self.assertEqual(result, {})

    def test_aggregates_results(self):
        f1 = MagicMock()
        f1.id = 1
        f2 = MagicMock()
        f2.id = 2

        db = self._db_with_fields([f1, f2])

        with patch.object(
            ap,
            "find_stat_anomaly",
            side_effect=[
                {"out_of_bounds": 2},
                {"sudden_change": 1},
            ],
        ):
            result = find_all_anomaly(db)

        self.assertEqual(result[1], {"out_of_bounds": 2})
        self.assertEqual(result[2], {"sudden_change": 1})

    def test_location_id_filter_applied(self):
        db = MagicMock()
        fq = MagicMock()
        fq.filter.return_value.all.return_value = []
        db.query.return_value = fq

        find_all_anomaly(db, location_id=5)
        fq.filter.assert_called()