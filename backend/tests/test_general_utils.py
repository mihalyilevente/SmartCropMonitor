import numpy as np
import pytest

from app.utils.general import clean_f, r, safe_array, safe_float, safe_int


def test_safe_float_and_int_convert_none_to_zero():
    assert safe_float(None) == 0.0
    assert safe_int(None) == 0


def test_safe_float_and_int_convert_numeric_values():
    assert safe_float("3.5") == 3.5
    assert safe_int("7") == 7


def test_safe_array_converts_to_float32_and_replaces_non_finite_values():
    values = np.array([1, np.nan, np.inf, -np.inf], dtype="float64")

    result = safe_array(values)

    assert result.dtype == np.float32
    assert result.tolist() == [1.0, 0.0, 0.0, 0.0]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, 0.0),
        (float("nan"), 0.0),
        ("2.75", 2.75),
        (4, 4.0),
    ],
)
def test_clean_f_normalizes_values_for_serialization(value, expected):
    assert clean_f(value) == expected


def test_round_helper_preserves_none():
    assert r(None) is None
    assert r(1.23456789, ndigits=3) == 1.235
