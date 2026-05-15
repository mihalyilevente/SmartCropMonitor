import os
import torch
import torch.nn.functional as F
import numpy as np
import xarray as xr
import affine
from pyproj import Transformer
from datetime import datetime
from app.models.utae import AgriculturalSegmentationModel
from scipy.ndimage import label
from shapely.geometry import shape, MultiPolygon
from shapely.ops import transform as shapely_transform
from rasterio import features
from sqlalchemy import desc, text
from sqlalchemy.orm import Session
from app.core.schemas import FieldType
from app.core.database import FieldAnalysis, FieldUnit, UserLocation
from app.core.config import SEGM_DIR, DATA_DIR, TEMP_MODEL_WEIGHTS, MAX_SEGM_INPUT, MIN_SEGM_INPUTS, QUALITY_THRESHOLD_SEGM
from app.utils.fields import validate_field_shape


PASTIS_MEAN = torch.tensor([
    1006.0, 1025.9, 936.6, 2801.8,
    1451.4, 1917.0, 2140.7, 2262.8,
    1610.1, 1009.4
], dtype=torch.float32).view(1, 10, 1, 1)

PASTIS_STD = torch.tensor([
    729.2, 754.9, 762.9, 1085.5,
    914.4, 937.8, 930.6, 1001.9,
    972.7, 810.1
], dtype=torch.float32).view(1, 10, 1, 1)


def perform_temp_segmentation_and_save(location_id: int, db: Session):
    try:
        location = db.query(UserLocation).filter(UserLocation.id == location_id).first()
        if not location:
            print(f"[ERROR] Location {location_id} not found")
            return

        analyses = db.query(FieldAnalysis) \
            .filter(FieldAnalysis.location_id == location_id) \
            .filter(FieldAnalysis.is_valid >= QUALITY_THRESHOLD_SEGM) \
            .order_by(desc(FieldAnalysis.last_data_request_date)) \
            .limit(MAX_SEGM_INPUT).all()

        if not analyses:
            print(f"[ERROR] No valid data found for location {location_id}")
            return

        if len(analyses) < MIN_SEGM_INPUTS:
            print(f"[WARNING] Not enough data: {len(analyses)}/{MIN_SEGM_INPUTS} required")
            return

        analyses = sorted(analyses, key=lambda a: a.last_data_request_date)

        print(f"[DEBUG] Found {len(analyses)} valid analyses for location {location_id}")

        all_tensors = []
        all_timestamps = []
        original_h, original_w = None, None
        mask_coords = None
        transform = None

        MODEL_HEIGHT, MODEL_WIDTH = 128, 128

        first_nc = os.path.join(DATA_DIR, os.path.basename(analyses[0].nc_filename))
        print(f"[DEBUG] Loading reference file: {first_nc}")

        with xr.open_dataset(first_nc) as ds:
            if hasattr(ds, 'rio') and ds.rio.crs:
                source_crs = ds.rio.crs
            elif 'spatial_ref' in ds.variables:
                source_crs = ds.spatial_ref.attrs.get('crs_wkt')
            else:
                print("[WARNING] Could not detect CRS, falling back to EPSG:32634")
                source_crs = "EPSG:32634"

            if not source_crs:
                raise ValueError("source_crs is None. Check NetCDF metadata.")

            data_var = None
            print(f"[DEBUG] Dataset variables: {list(ds.data_vars)}")
            for var_name in ds.data_vars:
                candidate = ds[var_name]
                print(f"[DEBUG]   var '{var_name}': dims={candidate.dims}, shape={candidate.shape}")
                if 'x' in candidate.dims and 'y' in candidate.dims:
                    data_var = candidate
                    print(f"[DEBUG] Selected spatial variable: '{var_name}'")
                    break

            if data_var is None:
                raise ValueError(
                    f"No spatial variable with x/y dims found in {first_nc}. "
                    f"Available vars: {list(ds.data_vars)}"
                )

            print(f"[DEBUG] Reference dataset shape: {data_var.shape}")
            print(f"[DEBUG] Reference dataset dims: {data_var.dims}")

            res_x = float(ds.x[1] - ds.x[0])
            res_y = float(ds.y[1] - ds.y[0])
            transform = affine.Affine.translation(float(ds.x[0]), float(ds.y[0])) * \
                        affine.Affine.scale(res_x, res_y)

            y_dim = [d for d in data_var.dims if d != 'band' and d != 'x'][0]
            x_dim = [d for d in data_var.dims if d != 'band' and d != 'y'][0]
            mask_coords = {d: data_var.coords[d].values for d in data_var.dims if d != 'band'}
            original_h = len(data_var.coords[y_dim])
            original_w = len(data_var.coords[x_dim])

            print(f"[DEBUG] Original spatial dimensions: H={original_h}, W={original_w}")

        transformer = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)

        for idx, an in enumerate(analyses):
            nc_path = os.path.join(DATA_DIR, os.path.basename(an.nc_filename))
            print(f"[DEBUG] Processing temporal observation {idx + 1}/{len(analyses)}: {nc_path}")

            with xr.open_dataset(nc_path) as ds:
                data_var = None
                for var_name in ds.data_vars:
                    candidate = ds[var_name]
                    if 'x' in candidate.dims and 'y' in candidate.dims:
                        data_var = candidate
                        break
                if data_var is None:
                    raise ValueError(f"No spatial variable found in {nc_path}. Vars: {list(ds.data_vars)}")

                if 'band' in data_var.dims:
                    data = data_var.values
                    if data.shape[0] != len(data_var.coords['band']):
                        data = np.moveaxis(data, -1, 0)
                else:
                    raise ValueError(f"Expected 'band' dimension in {an.nc_filename}")

                print(f"[DEBUG] Raw data shape: {data.shape}")

                ten_channels = data[:10].astype(np.float32)  # (10, H, W)

                print(f"[DEBUG] 10-channel data shape: {ten_channels.shape}")
                print(f"[DEBUG] Raw DN range: [{ten_channels.min():.1f}, {ten_channels.max():.1f}]")

                ten_channels = np.nan_to_num(ten_channels, nan=0.0, posinf=0.0, neginf=0.0)

                img_tensor = torch.from_numpy(ten_channels).float()  # (10, H, W)

                img_tensor = img_tensor.unsqueeze(0)  # (1, 10, H, W)
                img_tensor = (img_tensor - PASTIS_MEAN) / PASTIS_STD
                img_tensor = img_tensor.squeeze(0)    # (10, H, W)

                print(f"[DEBUG] Normalized range: [{img_tensor.min():.4f}, {img_tensor.max():.4f}]")

                current_h, current_w = img_tensor.shape[-2], img_tensor.shape[-1]
                if (current_h, current_w) != (MODEL_HEIGHT, MODEL_WIDTH):
                    print(f"[DEBUG] Resizing from ({current_h}, {current_w}) to ({MODEL_HEIGHT}, {MODEL_WIDTH})")
                    img_tensor = F.interpolate(
                        img_tensor.unsqueeze(0),
                        size=(MODEL_HEIGHT, MODEL_WIDTH),
                        mode='bilinear',
                        align_corners=False
                    ).squeeze(0)

                print(f"[DEBUG] Final tensor shape: {img_tensor.shape}")
                all_tensors.append(img_tensor)

                all_timestamps.append(an.last_data_request_date.timestamp())

        num_found = len(all_tensors)
        print(f"[DEBUG] Total tensors collected: {num_found}/{MAX_SEGM_INPUT}")

        if num_found < MAX_SEGM_INPUT:
            pad_count = MAX_SEGM_INPUT - num_found
            print(f"[DEBUG] Padding with {pad_count} zero tensors (neutral after norm)")
            zero_tensor = torch.zeros_like(all_tensors[0])
            all_tensors.extend([zero_tensor] * pad_count)

            all_timestamps.extend([all_timestamps[-1]] * pad_count)

        print(f"[DEBUG] Stacking {len(all_tensors)} tensors...")
        input_tensor = torch.stack(all_tensors, dim=0)       # (T, 10, H, W)
        input_tensor = input_tensor.unsqueeze(0)             # (1, T, 10, H, W)

        print(f"[DEBUG] Final input tensor shape: {input_tensor.shape}")

        assert input_tensor.shape == (1, MAX_SEGM_INPUT, 10, MODEL_HEIGHT, MODEL_WIDTH), \
            f"Unexpected input shape: {input_tensor.shape}"

        ts = torch.tensor(all_timestamps, dtype=torch.float32)
        ts_min, ts_max = ts.min(), ts.max()
        if ts_max - ts_min > 1e-5:
            ts_norm = (ts - ts_min) / (ts_max - ts_min)
        else:
            ts_norm = torch.zeros_like(ts)
        batch_dates = ts_norm.unsqueeze(0)  # (1, T)
        print(f"[DEBUG] Batch dates shape: {batch_dates.shape}, range: [{ts_norm.min():.3f}, {ts_norm.max():.3f}]")

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
            probs = torch.sigmoid(logits).cpu().numpy()

            if probs.ndim == 4:
                probs = probs[0, 0]
            elif probs.ndim == 3:
                probs = probs[0]

            print(f"[DEBUG] Spatial probabilities shape: {probs.shape}")
            print(f"[DEBUG] Probability range: [{probs.min():.4f}, {probs.max():.4f}]")

            if probs.shape != (original_h, original_w):
                print(f"[DEBUG] Upsampling from {probs.shape} to ({original_h}, {original_w})")
                probs = F.interpolate(
                    torch.from_numpy(probs).float().unsqueeze(0).unsqueeze(0),
                    size=(original_h, original_w),
                    mode='bilinear',
                    align_corners=False
                ).squeeze(0).squeeze(0).numpy()

            print(f"[DEBUG] Final probabilities shape: {probs.shape}")

        binary_mask = (probs > 0.5).astype(np.uint8)
        labeled_mask, num_features = label(binary_mask)
        print(f"[DEBUG] Segmentation complete: {num_features} features detected")

        segm_mask_filename = f"mask_loc_{location_id}_{int(datetime.now().timestamp())}.nc"
        if not os.path.exists(SEGM_DIR):
            os.makedirs(SEGM_DIR)

        mask_da = xr.DataArray(
            labeled_mask.astype(np.int32),
            coords=mask_coords,
            dims=("y", "x"),
            name="segmentation_mask"
        )
        segm_mask_path = os.path.join(SEGM_DIR, segm_mask_filename)
        mask_da.to_netcdf(segm_mask_path)
        print(f"[DEBUG] Physical mask file saved to {segm_mask_path}")

        mask_shapes = features.shapes(
            labeled_mask.astype('int32'),
            mask=(labeled_mask > 0),
            transform=transform
        )

        db.query(FieldUnit).filter(FieldUnit.location_id == location_id).delete()
        db.flush()
        db.execute(
            text("SELECT setval(pg_get_serial_sequence('field_units', 'id'), "
                 "COALESCE((SELECT MAX(id) FROM field_units), 0) + 1, false)")
        )

        saved_count = 0
        skipped_count = 0

        for geom, value in mask_shapes:
            s = shape(geom)
            s_wgs84 = shapely_transform(transformer.transform, s)

            if s_wgs84.geom_type == 'Polygon':
                s_wgs84 = MultiPolygon([s_wgs84])

            validation = validate_field_shape(s_wgs84)
            if not validation["valid"]:
                print(f"[DEBUG] Skipping Field {int(value)}: {validation['error']}")
                skipped_count += 1
                continue

            print(f"[DEBUG] Field {int(value)} passed validation: {validation['area_ha']} ha")

            db_geom = f"SRID=4326;{s_wgs84.wkt}"
            db.add(FieldUnit(
                location_id=location_id,
                geometry=db_geom,
                label=f"Field {int(value)}",
                status="active",
                source="UTAE segm",
                field_type=FieldType.crop
            ))
            saved_count += 1

        print(f"[DEBUG] Fields saved: {saved_count}, skipped (invalid): {skipped_count}")

        location.last_segm_mask_url = segm_mask_filename
        location.segmentation_status = True
        db.commit()

        print(f"[INFO] Segmentation successful: {saved_count}/{num_features} fields saved for location {location_id}")

    except Exception as e:
        db.rollback()
        print(f"[CRITICAL] Segmentation failed: {str(e)}")
        import traceback
        traceback.print_exc()

        loc = db.query(UserLocation).filter(UserLocation.id == location_id).first()
        if loc:
            loc.segmentation_status = False
            db.commit()