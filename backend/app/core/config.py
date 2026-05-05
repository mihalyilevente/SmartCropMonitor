import os

STORAGE_PATH = os.path.join("data", "storage")

DATA_DIR = os.path.join(STORAGE_PATH, "data")
MASK_DIR = os.path.join(STORAGE_PATH, "masks")
SEGM_DIR = os.path.join(STORAGE_PATH, "segmentation")
GRID_DIR = os.path.join(STORAGE_PATH, "grid")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MASK_DIR, exist_ok=True)
os.makedirs(SEGM_DIR, exist_ok=True)
os.makedirs(GRID_DIR, exist_ok=True)

REQUIRED_BANDS = ["blue", "green", "red", "nir", "swir16"]
TARGET_BANDS = ["blue", "green", "red", "nir"]

API_TITLE = "SmartCropMonitor API"
API_VERSION = "0.0.11"

STAC_API_URL = "https://earth-search.aws.element84.com/v1"
SQLALCHEMY_DATABASE_URL = "sqlite:///./users.db"
HASKELL_SERVICE_URL = "http://localhost:8081/field-stats"

MODEL_WEIGHTS = "app/models/unet_ai4boundaries.pth"
MODEL_PATH = os.path.join("app", "models", "unet_mitb2_ai4boundaries.pth")
RANDOM_SEED = 28

MIN_RECORDS_7D = 7 #24 * 7 * 0.8
WEATHER_API_KEY = "62fac38da0cb452e42ea7171b9586e60"