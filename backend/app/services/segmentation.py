import os
import torch
import torch.nn.functional as F
import numpy as np
import xarray as xr
from datetime import datetime
from app.models.utae import AgriculturalSegmentationModel
from scipy.ndimage import label
from sqlalchemy import desc
from sqlalchemy.orm import Session
from app.core.database import FieldAnalysis, FieldUnit, UserLocation
from app.core.config import SEGM_DIR, DATA_DIR, TEMP_MODEL_WEIGHTS,MAX_SEGM_INPUT,MIN_SEGM_INPUTS ,QUALITY_THRESHOLD_SEGM


def perform_segmentation_and_save(location_id: int, db: Session, analyzer):
    analysis = (
        db.query(FieldAnalysis)
        .filter(FieldAnalysis.location_id == location_id, FieldAnalysis.is_valid == True)
        .order_by(desc(FieldAnalysis.last_data_request_date))
        .first()
    )

    if not analysis:
        print(f"[ERROR] No valid FieldAnalysis found for location {location_id}")
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


def perform_temp_segmentation_and_save(location_id: int, db: Session):
    try:
        location = db.query(UserLocation).filter(UserLocation.id == location_id).first()
        if not location:
            print(f"[ERROR] Location {location_id} not found")
            return

        analyses = db.query(FieldAnalysis) \
            .filter(FieldAnalysis.location_id == location_id) \
            .filter(FieldAnalysis.is_valid  >= QUALITY_THRESHOLD_SEGM) \
            .order_by(desc(FieldAnalysis.last_data_request_date)) \
            .limit(MAX_SEGM_INPUT).all()

        if not analyses:
            print(f"[ERROR] No valid data found for location {location_id}")
            return

        if len(analyses) < MIN_SEGM_INPUTS:
            print(f"[WARNING] Not enough data: {len(analyses)}/{MIN_SEGM_INPUTS} required")
            return

        print(f"[DEBUG] Found {len(analyses)} valid analyses for location {location_id}")

        all_tensors = []
        original_h, original_w = None, None
        mask_coords = None

        MODEL_HEIGHT, MODEL_WIDTH = 128, 128

        first_nc = os.path.join(DATA_DIR, os.path.basename(analyses[0].nc_filename))
        print(f"[DEBUG] Loading reference file: {first_nc}")

        with xr.open_dataset(first_nc) as ds:
            data_var = ds[list(ds.data_vars)[0]]
            print(f"[DEBUG] Reference dataset shape: {data_var.shape}")
            print(f"[DEBUG] Reference dataset dims: {data_var.dims}")

            mask_coords = {dim: data_var.coords[dim].values for dim in data_var.dims if dim != 'band'}
            original_h = len(data_var.coords[data_var.dims[1]])
            original_w = len(data_var.coords[data_var.dims[2]])

            print(f"[DEBUG] Original spatial dimensions: H={original_h}, W={original_w}")

        for idx, an in enumerate(analyses):
            nc_path = os.path.join(DATA_DIR, os.path.basename(an.nc_filename))
            print(f"[DEBUG] Processing temporal observation {idx + 1}/{len(analyses)}: {nc_path}")

            with xr.open_dataset(nc_path) as ds:
                data_var = ds[list(ds.data_vars)[0]]

                if 'band' in data_var.dims:
                    data = data_var.values
                    if data.shape[0] != len(data_var.coords['band']):
                        data = np.moveaxis(data, -1, 0)
                else:
                    raise ValueError(f"Expected 'band' dimension in {an.nc_filename}")

                print(f"[DEBUG] Raw data shape: {data.shape}")

                # Order: blue, green, red, nir, rededge1, rededge2, rededge3, nir08, swir16, swir22
                blue = data[0].astype(np.float32)
                green = data[1].astype(np.float32)
                red = data[2].astype(np.float32)
                nir = data[3].astype(np.float32)
                rededge1 = data[4].astype(np.float32)
                rededge2 = data[5].astype(np.float32)
                rededge3 = data[6].astype(np.float32)
                nir08 = data[7].astype(np.float32)
                swir16 = data[8].astype(np.float32)
                swir22 = data[9].astype(np.float32)

                ten_channels = np.stack([
                    blue,
                    green,
                    red,
                    nir,
                    rededge1,
                    rededge2,
                    rededge3,
                    nir08,
                    swir16,
                    swir22
                ], axis=0)

                print(f"[DEBUG] 10-channel data shape: {ten_channels.shape}")

                ten_channels = np.nan_to_num(ten_channels, nan=0.0, posinf=1.0, neginf=-1.0)

                ten_channels = np.clip(ten_channels, -1, 1)

                ten_channels = (ten_channels + 1) / 2.0

                print(f"[DEBUG] Data range: [{ten_channels.min():.4f}, {ten_channels.max():.4f}]")

                img_tensor = torch.from_numpy(ten_channels).float()
                print(f"[DEBUG] Tensor shape before resizing: {img_tensor.shape}")

                img_tensor = img_tensor.unsqueeze(0)

                current_h, current_w = img_tensor.shape[-2:]
                if (current_h, current_w) != (MODEL_HEIGHT, MODEL_WIDTH):
                    print(f"[DEBUG] Resizing from ({current_h}, {current_w}) to ({MODEL_HEIGHT}, {MODEL_WIDTH})")
                    img_tensor = F.interpolate(
                        img_tensor,
                        size=(MODEL_HEIGHT, MODEL_WIDTH),
                        mode='bilinear',
                        align_corners=False
                    )
                    print(f"[DEBUG] Tensor shape after resizing: {img_tensor.shape}")

                img_tensor = img_tensor.squeeze(0)
                print(f"[DEBUG] Tensor shape after squeeze: {img_tensor.shape}")

                all_tensors.append(img_tensor)

        num_found = len(all_tensors)
        print(f"[DEBUG] Total tensors collected: {num_found}/{MAX_SEGM_INPUT}")

        if num_found < MAX_SEGM_INPUT:
            print(f"[DEBUG] Padding with {MAX_SEGM_INPUT - num_found} zero tensors")
            padding = [torch.zeros_like(all_tensors[0]) for _ in range(MAX_SEGM_INPUT - num_found)]
            all_tensors.extend(padding)

        print(f"[DEBUG] Stacking {len(all_tensors)} tensors...")
        input_tensor = torch.stack(all_tensors, dim=0)
        print(f"[DEBUG] Tensor shape after stack: {input_tensor.shape}")

        input_tensor = input_tensor.unsqueeze(0)
        print(f"[DEBUG] Final input tensor shape: {input_tensor.shape}")

        assert len(input_tensor.shape) == 5, f"Expected 5D tensor, got {len(input_tensor.shape)}D"
        assert input_tensor.shape[0] == 1, f"Batch size should be 1, got {input_tensor.shape[0]}"
        assert input_tensor.shape[
                   1] == MAX_SEGM_INPUT, f"Time steps should be {MAX_SEGM_INPUT}, got {input_tensor.shape[1]}"
        assert input_tensor.shape[2] == 10, f"Channels should be 10, got {input_tensor.shape[2]}"
        assert input_tensor.shape[3] == MODEL_HEIGHT, f"Height should be {MODEL_HEIGHT}, got {input_tensor.shape[3]}"
        assert input_tensor.shape[4] == MODEL_WIDTH, f"Width should be {MODEL_WIDTH}, got {input_tensor.shape[4]}"

        batch_dates = torch.tensor([[float(i) for i in range(MAX_SEGM_INPUT)]]).float()
        print(f"[DEBUG] Batch dates shape: {batch_dates.shape}")

        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"[DEBUG] Using device: {device}")

        model = AgriculturalSegmentationModel(n_channels=10, n_classes=1)

        if os.path.exists(TEMP_MODEL_WEIGHTS):
            print(f"[DEBUG] Loading model weights from {TEMP_MODEL_WEIGHTS}")
            try:
                state_dict = torch.load(TEMP_MODEL_WEIGHTS, map_location=device, weights_only=False)
            except Exception as e:
                print(f"[DEBUG] Pickle load failed: {e}, trying SafeTensor format...")
                from safetensors.torch import load_file
                state_dict = load_file(TEMP_MODEL_WEIGHTS)

            model.load_state_dict(state_dict)
        else:
            print(f"[WARNING] Model weights not found at {TEMP_MODEL_WEIGHTS}")
            return

        model.to(device).eval()

        with torch.no_grad():
            print(f"[DEBUG] Running model inference with input shape: {input_tensor.shape}")
            output = model(input_tensor.to(device), batch_dates.to(device))
            print(f"[DEBUG] Model output shape: {output.shape}")

            logits = output[0] if isinstance(output, tuple) else output
            print(f"[DEBUG] Logits shape: {logits.shape}")

            probs = torch.sigmoid(logits).cpu().numpy()
            print(f"[DEBUG] Probabilities shape after sigmoid: {probs.shape}")

            if len(probs.shape) == 4:
                probs = probs[0, 0]
            elif len(probs.shape) == 3:
                probs = probs[0]

            print(f"[DEBUG] Spatial probabilities shape: {probs.shape}")

            if probs.shape != (original_h, original_w):
                print(f"[DEBUG] Upsampling from {probs.shape} to ({original_h}, {original_w})")
                probs_tensor = torch.from_numpy(probs).float().unsqueeze(0).unsqueeze(0)
                probs_upsampled = F.interpolate(
                    probs_tensor,
                    size=(original_h, original_w),
                    mode='bilinear',
                    align_corners=False
                ).squeeze(0).squeeze(0).numpy()
            else:
                probs_upsampled = probs

            print(f"[DEBUG] Final probabilities shape: {probs_upsampled.shape}")
            print(f"[DEBUG] Probability range: [{probs_upsampled.min():.4f}, {probs_upsampled.max():.4f}]")

        binary_mask = (probs_upsampled > 0.5).astype(np.uint8)
        labeled_mask, num_features = label(binary_mask)
        print(f"[DEBUG] Segmentation complete: {num_features} features detected")

        segm_mask_filename = f"mask_loc_{location_id}_{int(datetime.now().timestamp())}.nc"
        if not os.path.exists(SEGM_DIR):
            os.makedirs(SEGM_DIR)

        mask_da = xr.DataArray(
            labeled_mask.astype(np.int32),
            coords=mask_coords,
            dims=list(mask_coords.keys()),
            name="segmentation_mask"
        )
        mask_da.to_netcdf(os.path.join(SEGM_DIR, segm_mask_filename))
        print(f"[DEBUG] Saved segmentation mask to {segm_mask_filename}")

        db.query(FieldUnit).filter(FieldUnit.location_id == location_id).delete()
        for i in range(1, num_features + 1):
            db.add(FieldUnit(location_id=location_id, field_index=i, is_active=True))

        location.last_segm_mask_url = segm_mask_filename
        location.segmentation_status = True
        db.commit()

        print(f"[INFO] Segmentation successful: {num_features} fields found for {location_id}")

    except Exception as e:
        db.rollback()
        print(f"[CRITICAL] Segmentation failed: {str(e)}")
        import traceback
        traceback.print_exc()

        loc = db.query(UserLocation).filter(UserLocation.id == location_id).first()
        if loc:
            loc.segmentation_status = False
            db.commit()