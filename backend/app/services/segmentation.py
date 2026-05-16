import os
import torch
import torch.nn.functional as F
import numpy as np
import xarray as xr
import affine
import base64
import io
from PIL import Image
from pyproj import Transformer
from datetime import datetime
from app.models.uconvltc import AgriculturalSegmentationModel
from scipy.ndimage import label
from shapely.geometry import shape, MultiPolygon, mapping
from shapely.ops import transform as shapely_transform
from rasterio import features
from sqlalchemy import desc, text
from sqlalchemy.orm import Session
from app.core.schemas import FieldType
from app.core.database import FieldAnalysis, FieldUnit, UserLocation
from app.core.config import SEGM_DIR, DATA_DIR, MAX_SEGM_INPUT, MIN_SEGM_INPUTS, QUALITY_THRESHOLD_SEGM, TEMP_MODEL_WEIGHTS
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

RGB_INDICES = (2, 1, 0)

SOURCE_LABEL = "U-ConvLTC segm"


def _extract_rgb_preview(nc_path: str, target_size: int = 512) -> str | None:
    try:
        with xr.open_dataset(nc_path) as ds:
            data_var = None
            for var_name in ds.data_vars:
                candidate = ds[var_name]
                if 'x' in candidate.dims and 'y' in candidate.dims:
                    data_var = candidate
                    break

            if data_var is None:
                return None

            data = data_var.values
            if data.shape[0] != len(data_var.coords.get('band', [])):
                data = np.moveaxis(data, -1, 0)

            if data.shape[0] < 3:
                return None

            r = data[RGB_INDICES[0]].astype(np.float32)
            g = data[RGB_INDICES[1]].astype(np.float32)
            b = data[RGB_INDICES[2]].astype(np.float32)

            def normalise(band: np.ndarray) -> np.ndarray:
                p2, p98 = np.percentile(band[np.isfinite(band)], (2, 98))
                band = np.clip(band, p2, p98)
                if p98 > p2:
                    band = (band - p2) / (p98 - p2)
                else:
                    band = np.zeros_like(band)
                return (band * 255).astype(np.uint8)

            rgb = np.stack([normalise(r), normalise(g), normalise(b)], axis=-1)
            img = Image.fromarray(rgb, mode='RGB')

            w, h = img.size
            scale = target_size / max(w, h)
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format='PNG', optimize=True)
            return base64.b64encode(buf.getvalue()).decode('utf-8')

    except Exception as e:
        print(f"[WARNING] RGB preview failed: {e}")
        return None


def _run_segmentation_inference(
        location_id: int,
        db: Session
) -> dict:
    location = db.query(UserLocation).filter(UserLocation.id == location_id).first()
    if not location:
        raise ValueError(f"Location {location_id} not found")

    analyses = db.query(FieldAnalysis) \
        .filter(FieldAnalysis.location_id == location_id) \
        .filter(FieldAnalysis.is_valid >= QUALITY_THRESHOLD_SEGM) \
        .order_by(desc(FieldAnalysis.last_data_request_date)) \
        .limit(MAX_SEGM_INPUT).all()

    if not analyses:
        raise ValueError(f"No valid data found for location {location_id}")

    if len(analyses) < MIN_SEGM_INPUTS:
        raise ValueError(f"Not enough data: {len(analyses)}/{MIN_SEGM_INPUTS} required")

    analyses = sorted(analyses, key=lambda a: a.last_data_request_date)

    first_nc = os.path.join(DATA_DIR, os.path.basename(analyses[0].nc_filename))
    latest_nc = os.path.join(DATA_DIR, os.path.basename(analyses[-1].nc_filename))

    all_tensors = []
    all_timestamps = []
    original_h, original_w = None, None
    mask_coords = None
    transform = None
    source_crs = None

    TILE_SIZE = 128
    TILE_OVERLAP = 32

    with xr.open_dataset(first_nc) as ds:
        if hasattr(ds, 'rio') and ds.rio.crs:
            source_crs = ds.rio.crs
        elif 'spatial_ref' in ds.variables:
            source_crs = ds.spatial_ref.attrs.get('crs_wkt')
        else:
            source_crs = "EPSG:32634"

        if not source_crs:
            raise ValueError("source_crs is None. Check NetCDF metadata.")

        data_var = None
        for var_name in ds.data_vars:
            candidate = ds[var_name]
            if 'x' in candidate.dims and 'y' in candidate.dims:
                data_var = candidate
                break

        if data_var is None:
            raise ValueError(f"No spatial variable found in {first_nc}")

        res_x = float(ds.x[1] - ds.x[0])
        res_y = float(ds.y[1] - ds.y[0])
        transform = affine.Affine.translation(float(ds.x[0]), float(ds.y[0])) * \
                    affine.Affine.scale(res_x, res_y)

        y_dim = [d for d in data_var.dims if d != 'band' and d != 'x'][0]
        x_dim = [d for d in data_var.dims if d != 'band' and d != 'y'][0]
        mask_coords = {d: data_var.coords[d].values for d in data_var.dims if d != 'band'}
        original_h = len(data_var.coords[y_dim])
        original_w = len(data_var.coords[x_dim])

    transformer = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)

    for an in analyses:
        nc_path = os.path.join(DATA_DIR, os.path.basename(an.nc_filename))
        with xr.open_dataset(nc_path) as ds:
            data_var = None
            for var_name in ds.data_vars:
                candidate = ds[var_name]
                if 'x' in candidate.dims and 'y' in candidate.dims:
                    data_var = candidate
                    break
            if data_var is None:
                raise ValueError(f"No spatial variable found in {nc_path}")

            if 'band' in data_var.dims:
                data = data_var.values
                if data.shape[0] != len(data_var.coords['band']):
                    data = np.moveaxis(data, -1, 0)
            else:
                raise ValueError(f"Expected 'band' dimension in {an.nc_filename}")

            ten_channels = data[:10].astype(np.float32)
            ten_channels = np.nan_to_num(ten_channels, nan=0.0, posinf=0.0, neginf=0.0)

            img_tensor = torch.from_numpy(ten_channels).float().unsqueeze(0)
            img_tensor = (img_tensor - PASTIS_MEAN) / PASTIS_STD
            img_tensor = img_tensor.squeeze(0)
            all_tensors.append(img_tensor)
            all_timestamps.append(an.last_data_request_date.timestamp())

    n_real = len(all_tensors)

    if n_real < MAX_SEGM_INPUT:
        pad_count = MAX_SEGM_INPUT - n_real
        last_tensor = all_tensors[-1]
        last_ts = all_timestamps[-1]
        all_tensors.extend([last_tensor] * pad_count)
        all_timestamps.extend([last_ts] * pad_count)

    input_tensor = torch.stack(all_tensors, dim=0).unsqueeze(0)

    ts = torch.tensor(all_timestamps, dtype=torch.float32)
    ts_min, ts_max = ts.min(), ts.max()
    ts_norm = (ts - ts_min) / (ts_max - ts_min) if ts_max - ts_min > 1e-5 else torch.zeros_like(ts)
    batch_dates = ts_norm.unsqueeze(0)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = AgriculturalSegmentationModel(n_channels=10, n_classes=1)

    if not os.path.exists(TEMP_MODEL_WEIGHTS):
        raise ValueError(f"Model weights not found at {TEMP_MODEL_WEIGHTS}")

    try:
        state_dict = torch.load(TEMP_MODEL_WEIGHTS, map_location=device, weights_only=False)
    except Exception:
        from safetensors.torch import load_file
        state_dict = load_file(TEMP_MODEL_WEIGHTS)
    model.load_state_dict(state_dict)
    model.to(device).eval()

    stride = TILE_SIZE - TILE_OVERLAP
    prob_sum = np.zeros((original_h, original_w), dtype=np.float32)
    weight_sum = np.zeros((original_h, original_w), dtype=np.float32)

    hann_1d = np.hanning(TILE_SIZE).astype(np.float32)
    hann_2d = np.outer(hann_1d, hann_1d)

    y_starts = list(range(0, original_h - TILE_SIZE + 1, stride))
    if not y_starts or y_starts[-1] + TILE_SIZE < original_h:
        y_starts.append(max(0, original_h - TILE_SIZE))
    x_starts = list(range(0, original_w - TILE_SIZE + 1, stride))
    if not x_starts or x_starts[-1] + TILE_SIZE < original_w:
        x_starts.append(max(0, original_w - TILE_SIZE))

    with torch.no_grad():
        for y0 in y_starts:
            for x0 in x_starts:
                y1, x1 = y0 + TILE_SIZE, x0 + TILE_SIZE
                tile = input_tensor[:, :, :, y0:y1, x0:x1].to(device)
                output = model(tile, batch_dates.to(device), n_real=n_real)
                logits = output[0] if isinstance(output, tuple) else output
                tile_prob = torch.sigmoid(logits)[0, 0].cpu().numpy()
                prob_sum[y0:y1, x0:x1] += tile_prob * hann_2d
                weight_sum[y0:y1, x0:x1] += hann_2d

    probs = np.where(weight_sum > 0, prob_sum / weight_sum, 0.0)
    binary_mask = (probs > 0.5).astype(np.uint8)
    labeled_mask, num_features = label(binary_mask)

    print(f"[INFO] Segmentation inference complete: {num_features} raw features")

    mask_shapes = features.shapes(
        labeled_mask.astype('int32'),
        mask=(labeled_mask > 0),
        transform=transform
    )

    detected_fields = []
    for geom, value in mask_shapes:
        s = shape(geom)
        s_wgs84 = shapely_transform(transformer.transform, s)

        if s_wgs84.geom_type == 'Polygon':
            s_wgs84 = MultiPolygon([s_wgs84])

        validation = validate_field_shape(s_wgs84)

        detected_fields.append({
            "id": int(value),
            "label": f"Field {int(value)}",
            "geometry": mapping(s_wgs84),
            "area_ha": validation.get("area_ha"),
            "valid": validation["valid"],
            "error": validation.get("error"),
        })

    preview_b64 = _extract_rgb_preview(latest_nc)

    return {
        "fields": detected_fields,
        "preview_b64": preview_b64,
        "num_detected": num_features,
    }


def run_segmentation_preview(location_id: int, db: Session) -> dict:
    return _run_segmentation_inference(location_id, db)


def confirm_segmentation_fields(
        location_id: int,
        selected_field_ids: list[int],
        fields_data: list[dict],
        db: Session
) -> dict:
    from shapely.geometry import shape as shapely_shape
    from decimal import Decimal

    selected = {f["id"]: f for f in fields_data if f["id"] in selected_field_ids}

    if not selected:
        raise ValueError("No matching fields found for the provided IDs")

    db.query(FieldUnit).filter(
        FieldUnit.location_id == location_id,
        FieldUnit.source == SOURCE_LABEL
    ).delete()
    db.flush()
    db.execute(
        text(
            "SELECT setval(pg_get_serial_sequence('field_units', 'id'), "
            "COALESCE((SELECT MAX(id) FROM field_units), 0) + 1, false)"
        )
    )

    saved = []
    from geoalchemy2.shape import from_shape

    for fid, f in selected.items():
        geom = shapely_shape(f["geometry"])
        geometry_db = from_shape(geom, srid=4326)
        area_ha = f.get("area_ha") or 0.0

        field = FieldUnit(
            location_id=location_id,
            geometry=geometry_db,
            label=f["label"],
            status="active",
            source=SOURCE_LABEL,
            field_type=FieldType.crop,
            area_ha=Decimal(str(round(float(area_ha), 2))),
        )
        db.add(field)
        saved.append(fid)

    location = db.query(UserLocation).filter(UserLocation.id == location_id).first()
    if location:
        location.segmentation_status = True

    db.commit()
    print(f"[INFO] Confirmed and saved {len(saved)} fields for location {location_id}")
    return {"saved_count": len(saved), "field_ids": saved}


def perform_temp_segmentation_and_save(location_id: int, db: Session):
    try:
        result = _run_segmentation_inference(location_id, db)
        fields_data = result["fields"]
        valid_ids = [f["id"] for f in fields_data if f["valid"]]

        confirm_segmentation_fields(location_id, valid_ids, fields_data, db)

        location = db.query(UserLocation).filter(UserLocation.id == location_id).first()
        if location:
            location.segmentation_status = True
            db.commit()

        print(f"[INFO] Auto-save segmentation: {len(valid_ids)}/{result['num_detected']} fields saved")

    except Exception as e:
        db.rollback()
        print(f"[CRITICAL] Segmentation failed: {str(e)}")
        import traceback
        traceback.print_exc()

        loc = db.query(UserLocation).filter(UserLocation.id == location_id).first()
        if loc:
            loc.segmentation_status = False
            db.commit()