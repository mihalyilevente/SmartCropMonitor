# =========================
# Imports
# =========================
import os
import datetime

from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy.orm import Session

from apscheduler.schedulers.background import BackgroundScheduler
from pystac_client import Client

import xarray as xr
import rioxarray

from app.api.endpoints import router as field_router, analyzer
from app.core.database import (
    UserDB, UserCreate, UserLocation, FieldAnalysis,
    get_db, SessionLocal, Base, engine
)

# =========================
# Config
# =========================
Base.metadata.create_all(bind=engine)

REQUIRED_BANDS = ["blue", "green", "red", "nir", "swir16"]
STORAGE_PATH = os.path.join("data", "storage")

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
async def analyze_test_file(filename: str = "AT_10039_S2_10m_256.nc"):
    file_path = f"./data/storage/{filename}"

    try:
        data = analyzer.run_analysis(file_path)
        return {
            "file": filename,
            "fields_found": len(data),
            "analysis": data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

    date_range = (
        f"{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}/"
        f"{end_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    )

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
                print(f"[DEBUG] No items found for location_id={loc.id}")
                continue

            latest = items[0]

            dt_str = latest.properties["datetime"].replace("Z", "+00:00")
            timestamp = datetime.datetime.fromisoformat(dt_str)

            file_name = f"user_{loc.user_id}_loc_{loc.id}_{timestamp.strftime('%Y%m%d')}.nc"
            file_path = os.path.join(STORAGE_PATH, file_name)

            if os.path.exists(file_path):
                print(f"[DEBUG] File already exists: {file_name}")
                continue

            datasets = []

            for band_name in REQUIRED_BANDS:
                asset = latest.assets.get(band_name)
                if not asset:
                    print(f"[DEBUG] Missing band: {band_name}")
                    continue

                da = rioxarray.open_rasterio(asset.href, chunks=True)

                try:
                    clipped = da.rio.clip_box(
                        minx=loc.lon - 0.01,
                        miny=loc.lat - 0.01,
                        maxx=loc.lon + 0.01,
                        maxy=loc.lat + 0.01,
                        crs="EPSG:4326"
                    )

                    datasets.append(clipped.squeeze().drop_vars("band"))

                except Exception as e:
                    print(f"[ERROR] Clip failed for band={band_name}: {e}")
                    continue

            if len(datasets) != len(REQUIRED_BANDS):
                print(f"[DEBUG] Incomplete band set for location_id={loc.id}")
                continue

            ds = xr.concat(datasets, dim="band")
            ds = ds.assign_coords(band=REQUIRED_BANDS)
            ds.to_netcdf(file_path)

            new_entry = FieldAnalysis(
                location_id=loc.id,
                nc_filename=file_name,
                analysis_date=timestamp
            )

            db.add(new_entry)
            db.commit()

            print(f"[INFO] Saved file: {file_name}")

        except Exception as e:
            print(f"[CRITICAL] Location failed id={loc.id}: {e}")
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
            "date": h.analysis_date
        }
        for h in history
    ]


@router.post("/sync-manual", tags=["Data"])
async def manual_sync(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(download_sentinel_data, db)
    return {"status": "sync started"}

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
        download_sentinel_data(db)
    finally:
        db.close()

scheduler.add_job(scheduled_update, "cron", hour=3, minute=0)
scheduler.start()