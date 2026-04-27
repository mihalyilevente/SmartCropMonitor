from fastapi import APIRouter, HTTPException
from app.services.field_analysis import FieldAnalyzer
import os

router = APIRouter()

MODEL_WEIGHTS = "app/models/unet_ai4boundaries.pth"
analyzer = FieldAnalyzer(model_path=MODEL_WEIGHTS)


@router.get("/analyze-fields/{filename}")
async def analyze_fields(filename: str):
    path = os.path.join("data", "storage", filename)

    if not os.path.exists(path):
        raise HTTPException(
            status_code=404,
            detail=f"No file {filename} in data/storage/"
        )

    try:
        results = analyzer.run_analysis(path)

        return {
            "status": "success",
            "filename": filename,
            "fields_count": len(results),
            "data": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")