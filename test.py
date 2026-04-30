import numpy as np
import xarray as xr
import matplotlib.pyplot as plt

DATA_PATH = r"C:\Users\nikit\PycharmProjects\SmartCropMonitor\backend\data\storage\data\user_1_loc_1_20260428.nc"
MASK_PATH = r"C:\Users\nikit\PycharmProjects\SmartCropMonitor\backend\data\storage\masks\mask_user_1_loc_1_20260428.nc"


# =========================
# SAFE LOADING
# =========================
def load_raster(path):
    with xr.open_dataset(path) as ds:
        print("\n[INFO] Dataset structure:")
        print(ds)

        print("\n[DATA VARS]:", list(ds.data_vars))

        # safest extraction
        var = list(ds.data_vars)[0]
        arr = ds[var].values

        return np.array(arr)


# =========================
# CLEAN SCL
# =========================
def clean_values(arr):
    arr = np.array(arr)

    arr = arr[np.isfinite(arr)]  # removes NaN + inf
    return arr


# =========================
# ANALYSIS
# =========================
def analyze_scl(scl):
    scl = clean_values(scl).flatten()

    unique, counts = np.unique(scl, return_counts=True)
    ratio = counts / len(scl)

    print("\n[SCL CLASS DISTRIBUTION]")

    for u, c, r in zip(unique, counts, ratio):
        try:
            u = int(u)
        except Exception:
            continue

        c = int(c)
        print(f"class {u:2d} -> {c:6d} pixels ({r*100:.2f}%)")

    return unique, counts


# =========================
# VALIDATION
# =========================
def is_valid_scl(values):
    values = clean_values(values)
    unique = np.unique(values)

    print("\n[UNIQUE VALUES]:", unique[:50])

    valid = set(unique).issubset(set(range(0, 12)))
    print("[SCL VALID]:", valid)

    return valid


# =========================
# VISUALIZATION SAFE
# =========================
def plot_scl(scl, title="SCL"):
    scl = np.array(scl)

    # handle (band, y, x)
    if scl.ndim == 3:
        scl = scl[0]

    plt.figure(figsize=(6, 6))
    plt.imshow(scl, cmap="tab20")
    plt.colorbar()
    plt.title(title)
    plt.axis("off")
    plt.show()


def plot_hist(unique, counts):
    plt.figure(figsize=(8, 4))
    plt.bar(unique.astype(str), counts)
    plt.title("SCL Class Histogram")
    plt.xlabel("Class")
    plt.ylabel("Pixels")
    plt.show()


# =========================
# MAIN
# =========================
def main():
    print("\n================ DATA =================")
    data_scl = load_raster(DATA_PATH)

    print("\n================ MASK (SCL) =================")
    mask_scl = load_raster(MASK_PATH)

    print("\n================ DATA SCL =================")
    analyze_scl(data_scl)
    plot_scl(data_scl, "DATA SCL")

    print("\n================ MASK SCL =================")
    u2, c2 = analyze_scl(mask_scl)
    plot_scl(mask_scl, "MASK SCL")

    plot_hist(u2, c2)

    print("\n================ VALIDATION =================")
    is_valid_scl(mask_scl)


if __name__ == "__main__":
    main()