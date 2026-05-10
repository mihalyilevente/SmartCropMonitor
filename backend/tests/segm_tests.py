import os
import numpy as np
import xarray as xr
import matplotlib.pyplot as plt

BASE_DIR = os.getcwd()
DATA_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "data")
MASK_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "masks")
SEGM_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "segmentation")
NDVI_DIR = os.path.join(BASE_DIR, "backend", "data", "storage", "ndvi")

DATA_PATH = os.path.join(DATA_DIR, "user_1_loc_2_20260505T093712.nc")
MASK_PATH = os.path.join(MASK_DIR, "slc_user_1_loc_2_20260505T093712.nc")
SEGM_PATH = os.path.join(SEGM_DIR, "mask_loc_2_1778429660.nc")
NDVI_PATH = os.path.join(NDVI_DIR, "metrics_user_1_loc_2_20260505T093712.nc")

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


def check_segmentation(ndvi_path, segm_path):
    if not os.path.exists(ndvi_path) or not os.path.exists(segm_path):
        print(f"[ERROR] No:\nNDVI: {ndvi_path}\nSEGM: {segm_path}")
        return

    with xr.open_dataset(ndvi_path) as ds_ndvi, xr.open_dataset(segm_path) as ds_segm:
        ndvi_data = ds_ndvi[list(ds_ndvi.data_vars)[0]].values
        segm_mask = ds_segm['segmentation_mask'].values

        fig, axes = plt.subplots(1, 3, figsize=(18, 6))

        im0 = axes[0].imshow(ndvi_data, cmap='RdYlGn', vmin=0, vmax=1)
        axes[0].set_title("Original NDVI")
        fig.colorbar(im0, ax=axes[0])

        im1 = axes[1].imshow(segm_mask, cmap='tab20')
        axes[1].set_title(f"Segmentation Mask ({np.max(segm_mask)} fields)")

        axes[2].imshow(ndvi_data, cmap='gray')
        masked_segm = np.ma.masked_where(segm_mask == 0, segm_mask)
        axes[2].imshow(masked_segm, cmap='autumn', alpha=0.5)
        axes[2].set_title("Overlay (NDVI + Mask)")

        for ax in axes:
            ax.axis('off')

        plt.tight_layout()
        plt.show()

# =========================
# MAIN
# =========================
def main():

    plot_calculated_metrics(NDVI_PATH)
    check_segmentation(NDVI_PATH, SEGM_PATH)

if __name__ == "__main__":
    main()
