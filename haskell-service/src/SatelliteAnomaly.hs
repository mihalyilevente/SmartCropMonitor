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

data SnapshotInput = SnapshotInput
  { prev_ndvi  :: [[Double]]
  , last_ndvi  :: [[Double]]
  , prev_gndvi :: [[Double]]
  , last_gndvi :: [[Double]]
  , prev_ndre  :: [[Double]]
  , last_ndre  :: [[Double]]
  } deriving (Show, Generic)

instance FromJSON SnapshotInput
instance ToJSON   SnapshotInput

data MetricAnomaly = MetricAnomaly
  { metric_name      :: String
  , prev_mean        :: Double
  , last_mean        :: Double
  , abs_delta        :: Double
  , rel_change       :: Double
  , is_anomaly       :: Bool
  , anomaly_kind     :: String
  , confidence       :: Double
  } deriving (Show, Generic)

instance FromJSON MetricAnomaly
instance ToJSON   MetricAnomaly


newtype SnapshotResult = SnapshotResult
  { metrics :: [MetricAnomaly]
  } deriving (Show, Generic)

instance FromJSON SnapshotResult
instance ToJSON   SnapshotResult


thresholds :: String -> (Double, Double)
thresholds "ndvi"  = (0.12, 0.20)
thresholds "gndvi" = (0.10, 0.20)
thresholds "ndre"  = (0.10, 0.20)
thresholds _       = (0.15, 0.25)


safeFinite :: Double -> Bool
safeFinite x = not (isNaN x || isInfinite x)

flatMean :: [[Double]] -> Maybe Double
flatMean xss =
  let xs = filter safeFinite (concat xss)
  in if null xs
       then Nothing
       else Just (sum xs / fromIntegral (length xs))

computeConfidence :: Double -> Double -> Double
computeConfidence relChange relThr =
  let ratio = abs relChange / relThr
      raw   = 0.60 + min (ratio - 1.0) 1.0 * 0.39
  in min 0.9999 raw

analyzeMetric :: String -> [[Double]] -> [[Double]] -> MetricAnomaly
analyzeMetric name prevMap lastMap =
  let (absThr, relThr) = thresholds name
      mPrev = flatMean prevMap
      mLast = flatMean lastMap
  in case (mPrev, mLast) of
       (Just pv, Just lv) ->
         let delta  = lv - pv
             rel    = delta / (abs pv + 1.0e-9)
             absOk  = abs delta >= absThr
             relOk  = abs rel   >= relThr
             anomaly = absOk && relOk
             kind
               | not anomaly = "none"
               | delta < 0   = "drop"
               | otherwise   = "rise"
             conf
               | anomaly   = computeConfidence rel relThr
               | otherwise = 0.0
         in MetricAnomaly
              { metric_name  = name
              , prev_mean    = pv
              , last_mean    = lv
              , abs_delta    = delta
              , rel_change   = rel
              , is_anomaly   = anomaly
              , anomaly_kind = kind
              , confidence   = conf
              }
       _ ->
         MetricAnomaly
           { metric_name  = name
           , prev_mean    = 0.0
           , last_mean    = 0.0
           , abs_delta    = 0.0
           , rel_change   = 0.0
           , is_anomaly   = False
           , anomaly_kind = "none"
           , confidence   = 0.0
           }


computeSnapshotAnomaly :: SnapshotInput -> SnapshotResult
computeSnapshotAnomaly inp = SnapshotResult
  { metrics =
      [ analyzeMetric "ndvi"  (prev_ndvi  inp) (last_ndvi  inp)
      , analyzeMetric "gndvi" (prev_gndvi inp) (last_gndvi inp)
      , analyzeMetric "ndre"  (prev_ndre  inp) (last_ndre  inp)
      ]
  }