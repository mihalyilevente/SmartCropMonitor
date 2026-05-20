{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric     #-}

module IrrigationAdvisor
  ( computeIrrigation
  , IrrigationInput(..)
  , IrrigationResult(..)
  , FieldAdvice(..)
  , FieldInput(..)
  , WeatherContext(..)
  ) where


import Data.Aeson
import GHC.Generics
import Data.Maybe  (fromMaybe, mapMaybe)
import Data.List   (sortBy)
import Data.Ord    (comparing, Down(..))
import Prelude hiding (sum)
import Data.List (sum)

-- =============================================================================
-- INPUT TYPES
-- =============================================================================

data FieldInput = FieldInput
  { fieldId      :: Int
  , fieldLabel   :: String
  , fieldType    :: String
  , cropType     :: Maybe String
  , areHa        :: Maybe Double
  , ndwiMean     :: Maybe Double
  , ndviMean     :: Maybe Double
  } deriving (Show, Generic)

instance FromJSON FieldInput where
  parseJSON = withObject "FieldInput" $ \v ->
    FieldInput
      <$> v .:  "field_id"
      <*> v .:  "field_label"
      <*> v .:  "field_type"
      <*> v .:? "crop_type"
      <*> v .:? "area_ha"
      <*> v .:? "ndwi_mean"
      <*> v .:? "ndvi_mean"

-- Location-level weather context
data WeatherContext = WeatherContext
  { et0Val          :: Maybe Double  -- mm/day
  , waterDeficit7d  :: Maybe Double  -- mm  (ET0_sum - precip_sum, 7d)
  , waterDeficit30d :: Maybe Double  -- mm
  , rainCum7d       :: Maybe Double  -- mm
  , rainCum30d      :: Maybe Double  -- mm
  , spi1m           :: Maybe Double
  , soilMoisture    :: Maybe Double
  , vpd             :: Maybe Double  -- kPa
  , tempMean7d      :: Maybe Double  -- °C
  , humMean7d       :: Maybe Double  -- %
  } deriving (Show, Generic)

instance FromJSON WeatherContext where
  parseJSON = withObject "WeatherContext" $ \v ->
    WeatherContext
      <$> v .:? "et0"
      <*> v .:? "water_deficit_7d"
      <*> v .:? "water_deficit_30d"
      <*> v .:? "rain_cum_7d"
      <*> v .:? "rain_cum_30d"
      <*> v .:? "spi_1m"
      <*> v .:? "soil_moisture"
      <*> v .:? "vpd"
      <*> v .:? "temp_mean_7d"
      <*> v .:? "hum_mean_7d"

data IrrigationInput = IrrigationInput
  { fields  :: [FieldInput]
  , weather :: WeatherContext
  } deriving (Show, Generic)

instance FromJSON IrrigationInput

-- =============================================================================
-- OUTPUT TYPES
-- =============================================================================

data FieldAdvice = FieldAdvice
  { advFieldId       :: Int
  , advFieldLabel    :: String
  , advUrgency       :: String   -- "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "NONE"
  , advShouldIrrigate:: Bool
  , advScoreTotal    :: Double
  , advRecommMm      :: Double
  , advRecommM3Ha    :: Double
  , advTotalM3       :: Double
  , advReason        :: [String]
  -- key input echo for traceability
  , advEt0           :: Maybe Double
  , advWaterDef7d    :: Maybe Double
  , advRainCum7d     :: Maybe Double
  , advSoilMoisture  :: Maybe Double
  , advNdwi          :: Maybe Double
  , advSpi1m         :: Maybe Double
  } deriving (Show, Generic)

instance ToJSON FieldAdvice where
  toJSON a = object
    [ "field_id"          .= advFieldId       a
    , "field_label"       .= advFieldLabel    a
    , "urgency"           .= advUrgency       a
    , "should_irrigate"   .= advShouldIrrigate a
    , "score"             .= advScoreTotal    a
    , "recommended_mm"    .= advRecommMm      a
    , "recommended_m3_ha" .= advRecommM3Ha    a
    , "total_volume_m3"   .= advTotalM3       a
    , "reason"            .= advReason        a
    , "et0"               .= advEt0           a
    , "water_deficit_7d"  .= advWaterDef7d    a
    , "rain_cum_7d"       .= advRainCum7d     a
    , "soil_moisture"     .= advSoilMoisture  a
    , "ndwi_mean"         .= advNdwi          a
    , "spi_1m"            .= advSpi1m         a
    ]

data IrrigationResult = IrrigationResult
  { irFields              :: [FieldAdvice]
  , irFieldsTotal         :: Int
  , irFieldsNeedAction    :: Int
  , irTotalWaterM3        :: Double
  , irCriticalCount       :: Int
  , irHighCount           :: Int
  , irModerateCount       :: Int
  } deriving (Show, Generic)

instance ToJSON IrrigationResult where
  toJSON r = object
    [ "fields"               .= irFields           r
    , "fields_total"         .= irFieldsTotal       r
    , "fields_need_action"   .= irFieldsNeedAction  r
    , "total_water_m3"       .= irTotalWaterM3       r
    , "critical_count"       .= irCriticalCount      r
    , "high_count"           .= irHighCount          r
    , "moderate_count"       .= irModerateCount      r
    ]

-- =============================================================================
-- CROP PARAMETERS  (FAO-56 + empirical)
-- =============================================================================

data CropParams = CropParams
  { cpKc           :: Double   -- crop coefficient (mid-season)
  , cpDepletionFrac:: Double   -- RAW fraction  (p in FAO-56)
  , cpMaxDoseMm    :: Double   -- max single irrigation application [mm]
  , cpCriticalSM   :: Double   -- soil moisture → CRITICAL  [m3/m3]
  , cpHighSM       :: Double   -- soil moisture → HIGH
  } deriving (Show)

-- Lookup by FieldCrop
cropParams :: Maybe String -> CropParams
cropParams Nothing    = defaultCrop
cropParams (Just ct)  = case ct of
  -- ── Cereals ───────────────────────────────────────────────────────────────
  "WHEAT_WINTER"    -> CropParams 1.15 0.55 45 0.13 0.18
  "WHEAT_SPRING"    -> CropParams 1.15 0.55 40 0.13 0.18
  "BARLEY"          -> CropParams 1.15 0.55 40 0.13 0.18
  "CORN"            -> CropParams 1.20 0.55 50 0.14 0.20
  "OATS"            -> CropParams 1.05 0.55 40 0.13 0.18
  "RYE"             -> CropParams 1.05 0.60 40 0.12 0.17
  "RICE"            -> CropParams 1.20 0.20 60 0.25 0.32
  -- ── Legumes ───────────────────────────────────────────────────────────────
  "PEAS"            -> CropParams 1.15 0.40 35 0.16 0.22
  "SOYBEANS"        -> CropParams 1.15 0.50 40 0.15 0.21
  "CHICKPEAS"       -> CropParams 1.00 0.50 35 0.14 0.20
  "LENTILS"         -> CropParams 1.05 0.50 35 0.14 0.20
  -- ── Oil / industrial ──────────────────────────────────────────────────────
  "SUNFLOWER"       -> CropParams 1.10 0.45 45 0.15 0.22
  "RAPESEED_WINTER" -> CropParams 1.10 0.50 40 0.14 0.19
  "RAPESEED_SPRING" -> CropParams 1.10 0.50 40 0.14 0.19
  "FLAX"            -> CropParams 1.05 0.50 35 0.14 0.19
  -- ── Root / tuber / industrial ─────────────────────────────────────────────
  "SUGAR_BEET"      -> CropParams 1.20 0.50 50 0.14 0.20
  "POTATOES"        -> CropParams 1.15 0.35 35 0.18 0.25
  "COTTON"          -> CropParams 1.15 0.65 60 0.12 0.17
  -- ── Fodder / pasture ──────────────────────────────────────────────────────
  "ALFALFA"         -> CropParams 1.05 0.55 30 0.16 0.22
  "SILAGE_CORN"     -> CropParams 1.20 0.55 50 0.14 0.20
  "CLOVER"          -> CropParams 1.00 0.55 25 0.16 0.22
  "GRASS_MIX"       -> CropParams 1.00 0.55 25 0.16 0.22
  -- ── Orchards / fruits ─────────────────────────────────────────────────────
  "APPLE"           -> CropParams 1.20 0.50 40 0.14 0.20
  "PEAR"            -> CropParams 1.20 0.50 40 0.14 0.20
  "CHERRY"          -> CropParams 1.10 0.50 35 0.14 0.20
  "GRAPES_WINE"     -> CropParams 0.85 0.45 30 0.15 0.20
  "GRAPES_TABLE"    -> CropParams 1.05 0.35 30 0.16 0.22
  "STRAWBERRY"      -> CropParams 1.05 0.35 25 0.18 0.26
  "BLUEBERRY"       -> CropParams 1.00 0.35 25 0.18 0.26
  -- ── Vegetables ────────────────────────────────────────────────────────────
  "TOMATO"          -> CropParams 1.15 0.40 35 0.18 0.24
  "ONION"           -> CropParams 1.05 0.30 30 0.20 0.27
  "CARROT"          -> CropParams 1.05 0.35 30 0.18 0.25
  "CABBAGE"         -> CropParams 1.05 0.45 35 0.16 0.22
  -- ── Special / non-irrigated ───────────────────────────────────────────────
  "FALLOW"          -> CropParams 0.00 0.60 0  0.08 0.12
  "COVER_CROP"      -> CropParams 0.80 0.55 20 0.12 0.16
  "OTHER"           -> defaultCrop
  _                 -> defaultCrop

defaultCrop :: CropParams
defaultCrop = CropParams 1.00 0.50 40 0.15 0.20

-- =============================================================================
-- FIELD-TYPE MODIFIERS
-- =============================================================================

data FieldTypeMod
  = NeverIrrigate
  | ReducedDose Double
  | StandardIrrigation
  deriving (Show)

fieldTypeMod :: String -> FieldTypeMod
fieldTypeMod ft = case ft of
  "water_body"   -> NeverIrrigate
  "storage"      -> NeverIrrigate
  "forest_belt"  -> NeverIrrigate
  "fallow"       -> NeverIrrigate
  "fallow_land"  -> NeverIrrigate
  -- Pasture / hayfield
  "pasture"      -> ReducedDose 0.60
  "hayfield"     -> ReducedDose 0.70
  -- Nursery / berry_patch / greenhouse
  "nursery"      -> ReducedDose 0.75
  "berry_patch"  -> ReducedDose 0.80
  "greenhouse"   -> ReducedDose 0.65
  -- Standard productive fields
  "crop"         -> StandardIrrigation
  "orchard"      -> StandardIrrigation
  "vineyard"     -> StandardIrrigation
  _              -> StandardIrrigation

-- =============================================================================
-- SIGNAL SCORING
-- Urgency tiers:  ≥9 CRITICAL | ≥6 HIGH | ≥3 MODERATE | ≥1 LOW | else NONE
-- =============================================================================

data Signal = Signal
  { sigScore  :: Double
  , sigReason :: String
  } deriving (Show)

scoreWeather :: WeatherContext -> CropParams -> [Signal]
scoreWeather wx cp =
  let sm     = soilMoisture  wx
      wd7    = waterDeficit7d wx
      et0v   = et0Val        wx
      r7     = rainCum7d     wx
      spi    = spi1m         wx
      vpd'   = vpd           wx

      smSignals = case sm of
        Nothing -> []
        Just v
          | v < cpCriticalSM cp ->
              [Signal 4.0 ("Soil moisture critically low ("
                ++ show2 v ++ " m^3/m^3 < " ++ show2 (cpCriticalSM cp) ++ ")")]
          | v < cpHighSM cp ->
              [Signal 2.0 ("Soil moisture below threshold ("
                ++ show2 v ++ " m^3/m^3 < " ++ show2 (cpHighSM cp) ++ ")")]
          | v > 0.35 ->
              [Signal (-1.0) ("Soil moisture adequate ("
                ++ show2 v ++ " m^3/m^3)")]
          | otherwise -> []

      wdSignals = case wd7 of
        Nothing -> []
        Just v
          | v > 20.0 -> [Signal 3.0 ("7-day water deficit severe ("   ++ show1 v ++ " mm)")]
          | v > 10.0 -> [Signal 1.5 ("7-day water deficit moderate (" ++ show1 v ++ " mm)")]
          | v >  5.0 -> [Signal 0.5 ("7-day water deficit mild ("     ++ show1 v ++ " mm)")]
          | v < -10.0 -> [Signal (-2.0) ("Water surplus 7d ("         ++ show1 v ++ " mm)")]
          | otherwise -> []

      et0Signals = case et0v of
        Nothing -> []
        Just v ->
          let etCrop = v * cpKc cp
          in if etCrop > 5.0
               then [Signal 2.0 ("High crop ET demand (ET0=" ++ show1 v
                      ++ " mm/day, Kc=" ++ show2 (cpKc cp) ++ ")")]
             else if etCrop > 3.0
               then [Signal 1.0 ("Moderate crop ET demand (ET0=" ++ show1 v ++ " mm/day)")]
             else []

      rainSignals = case r7 of
        Nothing -> []
        Just v
          | v <  5.0 -> [Signal 2.0 ("Very dry week -- only "   ++ show1 v ++ " mm rain")]
          | v < 15.0 -> [Signal 1.0 ("Below-avg rain last 7d (" ++ show1 v ++ " mm)")]
          | v > 40.0 -> [Signal (-2.0) ("Abundant rain last 7d (" ++ show1 v ++ " mm)")]
          | otherwise -> []

      spiSignals = case spi of
        Nothing -> []
        Just v
          | v < -1.5 -> [Signal 2.0 ("Severe drought (SPI=" ++ show2 v ++ ")")]
          | v < -1.0 -> [Signal 1.0 ("Moderate drought (SPI=" ++ show2 v ++ ")")]
          | v >  1.0 -> [Signal (-1.0) ("Wet conditions (SPI=" ++ show2 v ++ ")")]
          | otherwise -> []

      vpdSignals = case vpd' of
        Nothing -> []
        Just v
          | v > 2.0   -> [Signal 1.0 ("High evaporative demand (VPD=" ++ show2 v ++ " kPa)")]
          | otherwise -> []

  in concat [smSignals, wdSignals, et0Signals, rainSignals, spiSignals, vpdSignals]

scoreField :: FieldInput -> [Signal]
scoreField fi =
  let ndwiSigs = case ndwiMean fi of
        Nothing -> []
        Just v
          | v < -0.20 -> [Signal 2.0 ("NDWI indicates plant water stress ("  ++ show3 v ++ ")")]
          | v < -0.10 -> [Signal 1.0 ("NDWI mildly negative ("               ++ show3 v ++ ")")]
          | v >  0.10 -> [Signal (-1.0) ("NDWI shows adequate canopy water (" ++ show3 v ++ ")")]
          | otherwise -> []
      ndviSigs = case ndviMean fi of
        Nothing -> []
        Just v
          | v < 0.25  -> [Signal 1.0 ("Low NDVI suggests vegetation stress (" ++ show3 v ++ ")")]
          | v > 0.65  -> [Signal (-0.5) ("High NDVI -- healthy canopy ("        ++ show3 v ++ ")")]
          | otherwise -> []
  in ndwiSigs ++ ndviSigs

totalScore :: [Signal] -> Double
totalScore = sum . map sigScore

urgencyFromScore :: Double -> String
urgencyFromScore s
  | s >= 9.0  = "CRITICAL"
  | s >= 6.0  = "HIGH"
  | s >= 3.0  = "MODERATE"
  | s >= 1.0  = "LOW"
  | otherwise = "NONE"

shouldIrrigate :: String -> Bool
shouldIrrigate u = u `elem` ["CRITICAL", "HIGH", "MODERATE"]

wetConditionsSuppress :: WeatherContext -> CropParams -> Maybe String
wetConditionsSuppress wx cp =
  let sm = soilMoisture wx
      soilStillDry = case sm of
        Just v  -> v < cpHighSM cp
        Nothing -> False
      wetReason label =
        Just ("Irrigation suppressed: " ++ label ++ " and soil is not below crop threshold")
  in if soilStillDry
       then Nothing
       else case (rainCum7d wx, waterDeficit7d wx) of
         (Just r7, Just wd7)
           | r7 >= 25.0 && wd7 <= 0.0 ->
               wetReason ("recent rain " ++ show1 r7 ++ " mm with 7-day water surplus")
           | r7 >= 40.0 && wd7 <= 5.0 ->
               wetReason ("abundant recent rain " ++ show1 r7 ++ " mm")
         (Just r7, Nothing)
           | r7 >= 40.0 ->
               wetReason ("abundant recent rain " ++ show1 r7 ++ " mm")
         (Nothing, Just wd7)
           | wd7 <= -10.0 ->
               wetReason ("7-day water surplus " ++ show1 wd7 ++ " mm")
         _ -> Nothing

-- =============================================================================
-- DOSE CALCULATION
-- Primary: water_deficit_7d × depletion_fraction  (refill approach)
-- Fallback: ET0 × Kc × 7 − 0.75 × rain7d
-- =============================================================================

computeDose :: WeatherContext -> CropParams -> String -> Double -> Double
computeDose wx cp urgency maxMm
  | not (shouldIrrigate urgency) = 0.0
  | otherwise =
      let raw = case waterDeficit7d wx of
                  Just wd | wd > 0.0 ->
                    let base = wd * cpDepletionFrac cp
                    in if urgency == "CRITICAL" then base * 1.30 else base
                  _ ->
                    case et0Val wx of
                      Just e  ->
                        let etCrop7 = e * cpKc cp * 7.0
                            effRain  = fromMaybe 0.0 (rainCum7d wx) * 0.75
                        in max 0.0 (etCrop7 - effRain)
                      Nothing -> fallbackDose urgency
      in roundTo1 (min (max raw 0.0) maxMm)

fallbackDose :: String -> Double
fallbackDose "CRITICAL" = 30.0
fallbackDose "HIGH"     = 20.0
fallbackDose "MODERATE" = 12.0
fallbackDose _          = 0.0


adviseField :: WeatherContext -> FieldInput -> FieldAdvice
adviseField wx fi =
  let ftMod = fieldTypeMod (fieldType fi)
      cp    = cropParams   (cropType  fi)
      area  = fromMaybe 1.0 (areHa fi)

  in case ftMod of
    NeverIrrigate ->
      FieldAdvice
        { advFieldId        = fieldId fi
        , advFieldLabel     = fieldLabel fi
        , advUrgency        = "NONE"
        , advShouldIrrigate = False
        , advScoreTotal     = 0.0
        , advRecommMm       = 0.0
        , advRecommM3Ha     = 0.0
        , advTotalM3        = 0.0
        , advReason         = ["Field type '" ++ fieldType fi ++ "' does not require irrigation."]
        , advEt0            = et0Val wx
        , advWaterDef7d     = waterDeficit7d wx
        , advRainCum7d      = rainCum7d wx
        , advSoilMoisture   = soilMoisture wx
        , advNdwi           = ndwiMean fi
        , advSpi1m          = spi1m wx
        }

    doseMod ->
      let maxMm   = case doseMod of
                      ReducedDose mult -> cpMaxDoseMm cp * mult
                      _                -> cpMaxDoseMm cp

          wxSigs  = scoreWeather wx cp
          fldSigs = scoreField fi
          allSigs = wxSigs ++ fldSigs
          rawScore = totalScore allSigs
          wetStop = wetConditionsSuppress wx cp
          score   = case wetStop of
                      Just _  -> min 0.0 rawScore
                      Nothing -> rawScore
          urgency = case wetStop of
                      Just _  -> "NONE"
                      Nothing -> urgencyFromScore score
          dose    = computeDose wx cp urgency maxMm
          doseM3Ha= roundTo1 (dose * 10.0)
          totalM3 = roundTo1 (doseM3Ha * area)
          reasons = map sigReason allSigs ++ maybe [] (:[]) wetStop

      in FieldAdvice
           { advFieldId        = fieldId fi
           , advFieldLabel     = fieldLabel fi
           , advUrgency        = urgency
           , advShouldIrrigate = shouldIrrigate urgency
           , advScoreTotal     = roundTo2 score
           , advRecommMm       = dose
           , advRecommM3Ha     = doseM3Ha
           , advTotalM3        = totalM3
           , advReason         = reasons
           , advEt0            = et0Val wx
           , advWaterDef7d     = waterDeficit7d wx
           , advRainCum7d      = rainCum7d wx
           , advSoilMoisture   = soilMoisture wx
           , advNdwi           = ndwiMean fi
           , advSpi1m          = spi1m wx
           }


computeIrrigation :: IrrigationInput -> IrrigationResult
computeIrrigation input =
  let wx       = weather input
      advised  = map (adviseField wx) (fields input)
      sorted   = sortBy (comparing (Down . urgencyRank . advUrgency)) advised
      needAct  = filter advShouldIrrigate sorted
      totalW   = sum (map advTotalM3 sorted)

  in IrrigationResult
       { irFields           = sorted
       , irFieldsTotal      = length sorted
       , irFieldsNeedAction = length needAct
       , irTotalWaterM3     = roundTo1 totalW
       , irCriticalCount    = length (filter ((== "CRITICAL") . advUrgency) sorted)
       , irHighCount        = length (filter ((== "HIGH")     . advUrgency) sorted)
       , irModerateCount    = length (filter ((== "MODERATE") . advUrgency) sorted)
       }

urgencyRank :: String -> Int
urgencyRank "CRITICAL" = 4
urgencyRank "HIGH"     = 3
urgencyRank "MODERATE" = 2
urgencyRank "LOW"      = 1
urgencyRank _          = 0


roundTo1 :: Double -> Double
roundTo1 x = fromIntegral (round (x * 10.0) :: Int) / 10.0

roundTo2 :: Double -> Double
roundTo2 x = fromIntegral (round (x * 100.0) :: Int) / 100.0

show1 :: Double -> String
show1 x = show (roundTo1 x)

show2 :: Double -> String
show2 x = show (roundTo2 x)

show3 :: Double -> String
show3 x = show (fromIntegral (round (x * 1000.0) :: Int) / 1000.0 :: Double)
