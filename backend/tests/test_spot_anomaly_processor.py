# backend/tests/test_spot_anomaly_processor.py
#
# Запуск:
#   pytest tests/test_spot_anomaly_processor.py -v
#   pytest tests/test_spot_anomaly_processor.py -v -k "test_no_anomaly"
#
# Зависимости (уже в requirements.txt):
#   pytest, pytest-mock, sqlalchemy

import datetime
from collections import defaultdict
from unittest.mock import MagicMock, patch

import pytest

from app.services.spot_anomaly_processor import (
    _call_haskell_snapshot,
    _build_haskell_payload,
    _event_type_for_metric,
    find_satellite_anomaly,
    DEFAULT_AREA_THRESHOLD_RATIO,
    SMALL_FIELD_HA,
    SMALL_FIELD_RATIO,
)
from app.core.schemas import AnomalyType, StatusType, EventType


# ================================
# Фикстуры
# ================================

def _make_field_data(
    field_id: int,
    metric_type: str,
    mean_val: float,
    timestamp: datetime.datetime,
    source_file: str = None,
    row_id: int = 1,
):
    """Создаёт мок FieldData-записи."""
    row = MagicMock()
    row.id            = row_id
    row.field_id      = field_id
    row.metric_type   = metric_type
    row.mean_metric   = mean_val
    row.timestamp     = timestamp
    row.extra         = {"source_file": source_file} if source_file else {}
    return row


def _make_field(field_id: int = 1, location_id: int = 10, area_ha: float = 20.0):
    field = MagicMock()
    field.id          = field_id
    field.location_id = location_id
    field.status      = "active"
    field.geometry    = MagicMock()   # заглушка WKB
    return field


T0 = datetime.datetime(2025, 4, 1, 12, 0, 0)
T1 = datetime.datetime(2025, 5, 1, 12, 0, 0)

# Haskell-ответ: аномалия по ndvi
HASKELL_ANOMALY_RESPONSE = {
    "metrics": [
        {
            "metric_name":         "ndvi",
            "prev_mean":           0.70,
            "last_mean":           0.52,
            "abs_delta":          -0.18,
            "rel_change":         -0.257,
            "is_anomaly":          True,
            "anomaly_kind":        "drop",
            "confidence":          0.85,
            "anomaly_pixel_count": 90,
            "total_pixel_count":   100,
            "anomaly_ratio":       0.90,
        },
        {
            "metric_name":         "gndvi",
            "prev_mean":           0.55,
            "last_mean":           0.54,
            "abs_delta":          -0.01,
            "rel_change":         -0.018,
            "is_anomaly":          False,
            "anomaly_kind":        "none",
            "confidence":          0.0,
            "anomaly_pixel_count": 0,
            "total_pixel_count":   100,
            "anomaly_ratio":       0.0,
        },
        {
            "metric_name":         "ndre",
            "prev_mean":           0.45,
            "last_mean":           0.44,
            "abs_delta":          -0.01,
            "rel_change":         -0.022,
            "is_anomaly":          False,
            "anomaly_kind":        "none",
            "confidence":          0.0,
            "anomaly_pixel_count": 0,
            "total_pixel_count":   100,
            "anomaly_ratio":       0.0,
        },
    ]
}

# Haskell-ответ: нет аномалий
HASKELL_NO_ANOMALY_RESPONSE = {
    "metrics": [
        {
            "metric_name": m, "prev_mean": 0.7, "last_mean": 0.7,
            "abs_delta": 0.0, "rel_change": 0.0, "is_anomaly": False,
            "anomaly_kind": "none", "confidence": 0.0,
            "anomaly_pixel_count": 0, "total_pixel_count": 100, "anomaly_ratio": 0.0,
        }
        for m in ["ndvi", "gndvi", "ndre"]
    ]
}


# ================================
# _call_haskell_snapshot
# ================================

class TestCallHaskellSnapshot:

    def test_returns_json_on_200(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"metrics": []}

        with patch("app.services.spot_anomaly_processor.requests.post",
                   return_value=mock_resp):
            result = _call_haskell_snapshot({"config": 5, "raw_data": {}})

        assert result == {"metrics": []}

    def test_retries_on_non_200_and_returns_none(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"

        with patch("app.services.spot_anomaly_processor.requests.post",
                   return_value=mock_resp), \
             patch("app.services.spot_anomaly_processor.time.sleep"):
            result = _call_haskell_snapshot({"config": 5})

        assert result is None

    def test_returns_none_on_connection_error(self):
        import requests as req

        with patch("app.services.spot_anomaly_processor.requests.post",
                   side_effect=req.RequestException("conn refused")), \
             patch("app.services.spot_anomaly_processor.time.sleep"):
            result = _call_haskell_snapshot({"config": 5})

        assert result is None

    def test_makes_exactly_3_attempts_on_failure(self):
        import requests as req

        with patch("app.services.spot_anomaly_processor.requests.post",
                   side_effect=req.RequestException("fail")) as mock_post, \
             patch("app.services.spot_anomaly_processor.time.sleep"):
            _call_haskell_snapshot({"config": 5})

        assert mock_post.call_count == 3


# ================================
# _build_haskell_payload
# ================================

class TestBuildHaskellPayload:

    def _groups(self, mean_prev=0.70, mean_last=0.52):
        prev = _make_field_data(1, "ndvi", mean_prev, T0, row_id=1)
        last = _make_field_data(1, "ndvi", mean_last, T1, row_id=2)
        return {"ndvi": [prev, last]}

    def test_config_is_5(self):
        geom = MagicMock()
        with patch("app.services.spot_anomaly_processor._load_and_clip_metric",
                   return_value=None):
            payload = _build_haskell_payload(self._groups(), geom, 0.10)
        assert payload["config"] == 5

    def test_area_threshold_in_payload(self):
        geom = MagicMock()
        with patch("app.services.spot_anomaly_processor._load_and_clip_metric",
                   return_value=None):
            payload = _build_haskell_payload(self._groups(), geom, 0.07)
        assert payload["raw_data"]["area_threshold_ratio"] == 0.07

    def test_fallback_to_scalar_when_no_file(self):
        """Если _load_and_clip_metric вернул None — используем [[mean_metric]]."""
        geom = MagicMock()
        with patch("app.services.spot_anomaly_processor._load_and_clip_metric",
                   return_value=None):
            payload = _build_haskell_payload(self._groups(0.70, 0.52), geom, 0.10)

        assert payload["raw_data"]["prev_ndvi"] == [[0.70]]
        assert payload["raw_data"]["last_ndvi"] == [[0.52]]

    def test_uses_clipped_map_when_file_available(self):
        """Если _load_and_clip_metric вернул карту — берём её."""
        fake_map = [[0.71, 0.69], [0.70, 0.72]]
        geom = MagicMock()
        groups = self._groups()
        groups["ndvi"][0].extra = {"source_file": "metrics_abc.nc"}
        groups["ndvi"][1].extra = {"source_file": "metrics_xyz.nc"}

        with patch("app.services.spot_anomaly_processor._load_and_clip_metric",
                   return_value=fake_map):
            payload = _build_haskell_payload(groups, geom, 0.10)

        assert payload["raw_data"]["prev_ndvi"] == fake_map
        assert payload["raw_data"]["last_ndvi"] == fake_map

    def test_missing_metric_gets_zero_placeholder(self):
        """Метрика отсутствует в groups → [[0.0]] для prev и last."""
        geom = MagicMock()
        with patch("app.services.spot_anomaly_processor._load_and_clip_metric",
                   return_value=None):
            payload = _build_haskell_payload({}, geom, 0.10)

        assert payload["raw_data"]["prev_ndvi"] == [[0.0]]
        assert payload["raw_data"]["last_ndvi"] == [[0.0]]


# ================================
# _event_type_for_metric
# ================================

class TestEventTypeForMetric:

    def test_ndvi_maps_to_ndvi_drop(self):
        assert _event_type_for_metric("ndvi") == EventType.NDVI_DROP

    def test_gndvi_maps_to_ndvi_drop(self):
        # gndvi содержит "ndvi"
        assert _event_type_for_metric("gndvi") == EventType.NDVI_DROP

    def test_evi_maps_to_evi_anomaly(self):
        assert _event_type_for_metric("evi") == EventType.EVI_ANOMALY

    def test_ndre_maps_to_metric_anomaly(self):
        assert _event_type_for_metric("ndre") == EventType.METRIC_ANOMALY

    def test_unknown_maps_to_metric_anomaly(self):
        assert _event_type_for_metric("nmdi") == EventType.METRIC_ANOMALY


# ================================
# find_satellite_anomaly — интеграционный уровень
# ================================

class TestFindSatelliteAnomaly:

    def _make_db(self, field, loc_user_id=42):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = field

        loc = MagicMock()
        loc.user_id = loc_user_id
        # второй вызов query (UserLocation)
        db.query.return_value.filter.return_value.first.side_effect = [field, loc]

        return db

    @patch("app.services.spot_anomaly_processor.calculate_field_area", return_value=20.0)
    @patch("app.services.spot_anomaly_processor._call_haskell_snapshot",
           return_value=HASKELL_ANOMALY_RESPONSE)
    @patch("app.services.spot_anomaly_processor._load_and_clip_metric", return_value=None)
    @patch("app.services.spot_anomaly_processor._get_two_snapshots_db")
    def test_returns_anomaly_count(self, mock_groups, _clip, _haskell, _area):
        field = _make_field()
        db    = self._make_db(field)

        prev = _make_field_data(1, "ndvi", 0.70, T0, row_id=1)
        last = _make_field_data(1, "ndvi", 0.52, T1, row_id=2)
        mock_groups.return_value = {"ndvi": [prev, last]}

        result = find_satellite_anomaly(db, field_id=1, generate_events=False)

        assert "sudden_change" in result
        assert result["sudden_change"] == 1

    @patch("app.services.spot_anomaly_processor.calculate_field_area", return_value=20.0)
    @patch("app.services.spot_anomaly_processor._call_haskell_snapshot",
           return_value=HASKELL_NO_ANOMALY_RESPONSE)
    @patch("app.services.spot_anomaly_processor._load_and_clip_metric", return_value=None)
    @patch("app.services.spot_anomaly_processor._get_two_snapshots_db")
    def test_returns_empty_when_no_anomaly(self, mock_groups, _clip, _haskell, _area):
        field = _make_field()
        db    = self._make_db(field)

        prev = _make_field_data(1, "ndvi", 0.70, T0, row_id=1)
        last = _make_field_data(1, "ndvi", 0.71, T1, row_id=2)
        mock_groups.return_value = {"ndvi": [prev, last]}

        result = find_satellite_anomaly(db, field_id=1, generate_events=False)

        assert result == {}

    @patch("app.services.spot_anomaly_processor.calculate_field_area", return_value=20.0)
    @patch("app.services.spot_anomaly_processor._call_haskell_snapshot", return_value=None)
    @patch("app.services.spot_anomaly_processor._load_and_clip_metric", return_value=None)
    @patch("app.services.spot_anomaly_processor._get_two_snapshots_db")
    def test_returns_empty_when_haskell_fails(self, mock_groups, _clip, _haskell, _area):
        field = _make_field()
        db    = self._make_db(field)

        prev = _make_field_data(1, "ndvi", 0.70, T0, row_id=1)
        last = _make_field_data(1, "ndvi", 0.52, T1, row_id=2)
        mock_groups.return_value = {"ndvi": [prev, last]}

        result = find_satellite_anomaly(db, field_id=1, generate_events=False)

        assert result == {}

    @patch("app.services.spot_anomaly_processor.calculate_field_area", return_value=20.0)
    @patch("app.services.spot_anomaly_processor._call_haskell_snapshot",
           return_value=HASKELL_ANOMALY_RESPONSE)
    @patch("app.services.spot_anomaly_processor._load_and_clip_metric", return_value=None)
    @patch("app.services.spot_anomaly_processor._get_two_snapshots_db")
    def test_field_not_found_returns_empty(self, mock_groups, _clip, _haskell, _area):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        result = find_satellite_anomaly(db, field_id=999, generate_events=False)

        assert result == {}

    @patch("app.services.spot_anomaly_processor.calculate_field_area", return_value=3.0)
    @patch("app.services.spot_anomaly_processor._call_haskell_snapshot",
           return_value=HASKELL_NO_ANOMALY_RESPONSE)
    @patch("app.services.spot_anomaly_processor._load_and_clip_metric", return_value=None)
    @patch("app.services.spot_anomaly_processor._get_two_snapshots_db")
    @patch("app.services.spot_anomaly_processor._build_haskell_payload")
    def test_small_field_uses_reduced_threshold(
        self, mock_build, mock_groups, _clip, _haskell, _area
    ):
        """Поля < SMALL_FIELD_HA должны получать SMALL_FIELD_RATIO."""
        field = _make_field()
        db    = self._make_db(field)
        mock_build.return_value = {"config": 5, "raw_data": {}}
        mock_groups.return_value = {
            "ndvi": [
                _make_field_data(1, "ndvi", 0.70, T0, row_id=1),
                _make_field_data(1, "ndvi", 0.52, T1, row_id=2),
            ]
        }

        find_satellite_anomaly(db, field_id=1, generate_events=False)

        call_kwargs = mock_build.call_args
        used_ratio  = call_kwargs[0][2]   # третий позиционный аргумент
        assert used_ratio == SMALL_FIELD_RATIO

    @patch("app.services.spot_anomaly_processor.calculate_field_area", return_value=50.0)
    @patch("app.services.spot_anomaly_processor._call_haskell_snapshot",
           return_value=HASKELL_NO_ANOMALY_RESPONSE)
    @patch("app.services.spot_anomaly_processor._load_and_clip_metric", return_value=None)
    @patch("app.services.spot_anomaly_processor._get_two_snapshots_db")
    @patch("app.services.spot_anomaly_processor._build_haskell_payload")
    def test_large_field_uses_default_threshold(
        self, mock_build, mock_groups, _clip, _haskell, _area
    ):
        """Поля >= SMALL_FIELD_HA используют DEFAULT_AREA_THRESHOLD_RATIO."""
        field = _make_field()
        db    = self._make_db(field)
        mock_build.return_value = {"config": 5, "raw_data": {}}
        mock_groups.return_value = {
            "ndvi": [
                _make_field_data(1, "ndvi", 0.70, T0, row_id=1),
                _make_field_data(1, "ndvi", 0.52, T1, row_id=2),
            ]
        }

        find_satellite_anomaly(db, field_id=1, generate_events=False)

        call_kwargs = mock_build.call_args
        used_ratio  = call_kwargs[0][2]
        assert used_ratio == DEFAULT_AREA_THRESHOLD_RATIO

    @patch("app.services.spot_anomaly_processor.calculate_field_area", return_value=20.0)
    @patch("app.services.spot_anomaly_processor._call_haskell_snapshot",
           return_value=HASKELL_ANOMALY_RESPONSE)
    @patch("app.services.spot_anomaly_processor._load_and_clip_metric", return_value=None)
    @patch("app.services.spot_anomaly_processor._get_two_snapshots_db")
    def test_db_rollback_on_exception(self, mock_groups, _clip, _haskell, _area):
        """При исключении в db.flush() должен вызываться rollback."""
        field = _make_field()
        db    = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = field
        db.flush.side_effect = Exception("DB flush failed")

        prev = _make_field_data(1, "ndvi", 0.70, T0, row_id=1)
        last = _make_field_data(1, "ndvi", 0.52, T1, row_id=2)
        mock_groups.return_value = {"ndvi": [prev, last]}

        with pytest.raises(Exception, match="DB flush failed"):
            find_satellite_anomaly(db, field_id=1, generate_events=False)

        db.rollback.assert_called_once()

    @patch("app.services.spot_anomaly_processor.calculate_field_area", return_value=20.0)
    @patch("app.services.spot_anomaly_processor._call_haskell_snapshot",
           return_value=HASKELL_ANOMALY_RESPONSE)
    @patch("app.services.spot_anomaly_processor._load_and_clip_metric", return_value=None)
    @patch("app.services.spot_anomaly_processor._get_two_snapshots_db")
    def test_summary_contains_spatial_fields(self, mock_groups, _clip, _haskell, _area):
        """metrics_summary должен содержать пространственные поля от Haskell."""
        field = _make_field()
        db    = self._make_db(field)

        prev = _make_field_data(1, "ndvi", 0.70, T0, row_id=1)
        last = _make_field_data(1, "ndvi", 0.52, T1, row_id=2)
        mock_groups.return_value = {"ndvi": [prev, last]}

        find_satellite_anomaly(db, field_id=1, generate_events=False)

        # Проверяем аргументы FieldStatAnomalyAnalysis
        added = db.add.call_args_list
        assert len(added) >= 1
        rec = added[0][0][0]   # первый db.add(rec)
        s   = rec.metrics_summary
        assert "anomaly_pixel_count" in s
        assert "anomaly_ratio"       in s
        assert "area_ha"             in s