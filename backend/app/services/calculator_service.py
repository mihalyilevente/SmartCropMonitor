"""
Config mapping (mirrors Main.hs):
  9  – Irrigation Runtime
  10 – Soil Water Balance
  11 – Fertilizer Rate
  12 – Tank Mix
  13 – Spray Volume
  14 – Soil Nutrient Balance
  15 – Lime Requirement
  16 – Machinery Cost
  17 – Seed Rate
"""
import logging
import requests
from typing import Any, Dict, Optional
from app.core.config import HASKELL_SERVICE_URL

logger = logging.getLogger(__name__)


def _call_haskell(config: int, raw_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    payload = {"config": config, "raw_data": raw_data}
    try:
        resp = requests.post(HASKELL_SERVICE_URL, json=payload, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        logger.error("Haskell calc error config=%d status=%d body=%s",
                     config, resp.status_code, resp.text[:300])
        return None
    except requests.exceptions.Timeout:
        logger.error("Haskell service timeout (config=%d)", config)
    except Exception as exc:
        logger.error("Haskell service error (config=%d): %s", config, exc)
    return None


def calc_irrigation_runtime(
    target_mm: float,
    area_ha: float,
    flow_lph: float,
    efficiency: float = 0.85,
) -> Optional[Dict[str, Any]]:
    return _call_haskell(9, {
        "target_mm":  target_mm,
        "area_ha":    area_ha,
        "flow_lph":   flow_lph,
        "efficiency": efficiency,
    })


def calc_soil_water_balance(
    initial_sw: float,
    field_cap: float,
    wilting_pt: float,
    root_depth: float,
    steps: list,
    cn: float = 75.0,
) -> Optional[Dict[str, Any]]:
    return _call_haskell(10, {
        "initial_sw": initial_sw,
        "field_cap":  field_cap,
        "wilting_pt": wilting_pt,
        "root_depth": root_depth,
        "cn":         cn,
        "steps":      steps,
    })


def calc_fertilizer_rate(
    need: Dict[str, float],
    area_ha: float,
    products: list,
    splits: int = 1,
) -> Optional[Dict[str, Any]]:
    return _call_haskell(11, {
        "need":     need,
        "area_ha":  area_ha,
        "products": products,
        "splits":   splits,
    })


def calc_tank_mix(
    area_ha: float,
    water_vol_l_ha: float,
    products: list,
    water_ph: float = 7.0,
) -> Optional[Dict[str, Any]]:
    return _call_haskell(12, {
        "area_ha":        area_ha,
        "water_vol_l_ha": water_vol_l_ha,
        "products":       products,
        "water_ph":       water_ph,
    })


def calc_spray_volume(
    nozzle_l_min: float,
    speed_km_h: float,
    boom_m: float,
    area_ha: float,
    nozzles: int = 1,
) -> Optional[Dict[str, Any]]:
    return _call_haskell(13, {
        "nozzle_l_min": nozzle_l_min,
        "speed_km_h":   speed_km_h,
        "boom_m":       boom_m,
        "area_ha":      area_ha,
        "nozzles":      nozzles,
    })


def calc_soil_nutrient_balance(data: Dict[str, float]) -> Optional[Dict[str, Any]]:
    return _call_haskell(14, data)


def calc_lime_requirement(
    current_ph: float,
    target_ph: float,
    area_ha: float,
    soil_texture: str = "loam",
    om_pct: float = 2.0,
    lime_ecce: float = 0.9,
) -> Optional[Dict[str, Any]]:
    return _call_haskell(15, {
        "current_ph":   current_ph,
        "target_ph":    target_ph,
        "area_ha":      area_ha,
        "soil_texture": soil_texture,
        "om_pct":       om_pct,
        "lime_ecce":    lime_ecce,
    })


def calc_machinery_cost(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return _call_haskell(16, data)


def calc_seed_rate(
    target_plants_m2: float,
    tkw_g: float,
    area_ha: float,
    germination_pct: float = 95.0,
    field_emergence: float = 0.85,
    row_spacing_cm: float = 12.5,
) -> Optional[Dict[str, Any]]:
    return _call_haskell(17, {
        "target_plants_m2": target_plants_m2,
        "tkw_g":            tkw_g,
        "area_ha":          area_ha,
        "germination_pct":  germination_pct,
        "field_emergence":  field_emergence,
        "row_spacing_cm":   row_spacing_cm,
    })