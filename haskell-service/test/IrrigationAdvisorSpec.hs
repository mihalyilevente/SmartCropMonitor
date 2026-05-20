module IrrigationAdvisorSpec (spec) where

import Test.Hspec
import IrrigationAdvisor
  ( computeIrrigation
  , IrrigationInput(..)
  , IrrigationResult(..)
  , FieldAdvice(..)
  , FieldInput(..)
  , WeatherContext(..)
  )

-- =============================================================================
-- HELPERS
-- =============================================================================

inRange :: Double -> Double -> Double -> Bool
inRange lo hi x = x >= lo && x <= hi

-- Minimal FieldInput constructor
mkField :: Int -> String -> String -> Maybe String -> Maybe Double -> FieldInput
mkField fid lbl ftype crop area = FieldInput
  { fieldId    = fid
  , fieldLabel = lbl
  , fieldType  = ftype
  , cropType   = crop
  , areHa      = area
  , ndwiMean   = Nothing
  , ndviMean   = Nothing
  }

-- WeatherContext with every field absent (all Nothing)
emptyWx :: WeatherContext
emptyWx = WeatherContext
  { et0Val          = Nothing
  , waterDeficit7d  = Nothing
  , waterDeficit30d = Nothing
  , rainCum7d       = Nothing
  , rainCum30d      = Nothing
  , spi1m           = Nothing
  , soilMoisture    = Nothing
  , vpd             = Nothing
  , tempMean7d      = Nothing
  , humMean7d       = Nothing
  }

-- Neutral well-watered week — no stress signals
goodWx :: WeatherContext
goodWx = emptyWx
  { et0Val         = Just 2.0    -- low demand
  , waterDeficit7d = Just 0.0
  , rainCum7d      = Just 30.0   -- 15-40 mm - 0 pts
  , soilMoisture   = Just 0.30   -- above highSM for most crops
  , spi1m          = Just 0.5
  }

-- Severe drought — forces CRITICAL for any standard crop field
-- Score breakdown (CORN Kc=1.20, criticalSM=0.14):
--   SM=0.10 < 0.14       → +4.0
--   wd7=25  > 20         → +3.0
--   ET0=6 * 1.20=7.2 > 5 → +2.0
--   rain=2  < 5          → +2.0
--   SPI=-2  < -1.5       → +2.0
--   VPD=2.5 > 2.0        → +1.0
--   Total                  14.0 → CRITICAL
droughtWx :: WeatherContext
droughtWx = emptyWx
  { et0Val         = Just 6.0
  , waterDeficit7d = Just 25.0
  , rainCum7d      = Just 2.0
  , soilMoisture   = Just 0.10
  , spi1m          = Just (-2.0)
  , vpd            = Just 2.5
  }

-- Moderate stress — scores around 3-4 → MODERATE
-- Score breakdown (CORN):
--   ET0=3.5 * 1.20=4.2 in (3,5] → +1.0
--   wd7=12  in (10,20]           → +1.5
--   rain=8  in [5,15)            → +1.0
--   Total                          3.5 → MODERATE
moderateWx :: WeatherContext
moderateWx = emptyWx
  { et0Val         = Just 3.5
  , waterDeficit7d = Just 12.0
  , rainCum7d      = Just 8.0
  , soilMoisture   = Just 0.22   -- above CORN highSM 0.20 → 0 pts
  }

-- Reusable field fixtures
cornField :: FieldInput
cornField = mkField 1 "North CORN" "crop" (Just "CORN") (Just 10.0)

wheatField :: FieldInput
wheatField = mkField 2 "South WHEAT" "crop" (Just "WHEAT_WINTER") (Just 5.0)

vineyardField :: FieldInput
vineyardField = mkField 3 "Hillside Vineyard" "vineyard" (Just "GRAPES_WINE") (Just 3.0)

pastureField :: FieldInput
pastureField = mkField 4 "East Pasture" "pasture" (Just "GRASS_MIX") (Just 8.0)

waterField :: FieldInput
waterField = mkField 5 "Pond" "water_body" Nothing (Just 1.0)

fallowField :: FieldInput
fallowField = mkField 6 "Resting Land" "fallow_land" Nothing (Just 4.0)

-- Run for a single field
advise :: WeatherContext -> FieldInput -> FieldAdvice
advise wx fi =
  head . irFields $
    computeIrrigation IrrigationInput { fields = [fi], weather = wx }

-- Run for a list of fields
adviseAll :: WeatherContext -> [FieldInput] -> IrrigationResult
adviseAll wx flds =
  computeIrrigation IrrigationInput { fields = flds, weather = wx }

-- Local mirror of urgencyRank (used only for sort-order test)
urgencyRank :: String -> Int
urgencyRank "CRITICAL" = 4
urgencyRank "HIGH"     = 3
urgencyRank "MODERATE" = 2
urgencyRank "LOW"      = 1
urgencyRank _          = 0

-- =============================================================================
-- SPEC
-- =============================================================================

spec :: Spec
spec = do

  -- ---------------------------------------------------------------------------
  describe "NeverIrrigate field types" $ do

    it "water_body -> NONE, no irrigation, dose 0" $ do
      let a = advise droughtWx waterField
      advUrgency        a `shouldBe` "NONE"
      advShouldIrrigate a `shouldBe` False
      advRecommMm       a `shouldBe` 0.0
      advRecommM3Ha     a `shouldBe` 0.0
      advTotalM3        a `shouldBe` 0.0

    it "fallow_land -> NONE regardless of severe drought" $ do
      let a = advise droughtWx fallowField
      advUrgency        a `shouldBe` "NONE"
      advShouldIrrigate a `shouldBe` False

    it "storage -> NONE" $ do
      let fi = mkField 7 "Barn" "storage" Nothing (Just 0.5)
      advUrgency (advise droughtWx fi) `shouldBe` "NONE"

    it "forest_belt -> NONE" $ do
      let fi = mkField 8 "Windbreak" "forest_belt" Nothing (Just 2.0)
      advUrgency (advise droughtWx fi) `shouldBe` "NONE"

    it "fallow -> NONE" $ do
      let fi = mkField 9 "Fallow" "fallow" Nothing (Just 3.0)
      advUrgency (advise droughtWx fi) `shouldBe` "NONE"

    it "NeverIrrigate reason list is non-empty" $ do
      advReason (advise droughtWx waterField) `shouldSatisfy` (not . null)

  -- ---------------------------------------------------------------------------
  describe "ReducedDose field types" $ do

    it "pasture dose <= equivalent crop dose (same crop, same stress)" $ do
      let cropF    = mkField 1 "CropF"    "crop"    (Just "GRASS_MIX") (Just 8.0)
          pastureF = mkField 2 "PastureF" "pasture" (Just "GRASS_MIX") (Just 8.0)
      advRecommMm (advise droughtWx pastureF)
        `shouldSatisfy` (<= advRecommMm (advise droughtWx cropF))

    it "hayfield dose <= equivalent crop dose" $ do
      let cropF = mkField 1 "CropF"     "crop"     (Just "ALFALFA") (Just 5.0)
          hayF  = mkField 2 "HayfieldF" "hayfield" (Just "ALFALFA") (Just 5.0)
      advRecommMm (advise droughtWx hayF)
        `shouldSatisfy` (<= advRecommMm (advise droughtWx cropF))

    it "greenhouse dose <= equivalent crop dose" $ do
      let cropF = mkField 1 "CropF" "crop"       (Just "TOMATO") (Just 2.0)
          ghF   = mkField 2 "GHF"   "greenhouse" (Just "TOMATO") (Just 2.0)
      advRecommMm (advise droughtWx ghF)
        `shouldSatisfy` (<= advRecommMm (advise droughtWx cropF))

    it "ReducedDose field still receives urgency classification" $ do
      advUrgency (advise droughtWx pastureField)
        `shouldSatisfy` (`elem` ["CRITICAL","HIGH","MODERATE","LOW","NONE"])

  -- ---------------------------------------------------------------------------
  describe "Urgency tiers (score thresholds)" $ do

    it "good conditions -> NONE, dose = 0" $ do
      let a = advise goodWx cornField
      advUrgency        a `shouldBe` "NONE"
      advShouldIrrigate a `shouldBe` False
      advRecommMm       a `shouldBe` 0.0

    it "severe drought -> CRITICAL for standard crop field" $ do
      let a = advise droughtWx cornField
      advUrgency        a `shouldBe` "CRITICAL"
      advShouldIrrigate a `shouldBe` True

    it "moderate stress -> MODERATE or HIGH, shouldIrrigate = True" $ do
      let a = advise moderateWx cornField
      advUrgency        a `shouldSatisfy` (`elem` ["MODERATE","HIGH"])
      advShouldIrrigate a `shouldBe` True

    it "score >= 9 -> CRITICAL" $ do
      let a = advise droughtWx cornField
      advScoreTotal a `shouldSatisfy` (>= 9.0)
      advUrgency    a `shouldBe` "CRITICAL"

    it "shouldIrrigate True iff urgency in {CRITICAL,HIGH,MODERATE}" $ do
      let check wx fi =
            let a = advise wx fi
            in if advUrgency a `elem` ["CRITICAL","HIGH","MODERATE"]
               then advShouldIrrigate a `shouldBe` True
               else advShouldIrrigate a `shouldBe` False
      check droughtWx  cornField
      check goodWx     cornField
      check moderateWx wheatField

  -- ---------------------------------------------------------------------------
  describe "Soil moisture signal" $ do

    it "SM < criticalSM -> +4 pts  (CORN criticalSM=0.14, SM=0.10)" $ do
      let a = advise emptyWx { soilMoisture = Just 0.10 } cornField
      advScoreTotal a `shouldSatisfy` inRange 3.9 4.1

    it "SM < highSM but >= criticalSM -> +2 pts  (CORN highSM=0.20, SM=0.16)" $ do
      let a = advise emptyWx { soilMoisture = Just 0.16 } cornField
      advScoreTotal a `shouldSatisfy` inRange 1.9 2.1

    it "SM > 0.35 -> -1 pt (well saturated)" $ do
      let a = advise emptyWx { soilMoisture = Just 0.40 } cornField
      advScoreTotal a `shouldSatisfy` (<= -0.9)

    it "SM = Nothing -> 0 pts from soil moisture" $ do
      advScoreTotal (advise emptyWx cornField) `shouldBe` 0.0

    it "RICE criticalSM=0.25 triggers +4 pts at SM=0.22" $ do
      let riceField = mkField 10 "Paddy" "crop" (Just "RICE") (Just 2.0)
          a = advise emptyWx { soilMoisture = Just 0.22 } riceField
      advScoreTotal a `shouldSatisfy` (>= 4.0)

    it "COTTON criticalSM=0.12: SM=0.13 is above critical, gives +2 (highSM=0.17)" $ do
      let cottonField = mkField 11 "Cotton" "crop" (Just "COTTON") (Just 6.0)
          a = advise emptyWx { soilMoisture = Just 0.13 } cottonField
      advScoreTotal a `shouldSatisfy` inRange 1.9 2.1

  -- ---------------------------------------------------------------------------
  describe "Water deficit signal" $ do

    it "deficit > 20 mm -> +3 pts" $ do
      let a = advise emptyWx { waterDeficit7d = Just 25.0 } cornField
      advScoreTotal a `shouldSatisfy` inRange 2.9 3.1

    it "deficit 10-20 mm -> +1.5 pts" $ do
      let a = advise emptyWx { waterDeficit7d = Just 15.0 } cornField
      advScoreTotal a `shouldSatisfy` inRange 1.4 1.6

    it "deficit 5-10 mm -> +0.5 pts" $ do
      let a = advise emptyWx { waterDeficit7d = Just 7.0 } cornField
      advScoreTotal a `shouldSatisfy` inRange 0.4 0.6

    it "surplus < -10 mm -> -2 pts" $ do
      let a = advise emptyWx { waterDeficit7d = Just (-15.0) } cornField
      advScoreTotal a `shouldSatisfy` (<= -1.9)

    it "deficit = 0 -> 0 pts" $ do
      let a = advise emptyWx { waterDeficit7d = Just 0.0 } cornField
      advScoreTotal a `shouldBe` 0.0

  -- ---------------------------------------------------------------------------
  describe "ET0 signal" $ do

    it "CORN: ET0=5 -> etCrop=6.0 > 5 -> +2 pts" $ do
      let a = advise emptyWx { et0Val = Just 5.0 } cornField
      advScoreTotal a `shouldSatisfy` inRange 1.9 2.1

    it "CORN: ET0=3 -> etCrop=3.6 in (3,5] -> +1 pt" $ do
      let a = advise emptyWx { et0Val = Just 3.0 } cornField
      advScoreTotal a `shouldSatisfy` inRange 0.9 1.1

    it "CORN: ET0=1 -> etCrop=1.2 <= 3 -> 0 pts" $ do
      let a = advise emptyWx { et0Val = Just 1.0 } cornField
      advScoreTotal a `shouldBe` 0.0

    it "GRAPES_WINE Kc=0.85 scores lower than CORN Kc=1.20 at same ET0=5" $ do
      let grapesField = mkField 12 "Grapes" "vineyard" (Just "GRAPES_WINE") (Just 3.0)
      advScoreTotal (advise emptyWx { et0Val = Just 5.0 } cornField)
        `shouldSatisfy`
          (> advScoreTotal (advise emptyWx { et0Val = Just 5.0 } grapesField))

  -- ---------------------------------------------------------------------------
  describe "Rainfall signal" $ do

    it "rain < 5 mm -> +2 pts" $ do
      let a = advise emptyWx { rainCum7d = Just 2.0 } cornField
      advScoreTotal a `shouldSatisfy` inRange 1.9 2.1

    it "rain 5-15 mm -> +1 pt" $ do
      let a = advise emptyWx { rainCum7d = Just 10.0 } cornField
      advScoreTotal a `shouldSatisfy` inRange 0.9 1.1

    it "rain 15-40 mm -> 0 pts" $ do
      let a = advise emptyWx { rainCum7d = Just 25.0 } cornField
      advScoreTotal a `shouldBe` 0.0

    it "rain > 40 mm -> -2 pts" $ do
      let a = advise emptyWx { rainCum7d = Just 50.0 } cornField
      advScoreTotal a `shouldSatisfy` (<= -1.9)

    it "rainy week with water surplus suppresses irrigation despite ET and canopy stress" $ do
      let rainyWx = emptyWx
            { et0Val         = Just 5.5
            , waterDeficit7d = Just (-18.0)
            , rainCum7d      = Just 65.0
            , soilMoisture   = Just 0.32
            , vpd            = Just 2.4
            }
          stressedCanopy = cornField { ndwiMean = Just (-0.30), ndviMean = Just 0.20 }
          a = advise rainyWx stressedCanopy
      advUrgency        a `shouldBe` "NONE"
      advShouldIrrigate a `shouldBe` False
      advRecommMm       a `shouldBe` 0.0

    it "rainy week does not suppress irrigation when current soil moisture is still dry" $ do
      let rainyButDryWx = emptyWx
            { et0Val         = Just 5.5
            , waterDeficit7d = Just 3.0
            , rainCum7d      = Just 55.0
            , soilMoisture   = Just 0.12
            , spi1m          = Just (-1.8)
            }
          a = advise rainyButDryWx cornField
      advShouldIrrigate a `shouldBe` True

  -- ---------------------------------------------------------------------------
  describe "SPI signal" $ do

    it "SPI < -1.5 -> +2 pts" $ do
      let a = advise emptyWx { spi1m = Just (-2.0) } cornField
      advScoreTotal a `shouldSatisfy` inRange 1.9 2.1

    it "SPI -1.5 to -1.0 -> +1 pt" $ do
      let a = advise emptyWx { spi1m = Just (-1.2) } cornField
      advScoreTotal a `shouldSatisfy` inRange 0.9 1.1

    it "SPI -1.0 to 1.0 -> 0 pts" $ do
      let a = advise emptyWx { spi1m = Just 0.0 } cornField
      advScoreTotal a `shouldBe` 0.0

    it "SPI > 1.0 -> -1 pt" $ do
      let a = advise emptyWx { spi1m = Just 1.5 } cornField
      advScoreTotal a `shouldSatisfy` (<= -0.9)

  -- ---------------------------------------------------------------------------
  describe "VPD signal" $ do

    it "VPD > 2.0 kPa -> +1 pt" $ do
      let a = advise emptyWx { vpd = Just 2.5 } cornField
      advScoreTotal a `shouldSatisfy` inRange 0.9 1.1

    it "VPD <= 2.0 kPa -> 0 pts" $ do
      let a = advise emptyWx { vpd = Just 1.5 } cornField
      advScoreTotal a `shouldBe` 0.0

  -- ---------------------------------------------------------------------------
  describe "NDWI signal" $ do

    it "NDWI < -0.2 -> +2 pts" $ do
      let fi = cornField { ndwiMean = Just (-0.30) }
      advScoreTotal (advise emptyWx fi) `shouldSatisfy` inRange 1.9 2.1

    it "NDWI -0.2 to -0.1 -> +1 pt" $ do
      let fi = cornField { ndwiMean = Just (-0.15) }
      advScoreTotal (advise emptyWx fi) `shouldSatisfy` inRange 0.9 1.1

    it "NDWI -0.1 to 0.1 -> 0 pts" $ do
      let fi = cornField { ndwiMean = Just 0.0 }
      advScoreTotal (advise emptyWx fi) `shouldBe` 0.0

    it "NDWI > 0.1 -> -1 pt" $ do
      let fi = cornField { ndwiMean = Just 0.25 }
      advScoreTotal (advise emptyWx fi) `shouldSatisfy` (<= -0.9)

  -- ---------------------------------------------------------------------------
  describe "NDVI signal" $ do

    it "NDVI < 0.25 -> +1 pt" $ do
      let fi = cornField { ndviMean = Just 0.20 }
      advScoreTotal (advise emptyWx fi) `shouldSatisfy` inRange 0.9 1.1

    it "NDVI 0.25-0.65 -> 0 pts" $ do
      let fi = cornField { ndviMean = Just 0.45 }
      advScoreTotal (advise emptyWx fi) `shouldBe` 0.0

    it "NDVI > 0.65 -> -0.5 pts" $ do
      let fi = cornField { ndviMean = Just 0.80 }
      advScoreTotal (advise emptyWx fi) `shouldSatisfy` (<= -0.4)

  -- ---------------------------------------------------------------------------
  describe "Dose calculation - primary path (water deficit)" $ do

    it "dose = wd7 * depletionFrac for MODERATE  (CORN p=0.55, wd=12 -> 6.6)" $ do
      -- moderateWx has wd7=12; CORN urgency = MODERATE; dose = 12*0.55 = 6.6
      let a = advise moderateWx cornField
      if advShouldIrrigate a
        then advRecommMm a `shouldSatisfy` inRange 6.0 7.5
        else advRecommMm a `shouldBe` 0.0

    it "CRITICAL scales dose x 1.30  (wd=25, CORN p=0.55 -> 25*0.55*1.3=17.9)" $ do
      let a = advise droughtWx cornField
      advUrgency  a `shouldBe` "CRITICAL"
      advRecommMm a `shouldSatisfy` inRange 17.0 19.0

    it "dose never exceeds CORN maxDoseMm=50" $ do
      let extremeWx = droughtWx { waterDeficit7d = Just 1000.0 }
      advRecommMm (advise extremeWx cornField) `shouldSatisfy` (<= 50.0)

    it "dose never exceeds POTATOES maxDoseMm=35" $ do
      let potatoField = mkField 13 "Potato" "crop" (Just "POTATOES") (Just 5.0)
          extremeWx   = droughtWx { waterDeficit7d = Just 1000.0 }
      advRecommMm (advise extremeWx potatoField) `shouldSatisfy` (<= 35.0)

    it "dose = 0 when urgency = NONE" $ do
      let a = advise goodWx cornField
      advRecommMm   a `shouldBe` 0.0
      advRecommM3Ha a `shouldBe` 0.0
      advTotalM3    a `shouldBe` 0.0

  -- ---------------------------------------------------------------------------
  describe "Dose calculation - ET0 fallback path" $ do

    it "when waterDeficit7d=Nothing, falls back to ET0 path (dose > 0 under stress)" $ do
      -- Force CRITICAL via SM + SPI + rain, no waterDeficit7d
      let wx = emptyWx
                { et0Val       = Just 5.0
                , rainCum7d    = Just 0.0
                , soilMoisture = Just 0.10
                , spi1m        = Just (-2.0)
                }
          a  = advise wx cornField
      advShouldIrrigate a `shouldBe` True
      advRecommMm       a `shouldSatisfy` (> 0.0)
      advRecommMm       a `shouldSatisfy` (<= 50.0)

    it "ET0 fallback: rain reduces dose (effective rain = rain x 0.75)" $ do
      let wxBase = emptyWx
                { et0Val       = Just 5.0
                , soilMoisture = Just 0.10
                , spi1m        = Just (-2.0)
                }
          aNoRain = advise wxBase                         cornField
          aRain   = advise wxBase { rainCum7d = Just 20.0 } cornField
      if advShouldIrrigate aNoRain && advShouldIrrigate aRain
        then advRecommMm aRain `shouldSatisfy` (< advRecommMm aNoRain)
        else return ()

  -- ---------------------------------------------------------------------------
  describe "Volume calculations" $ do

    it "recommended_m3_ha = recommended_mm x 10" $ do
      let a = advise droughtWx cornField
      advRecommM3Ha a
        `shouldSatisfy` inRange (advRecommMm a * 10.0 - 0.1) (advRecommMm a * 10.0 + 0.1)

    it "total_volume_m3 = recommended_m3_ha x area_ha  (10 ha)" $ do
      let a = advise droughtWx cornField
      advTotalM3 a
        `shouldSatisfy` inRange (advRecommM3Ha a * 10.0 - 0.2) (advRecommM3Ha a * 10.0 + 0.2)

    it "total_volume_m3 scales proportionally with area" $ do
      let bigField   = cornField { areHa = Just 20.0 }
          smallField = cornField { areHa = Just 5.0  }
          aBig   = advise droughtWx bigField
          aSmall = advise droughtWx smallField
      if advTotalM3 aSmall > 0.0
        then (advTotalM3 aBig / advTotalM3 aSmall) `shouldSatisfy` inRange 3.9 4.1
        else return ()

    it "area=Nothing defaults to 1 ha (total_m3 apr = m3_ha)" $ do
      let a = advise droughtWx cornField { areHa = Nothing }
      advTotalM3 a
        `shouldSatisfy` inRange (advRecommM3Ha a - 0.1) (advRecommM3Ha a + 0.1)

  -- ---------------------------------------------------------------------------
  describe "Crop-specific differences" $ do

    it "POTATOES cap 35 mm < CORN cap 50 mm under extreme deficit" $ do
      let potatoField = mkField 14 "Potato" "crop" (Just "POTATOES") (Just 5.0)
          extremeWx   = droughtWx { waterDeficit7d = Just 500.0 }
      advRecommMm (advise extremeWx potatoField) `shouldSatisfy` (<= 35.0)
      advRecommMm (advise extremeWx cornField)   `shouldSatisfy` (<= 50.0)
      advRecommMm (advise extremeWx potatoField)
        `shouldSatisfy` (< advRecommMm (advise extremeWx cornField))

    it "FALLOW crop type -> Kc=0, maxDose=0, dose always 0" $ do
      -- field_type = "crop" but crop_type = FALLOW
      let fallowCrop = mkField 15 "Fallow Crop" "crop" (Just "FALLOW") (Just 5.0)
      advRecommMm (advise droughtWx fallowCrop) `shouldBe` 0.0

    it "COTTON depletionFrac=0.65 gives larger dose than POTATOES p=0.35 at same deficit" $ do
      let cottonField  = mkField 16 "Cotton"   "crop" (Just "COTTON")   (Just 5.0)
          potatoField2 = mkField 17 "Potatoes" "crop" (Just "POTATOES") (Just 5.0)
          wx = emptyWx
                { waterDeficit7d = Just 30.0
                , soilMoisture   = Just 0.10
                , spi1m          = Just (-2.0)
                , rainCum7d      = Just 2.0
                }
      if advShouldIrrigate (advise wx cottonField) &&
         advShouldIrrigate (advise wx potatoField2)
        then advRecommMm (advise wx cottonField)
               `shouldSatisfy` (>= advRecommMm (advise wx potatoField2))
        else return ()

    it "RICE criticalSM=0.25: SM=0.22 triggers +4 pts (critical signal)" $ do
      let riceField = mkField 18 "Paddy" "crop" (Just "RICE") (Just 3.0)
      advScoreTotal (advise emptyWx { soilMoisture = Just 0.22 } riceField)
        `shouldSatisfy` (>= 4.0)

  -- ---------------------------------------------------------------------------
  describe "IrrigationResult aggregates" $ do

    it "fields_total = number of input fields" $ do
      irFieldsTotal (adviseAll droughtWx [cornField, wheatField, vineyardField, waterField])
        `shouldBe` 4

    it "fields_need_action = count of shouldIrrigate=True fields" $ do
      let res = adviseAll droughtWx [cornField, wheatField, waterField, fallowField]
      irFieldsNeedAction res
        `shouldBe` length (filter advShouldIrrigate (irFields res))

    it "total_water_m3 = sum of per-field total_volume_m3" $ do
      let res      = adviseAll droughtWx [cornField, wheatField, vineyardField]
          expected = sum (map advTotalM3 (irFields res))
      irTotalWaterM3 res `shouldSatisfy` inRange (expected - 0.2) (expected + 0.2)

    it "critical_count = count of CRITICAL fields" $ do
      let res = adviseAll droughtWx [cornField, wheatField, vineyardField, waterField]
      irCriticalCount res
        `shouldBe` length (filter ((== "CRITICAL") . advUrgency) (irFields res))

    it "high_count = count of HIGH fields" $ do
      let res = adviseAll moderateWx [cornField, wheatField, vineyardField]
      irHighCount res
        `shouldBe` length (filter ((== "HIGH") . advUrgency) (irFields res))

    it "fields are sorted by urgency descending (CRITICAL first)" $ do
      let res   = adviseAll droughtWx [waterField, cornField, wheatField]
          ranks = map (urgencyRank . advUrgency) (irFields res)
      and (zipWith (>=) ranks (tail ranks)) `shouldBe` True

    it "NeverIrrigate fields not counted in fields_need_action" $ do
      irFieldsNeedAction (adviseAll droughtWx [waterField, fallowField])
        `shouldBe` 0

    it "empty field list -> all counts = 0, total water = 0" $ do
      let res = adviseAll droughtWx []
      irFieldsTotal      res `shouldBe` 0
      irFieldsNeedAction res `shouldBe` 0
      irTotalWaterM3     res `shouldBe` 0.0
      irCriticalCount    res `shouldBe` 0

  -- ---------------------------------------------------------------------------
  describe "Input echo in FieldAdvice" $ do

    it "advEt0 echoes weather et0Val" $ do
      advEt0 (advise goodWx { et0Val = Just 3.7 } cornField) `shouldBe` Just 3.7

    it "advWaterDef7d echoes waterDeficit7d" $ do
      advWaterDef7d (advise emptyWx { waterDeficit7d = Just 18.5 } cornField)
        `shouldBe` Just 18.5

    it "advRainCum7d echoes rainCum7d" $ do
      advRainCum7d (advise emptyWx { rainCum7d = Just 7.3 } cornField)
        `shouldBe` Just 7.3

    it "advSoilMoisture echoes soilMoisture" $ do
      advSoilMoisture (advise emptyWx { soilMoisture = Just 0.22 } cornField)
        `shouldBe` Just 0.22

    it "advNdwi echoes ndwiMean from FieldInput" $ do
      advNdwi (advise emptyWx cornField { ndwiMean = Just (-0.15) })
        `shouldBe` Just (-0.15)

    it "advSpi1m echoes spi1m" $ do
      advSpi1m (advise emptyWx { spi1m = Just (-1.8) } cornField)
        `shouldBe` Just (-1.8)

  -- ---------------------------------------------------------------------------
  describe "Edge and boundary inputs" $ do

    it "all Nothing -> score=0, urgency=NONE, dose=0" $ do
      let a = advise emptyWx cornField
      advScoreTotal a `shouldBe` 0.0
      advUrgency    a `shouldBe` "NONE"
      advRecommMm   a `shouldBe` 0.0

    it "unknown crop_type -> uses defaultCrop, no crash" $ do
      let fi = mkField 20 "Alien" "crop" (Just "QUINOA") (Just 2.0)
      advUrgency (advise droughtWx fi)
        `shouldSatisfy` (`elem` ["CRITICAL","HIGH","MODERATE","LOW","NONE"])

    it "crop_type = Nothing -> uses defaultCrop, no crash" $ do
      let fi = mkField 21 "Unknown" "crop" Nothing (Just 5.0)
      advUrgency (advise droughtWx fi)
        `shouldSatisfy` (`elem` ["CRITICAL","HIGH","MODERATE","LOW","NONE"])

    it "unknown field_type -> StandardIrrigation (not forced to NONE)" $ do
      let fi = mkField 22 "Aquaponics" "aquaponics" (Just "CORN") (Just 3.0)
      advUrgency (advise droughtWx fi) `shouldSatisfy` (/= "NONE")

    it "dose is always non-negative" $ do
      let a = advise droughtWx cornField
      advRecommMm   a `shouldSatisfy` (>= 0.0)
      advRecommM3Ha a `shouldSatisfy` (>= 0.0)
      advTotalM3    a `shouldSatisfy` (>= 0.0)

    it "score can go negative under surplus conditions; dose floors at 0" $ do
      let surplusWx = emptyWx
                        { soilMoisture   = Just 0.50    -- -1 pt
                        , waterDeficit7d = Just (-20.0) -- -2 pts
                        , rainCum7d      = Just 60.0    -- -2 pts
                        , spi1m          = Just 2.0     -- -1 pt
                        }
          fi = cornField { ndwiMean = Just 0.3, ndviMean = Just 0.8 }
      let a = advise surplusWx fi
      advScoreTotal a `shouldSatisfy` (< 0.0)
      advRecommMm   a `shouldBe` 0.0
      advUrgency    a `shouldBe` "NONE"

    it "single-field input does not crash" $ do
      irFieldsTotal (adviseAll droughtWx [cornField]) `shouldBe` 1
