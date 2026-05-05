import os
import numpy as np
import xarray as xr
import matplotlib.pyplot as plt

BASE_DIR = os.getcwd()
DATA_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "data")
MASK_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "masks")
SEGM_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "segmentation")

DATA_PATH = os.path.join(DATA_DIR, "user_1_loc_1_20260503.nc")
MASK_PATH = os.path.join(MASK_DIR, "mask_user_1_loc_1_20260503.nc")
SEGM_PATH = os.path.join(SEGM_DIR, "segm_user_1_loc_1_20260503.nc")

# =========================
# SAFE LOADING & NDVI
# =========================
def load_and_calculate_ndvi(path):
    if not os.path.exists(path):
        print(f"[ERROR] File not found: {path}")
        return None

    with xr.open_dataset(path) as ds:
        if 'B08' in ds.data_vars and 'B04' in ds.data_vars:
            ndvi = (ds.B08 - ds.B04) / (ds.B08 + ds.B04)
            print("[INFO] NDVI calculated successfully.")
            return ndvi.values

        var = list(ds.data_vars)[0]
        return ds[var].values


# =========================
# PIF VALIDATION (Histogram)
# =========================
def plot_pif_check(arr, title="Signal Distribution"):
    clean_data = arr[np.isfinite(arr)].flatten()

    plt.figure(figsize=(8, 4))
    plt.hist(clean_data, bins=50, color='skyblue', edgecolor='black')
    plt.title(f"{title} - Distribution")
    plt.xlabel("Value")
    plt.ylabel("Frequency")
    plt.show()


# =========================
# MAIN VALIDATION LOOP
# =========================
def run_quality_check():
    print("\n=== STARTING HARMONIZATION QUALITY CHECK ===")

    data = load_and_calculate_ndvi(DATA_PATH)
    mask = load_and_calculate_ndvi(MASK_PATH)  # SCL

    if data is not None:
        plot_pif_check(data, "Master Grid Data")

        if mask is not None:
            print("\n[INFO] SCL Mask Analysis:")
            unique, counts = np.unique(mask[np.isfinite(mask)], return_counts=True)
            for u, c in zip(unique, counts):
                print(f"Class {int(u)}: {c} pixels")

            bad_pixels = np.isin(unique, [8, 9, 10]).any()
            print(f"[QUALITY]: Cloud classes present: {bad_pixels}")

    print("\n=== VALIDATION COMPLETE ===")

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

def test_nc():
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


def visualize_comparison(data_arr, segm_arr):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    if data_arr is not None:
        img_to_show = data_arr[3] if data_arr.ndim == 3 else data_arr

        vmin, vmax = np.nanpercentile(img_to_show, [2, 98])

        im1 = axes[0].imshow(img_to_show, cmap='gray', vmin=vmin, vmax=vmax)
        axes[0].set_title("Original Data (Auto-Scaled)")
        fig.colorbar(im1, ax=axes[0])

    if segm_arr is not None:
        im2 = axes[1].imshow(segm_arr, cmap='tab20', vmin=0, vmax=1)
        axes[1].set_title("Segmentation Mask")
        fig.colorbar(im2, ax=axes[1])

    plt.show()


# =========================
# ANALYSIS (Distribution)
# =========================
def analyze_mask(mask_arr):
    if mask_arr is None: return
    flat = mask_arr.flatten()
    unique, counts = np.unique(flat, return_counts=True)
    print("\n[MASK DISTRIBUTION]")
    for val, count in zip(unique, counts):
        print(f"Value {val}: {count} pixels")

def plot_original_with_contrast(path):
    with xr.open_dataset(path) as ds:
        var_name = list(ds.data_vars)[0]
        data = ds[var_name]

        if 'band' in data.dims:
            img = data.isel(band=3).values
        else:
            img = data.values

        img = np.nan_to_num(img, nan=np.nanmin(img))

        vmin, vmax = np.nanpercentile(img, [2, 98])

        plt.figure(figsize=(8, 8))
        im = plt.imshow(img, cmap='gray', vmin=vmin, vmax=vmax)
        plt.colorbar(im, label='Signal Intensity')
        plt.title(f"Original Data: {var_name}\nRange: {img.min():.1f} - {img.max():.1f}")
        plt.axis('off')
        plt.show()


def plot_rgb_color(path):
    with xr.open_dataset(path) as ds:
        data_var = ds[list(ds.data_vars)[0]]

        try:
            r = data_var.sel(band="red").values
            g = data_var.sel(band="green").values
            b = data_var.sel(band="blue").values

            rgb = np.stack([r, g, b], axis=-1)

            rgb = np.nan_to_num(rgb, nan=np.nanmin(rgb))

            p2, p98 = np.nanpercentile(rgb, (2, 98))
            rgb_norm = np.clip((rgb - p2) / (p98 - p2 + 1e-6), 0, 1)

            plt.figure(figsize=(10, 10))
            plt.imshow(rgb_norm)
            plt.title("True Color (RGB)")
            plt.axis('off')
            plt.show()

        except KeyError as e:
            print(f"[ERROR] Channel not found: {e}. Avalible: {data_var.band.values}")
# =========================
# MAIN
# =========================
def main():
    data = load_raster(DATA_PATH)
    segm = load_raster(SEGM_PATH)
    visualize_comparison(data,segm)
    plot_original_with_contrast(DATA_PATH)
    run_quality_check()
    plot_rgb_color(DATA_PATH)


if __name__ == "__main__":
    main()
