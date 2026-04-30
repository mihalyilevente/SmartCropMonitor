import os
import torch
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
HASKELL_SERVICE_URL = "http://localhost:8081/field-stats"

STORAGE_PATH = os.path.join("data", "storage")

DATA_DIR = os.path.join(STORAGE_PATH, "data")
MASK_DIR = os.path.join(STORAGE_PATH, "masks")

class FieldAnalyzer:
    def __init__(self, model_path: str = None, device: str = None):
        if model_path is None:
            model_path = os.path.join("app", "models", "unet_ai4boundaries.pth")

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
            raise FileNotFoundError(f"Файл {nc_path} не найден")

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

            image = np.stack([blue, green, red, nir, ndvi], axis=0)

        image = np.nan_to_num(image, nan=0.0)
        input_tensor_np = self._normalize(image)
        print(f"[DEBUG] Input range: {input_tensor_np.min():.4f}-{input_tensor_np.max():.4f}")
        input_tensor = torch.from_numpy(input_tensor_np).float().unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(input_tensor)
            mask_probs = torch.sigmoid(logits).cpu().numpy()[0, 0]

        print(f"[DEBUG] Max model confidence: {mask_probs.max():.4f}")
        binary_mask = (mask_probs > 0.5).astype(np.uint8)

        labeled_mask, num_features = label(binary_mask)

        payload = {
            "labels": labeled_mask.tolist(),
            "ndvi": ndvi.tolist(),
            "num_features": int(num_features)
        }

        return self._call_haskell(payload)


def perform_haskell_validation(mask_path, threshold=0.3):
    try:
        with xr.open_dataset(mask_path) as mds:
            scl_values = mds.to_array().values.flatten().astype(int).tolist()

        payload = {
            "scl_values": scl_values,
            "threshold": threshold
        }

        response = requests.post(
            HASKELL_SERVICE_URL,
            json=payload,
            timeout=10
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"[ERROR] Haskell service returned status {response.status_code}")
            return None

    except Exception as e:
        print(f"[ERROR] Failed to communicate with Haskell service: {e}")
        return None


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