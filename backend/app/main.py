from fastapi import FastAPI, APIRouter, HTTPException, Depends
from app.api.endpoints import router as field_router
from sqlalchemy.orm import Session
from app.core.database import UserDB, UserCreate, get_db
import os
from app.services.field_analysis import FieldAnalyzer
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI(
    title="SmartCropMonitor API",
    description="NDVI",
    version="1.0.0"
)
router = APIRouter()
app.include_router(field_router, prefix="/api/v1", tags=["Field Analysis"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", tags=["Health"])
async def health_check():
    return {
        "status": "online",
        "model": "UNet Attention",
        "random_seed": 28
    }


@app.get("/analyze-test", tags=["Debug"])
async def analyze_test_file(filename: str = "AT_10039_S2_10m_256.nc"):
    from app.api.endpoints import analyzer
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


@router.post("/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    new_user = UserDB(username=user.username, hashed_password=user.password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"status": "user created", "username": new_user.username}


@router.post("/login")
async def login(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.username == user.username).first()
    if not db_user or db_user.hashed_password != user.password:
        raise HTTPException(status_code=400, detail="Invalid username or password")

    return {"status": "login success", "user_id": db_user.id}


app.include_router(router, tags=["Authentication"])