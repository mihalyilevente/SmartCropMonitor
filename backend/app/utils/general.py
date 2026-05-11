import numpy as np
from typing import Any


def safe_float(x):
    return float(x) if x is not None else 0.0


def safe_int(x):
    return int(x) if x is not None else 0


def safe_array(x):
    x = x.astype("float32")
    x[~np.isfinite(x)] = 0
    return x


def r(x, ndigits=6):
    return round(x, ndigits) if x is not None else None


def clean_f(val: Any) -> float:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return 0.0
    return float(val)