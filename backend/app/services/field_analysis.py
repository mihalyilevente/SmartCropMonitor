import os
import torch
import numpy as np
import xarray as xr
from scipy.ndimage import label
from app.models.unet import UNet


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
        denominator = p98 - p2 + 1e-6
        img = (img - p2) / denominator
        img = np.nan_to_num(img, nan=0.0)
        return np.clip(img, 0, 1)

    def run_analysis(self, nc_path: str, month_idx: int = 4):
        if not os.path.exists(nc_path):
            raise FileNotFoundError(f"Файл {nc_path} не найден")

        with xr.open_dataset(nc_path) as ds:
            channels = []
            for band in ["B2", "B3", "B4", "B8", "NDVI"]:
                arr = ds[band].isel(time=month_idx).values
                channels.append(arr)

            image = np.stack(channels, axis=0)
            ndvi_full = ds["NDVI"].isel(time=month_idx).values

        image = np.nan_to_num(image, nan=0.0, posinf=0.0, neginf=0.0)
        input_tensor = self._normalize(image)
        input_tensor = torch.from_numpy(input_tensor).float().unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(input_tensor)
            mask = torch.sigmoid(logits).cpu().numpy()[0, 0]

        binary_mask = (mask > 0.5).astype(np.uint8)
        labeled_mask, num_features = label(binary_mask)

        results = []
        for i in range(1, num_features + 1):
            field_coords = (labeled_mask == i)
            field_ndvi_values = ndvi_full[field_coords]

            field_ndvi_values = field_ndvi_values[~np.isnan(field_ndvi_values)]

            if len(field_ndvi_values) > 0:
                results.append({
                    "field_id": int(i),
                    "area_px": int(np.sum(field_coords)),
                    "mean_ndvi": float(np.mean(field_ndvi_values)),
                    "std_ndvi": float(np.std(field_ndvi_values))
                })

        return results