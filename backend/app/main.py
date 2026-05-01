# =========================
# Imports
# =========================
import os
import numpy as np
import datetime

from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy.orm import Session

from apscheduler.schedulers.background import BackgroundScheduler
from pystac_client import Client

import xarray as xr
import rioxarray
from rasterio.enums import Resampling

from app.api.endpoints import router as field_router, analyzer, validate_pending_analyses
from app.core.database import (
    UserDB, UserCreate, UserLocation, FieldAnalysis,
    get_db, SessionLocal, Base, engine
)
from app.services.segmentation import perform_segmentation_and_save
from app.services.weather_service import fetch_and_save_weather
# =========================
# Config
# =========================
Base.metadata.create_all(bind=engine)

REQUIRED_BANDS = ["blue", "green", "red", "nir", "swir16"]
STORAGE_PATH = os.path.join("data", "storage")

DATA_DIR = os.path.join(STORAGE_PATH, "data")
MASK_DIR = os.path.join(STORAGE_PATH, "masks")
SEGM_DIR = os.path.join(STORAGE_PATH, "segmentation")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MASK_DIR, exist_ok=True)
os.makedirs(SEGM_DIR, exist_ok=True)

# =========================
# App Initialization
# =========================
app = FastAPI(title="SmartCropMonitor API", version="1.0.0")
router = APIRouter()

# =========================
# Middleware
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Routers
# =========================
app.include_router(field_router, prefix="/api/v1", tags=["Field Analysis"])

# =========================
# Health / Debug Endpoints
# =========================
@app.get("/", tags=["Health"])
async def health_check():
    return {
        "status": "online",
        "model": "UNet Attention",
        "random_seed": 28
    }


@app.get("/analyze-test", tags=["Debug"])
async def analyze_test_file(filename: str = "AT_10186_S2_10m_256.nc"):
    file_path = f"./data/storage/{filename}"

    try:
        data = analyzer.run_analysis(file_path)

        return {
            "file": filename,
            "fields_found": len(data),
            "analysis": data,
            "backend": "python + haskell"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/plot-data/{filename}")
async def get_plot_data(
    filename: str,
    mode: str = "heatmap",   # heatmap | raw
    filter: str = "none"     # none | ndvi | log
):
    file_path = os.path.join(STORAGE_PATH, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with xr.open_dataset(file_path) as ds:

            if len(ds.data_vars) == 0:
                return {"ok": False, "error": "no_data_vars"}

            var_name = list(ds.data_vars)[0]
            da = ds[var_name]

            if "band" in da.coords:
                try:
                    da = da.sel(band="red")
                except Exception:
                    da = da.isel(band=0)

            data = np.asarray(da.values)

            # -------------------------
            # scalar protection
            # -------------------------
            if data.ndim == 0:
                return {"ok": False, "error": "scalar_raster"}

            # -------------------------
            # normalize dimensions
            # -------------------------
            if data.ndim == 1:
                data = data.reshape(1, -1)

            elif data.ndim >= 3:
                data = data[0]

            if data.size == 0:
                return {"ok": False, "error": "empty_raster"}

            data = np.nan_to_num(data).astype(np.float32)

            # =========================
            # FILTERS
            # =========================

            if filter == "log":
                data = np.log1p(np.maximum(data, 0))

            elif filter == "ndvi":
                # placeholder NDVI-like transform (safe fallback)
                data = data / (np.max(data) + 1e-6)

            # =========================
            # RAW MODE
            # =========================
            if mode == "raw":
                return {
                    "ok": True,
                    "mode": "raw",
                    "z": data.tolist()
                }

            # =========================
            # HEATMAP MODE
            # =========================
            dmin, dmax = float(np.min(data)), float(np.max(data))

            if dmax > dmin:
                data = (data - dmin) / (dmax - dmin)
            else:
                data = np.zeros_like(data)

            return {
                "ok": True,
                "mode": "heatmap",
                "filter": filter,
                "z": data.tolist()
            }

    except Exception as e:
        return {
            "ok": False,
            "error": "backend_exception",
            "message": str(e)
        }


# =========================
# Auth Endpoints
# =========================
@router.post("/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    # check existing user
    db_user = db.query(UserDB).filter(UserDB.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    # create user
    new_user = UserDB(username=user.username, hashed_password=user.password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"status": "user created", "username": new_user.username}


@router.post("/login")
async def login(user: UserCreate, db: Session = Depends(get_db)):
    # validate credentials
    db_user = db.query(UserDB).filter(UserDB.username == user.username).first()
    if not db_user or db_user.hashed_password != user.password:
        raise HTTPException(status_code=400, detail="Invalid username or password")

    return {"status": "login success", "user_id": db_user.id}

# =========================
# Data Processing Service
# =========================
def download_sentinel_data(db: Session):
    client = Client.open("https://earth-search.aws.element84.com/v1")
    locations = db.query(UserLocation).all()

    end_date = datetime.datetime.now()
    start_date = end_date - datetime.timedelta(days=30)
    date_range = f"{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    for loc in locations:
        try:
            print(f"[DEBUG] Processing location_id={loc.id}")

            search = client.search(
                collections=["sentinel-2-l2a"],
                bbox=[loc.lon - 0.05, loc.lat - 0.05, loc.lon + 0.05, loc.lat + 0.05],
                datetime=date_range,
                max_items=1,
                sortby=[{"field": "properties.datetime", "direction": "desc"}]
            )

            items = list(search.items())
            if not items:
                print(f"[DEBUG] No items found for loc={loc.id}")
                continue

            latest = items[0]
            dt_str = latest.properties["datetime"].replace("Z", "+00:00")
            timestamp = datetime.datetime.fromisoformat(dt_str)

            base_name = f"user_{loc.user_id}_loc_{loc.id}_{timestamp.strftime('%Y%m%d')}"
            nc_filename = f"{base_name}.nc"
            mask_filename = f"mask_{base_name}.nc"

            file_path = os.path.join(DATA_DIR, nc_filename)
            mask_path = os.path.join(MASK_DIR, mask_filename)

            if os.path.exists(file_path):
                print(f"[DEBUG] Skipping: {nc_filename} already exists.")
                continue

            scl_final = None
            asset_scl = latest.assets.get("scl")
            if asset_scl:
                try:
                    scl_da = rioxarray.open_rasterio(asset_scl.href, chunks=True)
                    scl_clipped = scl_da.rio.clip_box(
                        minx=loc.lon - 0.02, miny=loc.lat - 0.02,
                        maxx=loc.lon + 0.02, maxy=loc.lat + 0.02, crs="EPSG:4326"
                    )
                    scl_final = scl_clipped.rio.reproject(
                        scl_clipped.rio.crs, shape=(256, 256), resampling=0
                    ).squeeze().drop_vars(["band", "spatial_ref"], errors="ignore")
                except Exception as e:
                    print(f"[ERROR] SCL processing failed: {e}")

            datasets = []

            for band_name in REQUIRED_BANDS:
                asset = latest.assets.get(band_name)
                if not asset: continue

                da = rioxarray.open_rasterio(asset.href, chunks=True)

                try:

                    clipped = da.rio.clip_box(
                        minx=loc.lon - 0.02,
                        miny=loc.lat - 0.02,
                        maxx=loc.lon + 0.02,
                        maxy=loc.lat + 0.02,
                        crs="EPSG:4326"
                    )

                    if not datasets:
                        reference_da = clipped
                        final_da = clipped
                    else:
                        final_da = clipped.rio.reproject_match(reference_da)

                    final_da = final_da.squeeze().drop_vars(["band", "spatial_ref"], errors="ignore")
                    datasets.append(final_da)

                except Exception as e:
                    print(f"[ERROR] Band {band_name} failed: {e}")
                    continue

            if len(datasets) == len(REQUIRED_BANDS):
                ds = xr.concat(datasets, dim="band")
                ds = ds.assign_coords(band=REQUIRED_BANDS)

                ds.to_netcdf(file_path)

                if scl_final is not None:
                    scl_final.to_netcdf(mask_path)

                new_entry = FieldAnalysis(
                    location_id=loc.id,
                    nc_filename=nc_filename,
                    mask_filename=mask_filename if scl_final is not None else None,
                    last_data_request_date=timestamp
                )
                db.add(new_entry)
                db.commit()
                print(f"[INFO] Successfully saved NC: {nc_filename}")
                print("[INFO] Starting post-download validation...")
                validate_pending_analyses(db)
            else:
                print(f"[DEBUG] Incomplete bands for loc={loc.id}. Found {len(datasets)}/{len(REQUIRED_BANDS)}")

        except Exception as e:
            print(f"[CRITICAL] Failed loc {loc.id}: {e}")
            db.rollback()

# =========================
# Data Endpoints
# =========================
@router.get("/user/files", tags=["History"])
async def get_user_files(user_id: int, db: Session = Depends(get_db)):
    history = (
        db.query(FieldAnalysis)
        .join(UserLocation)
        .filter(UserLocation.user_id == user_id)
        .all()
    )

    return [
        {
            "id": h.id,
            "location": h.location.label,
            "filename": h.nc_filename,
            "date": h.last_data_request_date
        }
        for h in history
    ]


@router.post("/sync-manual", tags=["Data"])
async def manual_sync(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(full_sync_process, db)
    return {"status": "sync started"}

def full_sync_process(db: Session):
    download_sentinel_data(db)
    run_full_data_cycle(db)


def run_full_data_cycle(db: Session):
    print("[INFO] Starting data download cycle...")

    all_locations = db.query(UserLocation).all()
    for loc in all_locations:
        print(f"[PROCESS] Fetching weather for: {loc.label}")
        fetch_and_save_weather(db, loc)

    pending_segmentation = (
        db.query(FieldAnalysis)
        .join(UserLocation)
        .filter(UserLocation.segmentation_status == None)
        .all()
    )

    if not pending_segmentation:
        print("[INFO] No locations pending segmentation.")
        return

    print(f"[INFO] Found {len(pending_segmentation)} analysis records for segmentation.")

    for analysis in pending_segmentation:
        try:
            print(f"[PROCESS] Segmenting location ID: {analysis.location_id} (Analysis ID: {analysis.id})")

            perform_segmentation_and_save(analysis.id, db, analyzer)

        except Exception as e:
            print(f"[ERROR] Failed to segment analysis {analysis.id}: {e}")
            loc = db.query(UserLocation).filter(UserLocation.id == analysis.location_id).first()
            if loc:
                loc.segmentation_status = False
                db.commit()

# =========================
# Attach Router
# =========================
app.include_router(router, tags=["General", "Authentication"])

# =========================
# Scheduler
# =========================
scheduler = BackgroundScheduler()

def scheduled_update():
    db = SessionLocal()
    try:
        run_full_data_cycle(db)
        download_sentinel_data(db)
    finally:
        db.close()

scheduler.add_job(scheduled_update, "cron", hour=3, minute=0)
scheduler.start()