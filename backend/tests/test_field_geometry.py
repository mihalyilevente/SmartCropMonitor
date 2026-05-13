import pytest
from shapely.geometry import MultiPolygon, Polygon

from app.utils.fields import calculate_field_area, validate_field_shape


def _field_square(size=0.001):
    return Polygon(
        [
            (19.0, 47.0),
            (19.0 + size, 47.0),
            (19.0 + size, 47.0 + size),
            (19.0, 47.0 + size),
            (19.0, 47.0),
        ]
    )


def test_calculate_field_area_returns_hectares_for_multipolygon():
    geometry = MultiPolygon([_field_square()])

    area_ha = calculate_field_area(geometry)

    assert area_ha == pytest.approx(0.82, abs=0.05)


def test_validate_field_shape_accepts_valid_multipolygon():
    result = validate_field_shape(MultiPolygon([_field_square()]))

    assert result["valid"] is True
    assert result["area_ha"] == pytest.approx(0.82, abs=0.05)


def test_validate_field_shape_rejects_missing_geometry():
    assert validate_field_shape(None) == {
        "valid": False,
        "error": "Geometry is missing",
    }


def test_validate_field_shape_rejects_plain_polygon():
    result = validate_field_shape(_field_square())

    assert result == {
        "valid": False,
        "error": "Geometry must be MULTIPOLYGON",
    }


def test_validate_field_shape_rejects_tiny_fields():
    result = validate_field_shape(MultiPolygon([_field_square(size=0.00001)]))

    assert result == {
        "valid": False,
        "error": "Field area too small",
    }
