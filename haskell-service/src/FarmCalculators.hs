{-# LANGUAGE DeriveGeneric     #-}
{-# LANGUAGE OverloadedStrings #-}

module FarmCalculators
  ( -- Irrigation Runtime
    IrrigationRuntimeInput(..)
  , IrrigationRuntimeResult(..)
  , calcIrrigationRuntime

    -- Soil Water Balance
  , SoilWaterBalanceInput(..)
  , SoilWaterBalanceResult(..)
  , SoilWaterStep(..)
  , calcSoilWaterBalance

    -- Fertilizer Rate
  , FertilizerRateInput(..)
  , FertilizerRateResult(..)
  , NutrientSplit(..)
  , calcFertilizerRate

    -- Tank Mix
  , TankMixInput(..)
  , TankMixProduct(..)
  , TankMixResult(..)
  , TankMixProduct'(..)
  , calcTankMix

    -- Spray Volume
  , SprayVolumeInput(..)
  , SprayVolumeResult(..)
  , calcSprayVolume

    -- Soil Nutrient Balance
  , SoilNutrientInput(..)
  , SoilNutrientResult(..)
  , calcSoilNutrientBalance

    -- Lime Requirement
  , LimeInput(..)
  , LimeResult(..)
  , calcLimeRequirement

    -- Machinery Cost
  , MachineryCostInput(..)
  , MachineryCostResult(..)
  , calcMachineryCost

    -- Seed Rate
  , SeedRateInput(..)
  , SeedRateResult(..)
  , calcSeedRate
  ) where

import Data.Aeson
import GHC.Generics
import Data.List (foldl')


clamp :: Double -> Double -> Double -> Double
clamp lo hi x = max lo (min hi x)

roundTo :: Int -> Double -> Double
roundTo d x =
  let f = 10 ^ d
  in fromIntegral (round (x * fromIntegral f) :: Int) / fromIntegral f

-- 1. IRRIGATION RUNTIME CALCULATOR

data IrrigationRuntimeInput = IrrigationRuntimeInput
  { iri_target_mm    :: Double
  , iri_area_ha      :: Double
  , iri_flow_lph     :: Double
  , iri_efficiency   :: Double
  } deriving (Show, Generic)

instance FromJSON IrrigationRuntimeInput where
  parseJSON = withObject "IrrigationRuntimeInput" $ \v ->
    IrrigationRuntimeInput
      <$> v .: "target_mm"
      <*> v .: "area_ha"
      <*> v .: "flow_lph"
      <*> v .: "efficiency"

instance ToJSON IrrigationRuntimeInput

data IrrigationRuntimeResult = IrrigationRuntimeResult
  { irr_runtime_h    :: Double
  , irr_runtime_min  :: Double
  , irr_total_liters :: Double
  , irr_total_m3     :: Double
  , irr_mm_per_hour  :: Double
  } deriving (Show, Generic)

instance ToJSON IrrigationRuntimeResult

calcIrrigationRuntime :: IrrigationRuntimeInput -> IrrigationRuntimeResult
calcIrrigationRuntime inp =
  let eff       = clamp 0.1 1.0 (iri_efficiency inp)
      areaSqm   = iri_area_ha inp * 10000.0
      litersNet = iri_target_mm inp * areaSqm
      litersGross = litersNet / eff
      runtimeH  = litersGross / iri_flow_lph inp
      mmPerHour = (iri_flow_lph inp * eff) / areaSqm
  in  IrrigationRuntimeResult
        { irr_runtime_h    = roundTo 2 runtimeH
        , irr_runtime_min  = roundTo 1 (runtimeH * 60.0)
        , irr_total_liters = roundTo 0 litersGross
        , irr_total_m3     = roundTo 2 (litersGross / 1000.0)
        , irr_mm_per_hour  = roundTo 3 mmPerHour
        }

-- 2. SOIL WATER BALANCE

data SWBStep = SWBStep
  { swb_date          :: String
  , swb_precip_mm     :: Double
  , swb_irrigation_mm :: Double
  , swb_et0           :: Double
  , swb_kc            :: Double
  } deriving (Show, Generic)

instance FromJSON SWBStep where
  parseJSON = withObject "SWBStep" $ \v ->
    SWBStep
      <$> v .:  "date"
      <*> v .:  "precip_mm"
      <*> v .:  "irrigation_mm"
      <*> v .:  "et0"
      <*> v .:? "kc"          .!= 1.0

instance ToJSON SWBStep

data SoilWaterBalanceInput = SoilWaterBalanceInput
  { swbi_initial_sw  :: Double
  , swbi_field_cap   :: Double
  , swbi_wilting_pt  :: Double
  , swbi_root_depth  :: Double
  , swbi_cn          :: Double
  , swbi_steps       :: [SWBStep]
  } deriving (Show, Generic)

instance FromJSON SoilWaterBalanceInput where
  parseJSON = withObject "SoilWaterBalanceInput" $ \v ->
    SoilWaterBalanceInput
      <$> v .:  "initial_sw"
      <*> v .:  "field_cap"
      <*> v .:  "wilting_pt"
      <*> v .:  "root_depth"
      <*> v .:? "cn"         .!= 75.0
      <*> v .:  "steps"

instance ToJSON SoilWaterBalanceInput

data SoilWaterStep = SoilWaterStep
  { sws_date        :: String
  , sws_sw          :: Double
  , sws_depletion   :: Double
  , sws_etc         :: Double
  , sws_runoff      :: Double
  , sws_perc        :: Double
  , sws_stress      :: Bool
  } deriving (Show, Generic)

instance ToJSON SoilWaterStep

data SoilWaterBalanceResult = SoilWaterBalanceResult
  { swbr_steps       :: [SoilWaterStep]
  , swbr_final_sw    :: Double
  , swbr_mean_dep    :: Double
  , swbr_total_etc   :: Double
  , swbr_total_rain  :: Double
  , swbr_total_irr   :: Double
  , swbr_stress_days :: Int
  } deriving (Show, Generic)

instance ToJSON SoilWaterBalanceResult

cnRunoff :: Double -> Double -> Double
cnRunoff cn p
  | p <= 0    = 0.0
  | otherwise =
      let s    = 25400.0 / cn - 254.0
          ia   = 0.2 * s
      in  if p <= ia then 0.0
          else (p - ia) ^ (2 :: Int) / (p + 0.8 * s)

calcSoilWaterBalance :: SoilWaterBalanceInput -> SoilWaterBalanceResult
calcSoilWaterBalance inp =
  let fc  = swbi_field_cap  inp
      wp  = swbi_wilting_pt inp
      cn  = swbi_cn inp
      taw = fc - wp
      mad = taw * 0.5

      (steps, _) = foldl' runStep ([], swbi_initial_sw inp) (swbi_steps inp)
      stepsRev   = reverse steps

      totalEtc  = sum (map sws_etc stepsRev)
      totalRain = sum (map (\s -> swb_precip_mm s) (swbi_steps inp))
      totalIrr  = sum (map (\s -> swb_irrigation_mm s) (swbi_steps inp))
      meanDep   = if null stepsRev then 0 else sum (map sws_depletion stepsRev) / fromIntegral (length stepsRev)
      stressDays = length (filter sws_stress stepsRev)
      finalSW    = if null stepsRev then swbi_initial_sw inp else sws_sw (last stepsRev)

  in  SoilWaterBalanceResult
        { swbr_steps       = stepsRev
        , swbr_final_sw    = roundTo 1 finalSW
        , swbr_mean_dep    = roundTo 1 meanDep
        , swbr_total_etc   = roundTo 1 totalEtc
        , swbr_total_rain  = roundTo 1 totalRain
        , swbr_total_irr   = roundTo 1 totalIrr
        , swbr_stress_days = stressDays
        }
  where
    fc  = swbi_field_cap  inp
    wp  = swbi_wilting_pt inp
    cn  = swbi_cn inp
    taw = fc - wp
    mad = taw * 0.5

    runStep (acc, sw) step =
      let p    = swb_precip_mm step
          irr  = swb_irrigation_mm step
          et0  = swb_et0 step
          kc   = swb_kc step
          etc  = et0 * kc
          runoff = cnRunoff cn p
          inflow = p - runoff + irr
          swRaw  = sw + inflow - etc
          perc   = max 0.0 (swRaw - fc)
          swFinal = clamp wp fc swRaw
          depl   = max 0.0 (fc - swFinal)
          stress = depl > mad
          s = SoilWaterStep
                { sws_date      = swb_date step
                , sws_sw        = roundTo 1 swFinal
                , sws_depletion = roundTo 1 depl
                , sws_etc       = roundTo 2 etc
                , sws_runoff    = roundTo 2 runoff
                , sws_perc      = roundTo 2 perc
                , sws_stress    = stress
                }
      in  (s : acc, swFinal)

-- 3. FERTILIZER RATE CALCULATOR

data NutrientNeed = NutrientNeed
  { nn_n_kg_ha :: Double
  , nn_p_kg_ha :: Double
  , nn_k_kg_ha :: Double
  } deriving (Show, Generic)

instance FromJSON NutrientNeed where
  parseJSON = withObject "NutrientNeed" $ \v ->
    NutrientNeed
      <$> v .:? "n_kg_ha" .!= 0
      <*> v .:? "p_kg_ha" .!= 0
      <*> v .:? "k_kg_ha" .!= 0

instance ToJSON NutrientNeed

data FertProduct = FertProduct
  { fp_name         :: String
  , fp_n_pct        :: Double
  , fp_p_pct        :: Double
  , fp_k_pct        :: Double
  , fp_cost_per_kg  :: Double
  } deriving (Show, Generic)

instance FromJSON FertProduct where
  parseJSON = withObject "FertProduct" $ \v ->
    FertProduct
      <$> v .:  "name"
      <*> v .:? "n_pct"        .!= 0
      <*> v .:? "p_pct"        .!= 0
      <*> v .:? "k_pct"        .!= 0
      <*> v .:? "cost_per_kg"  .!= 0

instance ToJSON FertProduct

data FertilizerRateInput = FertilizerRateInput
  { fri_need      :: NutrientNeed
  , fri_area_ha   :: Double
  , fri_products  :: [FertProduct]
  , fri_splits    :: Int
  } deriving (Show, Generic)

instance FromJSON FertilizerRateInput where
  parseJSON = withObject "FertilizerRateInput" $ \v ->
    FertilizerRateInput
      <$> v .:  "need"
      <*> v .:  "area_ha"
      <*> v .:  "products"
      <*> v .:? "splits"   .!= 1

instance ToJSON FertilizerRateInput

data NutrientSplit = NutrientSplit
  { ns_split_num    :: Int
  , ns_product_name :: String
  , ns_rate_kg_ha   :: Double
  , ns_rate_total   :: Double
  , ns_cost         :: Double
  } deriving (Show, Generic)

instance ToJSON NutrientSplit

data FertilizerRateResult = FertilizerRateResult
  { frr_splits      :: [NutrientSplit]
  , frr_total_n     :: Double
  , frr_total_p     :: Double
  , frr_total_k     :: Double
  , frr_total_cost  :: Double
  } deriving (Show, Generic)

instance ToJSON FertilizerRateResult

calcFertilizerRate :: FertilizerRateInput -> FertilizerRateResult
calcFertilizerRate inp =
  let need    = fri_need inp
      area    = fri_area_ha inp
      nSplits = max 1 (min 4 (fri_splits inp))
      prods   = fri_products inp

      pickBest nutrientFn = foldr1 (\a b -> if nutrientFn a > nutrientFn b then a else b) prods

      bestN = if null prods then Nothing else Just (pickBest fp_n_pct)
      bestP = if null prods then Nothing else Just (pickBest fp_p_pct)
      bestK = if null prods then Nothing else Just (pickBest fp_k_pct)

      makeSplit splitIdx prod needKgHa =
        let frac    = 1.0 / fromIntegral nSplits
            ratePct = case prod of
                        Just p  -> if fp_n_pct p + fp_p_pct p + fp_k_pct p > 0
                                   then (needKgHa * frac) / ((fp_n_pct p + fp_p_pct p + fp_k_pct p) / 100.0)
                                   else 0
                        Nothing -> 0
            rateTotal = ratePct * area
            cost      = rateTotal * maybe 0 fp_cost_per_kg prod
        in  NutrientSplit
              { ns_split_num    = splitIdx
              , ns_product_name = maybe "—" fp_name prod
              , ns_rate_kg_ha   = roundTo 1 ratePct
              , ns_rate_total   = roundTo 0 rateTotal
              , ns_cost         = roundTo 2 cost
              }

      nSplitList = map (\i -> makeSplit i bestN (nn_n_kg_ha need)) [1..nSplits]
      pSplitList = map (\i -> makeSplit i bestP (nn_p_kg_ha need)) [1..nSplits]
      kSplitList = map (\i -> makeSplit i bestK (nn_k_kg_ha need)) [1..nSplits]

      allSplits = nSplitList ++ pSplitList ++ kSplitList
      totalCost = sum (map ns_cost allSplits)
  in  FertilizerRateResult
        { frr_splits     = allSplits
        , frr_total_n    = nn_n_kg_ha need * area
        , frr_total_p    = nn_p_kg_ha need * area
        , frr_total_k    = nn_k_kg_ha need * area
        , frr_total_cost = roundTo 2 totalCost
        }

-- 4. TANK MIX CALCULATOR

data TankMixProduct = TankMixProduct
  { tmp_name       :: String
  , tmp_rate_l_ha  :: Double
  , tmp_type       :: String
  , tmp_ph_min     :: Double
  , tmp_ph_max     :: Double
  } deriving (Show, Generic)

instance FromJSON TankMixProduct where
  parseJSON = withObject "TankMixProduct" $ \v ->
    TankMixProduct
      <$> v .:  "name"
      <*> v .:  "rate_l_ha"
      <*> v .:? "type"    .!= "SC"
      <*> v .:? "ph_min"  .!= 5.0
      <*> v .:? "ph_max"  .!= 8.0

instance ToJSON TankMixProduct

data TankMixInput = TankMixInput
  { tmi_area_ha        :: Double
  , tmi_water_vol_l_ha :: Double
  , tmi_products       :: [TankMixProduct]
  , tmi_water_ph       :: Double
  } deriving (Show, Generic)

instance FromJSON TankMixInput where
  parseJSON = withObject "TankMixInput" $ \v ->
    TankMixInput
      <$> v .:  "area_ha"
      <*> v .:  "water_vol_l_ha"
      <*> v .:  "products"
      <*> v .:? "water_ph"  .!= 7.0

instance ToJSON TankMixInput

data TankMixProduct' = TankMixProduct'
  { tmr_name        :: String
  , tmr_amount_l    :: Double
  , tmr_amount_l_ha :: Double
  , tmr_order       :: Int
  , tmr_ph_ok       :: Bool
  } deriving (Show, Generic)

instance ToJSON TankMixProduct' where
  toJSON p = object
    [ "name"        .= tmr_name p
    , "amount_l"    .= tmr_amount_l p
    , "amount_l_ha" .= tmr_amount_l_ha p
    , "order"       .= tmr_order p
    , "ph_ok"       .= tmr_ph_ok p
    ]

data TankMixResult = TankMixResult
  { tmr_products       :: [TankMixProduct']
  , tmr_total_water_l  :: Double
  , tmr_ph_risk        :: Bool
  , tmr_ph_warning     :: String
  } deriving (Show, Generic)

instance ToJSON TankMixResult

typeOrder :: String -> Int
typeOrder t = case t of
  "adjuvant"   -> 1
  "WP"         -> 2
  "SC"         -> 3
  "flowable"   -> 3
  "EC"         -> 4
  "SL"         -> 4
  "surfactant" -> 5
  _            -> 3

calcTankMix :: TankMixInput -> TankMixResult
calcTankMix inp =
  let area    = tmi_area_ha inp
      wph     = tmi_water_ph inp
      totalW  = area * tmi_water_vol_l_ha inp
      prods   = tmi_products inp

      makeP p =
        let amt    = tmp_rate_l_ha p * area
            phOk   = wph >= tmp_ph_min p && wph <= tmp_ph_max p
            order  = typeOrder (tmp_type p)
        in  TankMixProduct'
              { tmr_name        = tmp_name p
              , tmr_amount_l    = roundTo 2 amt
              , tmr_amount_l_ha = roundTo 3 (tmp_rate_l_ha p)
              , tmr_order       = order
              , tmr_ph_ok       = phOk
              }

      converted  = map makeP prods
      anyPhRisk  = any (not . tmr_ph_ok) converted
      phWarning  = if anyPhRisk
                   then "One or more products may be incompatible with water pH " ++ show wph ++ ". Consider pH adjustment."
                   else "pH appears compatible with all products."
  in  TankMixResult
        { tmr_products      = converted
        , tmr_total_water_l = roundTo 0 totalW
        , tmr_ph_risk       = anyPhRisk
        , tmr_ph_warning    = phWarning
        }

-- 5. SPRAY WATER VOLUME CALCULATOR

data SprayVolumeInput = SprayVolumeInput
  { svi_nozzle_l_min :: Double
  , svi_speed_km_h   :: Double
  , svi_boom_m       :: Double
  , svi_area_ha      :: Double
  , svi_nozzles      :: Int
  } deriving (Show, Generic)

instance FromJSON SprayVolumeInput where
  parseJSON = withObject "SprayVolumeInput" $ \v ->
    SprayVolumeInput
      <$> v .:  "nozzle_l_min"
      <*> v .:  "speed_km_h"
      <*> v .:  "boom_m"
      <*> v .:  "area_ha"
      <*> v .:? "nozzles"  .!= 1

instance ToJSON SprayVolumeInput

data SprayVolumeResult = SprayVolumeResult
  { svr_vol_l_ha       :: Double
  , svr_total_liters   :: Double
  , svr_time_h         :: Double
  , svr_time_min       :: Double
  } deriving (Show, Generic)

instance ToJSON SprayVolumeResult

calcSprayVolume :: SprayVolumeInput -> SprayVolumeResult
calcSprayVolume inp =
  let nozL    = svi_nozzle_l_min inp * fromIntegral (svi_nozzles inp)
      speedMs = svi_speed_km_h inp * 1000.0 / 3600.0
      boomM   = svi_boom_m inp
      lHa     = (nozL * 600.0) / (svi_speed_km_h inp * boomM)
      total   = lHa * svi_area_ha inp
      areaRateHaH = speedMs * boomM * 3600.0 / 10000.0
      timeH   = svi_area_ha inp / areaRateHaH
  in  SprayVolumeResult
        { svr_vol_l_ha     = roundTo 1 lHa
        , svr_total_liters = roundTo 0 total
        , svr_time_h       = roundTo 2 timeH
        , svr_time_min     = roundTo 0 (timeH * 60.0)
        }

-- 6. SOIL NUTRIENT BALANCE

data SoilNutrientInput = SoilNutrientInput
  { sni_n_soil      :: Double
  , sni_p_soil      :: Double
  , sni_k_soil      :: Double
  , sni_n_fert      :: Double
  , sni_p_fert      :: Double
  , sni_k_fert      :: Double
  , sni_n_crop      :: Double
  , sni_p_crop      :: Double
  , sni_k_crop      :: Double
  , sni_n_atm       :: Double
  , sni_n_fixation  :: Double
  } deriving (Show, Generic)

instance FromJSON SoilNutrientInput where
  parseJSON = withObject "SoilNutrientInput" $ \v ->
    SoilNutrientInput
      <$> v .:? "n_soil"     .!= 0
      <*> v .:? "p_soil"     .!= 0
      <*> v .:? "k_soil"     .!= 0
      <*> v .:? "n_fert"     .!= 0
      <*> v .:? "p_fert"     .!= 0
      <*> v .:? "k_fert"     .!= 0
      <*> v .:? "n_crop"     .!= 0
      <*> v .:? "p_crop"     .!= 0
      <*> v .:? "k_crop"     .!= 0
      <*> v .:? "n_atm"      .!= 10.0
      <*> v .:? "n_fixation" .!= 0

instance ToJSON SoilNutrientInput

data SoilNutrientResult = SoilNutrientResult
  { snr_n_balance :: Double
  , snr_p_balance :: Double
  , snr_k_balance :: Double
  , snr_n_status  :: String
  , snr_p_status  :: String
  , snr_k_status  :: String
  } deriving (Show, Generic)

instance ToJSON SoilNutrientResult

balanceStatus :: Double -> String
balanceStatus b
  | b >  10.0 = "surplus"
  | b < -10.0 = "deficit"
  | otherwise  = "balanced"

calcSoilNutrientBalance :: SoilNutrientInput -> SoilNutrientResult
calcSoilNutrientBalance inp =
  let nb = sni_n_soil inp + sni_n_fert inp + sni_n_atm inp + sni_n_fixation inp - sni_n_crop inp
      pb = sni_p_soil inp + sni_p_fert inp - sni_p_crop inp
      kb = sni_k_soil inp + sni_k_fert inp - sni_k_crop inp
  in  SoilNutrientResult
        { snr_n_balance = roundTo 1 nb
        , snr_p_balance = roundTo 1 pb
        , snr_k_balance = roundTo 1 kb
        , snr_n_status  = balanceStatus nb
        , snr_p_status  = balanceStatus pb
        , snr_k_status  = balanceStatus kb
        }

-- 7. LIME REQUIREMENT CALCULATOR

data LimeInput = LimeInput
  { li_current_ph   :: Double
  , li_target_ph    :: Double
  , li_soil_texture :: String
  , li_om_pct       :: Double
  , li_lime_ecce    :: Double
  , li_area_ha      :: Double
  } deriving (Show, Generic)

instance FromJSON LimeInput where
  parseJSON = withObject "LimeInput" $ \v ->
    LimeInput
      <$> v .:  "current_ph"
      <*> v .:  "target_ph"
      <*> v .:? "soil_texture" .!= "loam"
      <*> v .:? "om_pct"       .!= 2.0
      <*> v .:? "lime_ecce"    .!= 0.9
      <*> v .:  "area_ha"

instance ToJSON LimeInput

data LimeResult = LimeResult
  { lr_lime_t_ha     :: Double
  , lr_lime_total_t  :: Double
  , lr_ph_change     :: Double
  , lr_recommendation :: String
  } deriving (Show, Generic)

instance ToJSON LimeResult

soilFactor :: String -> Double -> Double
soilFactor texture om =
  let base = case texture of
               "sandy" -> 1.5
               "clay"  -> 4.5
               _       -> 3.0
      omAdj = 1.0 + (om / 100.0) * 2.0
  in  base * omAdj

calcLimeRequirement :: LimeInput -> LimeResult
calcLimeRequirement inp =
  let phDiff  = max 0 (li_target_ph inp - li_current_ph inp)
      sf      = soilFactor (li_soil_texture inp) (li_om_pct inp)
      rawTHa  = phDiff * sf / li_lime_ecce inp
      totalT  = rawTHa * li_area_ha inp
      rec | rawTHa <= 0   = "No lime required"
          | rawTHa < 1.0  = "Light application — split over 2 seasons recommended"
          | rawTHa < 3.0  = "Moderate application — incorporate before tillage"
          | otherwise     = "Heavy application — split into 2 equal applications over 2 years"
  in  LimeResult
        { lr_lime_t_ha      = roundTo 2 rawTHa
        , lr_lime_total_t   = roundTo 1 totalT
        , lr_ph_change      = roundTo 2 phDiff
        , lr_recommendation = rec
        }

-- 8. MACHINERY COST CALCULATOR

data MachineryCostInput = MachineryCostInput
  { mci_purchase_price :: Double
  , mci_salvage_value  :: Double
  , mci_life_years     :: Double
  , mci_annual_hours   :: Double
  , mci_fuel_l_h       :: Double
  , mci_fuel_price     :: Double
  , mci_oil_pct        :: Double
  , mci_repair_pct     :: Double
  , mci_labour_h       :: Double
  , mci_capacity_ha_h  :: Double
  , mci_area_ha        :: Double
  } deriving (Show, Generic)

instance FromJSON MachineryCostInput where
  parseJSON = withObject "MachineryCostInput" $ \v ->
    MachineryCostInput
      <$> v .:  "purchase_price"
      <*> v .:? "salvage_value"  .!= 0
      <*> v .:? "life_years"     .!= 10
      <*> v .:? "annual_hours"   .!= 500
      <*> v .:? "fuel_l_h"       .!= 15
      <*> v .:? "fuel_price"     .!= 1.5
      <*> v .:? "oil_pct"        .!= 0.15
      <*> v .:? "repair_pct"     .!= 0.03
      <*> v .:? "labour_h"       .!= 15
      <*> v .:  "capacity_ha_h"
      <*> v .:  "area_ha"

instance ToJSON MachineryCostInput

data MachineryCostResult = MachineryCostResult
  { mcr_depreciation_h  :: Double
  , mcr_fuel_h          :: Double
  , mcr_oil_h           :: Double
  , mcr_repair_h        :: Double
  , mcr_labour_h        :: Double
  , mcr_total_cost_h    :: Double
  , mcr_cost_per_ha     :: Double
  , mcr_total_cost_field :: Double
  } deriving (Show, Generic)

instance ToJSON MachineryCostResult

calcMachineryCost :: MachineryCostInput -> MachineryCostResult
calcMachineryCost inp =
  let deprYear  = (mci_purchase_price inp - mci_salvage_value inp) / mci_life_years inp
      deprH     = deprYear / mci_annual_hours inp
      fuelH     = mci_fuel_l_h inp * mci_fuel_price inp
      oilH      = fuelH * mci_oil_pct inp
      repairH   = (mci_purchase_price inp * mci_repair_pct inp) / mci_annual_hours inp
      labH      = mci_labour_h inp
      totalH    = deprH + fuelH + oilH + repairH + labH
      costHa    = totalH / mci_capacity_ha_h inp
      totalField = costHa * mci_area_ha inp
  in  MachineryCostResult
        { mcr_depreciation_h   = roundTo 2 deprH
        , mcr_fuel_h           = roundTo 2 fuelH
        , mcr_oil_h            = roundTo 2 oilH
        , mcr_repair_h         = roundTo 2 repairH
        , mcr_labour_h         = roundTo 2 labH
        , mcr_total_cost_h     = roundTo 2 totalH
        , mcr_cost_per_ha      = roundTo 2 costHa
        , mcr_total_cost_field = roundTo 0 totalField
        }

-- 9. SEED RATE CALCULATOR

data SeedRateInput = SeedRateInput
  { sri_target_plants_m2 :: Double
  , sri_germination_pct  :: Double
  , sri_field_emergence  :: Double
  , sri_tkw_g            :: Double
  , sri_area_ha          :: Double
  , sri_row_spacing_cm   :: Double
  } deriving (Show, Generic)

instance FromJSON SeedRateInput where
  parseJSON = withObject "SeedRateInput" $ \v ->
    SeedRateInput
      <$> v .:  "target_plants_m2"
      <*> v .:? "germination_pct"  .!= 95
      <*> v .:? "field_emergence"  .!= 0.85
      <*> v .:  "tkw_g"
      <*> v .:  "area_ha"
      <*> v .:? "row_spacing_cm"   .!= 12.5

instance ToJSON SeedRateInput

data SeedRateResult = SeedRateResult
  { srr_seeds_m2       :: Double
  , srr_seeds_ha       :: Double
  , srr_kg_ha          :: Double
  , srr_total_kg       :: Double
  , srr_seeds_per_m_row :: Double
  } deriving (Show, Generic)

instance ToJSON SeedRateResult

calcSeedRate :: SeedRateInput -> SeedRateResult
calcSeedRate inp =
  let germ    = clamp 0.01 1.0 (sri_germination_pct inp / 100.0)
      emerg   = clamp 0.01 1.0 (sri_field_emergence inp)
      seedsM2 = sri_target_plants_m2 inp / (germ * emerg)
      seedsHa = seedsM2 * 10000.0
      kgHa    = (seedsHa * sri_tkw_g inp) / 1000000.0
      totalKg = kgHa * sri_area_ha inp
      rowSpM  = sri_row_spacing_cm inp / 100.0
      seedsPerMRow = seedsM2 * rowSpM
  in  SeedRateResult
        { srr_seeds_m2        = roundTo 0 seedsM2
        , srr_seeds_ha        = roundTo 0 seedsHa
        , srr_kg_ha           = roundTo 1 kgHa
        , srr_total_kg        = roundTo 0 totalKg
        , srr_seeds_per_m_row = roundTo 1 seedsPerMRow
        }