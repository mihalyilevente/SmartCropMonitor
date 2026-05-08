import os
import numpy as np
import xarray as xr
import matplotlib.pyplot as plt

BASE_DIR = os.getcwd()
DATA_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "data")
MASK_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "masks")
SEGM_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "segmentation")
NDVI_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "ndvi")

DATA_PATH = os.path.join(DATA_DIR, "user_1_loc_1_20260503T094727.nc")
MASK_PATH = os.path.join(MASK_DIR, "mask_user_1_loc_1_20260503T094727.nc")
SEGM_PATH = os.path.join(SEGM_DIR, "mask_loc_1_20260503T094727.nc")
NDVI_PATH = os.path.join(NDVI_DIR, "metrics_user_2_loc_3_20260501T095511.nc")

# =========================
# Functions
# =========================

def plot_calculated_metrics(path):

    if not os.path.exists(path):
        print(f"[ERROR] Metrics file not found: {path}")
        return

    with xr.open_dataset(path) as ds:
        metrics = list(ds.data_vars)
        n_metrics = len(metrics)

        if n_metrics == 0:
            print("[WARNING] No metrics found in the dataset.")
            return

        # Настройка сетки графиков
        fig, axes = plt.subplots(1, n_metrics, figsize=(5 * n_metrics, 5))
        if n_metrics == 1: axes = [axes]

        for ax, var_name in zip(axes, metrics):
            data = ds[var_name].values

            im = ax.imshow(data, cmap='RdYlGn', vmin=0, vmax=1)
            ax.set_title(f"Index: {var_name.upper()}")
            ax.axis('off')
            fig.colorbar(im, ax=ax, orientation='horizontal', fraction=0.046, pad=0.04)

        plt.tight_layout()
        plt.show()

# =========================
# MAIN
# =========================
def main():

    plot_calculated_metrics(NDVI_PATH)


if __name__ == "__main__":
    main()
