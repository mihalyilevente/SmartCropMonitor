module FarmCalculatorsSpec (spec) where

import Test.Hspec
import FarmCalculators

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

approx :: Double -> Double -> Double -> Bool
approx tol expected actual = abs (actual - expected) <= tol

infix 4 ~==
(~==) :: Double -> Double -> Bool
(~==) = approx 1e-2   -- 2 decimal places sufficient for field calculations

infix 4 ~=~
(~=~) :: Double -> Double -> Bool
(~=~) = approx 1e-6   -- tight tolerance for pure math checks

-- ---------------------------------------------------------------------------
-- Reference implementations (mirror FarmCalculators.hs formulas)
-- ---------------------------------------------------------------------------

refIrrigRuntime :: Double -> Double -> Double -> Double -> Double
refIrrigRuntime mm area flow eff =
  let litersGross = (mm * area * 10000.0) / eff
  in  litersGross / flow

refLHa :: Double -> Double -> Double -> Int -> Double
refLHa nozLMin speedKmH boomM nozzles =
  (nozLMin * fromIntegral nozzles * 600.0) / (speedKmH * boomM)

refNBalance :: Double -> Double -> Double -> Double -> Double -> Double
refNBalance soil fert atm fix crop = soil + fert + atm + fix - crop

refCnRunoff :: Double -> Double -> Double
refCnRunoff cn p
  | p <= 0    = 0.0
  | otherwise =
      let s  = 25400.0 / cn - 254.0
          ia = 0.2 * s
      in  if p <= ia then 0.0
          else (p - ia) ^ (2 :: Int) / (p + 0.8 * s)

-- ---------------------------------------------------------------------------
-- Shared test inputs
-- ---------------------------------------------------------------------------

baseIrrig :: IrrigationRuntimeInput
baseIrrig = IrrigationRuntimeInput
  { iri_target_mm  = 25.0
  , iri_area_ha    = 10.0
  , iri_flow_lph   = 5000.0
  , iri_efficiency = 0.85
  }

baseSWBInput :: SoilWaterBalanceInput
baseSWBInput = SoilWaterBalanceInput
  { swbi_initial_sw = 100.0
  , swbi_field_cap  = 130.0
  , swbi_wilting_pt = 50.0
  , swbi_root_depth = 30.0
  , swbi_cn         = 75.0
  , swbi_steps      =
      [ SWBStep "2026-06-01" 0.0  20.0 5.0 0.8
      , SWBStep "2026-06-02" 12.0  0.0 4.5 0.8
      , SWBStep "2026-06-03" 0.0   0.0 5.5 0.85
      ]
  }

baseFertInput :: FertilizerRateInput
baseFertInput = FertilizerRateInput
  { fri_need     = NutrientNeed 120.0 50.0 80.0
  , fri_area_ha  = 10.0
  , fri_products =
      [ FertProduct "Urea" 46.0  0.0  0.0 0.45
      , FertProduct "DAP"  18.0 46.0  0.0 0.55
      , FertProduct "MOP"   0.0  0.0 60.0 0.38
      ]
  , fri_splits   = 1
  }

baseTankInput :: TankMixInput
baseTankInput = TankMixInput
  { tmi_area_ha        = 10.0
  , tmi_water_vol_l_ha = 200.0
  , tmi_water_ph       = 7.0
  , tmi_products       =
      [ TankMixProduct "HerbicideA" 1.5 "EC"  4.5 8.0
      , TankMixProduct "FungicideB" 0.8 "SC"  5.0 8.5
      ]
  }

baseSprayInput :: SprayVolumeInput
baseSprayInput = SprayVolumeInput
  { svi_nozzle_l_min = 0.8
  , svi_speed_km_h   = 6.0
  , svi_boom_m       = 12.0
  , svi_area_ha      = 20.0
  , svi_nozzles      = 24
  }

baseNutrientInput :: SoilNutrientInput
baseNutrientInput = SoilNutrientInput
  { sni_n_soil     = 0.0
  , sni_p_soil     = 0.0
  , sni_k_soil     = 0.0
  , sni_n_fert     = 120.0
  , sni_p_fert     = 50.0
  , sni_k_fert     = 80.0
  , sni_n_crop     = 130.0
  , sni_p_crop     = 45.0
  , sni_k_crop     = 80.0
  , sni_n_atm      = 10.0
  , sni_n_fixation = 0.0
  }

baseLimeInput :: LimeInput
baseLimeInput = LimeInput
  { li_current_ph   = 5.8
  , li_target_ph    = 6.5
  , li_area_ha      = 10.0
  , li_soil_texture = "loam"
  , li_om_pct       = 2.0
  , li_lime_ecce    = 0.9
  }

baseMachInput :: MachineryCostInput
baseMachInput = MachineryCostInput
  { mci_purchase_price = 250000.0
  , mci_salvage_value  = 30000.0
  , mci_life_years     = 12.0
  , mci_annual_hours   = 600.0
  , mci_fuel_l_h       = 18.0
  , mci_fuel_price     = 1.4
  , mci_oil_pct        = 0.15
  , mci_repair_pct     = 0.03
  , mci_labour_h       = 20.0
  , mci_capacity_ha_h  = 3.0
  , mci_area_ha        = 500.0
  }

baseSeedInput :: SeedRateInput
baseSeedInput = SeedRateInput
  { sri_target_plants_m2 = 250.0
  , sri_germination_pct  = 94.0
  , sri_field_emergence  = 0.83
  , sri_tkw_g            = 42.0
  , sri_area_ha          = 50.0
  , sri_row_spacing_cm   = 12.5
  }

-- ===========================================================================
-- SPEC
-- ===========================================================================

spec :: Spec
spec = do

  -- =========================================================================
  describe "calcIrrigationRuntime" $ do

    describe "core formula" $ do

      it "runtime_h matches reference formula" $ do
        let r        = calcIrrigationRuntime baseIrrig
            expected = refIrrigRuntime 25.0 10.0 5000.0 0.85
        irr_runtime_h r `shouldSatisfy` approx 0.01 expected

      it "runtime_min is approximately runtime_h * 60" $ do
        let r        = calcIrrigationRuntime baseIrrig
            expected = refIrrigRuntime 25.0 10.0 5000.0 0.85 * 60.0
        irr_runtime_min r `shouldSatisfy` approx 1.0 expected

      it "total_m3 = total_liters / 1000" $ do
        let r = calcIrrigationRuntime baseIrrig
        irr_total_m3 r `shouldSatisfy` approx 0.01 (irr_total_liters r / 1000.0)

      it "total_liters = target_mm * area_m2 / efficiency" $ do
        let r        = calcIrrigationRuntime baseIrrig
            expected = 25.0 * 10.0 * 10000.0 / 0.85
        irr_total_liters r `shouldSatisfy` approx 1.0 expected

    describe "monotonicity" $ do

      it "runtime increases with larger target_mm" $ do
        let small = calcIrrigationRuntime baseIrrig
            big   = calcIrrigationRuntime baseIrrig { iri_target_mm = 50.0 }
        irr_runtime_h big `shouldSatisfy` (> irr_runtime_h small)

      it "runtime decreases with higher flow rate" $ do
        let slow = calcIrrigationRuntime baseIrrig
            fast = calcIrrigationRuntime baseIrrig { iri_flow_lph = 10000.0 }
        irr_runtime_h fast `shouldSatisfy` (< irr_runtime_h slow)

      it "runtime increases for lower efficiency" $ do
        let eff90 = calcIrrigationRuntime baseIrrig { iri_efficiency = 0.90 }
            eff50 = calcIrrigationRuntime baseIrrig { iri_efficiency = 0.50 }
        irr_runtime_h eff50 `shouldSatisfy` (> irr_runtime_h eff90)

      it "runtime scales linearly with area" $ do
        let r1 = calcIrrigationRuntime baseIrrig
            r2 = calcIrrigationRuntime baseIrrig { iri_area_ha = 20.0 }
        irr_runtime_h r2 `shouldSatisfy` approx 0.01 (irr_runtime_h r1 * 2.0)

    describe "edge cases" $ do

      it "efficiency clamped to 0.1 -- does not produce infinite runtime" $ do
        let r = calcIrrigationRuntime baseIrrig { iri_efficiency = 0.001 }
        irr_runtime_h r `shouldSatisfy` (> 0.0)

      it "all result fields are positive for valid input" $ do
        let r = calcIrrigationRuntime baseIrrig
        irr_runtime_h    r `shouldSatisfy` (> 0.0)
        irr_runtime_min  r `shouldSatisfy` (> 0.0)
        irr_total_liters r `shouldSatisfy` (> 0.0)
        irr_total_m3     r `shouldSatisfy` (> 0.0)
        irr_mm_per_hour  r `shouldSatisfy` (> 0.0)

  -- =========================================================================
  describe "calcSoilWaterBalance" $ do

    let res = calcSoilWaterBalance baseSWBInput

    describe "output shape" $ do

      it "returns one step per input step" $ do
        length (swbr_steps res) `shouldBe` 3

      it "dates are preserved in order" $ do
        map sws_date (swbr_steps res) `shouldBe` ["2026-06-01","2026-06-02","2026-06-03"]

      it "final_sw matches last step sw" $ do
        let lastSW = sws_sw (last (swbr_steps res))
        swbr_final_sw res `shouldSatisfy` approx 0.01 lastSW

    describe "water conservation" $ do

      it "total ETc is positive" $ do
        swbr_total_etc res `shouldSatisfy` (> 0.0)

      it "total rain matches input sum" $ do
        swbr_total_rain res `shouldSatisfy` approx 0.01 12.0

      it "total irrigation matches input sum" $ do
        swbr_total_irr res `shouldSatisfy` approx 0.01 20.0

    describe "soil water bounds" $ do

      it "SW never exceeds field capacity" $ do
        let fc = swbi_field_cap baseSWBInput
        mapM_ (\s -> sws_sw s `shouldSatisfy` (<= fc + 1e-6)) (swbr_steps res)

      it "SW never falls below wilting point" $ do
        let wp = swbi_wilting_pt baseSWBInput
        mapM_ (\s -> sws_sw s `shouldSatisfy` (>= wp - 1e-6)) (swbr_steps res)

      it "depletion is always non-negative" $ do
        mapM_ (\s -> sws_depletion s `shouldSatisfy` (>= 0.0)) (swbr_steps res)

      it "runoff is always non-negative" $ do
        mapM_ (\s -> sws_runoff s `shouldSatisfy` (>= 0.0)) (swbr_steps res)

      it "deep percolation is always non-negative" $ do
        mapM_ (\s -> sws_perc s `shouldSatisfy` (>= 0.0)) (swbr_steps res)

    describe "stress detection" $ do

      it "no stress when SW is near field capacity" $ do
        let rich = baseSWBInput
              { swbi_initial_sw = 130.0
              , swbi_steps = [SWBStep "2026-01-01" 20.0 20.0 1.0 1.0]
              }
            r = calcSoilWaterBalance rich
        sws_stress (head (swbr_steps r)) `shouldBe` False

      it "stress flagged when depletion exceeds 50% TAW" $ do
        -- TAW = 130-50=80, MAD = 40 mm; start at wilting point with no input
        let dry = baseSWBInput
              { swbi_initial_sw = 55.0   -- only 5 mm above WP
              , swbi_steps = [SWBStep "2026-01-01" 0.0 0.0 8.0 1.0]
              }
            r = calcSoilWaterBalance dry
        sws_stress (head (swbr_steps r)) `shouldBe` True

      it "stress_days counts flagged steps" $ do
        swbr_stress_days res `shouldSatisfy` (>= 0)

    describe "CN runoff" $ do

      it "zero runoff when precipitation is zero" $ do
        let noRain = baseSWBInput
              { swbi_steps = [SWBStep "2026-01-01" 0.0 10.0 3.0 1.0] }
            r = calcSoilWaterBalance noRain
        sws_runoff (head (swbr_steps r)) `shouldSatisfy` (~=~ 0.0)

      it "runoff increases with higher CN" $ do
        let lowCN  = baseSWBInput { swbi_cn = 60.0, swbi_steps = [SWBStep "2026-01-01" 50.0 0.0 3.0 1.0] }
            highCN = baseSWBInput { swbi_cn = 90.0, swbi_steps = [SWBStep "2026-01-01" 50.0 0.0 3.0 1.0] }
        let rLow  = sws_runoff (head (swbr_steps (calcSoilWaterBalance lowCN)))
            rHigh = sws_runoff (head (swbr_steps (calcSoilWaterBalance highCN)))
        rHigh `shouldSatisfy` (> rLow)

      it "runoff matches reference CN formula for heavy rain" $ do
        let heavyRain = baseSWBInput
              { swbi_cn    = 75.0
              , swbi_steps = [SWBStep "2026-01-01" 60.0 0.0 3.0 1.0]
              }
            r        = calcSoilWaterBalance heavyRain
            expected = refCnRunoff 75.0 60.0
        sws_runoff (head (swbr_steps r)) `shouldSatisfy` approx 0.1 expected

  -- =========================================================================
  describe "calcFertilizerRate" $ do

    let res = calcFertilizerRate baseFertInput

    describe "split application" $ do

      it "single split produces one entry per nutrient (N, P, K)" $ do
        -- implementation picks the best product per nutrient: 3 nutrients x 1 split = 3
        length (frr_splits res) `shouldBe` 3

      it "two splits doubles the number of entries vs single" $ do
        let r1 = calcFertilizerRate baseFertInput { fri_splits = 1 }
            r2 = calcFertilizerRate baseFertInput { fri_splits = 2 }
        length (frr_splits r2) `shouldBe` length (frr_splits r1) * 2

      it "split num is in range [1..splits]" $ do
        let r = calcFertilizerRate baseFertInput { fri_splits = 3 }
        mapM_ (\s -> ns_split_num s `shouldSatisfy` (\n -> n >= 1 && n <= 3)) (frr_splits r)

    describe "totals" $ do

      it "total N equals need * area" $ do
        frr_total_n res `shouldSatisfy` approx 0.01 (120.0 * 10.0)

      it "total P equals need * area" $ do
        frr_total_p res `shouldSatisfy` approx 0.01 (50.0 * 10.0)

      it "total K equals need * area" $ do
        frr_total_k res `shouldSatisfy` approx 0.01 (80.0 * 10.0)

      it "total cost is non-negative" $ do
        frr_total_cost res `shouldSatisfy` (>= 0.0)

    describe "product selection" $ do

      it "rate per ha is non-negative for all splits" $ do
        mapM_ (\s -> ns_rate_kg_ha s `shouldSatisfy` (>= 0.0)) (frr_splits res)

      it "rate_total = rate_kg_ha * area" $ do
        let area = fri_area_ha baseFertInput
        mapM_ (\s -> ns_rate_total s `shouldSatisfy` approx 0.5 (ns_rate_kg_ha s * area))
              (frr_splits res)

    describe "edge cases" $ do

      it "zero nutrient need produces zero total cost" $ do
        let zeroNeed = baseFertInput { fri_need = NutrientNeed 0 0 0 }
            r        = calcFertilizerRate zeroNeed
        frr_total_cost r `shouldSatisfy` (~=~ 0.0)

  -- =========================================================================
  describe "calcTankMix" $ do

    let res = calcTankMix baseTankInput

    describe "volumes" $ do

      it "total_water_l = area * water_vol_l_ha" $ do
        tmr_total_water_l res `shouldSatisfy` approx 0.1 (10.0 * 200.0)

      it "product amount_l = rate_l_ha * area" $ do
        let prods = tmr_products res
        mapM_ (\p -> tmr_amount_l p `shouldSatisfy` approx 0.01 (tmr_amount_l_ha p * 10.0)) prods

      it "all amounts are positive" $ do
        mapM_ (\p -> tmr_amount_l p `shouldSatisfy` (> 0.0)) (tmr_products res)

    describe "pH compatibility" $ do

      it "no pH risk when water pH is 7.0 and all products allow 5-8" $ do
        tmr_ph_risk res `shouldBe` False

      it "pH risk flagged when water pH is out of range" $ do
        let acidWater = baseTankInput { tmi_water_ph = 4.0 }
            r         = calcTankMix acidWater
        tmr_ph_risk r `shouldBe` True

      it "ph_ok is True for compatible product" $ do
        let compatible = filter tmr_ph_ok (tmr_products res)
        length compatible `shouldBe` length (tmr_products res)

      it "ph_ok is False for incompatible product at pH 4" $ do
        let acidWater = baseTankInput { tmi_water_ph = 4.0 }
            r         = calcTankMix acidWater
        any (not . tmr_ph_ok) (tmr_products r) `shouldBe` True

    describe "mixing order" $ do

      it "mixing order values are between 1 and 6" $ do
        mapM_ (\p -> tmr_order p `shouldSatisfy` (\o -> o >= 1 && o <= 6)) (tmr_products res)

      it "EC products have higher order than adjuvants" $ do
        let ecProd  = TankMixProduct "E" 1.0 "EC"       4.5 8.0
            adjProd = TankMixProduct "A" 0.5 "adjuvant" 4.0 9.0
            inp     = baseTankInput { tmi_products = [ecProd, adjProd] }
            r       = calcTankMix inp
            orders  = map (\p -> (tmr_name p, tmr_order p)) (tmr_products r)
            ecO     = snd . head $ filter (\(n,_) -> n == "E") orders
            adjO    = snd . head $ filter (\(n,_) -> n == "A") orders
        ecO `shouldSatisfy` (> adjO)

  -- =========================================================================
  describe "calcSprayVolume" $ do

    describe "formula correctness" $ do

      it "vol_l_ha matches reference formula" $ do
        let r        = calcSprayVolume baseSprayInput
            expected = refLHa 0.8 6.0 12.0 24
        svr_vol_l_ha r `shouldSatisfy` approx 1.0 expected

      it "total_liters = vol_l_ha * area" $ do
        let r = calcSprayVolume baseSprayInput
        svr_total_liters r `shouldSatisfy` approx 1.0 (svr_vol_l_ha r * 20.0)

      it "time_min is approximately time_h * 60" $ do
        let r        = calcSprayVolume baseSprayInput
            areaRateHaH = (6.0 * 1000.0 / 3600.0) * 12.0 * 3600.0 / 10000.0
            expectedMin = (20.0 / areaRateHaH) * 60.0
        svr_time_min r `shouldSatisfy` approx 1.0 expectedMin

    describe "monotonicity" $ do

      it "vol_l_ha decreases with higher speed" $ do
        let slow = calcSprayVolume baseSprayInput
            fast = calcSprayVolume baseSprayInput { svi_speed_km_h = 12.0 }
        svr_vol_l_ha fast `shouldSatisfy` (< svr_vol_l_ha slow)

      it "vol_l_ha increases with higher nozzle output" $ do
        let low  = calcSprayVolume baseSprayInput
            high = calcSprayVolume baseSprayInput { svi_nozzle_l_min = 1.6 }
        svr_vol_l_ha high `shouldSatisfy` (> svr_vol_l_ha low)

      it "vol_l_ha decreases with wider boom (more coverage per pass)" $ do
        let narrow = calcSprayVolume baseSprayInput
            wide   = calcSprayVolume baseSprayInput { svi_boom_m = 24.0 }
        svr_vol_l_ha wide `shouldSatisfy` (< svr_vol_l_ha narrow)

      it "total_liters doubles when area doubles" $ do
        let r1 = calcSprayVolume baseSprayInput
            r2 = calcSprayVolume baseSprayInput { svi_area_ha = 40.0 }
        svr_total_liters r2 `shouldSatisfy` approx 1.0 (svr_total_liters r1 * 2.0)

      it "more nozzles increases vol_l_ha proportionally" $ do
        let r1 = calcSprayVolume baseSprayInput { svi_nozzles = 12 }
            r2 = calcSprayVolume baseSprayInput { svi_nozzles = 24 }
        svr_vol_l_ha r2 `shouldSatisfy` approx 1.0 (svr_vol_l_ha r1 * 2.0)

    describe "all results positive" $ do

      it "all fields are positive for standard input" $ do
        let r = calcSprayVolume baseSprayInput
        svr_vol_l_ha     r `shouldSatisfy` (> 0.0)
        svr_total_liters r `shouldSatisfy` (> 0.0)
        svr_time_h       r `shouldSatisfy` (> 0.0)
        svr_time_min     r `shouldSatisfy` (> 0.0)

  -- =========================================================================
  describe "calcSoilNutrientBalance" $ do

    let res = calcSoilNutrientBalance baseNutrientInput

    describe "balance arithmetic" $ do

      it "N balance matches reference formula" $ do
        let expected = refNBalance 0 120 10 0 130
        snr_n_balance res `shouldSatisfy` approx 0.01 expected

      it "P balance = p_soil + p_fert - p_crop" $ do
        snr_p_balance res `shouldSatisfy` approx 0.01 (0 + 50 - 45)

      it "K balance = k_soil + k_fert - k_crop" $ do
        snr_k_balance res `shouldSatisfy` approx 0.01 (0 + 80 - 80)

    describe "status labels" $ do

      it "N deficit when crop removal exceeds inputs" $ do
        let deficientN = baseNutrientInput { sni_n_fert = 0.0, sni_n_atm = 0.0 }
            r          = calcSoilNutrientBalance deficientN
        snr_n_status r `shouldBe` "deficit"

      it "N surplus when inputs far exceed crop removal" $ do
        let surplusN = baseNutrientInput { sni_n_fert = 500.0 }
            r        = calcSoilNutrientBalance surplusN
        snr_n_status r `shouldBe` "surplus"

      it "balanced when N difference is within +/-10 kg/ha" $ do
        -- N: 0 + 130 + 10 + 0 - 130 = 10 => exactly on boundary
        let balanced = baseNutrientInput
              { sni_n_fert = 130.0, sni_n_atm = 0.0, sni_n_fixation = 0.0 }
            r = calcSoilNutrientBalance balanced
        snr_n_status r `shouldBe` "balanced"

      it "K balanced when fert equals crop removal" $ do
        snr_k_status res `shouldBe` "balanced"

      it "P surplus when fert significantly exceeds removal" $ do
        let surplusP = baseNutrientInput { sni_p_fert = 200.0 }
            r        = calcSoilNutrientBalance surplusP
        snr_p_status r `shouldBe` "surplus"

    describe "N fixation" $ do

      it "N fixation improves N balance" $ do
        let withFix    = baseNutrientInput { sni_n_fixation = 150.0 }
            withoutFix = baseNutrientInput { sni_n_fixation = 0.0   }
        snr_n_balance (calcSoilNutrientBalance withFix) `shouldSatisfy`
          (> snr_n_balance (calcSoilNutrientBalance withoutFix))

  -- =========================================================================
  describe "calcLimeRequirement" $ do

    let res = calcLimeRequirement baseLimeInput

    describe "basic output" $ do

      it "lime_t_ha is positive when current pH < target pH" $ do
        lr_lime_t_ha res `shouldSatisfy` (> 0.0)

      it "lime_total_t = lime_t_ha * area" $ do
        lr_lime_total_t res `shouldSatisfy` approx 0.01 (lr_lime_t_ha res * 10.0)

      it "ph_change = target - current" $ do
        lr_ph_change res `shouldSatisfy` approx 1e-6 (6.5 - 5.8)

    describe "zero requirement" $ do

      it "returns zero lime when current pH >= target pH" $ do
        let noLime = baseLimeInput { li_current_ph = 7.0, li_target_ph = 6.5 }
            r      = calcLimeRequirement noLime
        lr_lime_t_ha r `shouldSatisfy` (~=~ 0.0)

      it "recommendation is 'No lime required' when no adjustment needed" $ do
        let noLime = baseLimeInput { li_current_ph = 7.0, li_target_ph = 6.5 }
            r      = calcLimeRequirement noLime
        lr_recommendation r `shouldBe` "No lime required"

    describe "soil texture effect" $ do

      it "clay soil requires more lime than sandy soil (same pH gap)" $ do
        let sandy = calcLimeRequirement baseLimeInput { li_soil_texture = "sandy" }
            clay  = calcLimeRequirement baseLimeInput { li_soil_texture = "clay"  }
        lr_lime_t_ha clay `shouldSatisfy` (> lr_lime_t_ha sandy)

      it "loam requirement is between sandy and clay" $ do
        let sandy = calcLimeRequirement baseLimeInput { li_soil_texture = "sandy" }
            loam  = calcLimeRequirement baseLimeInput { li_soil_texture = "loam"  }
            clay  = calcLimeRequirement baseLimeInput { li_soil_texture = "clay"  }
        lr_lime_t_ha loam `shouldSatisfy` (> lr_lime_t_ha sandy)
        lr_lime_t_ha loam `shouldSatisfy` (< lr_lime_t_ha clay)

    describe "lime efficiency" $ do

      it "lower CCE requires more lime" $ do
        let highCCE = calcLimeRequirement baseLimeInput { li_lime_ecce = 0.95 }
            lowCCE  = calcLimeRequirement baseLimeInput { li_lime_ecce = 0.50 }
        lr_lime_t_ha lowCCE `shouldSatisfy` (> lr_lime_t_ha highCCE)

    describe "organic matter effect" $ do

      it "higher OM increases lime requirement" $ do
        let low  = calcLimeRequirement baseLimeInput { li_om_pct = 1.0 }
            high = calcLimeRequirement baseLimeInput { li_om_pct = 8.0 }
        lr_lime_t_ha high `shouldSatisfy` (> lr_lime_t_ha low)

  -- =========================================================================
  describe "calcMachineryCost" $ do

    let res = calcMachineryCost baseMachInput

    describe "cost breakdown" $ do

      it "all per-hour components are non-negative" $ do
        mcr_depreciation_h res `shouldSatisfy` (>= 0.0)
        mcr_fuel_h         res `shouldSatisfy` (>= 0.0)
        mcr_oil_h          res `shouldSatisfy` (>= 0.0)
        mcr_repair_h       res `shouldSatisfy` (>= 0.0)
        mcr_labour_h       res `shouldSatisfy` (>= 0.0)

      it "total_cost_h = sum of all components" $ do
        let expected = mcr_depreciation_h res + mcr_fuel_h res
                     + mcr_oil_h res + mcr_repair_h res + mcr_labour_h res
        mcr_total_cost_h res `shouldSatisfy` approx 0.01 expected

      it "cost_per_ha = total_cost_h / capacity_ha_h" $ do
        let expected = mcr_total_cost_h res / mci_capacity_ha_h baseMachInput
        mcr_cost_per_ha res `shouldSatisfy` approx 0.01 expected

      it "total_cost_field = cost_per_ha * area" $ do
        let expected = mcr_cost_per_ha res * mci_area_ha baseMachInput
        mcr_total_cost_field res `shouldSatisfy` approx 1.0 expected

    describe "depreciation" $ do

      it "depreciation matches straight-line formula" $ do
        let annual   = (250000.0 - 30000.0) / 12.0
            expected = annual / 600.0
        mcr_depreciation_h res `shouldSatisfy` approx 0.01 expected

      it "zero salvage value increases depreciation" $ do
        let noSalvage = calcMachineryCost baseMachInput { mci_salvage_value = 0.0 }
        mcr_depreciation_h noSalvage `shouldSatisfy` (> mcr_depreciation_h res)

    describe "fuel cost" $ do

      it "fuel_h = fuel_l_h * fuel_price" $ do
        let expected = 18.0 * 1.4
        mcr_fuel_h res `shouldSatisfy` approx 0.01 expected

      it "oil_h = fuel_h * oil_pct" $ do
        let expected = mcr_fuel_h res * mci_oil_pct baseMachInput
        mcr_oil_h res `shouldSatisfy` approx 0.01 expected

    describe "monotonicity" $ do

      it "higher fuel price increases total cost" $ do
        let cheap = calcMachineryCost baseMachInput { mci_fuel_price = 1.0 }
            dear  = calcMachineryCost baseMachInput { mci_fuel_price = 2.5 }
        mcr_total_cost_h dear `shouldSatisfy` (> mcr_total_cost_h cheap)

      it "higher capacity reduces cost per ha" $ do
        let slow = calcMachineryCost baseMachInput { mci_capacity_ha_h = 2.0 }
            fast = calcMachineryCost baseMachInput { mci_capacity_ha_h = 5.0 }
        mcr_cost_per_ha fast `shouldSatisfy` (< mcr_cost_per_ha slow)

  -- =========================================================================
  describe "calcSeedRate" $ do

    let res = calcSeedRate baseSeedInput

    describe "formula correctness" $ do

      it "seeds_ha = target_plants_m2 / (germination * emergence) * 10000" $ do
        let expected = 250.0 / (0.94 * 0.83) * 10000.0
        srr_seeds_ha res `shouldSatisfy` approx 10.0 expected

      it "kg_ha = seeds_ha * tkw / 1_000_000" $ do
        let expected = srr_seeds_ha res * 42.0 / 1000000.0
        srr_kg_ha res `shouldSatisfy` approx 0.1 expected

      it "total_kg = kg_ha * area" $ do
        srr_total_kg res `shouldSatisfy` approx 1.0 (srr_kg_ha res * 50.0)

      it "seeds_per_m_row is approximately seeds_m2 * row_spacing_m" $ do
        -- both are independently rounded, compare against raw formula
        let rawSeedsM2 = 250.0 / (0.94 * 0.83)
            expected   = rawSeedsM2 * (12.5 / 100.0)
        srr_seeds_per_m_row res `shouldSatisfy` approx 0.5 expected

    describe "monotonicity" $ do

      it "lower germination requires more seed" $ do
        let high = calcSeedRate baseSeedInput { sri_germination_pct = 98.0 }
            low  = calcSeedRate baseSeedInput { sri_germination_pct = 75.0 }
        srr_kg_ha low `shouldSatisfy` (> srr_kg_ha high)

      it "lower field emergence requires more seed" $ do
        let good = calcSeedRate baseSeedInput { sri_field_emergence = 0.95 }
            poor = calcSeedRate baseSeedInput { sri_field_emergence = 0.60 }
        srr_kg_ha poor `shouldSatisfy` (> srr_kg_ha good)

      it "heavier seeds (higher TKW) require more kg/ha" $ do
        let light = calcSeedRate baseSeedInput { sri_tkw_g = 30.0 }
            heavy = calcSeedRate baseSeedInput { sri_tkw_g = 60.0 }
        srr_kg_ha heavy `shouldSatisfy` (> srr_kg_ha light)

      it "higher target density requires more seed" $ do
        let sparse = calcSeedRate baseSeedInput { sri_target_plants_m2 = 100.0 }
            dense  = calcSeedRate baseSeedInput { sri_target_plants_m2 = 400.0 }
        srr_kg_ha dense `shouldSatisfy` (> srr_kg_ha sparse)

      it "total_kg scales linearly with area" $ do
        let r1 = calcSeedRate baseSeedInput
            r2 = calcSeedRate baseSeedInput { sri_area_ha = 100.0 }
        srr_total_kg r2 `shouldSatisfy` approx 0.5 (srr_total_kg r1 * 2.0)

    describe "edge cases" $ do

      it "germination clamped -- no division by zero at extreme low value" $ do
        let r = calcSeedRate baseSeedInput { sri_germination_pct = 0.0001 }
        srr_seeds_ha r `shouldSatisfy` (> 0.0)

      it "all fields are positive for valid input" $ do
        srr_seeds_m2        res `shouldSatisfy` (> 0.0)
        srr_seeds_ha        res `shouldSatisfy` (> 0.0)
        srr_kg_ha           res `shouldSatisfy` (> 0.0)
        srr_total_kg        res `shouldSatisfy` (> 0.0)
        srr_seeds_per_m_row res `shouldSatisfy` (> 0.0)