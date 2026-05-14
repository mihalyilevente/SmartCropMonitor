{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE OverloadedStrings #-}

module SatelliteAnomaly
  ( computeSnapshotAnomaly
  , SnapshotInput (..)
  , SnapshotResult (..)
  , MetricAnomaly (..)
  ) where

import Data.Aeson (FromJSON, ToJSON)
import GHC.Generics (Generic)

-- ================================
-- Input
-- ================================

data SnapshotInput = SnapshotInput
  { prev_ndvi            :: [[Double]]
  , last_ndvi            :: [[Double]]
  , prev_gndvi           :: [[Double]]
  , last_gndvi           :: [[Double]]
  , prev_ndre            :: [[Double]]
  , last_ndre            :: [[Double]]
  , area_threshold_ratio :: Double
  } deriving (Show, Generic)

instance FromJSON SnapshotInput
instance ToJSON   SnapshotInput

-- ================================
-- Output
-- ================================

data MetricAnomaly = MetricAnomaly
  { metric_name         :: String
  , prev_mean           :: Double
  , last_mean           :: Double
  , abs_delta           :: Double
  , rel_change          :: Double
  , is_anomaly          :: Bool
  , anomaly_kind        :: String
  , confidence          :: Double
  , anomaly_pixel_count :: Int
  , total_pixel_count   :: Int
  , anomaly_ratio       :: Double
  } deriving (Show, Generic)

instance FromJSON MetricAnomaly
instance ToJSON   MetricAnomaly


newtype SnapshotResult = SnapshotResult
  { metrics :: [MetricAnomaly]
  } deriving (Show, Generic)

instance FromJSON SnapshotResult
instance ToJSON   SnapshotResult


-- ================================
-- Thresholds
-- ================================

-- Minimum per-pixel absolute delta to count a pixel as anomalous
pixelThreshold :: String -> Double
pixelThreshold "ndvi"  = 0.10
pixelThreshold "gndvi" = 0.08
pixelThreshold "ndre"  = 0.08
pixelThreshold _       = 0.10

-- Minimum relative change of the mean to fire overall anomaly
meanRelThreshold :: String -> Double
meanRelThreshold "ndvi"  = 0.15
meanRelThreshold "gndvi" = 0.15
meanRelThreshold "ndre"  = 0.15
meanRelThreshold _       = 0.20


-- ================================
-- Helpers
-- ================================

safeFinite :: Double -> Bool
safeFinite x = not (isNaN x || isInfinite x)

flatMean :: [[Double]] -> Maybe Double
flatMean xss =
  let xs = filter safeFinite (concat xss)
  in if null xs
       then Nothing
       else Just (sum xs / fromIntegral (length xs))

computeConfidence :: Double -> Double -> Double -> Double
computeConfidence relChange relThr ratio =
  let meanConf  = 0.60 + min (abs relChange / relThr - 1.0) 1.0 * 0.29
      areaBonus = min ratio 1.0 * 0.10
  in min 0.9999 (meanConf + areaBonus)


-- ================================
-- Core analysis
-- ================================

analyzeMetric :: String -> [[Double]] -> [[Double]] -> Double -> MetricAnomaly
analyzeMetric name prevMap lastMap areaThr =
  let pixThr = pixelThreshold name
      relThr = meanRelThreshold name

      pairs      = zip (concat prevMap) (concat lastMap)
      validPairs = filter (\(p, l) -> safeFinite p && safeFinite l) pairs
      validPx    = length validPairs
      anomPx     = length $ filter (\(p, l) -> abs (l - p) >= pixThr) validPairs

      ratio = if validPx > 0
                then fromIntegral anomPx / fromIntegral validPx
                else 0.0

      mPrev = flatMean prevMap
      mLast = flatMean lastMap

  in case (mPrev, mLast) of
       (Just pv, Just lv) ->
         let delta   = lv - pv
             rel     = delta / (abs pv + 1.0e-9)
             meanOk  = abs rel >= relThr
             areaOk  = ratio   >= areaThr
             anomaly = meanOk && areaOk
             kind
               | not anomaly = "none"
               | delta < 0   = "drop"
               | otherwise   = "rise"
             conf
               | anomaly   = computeConfidence rel relThr ratio
               | otherwise = 0.0
         in MetricAnomaly
              { metric_name         = name
              , prev_mean           = pv
              , last_mean           = lv
              , abs_delta           = delta
              , rel_change          = rel
              , is_anomaly          = anomaly
              , anomaly_kind        = kind
              , confidence          = conf
              , anomaly_pixel_count = anomPx
              , total_pixel_count   = validPx
              , anomaly_ratio       = ratio
              }
       _ ->
         MetricAnomaly
           { metric_name         = name
           , prev_mean           = 0.0
           , last_mean           = 0.0
           , abs_delta           = 0.0
           , rel_change          = 0.0
           , is_anomaly          = False
           , anomaly_kind        = "none"
           , confidence          = 0.0
           , anomaly_pixel_count = 0
           , total_pixel_count   = validPx
           , anomaly_ratio       = ratio
           }


-- ================================
-- Entry point
-- ================================

computeSnapshotAnomaly :: SnapshotInput -> SnapshotResult
computeSnapshotAnomaly inp =
  let areaThr = area_threshold_ratio inp
  in SnapshotResult
       { metrics =
           [ analyzeMetric "ndvi"  (prev_ndvi  inp) (last_ndvi  inp) areaThr
           , analyzeMetric "gndvi" (prev_gndvi inp) (last_gndvi inp) areaThr
           , analyzeMetric "ndre"  (prev_ndre  inp) (last_ndre  inp) areaThr
           ]
       }