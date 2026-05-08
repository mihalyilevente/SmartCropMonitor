import os
import time
import numpy as np
import xarray as xr
import requests
from sqlalchemy.orm import Session
from app.core.database import FieldAnalysis
from app.core.config import HASKELL_SERVICE_URL, MASK_DIR, WEBHOOK_URL
from app.monitoring.alerting import AlertService, format_alert


alert_service = AlertService(webhook_url=WEBHOOK_URL)

def perform_haskell_validation(mask_path, threshold=0.3):
    try:
        with xr.open_dataset(mask_path) as mds:
            scl_values = (
                mds.to_array()
                .values
                .flatten()
                .astype(float)
            )

            scl_values = [
                int(v) for v in scl_values
                if v is not None and not np.isnan(v)
            ]

        payload = {
            "config": 2,
            "scl_values": scl_values,
            "threshold": threshold
        }

        for _ in range(3):
            try:
                response = requests.post(
                    HASKELL_SERVICE_URL,
                    json=payload,
                    timeout=10
                )
                if response.status_code == 200:
                    return response.json()
            except requests.RequestException:
                time.sleep(1)

        alert_service.send(
            key="haskell_validation_timeout",
            message=format_alert("HASKELL_UNREACHABLE", f"Validation service failed for mask: {mask_path}")
        )
        return None

    except Exception as e:
        print(f"[ERROR] Haskell communication failed: {e}")
        return None


def validate_pending_analyses(db: Session):
    pending_list = db.query(FieldAnalysis).filter(FieldAnalysis.is_valid == None).all()

    if not pending_list:
        print("[INFO] No pending analyses to validate.")
        return

    print(f"[INFO] Found {len(pending_list)} records for validation.")

    for analysis in pending_list:
        mask_path = os.path.join(MASK_DIR, analysis.mask_filename) if analysis.mask_filename else None

        if not mask_path or not os.path.exists(mask_path):
            print(f"[WARN] Mask file missing for analysis_id={analysis.id}. Skipping.")
            continue

        result = perform_haskell_validation(mask_path, threshold=0.3)

        if result:
            is_valid_bool = result.get('is_valid')
            analysis.is_valid = 1.0 if is_valid_bool is True else 0.0
            analysis.quality_report = result.get('quality_report')

            if analysis.results_json is None:
                analysis.results_json = {}
            analysis.results_json['cloud_ratio'] = result.get('cloud_ratio')

            db.commit()
            print(f"[INFO] Analysis {analysis.id} validated. Result: {analysis.is_valid}")
        else:
            print(f"[ERROR] Haskell service failed for analysis_id={analysis.id}")

