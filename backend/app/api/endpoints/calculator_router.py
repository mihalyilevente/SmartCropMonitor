from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from app.services.calculator_service import (
    calc_irrigation_runtime,
    calc_soil_water_balance,
    calc_fertilizer_rate,
    calc_tank_mix,
    calc_spray_volume,
    calc_soil_nutrient_balance,
    calc_lime_requirement,
    calc_machinery_cost,
    calc_seed_rate,
)

router = APIRouter(prefix="/calculators", tags=["Calculators"])


def _require(result: Optional[Dict[str, Any]], name: str) -> Dict[str, Any]:
    if result is None:
        raise HTTPException(status_code=503, detail=f"{name} calculation failed")
    return result


class IrrigationRuntimeBody(BaseModel):
    target_mm:  float = Field(..., gt=0, description="Irrigation target in mm")
    area_ha:    float = Field(..., gt=0, description="Field area in ha")
    flow_lph:   float = Field(..., gt=0, description="System flow rate L/h")
    efficiency: float = Field(0.85, ge=0.1, le=1.0, description="System efficiency 0‥1")


@router.post("/irrigation-runtime")
def irrigation_runtime(body: IrrigationRuntimeBody):
    return _require(
        calc_irrigation_runtime(body.target_mm, body.area_ha, body.flow_lph, body.efficiency),
        "IrrigationRuntime",
    )

class SWBStep(BaseModel):
    date:           str
    precip_mm:      float = 0.0
    irrigation_mm:  float = 0.0
    et0:            float = 0.0
    kc:             float = 1.0

class SoilWaterBalanceBody(BaseModel):
    initial_sw: float = Field(..., description="Initial soil water content mm")
    field_cap:  float = Field(..., description="Field capacity mm")
    wilting_pt: float = Field(..., description="Wilting point mm")
    root_depth: float = Field(30.0, description="Root zone depth cm")
    cn:         float = Field(75.0, ge=40, le=99, description="Curve number for runoff")
    steps:      List[SWBStep]


@router.post("/soil-water-balance")
def soil_water_balance(body: SoilWaterBalanceBody):
    steps_raw = [s.model_dump() for s in body.steps]
    return _require(
        calc_soil_water_balance(
            body.initial_sw, body.field_cap, body.wilting_pt,
            body.root_depth, steps_raw, body.cn,
        ),
        "SoilWaterBalance",
    )

class NutrientNeed(BaseModel):
    n_kg_ha: float = 0.0
    p_kg_ha: float = 0.0
    k_kg_ha: float = 0.0

class FertProduct(BaseModel):
    name:        str
    n_pct:       float = 0.0
    p_pct:       float = 0.0
    k_pct:       float = 0.0
    cost_per_kg: float = 0.0

class FertilizerRateBody(BaseModel):
    need:     NutrientNeed
    area_ha:  float = Field(..., gt=0)
    products: List[FertProduct]
    splits:   int   = Field(1, ge=1, le=4)


@router.post("/fertilizer-rate")
def fertilizer_rate(body: FertilizerRateBody):
    return _require(
        calc_fertilizer_rate(
            body.need.model_dump(),
            body.area_ha,
            [p.model_dump() for p in body.products],
            body.splits,
        ),
        "FertilizerRate",
    )

class TankProduct(BaseModel):
    name:      str
    rate_l_ha: float
    type:      str   = "SC"
    ph_min:    float = 5.0
    ph_max:    float = 8.0

class TankMixBody(BaseModel):
    area_ha:        float = Field(..., gt=0)
    water_vol_l_ha: float = Field(..., gt=0, description="Water volume L/ha")
    products:       List[TankProduct]
    water_ph:       float = Field(7.0, ge=1, le=14)


@router.post("/tank-mix")
def tank_mix(body: TankMixBody):
    return _require(
        calc_tank_mix(
            body.area_ha,
            body.water_vol_l_ha,
            [p.model_dump() for p in body.products],
            body.water_ph,
        ),
        "TankMix",
    )

class SprayVolumeBody(BaseModel):
    nozzle_l_min: float = Field(..., gt=0, description="Nozzle output L/min per nozzle")
    speed_km_h:   float = Field(..., gt=0)
    boom_m:       float = Field(..., gt=0, description="Total boom width m")
    area_ha:      float = Field(..., gt=0)
    nozzles:      int   = Field(1, ge=1)


@router.post("/spray-volume")
def spray_volume(body: SprayVolumeBody):
    return _require(
        calc_spray_volume(
            body.nozzle_l_min, body.speed_km_h,
            body.boom_m, body.area_ha, body.nozzles,
        ),
        "SprayVolume",
    )

class SoilNutrientBody(BaseModel):
    n_soil:     float = 0.0
    p_soil:     float = 0.0
    k_soil:     float = 0.0
    n_fert:     float = 0.0
    p_fert:     float = 0.0
    k_fert:     float = 0.0
    n_crop:     float = 0.0
    p_crop:     float = 0.0
    k_crop:     float = 0.0
    n_atm:      float = 10.0
    n_fixation: float = 0.0


@router.post("/soil-nutrient-balance")
def soil_nutrient_balance(body: SoilNutrientBody):
    return _require(
        calc_soil_nutrient_balance(body.model_dump()),
        "SoilNutrientBalance",
    )

class LimeBody(BaseModel):
    current_ph:   float = Field(..., ge=3.0, le=9.0)
    target_ph:    float = Field(..., ge=3.0, le=9.0)
    area_ha:      float = Field(..., gt=0)
    soil_texture: str   = Field("loam", description="sandy | loam | clay")
    om_pct:       float = Field(2.0, ge=0, le=20)
    lime_ecce:    float = Field(0.9, ge=0.1, le=1.0, description="Lime CCE 0‥1")


@router.post("/lime-requirement")
def lime_requirement(body: LimeBody):
    return _require(
        calc_lime_requirement(
            body.current_ph, body.target_ph, body.area_ha,
            body.soil_texture, body.om_pct, body.lime_ecce,
        ),
        "LimeRequirement",
    )

class MachineryCostBody(BaseModel):
    purchase_price:  float = Field(..., gt=0)
    salvage_value:   float = 0.0
    life_years:      float = Field(10.0, gt=0)
    annual_hours:    float = Field(500.0, gt=0)
    fuel_l_h:        float = Field(15.0, gt=0)
    fuel_price:      float = Field(1.5,  gt=0)
    oil_pct:         float = Field(0.15, ge=0)
    repair_pct:      float = Field(0.03, ge=0)
    labour_h:        float = Field(15.0, ge=0)
    capacity_ha_h:   float = Field(..., gt=0)
    area_ha:         float = Field(..., gt=0)


@router.post("/machinery-cost")
def machinery_cost(body: MachineryCostBody):
    return _require(
        calc_machinery_cost(body.model_dump()),
        "MachineryCost",
    )

class SeedRateBody(BaseModel):
    target_plants_m2: float = Field(..., gt=0)
    tkw_g:            float = Field(..., gt=0, description="Thousand kernel weight grams")
    area_ha:          float = Field(..., gt=0)
    germination_pct:  float = Field(95.0, ge=1, le=100)
    field_emergence:  float = Field(0.85, ge=0.01, le=1.0)
    row_spacing_cm:   float = Field(12.5, gt=0)


@router.post("/seed-rate")
def seed_rate(body: SeedRateBody):
    return _require(
        calc_seed_rate(
            body.target_plants_m2, body.tkw_g, body.area_ha,
            body.germination_pct, body.field_emergence, body.row_spacing_cm,
        ),
        "SeedRate",
    )

AGRONOMY_REFERENCE = {
    "crops": {
        "wheat_winter": {
            "kc_stages":      {"initial": 0.7, "mid": 1.15, "late": 0.4},
            "target_plants":  300,
            "typical_tkw_g":  40,
            "npk_uptake":     {"n": 130, "p": 45, "k": 80},
            "typical_yield_t_ha": 6.5,
        },
        "corn": {
            "kc_stages":      {"initial": 0.3, "mid": 1.2, "late": 0.6},
            "target_plants":  8,
            "typical_tkw_g":  320,
            "npk_uptake":     {"n": 200, "p": 70, "k": 175},
            "typical_yield_t_ha": 9.0,
        },
        "sunflower": {
            "kc_stages":      {"initial": 0.35, "mid": 1.1, "late": 0.35},
            "target_plants":  5,
            "typical_tkw_g":  65,
            "npk_uptake":     {"n": 90, "p": 40, "k": 110},
            "typical_yield_t_ha": 3.2,
        },
        "soybeans": {
            "kc_stages":      {"initial": 0.4, "mid": 1.15, "late": 0.5},
            "target_plants":  35,
            "typical_tkw_g":  200,
            "npk_uptake":     {"n": 300, "p": 60, "k": 125},
            "typical_yield_t_ha": 3.0,
            "n_fixation_kg_ha": 150,
        },
        "rapeseed_winter": {
            "kc_stages":      {"initial": 0.5, "mid": 1.1, "late": 0.4},
            "target_plants":  40,
            "typical_tkw_g":  4.5,
            "npk_uptake":     {"n": 180, "p": 60, "k": 150},
            "typical_yield_t_ha": 3.5,
        },
        "sugar_beet": {
            "kc_stages":      {"initial": 0.35, "mid": 1.2, "late": 0.7},
            "target_plants":  9,
            "typical_tkw_g":  None,
            "npk_uptake":     {"n": 200, "p": 80, "k": 350},
            "typical_yield_t_ha": 60.0,
        },
        "potato": {
            "kc_stages":      {"initial": 0.5, "mid": 1.15, "late": 0.75},
            "target_plants":  4,
            "typical_tkw_g":  None,
            "npk_uptake":     {"n": 180, "p": 80, "k": 280},
            "typical_yield_t_ha": 40.0,
        },
    },
    "fertilizers": {
        "urea":       {"n_pct": 46, "p_pct": 0,  "k_pct": 0},
        "CAN":        {"n_pct": 27, "p_pct": 0,  "k_pct": 0},
        "DAP":        {"n_pct": 18, "p_pct": 46, "k_pct": 0},
        "MAP":        {"n_pct": 11, "p_pct": 52, "k_pct": 0},
        "MOP":        {"n_pct": 0,  "p_pct": 0,  "k_pct": 60},
        "SOP":        {"n_pct": 0,  "p_pct": 0,  "k_pct": 50},
        "NPK_15_15_15": {"n_pct": 15, "p_pct": 15, "k_pct": 15},
        "NPK_20_10_10": {"n_pct": 20, "p_pct": 10, "k_pct": 10},
    },
    "soil_texture_fc_wp": {
        "sandy":        {"fc_mm_per_30cm": 60,  "wp_mm_per_30cm": 25},
        "sandy_loam":   {"fc_mm_per_30cm": 90,  "wp_mm_per_30cm": 35},
        "loam":         {"fc_mm_per_30cm": 120, "wp_mm_per_30cm": 50},
        "clay_loam":    {"fc_mm_per_30cm": 140, "wp_mm_per_30cm": 65},
        "clay":         {"fc_mm_per_30cm": 160, "wp_mm_per_30cm": 85},
    },
    "ph_optimal_ranges": {
        "cereals":          {"min": 6.0, "max": 7.0},
        "legumes":          {"min": 6.2, "max": 7.2},
        "oilseed_rape":     {"min": 6.0, "max": 7.0},
        "sugar_beet":       {"min": 6.5, "max": 7.5},
        "potato":           {"min": 5.0, "max": 6.0},
        "vegetables":       {"min": 6.0, "max": 7.0},
        "fruit_trees":      {"min": 6.0, "max": 7.0},
    },
    "spray_guidelines": {
        "min_temp_c":       10,
        "max_temp_c":       25,
        "max_wind_m_s":     4,
        "min_humidity_pct": 40,
        "max_humidity_pct": 95,
        "avoid_rain_h":     4,
    },
}


@router.get("/reference")
def agronomy_reference():
    return AGRONOMY_REFERENCE


@router.get("/reference/crops")
def crop_reference():
    return AGRONOMY_REFERENCE["crops"]


@router.get("/reference/fertilizers")
def fertilizer_reference():
    return AGRONOMY_REFERENCE["fertilizers"]


@router.get("/reference/soil-textures")
def soil_texture_reference():
    return AGRONOMY_REFERENCE["soil_texture_fc_wp"]


@router.get("/reference/ph-ranges")
def ph_range_reference():
    return AGRONOMY_REFERENCE["ph_optimal_ranges"]


@router.get("/reference/spray-guidelines")
def spray_guidelines():
    return AGRONOMY_REFERENCE["spray_guidelines"]