from fastapi import FastAPI, HTTPException
from app.api.endpoints import router as field_router
from app.services.field_analysis import FieldAnalyzer

app = FastAPI(
    title="SmartCropMonitor API",
    description="NDVI",
    version="1.0.0"
)

app.include_router(field_router, prefix="/api/v1", tags=["Field Analysis"])


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