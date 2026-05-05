import os
import xarray as xr
import rioxarray
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import desc
from rasterio.enums import Resampling

from app.core.database import FieldAnalysis, UserLocation
from app.core.config import DATA_DIR, MASK_DIR, GRID_DIR


def get_best_master_dataset(db: Session, location_id: int):
    best_record = (
        db.query(FieldAnalysis)
        .filter(FieldAnalysis.location_id == location_id, FieldAnalysis.is_valid == True)
        .order_by(desc(FieldAnalysis.last_data_request_date))
        .first()
    )

    if not best_record:
        best_record = (
            db.query(FieldAnalysis)
            .filter(FieldAnalysis.location_id == location_id)
            .order_by(desc(FieldAnalysis.last_data_request_date))
            .first()
        )

    if not best_record:
        raise FileNotFoundError(f"No records found for location {location_id}")

    file_path = os.path.join(DATA_DIR, best_record.nc_filename)
    ds = xr.open_dataset(file_path).rio.write_crs("EPSG:4326")

    return ds


def process_and_align_nc(db: Session, location_id: int, use_sr: bool = False):
    master_ds = get_best_master_dataset(db, location_id)

    records = db.query(FieldAnalysis).filter(FieldAnalysis.location_id == location_id).all()

    processed_layers = []

    for record in records:
        nc_path = os.path.join(DATA_DIR, record.nc_filename)
        if not os.path.exists(nc_path):
            continue

        ds = xr.open_dataset(nc_path).rio.write_crs("EPSG:4326")

        if record.mask_filename:
            mask_path = os.path.join(MASK_DIR, record.mask_filename)
            if os.path.exists(mask_path):
                scl_ds = xr.open_dataset(mask_path)
                if 'SCL' in scl_ds.data_vars:
                    valid_mask = scl_ds.SCL.isin([4, 5, 6, 7, 11])

                    valid_mask = valid_mask.rio.reproject_match(ds, resampling=Resampling.nearest)
                    ds = ds.where(valid_mask)

        ds_aligned = ds.rio.reproject_match(master_ds, resampling=Resampling.bilinear)

        for var in ds_aligned.data_vars:
            if var in master_ds.data_vars and var != 'SCL':
                m_mean, m_std = master_ds[var].mean().values, master_ds[var].std().values
                c_mean, c_std = ds_aligned[var].mean().values, ds_aligned[var].std().values
                ds_aligned[var] = (ds_aligned[var] - c_mean) * (m_std / (c_std + 1e-6)) + m_mean

        processed_layers.append(ds_aligned)

    if not processed_layers:
        return None

    final_timeseries = xr.concat(processed_layers, dim='time').sortby('time')

    os.makedirs(GRID_DIR, exist_ok=True)
    file_name = f"location_{location_id}_timeseries.nc"
    save_path = os.path.join(GRID_DIR, file_name)

    final_timeseries.to_netcdf(save_path)

    location = db.query(UserLocation).filter(UserLocation.id == location_id).first()
    if location:
        location.last_segm_mask_url = save_path
        db.commit()

    return save_path