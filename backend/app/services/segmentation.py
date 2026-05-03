import os
import torch
import torch.nn.functional as F
import numpy as np
import xarray as xr
from scipy.ndimage import label
from sqlalchemy.orm import Session
from app.core.database import FieldAnalysis, FieldUnit, UserLocation
from app.core.config import TARGET_BANDS, MODEL_PATH


def perform_segmentation_and_save(analysis_id: int, db: Session, analyzer):
    analysis = db.query(FieldAnalysis).filter(FieldAnalysis.id == analysis_id).first()
    if not analysis:
        print(f"[ERROR] Analysis {analysis_id} not found")
        return

    nc_path = os.path.join("data", "storage", "data", analysis.nc_filename)

    try:
        with xr.open_dataset(nc_path) as ds:
            data_var = ds[list(ds.data_vars)[0]]

            blue = data_var.sel(band="blue").values
            green = data_var.sel(band="green").values
            red = data_var.sel(band="red").values
            nir = data_var.sel(band="nir").values

            ndvi = (nir - red) / (nir + red + 1e-8)

            image = np.stack([blue, green, red, nir, ndvi], axis=0)
            image = np.nan_to_num(image, nan=0.0)

            sample_band = data_var.sel(band="blue")
            mask_coords = sample_band.drop_vars("band", errors="ignore").coords

        input_tensor_np = analyzer._normalize(image)
        input_tensor = torch.from_numpy(input_tensor_np).float().unsqueeze(0).to(analyzer.device)

        orig_height, orig_width = input_tensor.shape[2], input_tensor.shape[3]

        target_size = (256, 256)
        input_resized = F.interpolate(input_tensor, size=target_size, mode='bilinear', align_corners=False)

        with torch.no_grad():
            logits = analyzer.model(input_resized)

            logits_rescaled = F.interpolate(logits, size=(orig_height, orig_width), mode='bilinear',
                                            align_corners=False)
            probs = torch.sigmoid(logits_rescaled).cpu().numpy()[0, 0]

        print(f"[DEBUG] Max confidence in prediction: {probs.max():.4f}")

        binary_mask = (probs > 0.5).astype(np.uint8)
        labeled_mask, num_features = label(binary_mask)

        segm_mask_filename = f"segm_{analysis.nc_filename}"
        segm_dir = os.path.join("data", "storage", "segmentation")
        os.makedirs(segm_dir, exist_ok=True)
        segm_mask_path = os.path.join(segm_dir, segm_mask_filename)

        mask_da = xr.DataArray(
            labeled_mask.astype(np.int32),
            coords=mask_coords,
            dims=("y", "x"),
            name="segmentation_mask"
        )
        mask_da.to_netcdf(segm_mask_path)

        db.query(FieldUnit).filter(FieldUnit.location_id == analysis.location_id).delete()

        for i in range(1, num_features + 1):
            db.add(FieldUnit(location_id=analysis.location_id, field_index=i, is_active=True))

        analysis.fields_count = num_features
        location = db.query(UserLocation).filter(UserLocation.id == analysis.location_id).first()
        if location:
            location.last_segm_mask_url = segm_mask_filename
            location.segmentation_status = True

        db.commit()
        print(f"[INFO] Segmentation success: {num_features} fields found for location {analysis.location_id}")

    except Exception as e:
        db.rollback()
        print(f"[CRITICAL] Segmentation failed: {str(e)}")
        raise e