import os
import httpx

STORAGE_PATH = os.path.join("data", "storage")

DATA_DIR = os.path.join(STORAGE_PATH, "data")
MASK_DIR = os.path.join(STORAGE_PATH, "masks")
SEGM_DIR = os.path.join(STORAGE_PATH, "segmentation")
GRID_DIR = os.path.join(STORAGE_PATH, "grid")
VIS_DIR = os.path.join(STORAGE_PATH, "visual")
NDVI_DIR = os.path.join(STORAGE_PATH, "ndvi")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MASK_DIR, exist_ok=True)
os.makedirs(SEGM_DIR, exist_ok=True)
os.makedirs(GRID_DIR, exist_ok=True)
os.makedirs(VIS_DIR, exist_ok=True)
os.makedirs(NDVI_DIR, exist_ok=True)

API_TITLE = "SmartCropMonitor API"
API_VERSION = "0.1.10"

REQUIRED_BANDS = [
    "blue", "green", "red", "nir",
    "rededge1", "rededge2", "rededge3",
    "nir08",
    "swir16", "swir22"
]

AUX_LAYERS = ["scl", "aot", "wvp"]

VISUAL_ASSET = "visual"
TARGET_BANDS = ["blue", "green", "red", "nir"]

QUALITY_THRESHOLD = 1
MIN_DIM = 128

STAC_API_URL = "https://earth-search.aws.element84.com/v1"
SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL")
HASKELL_URL = os.getenv("HASKELL_SERVICE_URL", "http://localhost:8081/field-stats")

MODEL_WEIGHTS = "app/models/unet_ai4boundaries.pth"
TEMP_MODEL_WEIGHTS = "app/models/utae_pastis.pth"
MODEL_PATH = os.path.join("app", "models", "unet_mitb2_ai4boundaries.pth")
TEMP_MODEL_PATH = os.path.join("app", "models", "utae_pastis.pth")
RANDOM_SEED = 28
MAX_SEGM_INPUT = 5

MIN_RECORDS_7D = 24 * 7 * 0.8
WEATHER_API_KEY = "62fac38da0cb452e42ea7171b9586e60"

WEBHOOK_URL = os.getenv("WEBHOOK_URL")
HASKELL_SERVICE_URL = HASKELL_URL
