import numpy as np

def safe_float(x):
    return float(x) if x is not None else 0.0


def safe_int(x):
    return int(x) if x is not None else 0


def safe_array(x):
    x = x.astype("float32")
    x[~np.isfinite(x)] = 0
    return x