import os
import torch
import time
import numpy as np
import xarray as xr
from scipy.ndimage import label
import requests
from app.models.unet import UNet
from sqlalchemy.orm import Session
from app.core.database import (
    UserDB, UserCreate, UserLocation, FieldAnalysis,
    get_db, SessionLocal, Base, engine
)
from app.core.config import HASKELL_SERVICE_URL, DATA_DIR, MASK_DIR, MODEL_WEIGHTS



class FieldAnalyzer:
    def __init__(self, model_path: str = None, device: str = None):
        if model_path is None:
            model_path = os.path.join("app", "models", "unet_mitb2_ai4boundaries.pth")

        self.device = torch.device(device if device else ("cuda" if torch.cuda.is_available() else "cpu"))

        self.model = UNet(in_channels=5, out_channels=1).to(self.device)

        state_dict = torch.load(model_path, map_location=self.device)
        self.model.load_state_dict(state_dict)
        self.model.eval()


    def _normalize(self, img):
        p2 = np.nanpercentile(img, 2, axis=(1, 2), keepdims=True)
        p98 = np.nanpercentile(img, 98, axis=(1, 2), keepdims=True)

        denominator = p98 - p2
        denominator[denominator == 0] = 1e-6

        img = (img - p2) / denominator

        img = np.nan_to_num(img, nan=0.0)
        return np.clip(img, 0, 1)


    def _call_haskell(self, payload: dict):
        try:
            r = requests.post(
                HASKELL_SERVICE_URL,
                json=payload,
                timeout=30
            )

            print("HASKELL STATUS:", r.status_code)
            print("HASKELL RESPONSE:", r.text)

            r.raise_for_status()
            return r.json()

        except Exception as e:
            print("HASKELL ERROR:", str(e))
            raise

    def run_analysis(self, nc_path: str, month_idx: int = 4):

        if not os.path.exists(nc_path):
            raise FileNotFoundError(f"{nc_path} not found")

        with xr.open_dataset(nc_path) as ds:

            try:
                blue = ds.sel(band="blue").to_array().values.squeeze()
                green = ds.sel(band="green").to_array().values.squeeze()
                red = ds.sel(band="red").to_array().values.squeeze()
                nir = ds.sel(band="nir").to_array().values.squeeze()

            except Exception:
                data = list(ds.data_vars.values())[0]
                blue = data.isel(band=0).values
                green = data.isel(band=1).values
                red = data.isel(band=2).values
                nir = data.isel(band=3).values

            ndvi = (nir - red) / (nir + red + 1e-8)
            ndvi = np.clip(ndvi, -1, 1)
            ndvi = np.nan_to_num(ndvi, nan=0.0)

            image = np.stack([blue, green, red, nir, ndvi], axis=0)

        image = np.nan_to_num(image, nan=0.0)
        image = self._normalize(image)

        tensor = torch.from_numpy(image).float().unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(tensor)
            mask_probs = torch.sigmoid(logits).cpu().numpy()[0, 0]

        binary_mask = (mask_probs > 0.5).astype(np.uint8)

        labeled_mask, num_features = label(binary_mask)

        label_features = self._compress_labels(labeled_mask, num_features)

        payload = {
            "config": 1,
            "labels": label_features,
            "ndvi_stats": {
                "mean": float(np.mean(ndvi)),
                "std": float(np.std(ndvi)),
                "min": float(np.min(ndvi)),
                "max": float(np.max(ndvi))
            },
            "num_features": int(num_features)
        }

        return self._call_haskell(payload)


def perform_haskell_validation(mask_path, threshold=0.3):
    try:
        with xr.open_dataset(mask_path) as mds:
            scl_values = (
                mds.to_array()
                .values
                .flatten()
                .astype(float)
            )

            scl_values = [
                int(v) for v in scl_values
                if v is not None and not np.isnan(v)
            ]

        payload = {
            "config": 2,
            "scl_values": scl_values,
            "threshold": threshold
        }

        for _ in range(3):
            try:
                response = requests.post(
                    HASKELL_SERVICE_URL,
                    json=payload,
                    timeout=10
                )
                if response.status_code == 200:
                    return response.json()
            except requests.RequestException:
                time.sleep(1)
        return None

    except Exception as e:
        print(f"[ERROR] Haskell communication failed: {e}")
        return None


analyzer = FieldAnalyzer(model_path=MODEL_WEIGHTS)


def validate_pending_analyses(db: Session):
    pending_list = db.query(FieldAnalysis).filter(FieldAnalysis.is_valid == None).all()

    if not pending_list:
        print("[INFO] No pending analyses to validate.")
        return

    print(f"[INFO] Found {len(pending_list)} records for validation.")

    for analysis in pending_list:
        mask_path = os.path.join(MASK_DIR, analysis.mask_filename) if analysis.mask_filename else None

        if not mask_path or not os.path.exists(mask_path):
            print(f"[WARN] Mask file missing for analysis_id={analysis.id}. Skipping.")
            continue

        result = perform_haskell_validation(mask_path, threshold=0.3)

        if result:
            analysis.is_valid = result.get('is_valid')
            analysis.quality_report = result.get('quality_report')

            if analysis.results_json is None:
                analysis.results_json = {}
            analysis.results_json['cloud_ratio'] = result.get('cloud_ratio')

            db.commit()
            print(f"[INFO] Analysis {analysis.id} validated. Result: {analysis.is_valid}")
        else:
            print(f"[ERROR] Haskell service failed for analysis_id={analysis.id}")

