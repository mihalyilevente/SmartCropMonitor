{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric #-}

module WeatherMetrics where

import Data.Aeson
import GHC.Generics
import Data.Maybe (mapMaybe, fromMaybe, listToMaybe)
import Prelude hiding (sum)
import Data.List (sum, partition, nub, sort, group, sortBy)
import Data.Ord (comparing)

-- =============================================================================
-- DATA MODELS
-- =============================================================================

data WeatherPoint = WeatherPoint
  { t        :: Maybe Double   -- temperature °C
  , h        :: Maybe Double   -- relative humidity %
  , p        :: Maybe Double   -- pressure hPa
  , ws       :: Maybe Double   -- wind speed m/s
  , wd       :: Maybe Double   -- wind direction °
  , cc       :: Maybe Double   -- cloud cover %
  , r        :: Maybe Double   -- rain mm
  , s        :: Maybe Double   -- snowfall mm (water equivalent)
  , dt       :: String         -- ISO timestamp
  , is_night :: Maybe Bool
  } deriving (Show, Generic)

instance FromJSON WeatherPoint where
  parseJSON = withObject "WeatherPoint" $ \v ->
    WeatherPoint
      <$> v .:? "t"
      <*> v .:? "h"
      <*> v .:? "p"
      <*> v .:? "ws"
      <*> v .:? "wd"
      <*> v .:? "cc"
      <*> v .:? "r"
      <*> v .:? "s"
      <*> v .:? "dt" .!= "2000-01-01T00:00:00"
      <*> v .:? "is_night"

data Metadata = Metadata
  { elevation   :: Double
  , lat         :: Double
  , lon         :: Double
  , day_of_year :: Int
  } deriving (Show, Generic)

instance FromJSON Metadata

data LocationData = LocationData
  { metadata    :: Metadata
  , current     :: WeatherPoint
  , history_7d  :: [WeatherPoint]
  , history_30d :: [WeatherPoint]
  } deriving (Show, Generic)

instance FromJSON LocationData

data MetricsResult = MetricsResult
  { temp_min_7d       :: Double
  , temp_max_7d       :: Double
  , temp_min_night_7d :: Double
  , temp_max_night_7d :: Double
  , gdd               :: Double
  , rain_sum_7d       :: Double
  , hum_mean_7d       :: Double
  , hum_mean_30d      :: Double
  , et0               :: Double
  , spi1m             :: Double
  , water_deficit_7d  :: Double
  , water_deficit_30d :: Double
  , ra                :: Double
  , rs                :: Double
  } deriving (Show, Generic)

instance ToJSON MetricsResult

-- =============================================================================
-- SAFE NUMERIC HELPERS
-- =============================================================================

safeMean :: [Double] -> Maybe Double
safeMean [] = Nothing
safeMean xs = Just (sum xs / fromIntegral (length xs))

safeMeanDef :: Double -> [Double] -> Double
safeMeanDef def xs = fromMaybe def (safeMean xs)

safeMax :: [Double] -> Maybe Double
safeMax [] = Nothing
safeMax xs = Just (maximum xs)

safeMin :: [Double] -> Maybe Double
safeMin [] = Nothing
safeMin xs = Just (minimum xs)

safeMaxDef :: Double -> [Double] -> Double
safeMaxDef def = fromMaybe def . safeMax

safeMinDef :: Double -> [Double] -> Double
safeMinDef def = fromMaybe def . safeMin

safeStd :: [Double] -> Maybe Double
safeStd xs
  | length xs < 2 = Nothing
  | otherwise =
      let m = sum xs / fromIntegral (length xs)
          v = sum [(x - m)^(2::Int) | x <- xs] / fromIntegral (length xs - 1)
      in Just (sqrt v)

-- =============================================================================
-- UNIT CONVERSIONS & CONSTANTS
-- =============================================================================

deg2rad :: Double -> Double
deg2rad x = x * pi / 180

-- Solar constant, MJ m⁻² min⁻¹
gsc :: Double
gsc = 0.0820

-- Stefan-Boltzmann constant, MJ K⁻⁴ m⁻² day⁻¹
sigma :: Double
sigma = 4.903e-9

-- =============================================================================
-- SATURATION VAPOUR PRESSURE  (FAO-56 Eq. 11)
-- es(T) in kPa
-- =============================================================================

satVapourPressure :: Double -> Double
satVapourPressure tempC =
  0.6108 * exp (17.27 * tempC / (tempC + 237.3))

-- Mean saturation VP from Tmin and Tmax (FAO-56 Eq. 12)
esMean :: Double -> Double -> Double
esMean tMin tMax =
  (satVapourPressure tMin + satVapourPressure tMax) / 2.0

-- Actual vapour pressure from dewpoint (FAO-56 Eq. 14) — most accurate
-- ea(Tdew) in kPa
eaFromDewpoint :: Double -> Double
eaFromDewpoint tdew = satVapourPressure tdew

-- Actual vapour pressure from RH mean (FAO-56 Eq. 19)
eaFromRH :: Double -> Double -> Double -> Double
eaFromRH tMin tMax rhMean =
  (rhMean / 100.0) * esMean tMin tMax

-- Slope of saturation VP curve Δ (FAO-56 Eq. 13), kPa/°C
slopeVapourPressure :: Double -> Double
slopeVapourPressure tempC =
  let es = satVapourPressure tempC
  in 4098.0 * es / (tempC + 237.3)^(2::Int)

-- =============================================================================
-- PSYCHROMETRIC CONSTANT γ  (FAO-56 Eq. 8)
-- pressure in hPa → convert to kPa
-- =============================================================================

psychroConst :: Double -> Double
psychroConst pressHPa =
  let pressKPa = pressHPa / 10.0
  in 0.000665 * pressKPa

-- =============================================================================
-- EXTRATERRESTRIAL RADIATION Ra  (FAO-56 Eq. 21)
-- Result in MJ m⁻² day⁻¹
-- =============================================================================

raFAO :: Double -> Int -> Double
raFAO latDeg j =
  let phi  = deg2rad latDeg
      dr   = 1.0 + 0.033 * cos (2.0 * pi * fromIntegral j / 365.0)
      dec  = 0.409 * sin (2.0 * pi * fromIntegral j / 365.0 - 1.39)
      -- sunset hour angle (FAO-56 Eq. 25) — clamp argument to [-1, 1]
      arg  = max (-1.0) (min 1.0 (- tan phi * tan dec))
      ws'  = acos arg
  in (24.0 * 60.0 / pi) * gsc * dr
     * (ws' * sin phi * sin dec + cos phi * cos dec * sin ws')

-- =============================================================================
-- SUNSHINE DURATION n from cloud cover (FAO-56 Eq. 34 inverted)
-- cloud cover cc in %, N = max possible sunshine hours
-- The Angström relation: Rs = (a + b·n/N)·Ra
-- Solving for n/N: cloud_fraction = 1 - n/N → n/N = 1 - cc/100
-- =============================================================================

sunFraction :: Double -> Double
sunFraction ccPct = max 0.0 (min 1.0 (1.0 - ccPct / 100.0))

-- =============================================================================
-- SOLAR RADIATION Rs  (FAO-56 Eq. 35, Angström)
-- a_s = 0.25, b_s = 0.50  (FAO default coefficients)
-- Result in MJ m⁻² day⁻¹
-- =============================================================================

rsAngstrom :: Double -> Double -> Double
rsAngstrom ra ccPct =
  let nOverN = sunFraction ccPct
  in (0.25 + 0.50 * nOverN) * ra

-- Net shortwave radiation Rns  (FAO-56 Eq. 38)
rns :: Double -> Double
rns rsVal = (1.0 - 0.23) * rsVal   -- albedo α = 0.23

-- Clear-sky solar radiation Rso  (FAO-56 Eq. 37)
rso :: Double -> Double -> Double
rso elev ra = (0.75 + 2e-5 * elev) * ra

-- Net longwave radiation Rnl  (FAO-56 Eq. 39)
rnl :: Double -> Double -> Double -> Double -> Double -> Double
rnl tMin tMax ea rsVal rsoVal =
  let tMinK   = tMin + 273.16
      tMaxK   = tMax + 273.16
      rso'    = if rsoVal > 0.0 then min 1.0 (rsVal / rsoVal) else 0.5
      stefTerm = sigma * (tMaxK^(4::Int) + tMinK^(4::Int)) / 2.0
      humTerm  = 0.34 - 0.14 * sqrt (max 0.0 ea)
      radTerm  = 1.35 * rso' - 0.35
  in stefTerm * humTerm * radTerm

-- Net radiation Rn = Rns - Rnl  (FAO-56 Eq. 40)
rn :: Double -> Double -> Double -> Double -> Double -> Double -> Double
rn tMin tMax ea rsVal rsoVal elev =
  rns rsVal - rnl tMin tMax ea rsVal rsoVal

-- =============================================================================
-- SOIL HEAT FLUX G  (FAO-56 Eq. 42, monthly approximation ≈ 0 for daily)
-- =============================================================================

soilHeatFlux :: Double
soilHeatFlux = 0.0

-- =============================================================================
-- ET0 — FAO-56 Penman-Monteith  (FAO-56 Eq. 6)
--
-- ET0 = [0.408·Δ·(Rn - G) + γ·(900/(T+273))·u2·(es-ea)]
--       / [Δ + γ·(1 + 0.34·u2)]
--
-- Inputs:
--   tMean  — mean daily temp °C
--   tMin   — daily min °C
--   tMax   — daily max °C
--   rhMean — mean relative humidity %
--   u2     — wind speed at 2 m, m/s
--   ra     — extraterrestrial radiation MJ m⁻² day⁻¹
--   rs     — solar radiation MJ m⁻² day⁻¹
--   elev   — elevation m
-- Returns ET0 in mm/day (≥ 0)
-- =============================================================================

et0FAO56 :: Double -> Double -> Double -> Double -> Double
         -> Double -> Double -> Double -> Double -> Double
et0FAO56 tMean tMin tMax rhMean u2 ra rsVal pressHPa elev =
  let
    delta   = slopeVapourPressure tMean            -- kPa/°C
    gamma   = psychroConst pressHPa                -- kPa/°C
    es      = esMean tMin tMax                     -- kPa
    ea      = eaFromRH tMin tMax rhMean            -- kPa
    vpd'    = max 0.0 (es - ea)                    -- kPa, never negative
    rsoVal  = rso elev ra
    rnVal   = rn tMin tMax ea rsVal rsoVal elev    -- MJ m⁻² day⁻¹
    g       = soilHeatFlux

    numerator   = 0.408 * delta * (rnVal - g)
                + gamma * (900.0 / (tMean + 273.0)) * u2 * vpd'
    denominator = delta + gamma * (1.0 + 0.34 * u2)
  in
    max 0.0 (numerator / denominator)

dayKey :: WeatherPoint -> String
dayKey wp = take 10 (dt wp)

groupByDay :: [WeatherPoint] -> [[WeatherPoint]]
groupByDay pts =
  let keys    = nub (map dayKey pts)
      sorted  = sortBy (comparing dayKey) pts
      byKey k = filter ((== k) . dayKey) sorted
  in map byKey keys

data DaySummary = DaySummary
  { dsTmin  :: Double
  , dsTmax  :: Double
  , dsTmean :: Double
  , dsRH    :: Double   -- mean RH %
  , dsU2    :: Double   -- mean wind at 2 m (hourly data already at 10 m; convert)
  , dsCC    :: Double   -- mean cloud cover %
  , dsRain  :: Double   -- total rain mm
  , dsSnow  :: Double   -- total snowfall mm (SWE)
  , dsPres  :: Double   -- mean pressure hPa
  } deriving Show

-- Wind speed at 2 m from 10 m measurement  (FAO-56 Eq. 47)
windAt2m :: Double -> Double
windAt2m u10 = u10 * (4.87 / log (67.8 * 10.0 - 5.42))

summariseDay :: [WeatherPoint] -> Maybe DaySummary
summariseDay [] = Nothing
summariseDay pts =
  let temps = mapMaybe t pts
      hums  = mapMaybe h pts
      winds = mapMaybe ws pts
      ccs   = mapMaybe cc pts
      pres  = mapMaybe p pts
      rain  = sum (map (fromMaybe 0.0 . r) pts)
      snow  = sum (map (fromMaybe 0.0 . s) pts)
  in case (safeMin temps, safeMax temps) of
       (Just tMin', Just tMax') ->
         Just DaySummary
           { dsTmin  = tMin'
           , dsTmax  = tMax'
           , dsTmean = safeMeanDef ((tMin' + tMax') / 2.0) temps
           , dsRH    = safeMeanDef 60.0 hums
           , dsU2    = windAt2m (safeMeanDef 2.0 winds)
           , dsCC    = safeMeanDef 50.0 ccs
           , dsRain  = rain
           , dsSnow  = snow
           , dsPres  = safeMeanDef 1013.25 pres
           }
       _ -> Nothing

-- ET0 for one day given metadata
dailyET0 :: Metadata -> Int -> DaySummary -> Double
dailyET0 meta jDay ds =
  let raVal = raFAO (lat meta) jDay
      rsVal = rsAngstrom raVal (dsCC ds)
  in et0FAO56
       (dsTmean ds) (dsTmin ds) (dsTmax ds)
       (dsRH ds) (dsU2 ds)
       raVal rsVal (dsPres ds) (elevation meta)

-- =============================================================================
-- GDD — standard daily method  (base 10 °C)
-- =============================================================================

gddFromDays :: [DaySummary] -> Double
gddFromDays days =
  sum [ max 0.0 ((dsTmax d + dsTmin d) / 2.0 - 10.0) | d <- days ]

-- =============================================================================
-- SPI — Standardised Precipitation Index (McKee et al., 1993)
-- =============================================================================

spiApprox :: [WeatherPoint] -> Double
spiApprox pts =
  let days     = groupByDay pts
      dailyR   = [ sum (map (fromMaybe 0.0 . r) d) | d <- days ]
      n        = length dailyR
      total    = sum dailyR
  in case safeStd dailyR of
       Nothing  -> 0.0
       Just std ->
         if std <= 0.0 then 0.0
         else
           let mu = total / fromIntegral n
           in (total - mu * fromIntegral n) / (std * sqrt (fromIntegral n))

-- =============================================================================
-- MAIN ENGINE
-- =============================================================================

computeMetrics :: LocationData -> MetricsResult
computeMetrics (LocationData meta cur h7 h30) =
  let
    -- -------------------------------------------------------------------------
    -- Basic temperature stats (7d)
    -- -------------------------------------------------------------------------
    temps7     = mapMaybe t h7
    hums7      = mapMaybe h h7
    hums30     = mapMaybe h h30

    tMin7      = safeMinDef 0.0 temps7
    tMax7      = safeMaxDef 0.0 temps7

    (nightPts, _) = partition (fromMaybe False . is_night) h7
    tMinNight  = safeMinDef tMin7 (mapMaybe t nightPts)
    tMaxNight  = safeMaxDef tMax7 (mapMaybe t nightPts)

    humMean7   = safeMeanDef 0.0 hums7
    humMean30  = safeMeanDef 0.0 hums30

    -- -------------------------------------------------------------------------
    -- Precipitation totals
    -- -------------------------------------------------------------------------
    rain7      = sum (map (fromMaybe 0.0 . r) h7)
    snow7      = sum (map (fromMaybe 0.0 . s) h7)
    rain30     = sum (map (fromMaybe 0.0 . r) h30)

    -- -------------------------------------------------------------------------
    -- Daily summaries for ET0 and GDD
    -- -------------------------------------------------------------------------
    days7      = groupByDay h7
    days30     = groupByDay h30
    summaries7 = mapMaybe summariseDay days7
    summaries30 = mapMaybe summariseDay days30

    -- -------------------------------------------------------------------------
    -- GDD
    -- -------------------------------------------------------------------------
    gddVal     = gddFromDays summaries7

    -- -------------------------------------------------------------------------
    -- RA and RS for the reference day (day_of_year from metadata)
    -- -------------------------------------------------------------------------
    j          = day_of_year meta
    raVal      = raFAO (lat meta) j

    ccToday    = fromMaybe 50.0 (cc cur)
    rsVal      = rsAngstrom raVal ccToday

    -- -------------------------------------------------------------------------
    -- ET0
    -- -------------------------------------------------------------------------
    assignJ :: [DaySummary] -> [(Int, DaySummary)]
    assignJ summaries =
      let n  = length summaries
          j0 = j - n + 1
      in zipWith (\k ds -> (max 1 (min 365 (j0 + k)), ds)) [0..] summaries

    et0PerDay7  = [ dailyET0 meta jk ds | (jk, ds) <- assignJ summaries7 ]
    et0PerDay30 = [ dailyET0 meta jk ds | (jk, ds) <- assignJ summaries30 ]

    et0Sum7     = sum et0PerDay7
    et0Sum30    = sum et0PerDay30

    et0Today    = case summaries7 of
                    [] -> 0.0
                    ds -> last et0PerDay7

    -- -------------------------------------------------------------------------
    -- Water deficit  =  cumulative ET0 − cumulative precipitation
    -- -------------------------------------------------------------------------
    waterDef7   = et0Sum7  - (rain7  + snow7)
    waterDef30  = et0Sum30 - rain30

    -- -------------------------------------------------------------------------
    -- SPI
    -- -------------------------------------------------------------------------
    spi1mVal    = spiApprox h30

  in MetricsResult
    { temp_min_7d       = tMin7
    , temp_max_7d       = tMax7
    , temp_min_night_7d = tMinNight
    , temp_max_night_7d = tMaxNight
    , gdd               = gddVal
    , rain_sum_7d       = rain7
    , hum_mean_7d       = humMean7
    , hum_mean_30d      = humMean30
    , et0               = et0Today
    , spi1m             = spi1mVal
    , water_deficit_7d  = waterDef7
    , water_deficit_30d = waterDef30
    , ra                = raVal
    , rs                = rsVal
    }