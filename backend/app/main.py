# =========================
# Imports
# =========================
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import config
from app.core.database import engine, Base
from app.api.endpoints.field_router import router as field_router
from app.api.endpoints.auth_router import router as auth_router
from app.api.endpoints.data_router import router as data_router
from app.api.endpoints.weather_router import router as weather_router
from app.tasks.scheduler import scheduler

# =========================
# Database Initialization
# =========================

Base.metadata.create_all(bind=engine)

# =========================
# App Initialization
# =========================
app = FastAPI(
    title=config.API_TITLE,
    version=config.API_VERSION
)

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
# Lifecycle Events
# =========================
@app.on_event("startup")
def start_tasks():
    if not scheduler.running:
        scheduler.start()
        print(f"[INFO] Background scheduler started (Seed: {config.RANDOM_SEED})")

@app.on_event("shutdown")
def stop_tasks():
    if scheduler.running:
        scheduler.shutdown()
        print("[INFO] Background scheduler shut down.")

# =========================
# Routers Connection
# =========================

app.include_router(field_router, prefix="/api/v1", tags=["Field Analysis"])

app.include_router(data_router, prefix="/api/v1", tags=["Data & Visualization"])

app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])

app.include_router(auth_router, prefix="/api/v1/weather", tags=["Weather"])

# =========================
# Health Check
# =========================
@app.get("/", tags=["Health"])
async def health_check():
    return {
        "status": "online",
        "app": config.API_TITLE,
        "version": config.API_VERSION
    }