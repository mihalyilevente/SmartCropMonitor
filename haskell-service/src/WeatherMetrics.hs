{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric #-}

module WeatherMetrics where

import Data.Aeson
import GHC.Generics
import Data.Maybe (mapMaybe, fromMaybe)
import Prelude hiding (sum)
import Data.List (sum, partition)

-- =========================
-- DATA MODELS (FULL MATCH YOUR PYTHON)
-- =========================

data WeatherPoint = WeatherPoint
  { t  :: Maybe Double
  , h  :: Maybe Double
  , p  :: Maybe Double
  , ws :: Maybe Double
  , wd :: Maybe Double
  , cc :: Maybe Double
  , r  :: Maybe Double
  , s  :: Maybe Double
  , dt :: String
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
      <*> v .:? "dt" .!= "2026-05-02T00:00:00"
      <*> v .:? "is_night"

data Metadata = Metadata
  { elevation   :: Double
  , lat         :: Double
  , lon         :: Double
  , day_of_year :: Int
  } deriving (Show, Generic)

instance FromJSON Metadata

data LocationData = LocationData
  { metadata     :: Metadata
  , current      :: WeatherPoint
  , history_7d   :: [WeatherPoint]
  , history_30d  :: [WeatherPoint]
  } deriving (Show, Generic)

instance FromJSON LocationData

data MetricsResult = MetricsResult
  { temp_min_7d      :: Double
  , temp_max_7d      :: Double
  , temp_min_night_7d:: Double
  , temp_max_night_7d:: Double
  , gdd              :: Double
  , rain_sum_7d      :: Double
  , hum_mean_7d      :: Double
  , hum_mean_30d     :: Double
  , et0              :: Double
  , spi1m            :: Double
  , water_deficit_7d :: Double
  , water_deficit_30d:: Double
  , ra               :: Double
  , rs               :: Double
  } deriving (Show, Generic)

instance ToJSON MetricsResult

-- =========================
-- SAFE HELPERS
-- =========================

safeMean :: [Double] -> Double
safeMean xs =
  if null xs then 0
  else sum xs / fromIntegral (length xs)

safeMax :: [Double] -> Double
safeMax xs = if null xs then 0 else maximum xs

safeMin :: [Double] -> Double
safeMin xs = if null xs then 0 else minimum xs

-- =========================
-- SOLAR CONSTANT
-- =========================

gsc :: Double
gsc = 0.0820

deg2rad :: Double -> Double
deg2rad x = x * pi / 180

-- =========================
-- RA (FAO-56 EXACT)
-- =========================

raFAO :: Double -> Int -> Double
raFAO latDeg j =
  let
    phi = deg2rad latDeg

    dr = 1 + 0.033 * cos (2 * pi * fromIntegral j / 365)

    delta = 0.409 * sin ((2 * pi * fromIntegral j / 365) - 1.39)

    ws = acos (-tan phi * tan delta)

  in
    (24 * 60 / pi)
    * gsc
    * dr
    * ( ws * sin phi * sin delta
      + cos phi * cos delta * sin ws
      )

-- =========================
-- RS (Angstrom model)
-- =========================

rsAngstrom :: Double -> Double -> Double -> Double
rsAngstrom ra n nMax =
  (0.25 + 0.5 * (n / nMax)) * ra

-- =========================
-- VPD (Vapor Pressure Deficit)
-- =========================

vpd :: Double -> Double -> Double
vpd t h =
  let
    es = 0.6108 * exp (17.27 * t / (t + 237.3))
    ea = es * (h / 100)
  in es - ea

-- =========================
-- GDD
-- =========================

gddCalc :: [WeatherPoint] -> Double
gddCalc pts =
  sum [ max 0 (temp - 10)
      | p <- pts
      , Just temp <- [t p]
      ]

-- =========================
-- ET0 (SIMPLIFIED PENMAN–MONTEITH)
-- =========================

et0Calc :: Double -> Double -> Double -> Double -> Double -> Double
et0Calc temp ra rs wind hum =
  let
    vpdVal = vpd temp hum

    et =
      0.408 * (temp + 17.8)
      * sqrt (max 0 vpdVal)
      + 0.0023 * ra * (1 + wind * 0.1)
      + 0.5 * rs * 0.0001
  in et

-- =========================
-- MAIN ENGINE
-- =========================

computeMetrics :: LocationData -> MetricsResult
computeMetrics (LocationData meta current h7 h30) =
  let
    temps7 = mapMaybe t h7
    hums7  = mapMaybe h h7
    hums30  = mapMaybe h h30
    rain7  = sum (map (fromMaybe 0 . r) h7)
    snow7  = sum (map (fromMaybe 0 . s) h7)
    rain30 = map (fromMaybe 0 . r) h30
    sumRain30 = sum rain30

    n30 = fromIntegral (length rain30)
    mean30 = sumRain30 / n30
    variance30 = sum [(r_val - mean30)^2 | r_val <- rain30] / n30
    stdDev30 = sqrt variance30

    spi1mVal = if stdDev30 > 0
            then (sumRain30 - (mean30 * n30)) / stdDev30
            else 0.0

    (nightPoints, _) = partition (fromMaybe False . is_night) h7
    tMinNight = safeMin (mapMaybe t nightPoints)
    tMaxNight = safeMax (mapMaybe t nightPoints)

    tMin = safeMin temps7
    tMax = safeMax temps7
    humM = safeMean hums7
    humM30 = safeMean hums30

    gddVal = gddCalc h7

    j = day_of_year meta

    raVal = raFAO (lat meta) j

    rsVal = rsAngstrom raVal 6 12

    wind = fromMaybe 2.0 (ws current)
    temp = fromMaybe 20 (t current)
    hum  = fromMaybe 60 (h current)

    et0Val = et0Calc temp raVal rsVal wind hum
    waterDef = et0Val - (rain7 + snow7)

    waterDef30 = (et0Val * 4) - sumRain30

  in MetricsResult
    { temp_min_7d      = tMin
    , temp_max_7d      = tMax
    , temp_min_night_7d = tMinNight
    , temp_max_night_7d = tMaxNight
    , gdd              = gddVal
    , rain_sum_7d      = rain7
    , hum_mean_7d      = humM
    , hum_mean_30d      = humM30
    , et0              = et0Val
    , spi1m            = spi1mVal
    , water_deficit_7d = waterDef
    , water_deficit_30d = waterDef30
    , ra               = raVal
    , rs               = rsVal
    }