import numpy as np
from typing import Any
from typing import Optional
import hashlib

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


def _safe_float(val) -> Optional[float]:
    try:
        f = float(val)
        return f if np.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _make_event_hash(*parts) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()


def _make_dedup_key(field_id: int, metric_type: str, anomaly_type: str, window: str) -> str:
    return f"field:{field_id}:metric:{metric_type}:anomaly:{anomaly_type}:window:{window}"