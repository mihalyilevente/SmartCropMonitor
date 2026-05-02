def safe_float(x):
    return float(x) if x is not None else 0.0


def safe_int(x):
    return int(x) if x is not None else 0