{-# LANGUAGE RecordWildCards #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric #-}

module SprayingWindow where

import GHC.Generics
import Data.Aeson
import Data.List (groupBy)
import Data.Time (UTCTime)
import Data.Maybe (fromMaybe)


data Weather = Weather
  { wTemp :: Double -- 't'
  , wWind :: Double -- 'ws'
  , wHum  :: Double -- 'h'
  , wRain :: Double -- 'r'
  , wEt0  :: Double -- 'et0'
  , wVpd  :: Double -- 'vapour_pressure_deficit'
  } deriving (Show, Eq, Generic)

instance FromJSON Weather where
  parseJSON = withObject "Weather" $ \v ->
    Weather <$> v .: "t"
            <*> v .: "ws"
            <*> v .: "h"
            <*> v .: "r"
            <*> v .: "et0"
            <*> v .:? "vapour_pressure_deficit" .!= 0.0

data ForecastPoint = ForecastPoint
  { fpTime    :: UTCTime
  , fpWeather :: Weather
  , fpProb    :: Double
  } deriving (Show, Eq, Generic)

instance FromJSON ForecastPoint where
  parseJSON = withObject "ForecastPoint" $ \v ->
    ForecastPoint <$> v .: "dt"
                  <*> parseJSON (Object v)
                  <*> v .:? "prob" .!= 1.0

data Window = Window
  { wStart :: UTCTime
  , wEnd   :: UTCTime
  , wScore :: Double
  } deriving (Show, Eq, Generic)

instance ToJSON Window where
  toJSON Window{..} = object
    [ "start" .= wStart
    , "end"   .= wEnd
    , "score" .= wScore
    ]

windThreshold, tempMin, tempMax, threshold :: Double
windThreshold = 3.5
tempMin       = 5.0
tempMax       = 28.0
threshold     = 0.7

isValid :: ForecastPoint -> Bool
isValid ForecastPoint{..} =
  let Weather{..} = fpWeather
  in  wRain <= 0.05
      && wWind < windThreshold
      && wTemp > tempMin
      && wTemp < tempMax

calculateRainLag :: [ForecastPoint] -> Int -> Double
calculateRainLag allFps currentIdx =
  let lookback = 3
      start = max 0 (currentIdx - lookback)
      pastPoints = take (currentIdx - start) (drop start allFps)
      decay = 0.6
      weightedRain = zipWith (\fp i -> (wRain . fpWeather $ fp) * (decay ** fromIntegral i))
                             (reverse pastPoints)
                             [1..]
  in sum weightedRain

vpdScore :: Double -> Double
vpdScore vpd =
  let opt = 1.0
      k = 1.5
  in exp (-k * (abs (vpd - opt) ** 2))

computePointScore :: [ForecastPoint] -> Int -> Double
computePointScore allFps idx =
  let fp = allFps !! idx
      w  = fpWeather fp
      rainLag = calculateRainLag allFps idx

      sWind = max 0 (1 - (wWind w / windThreshold))
      sTemp = if wTemp w > 20 then (tempMax - wTemp w) / (tempMax - 20) else 1.0
      sVpd  = vpdScore (wVpd w)
      sHum  = 1 - (abs (wHum w - 70) / 100)

      baseScore = 0.3 * sWind + 0.2 * sVpd + 0.2 * sTemp + 0.3 * sHum

      rainPenalty = exp (-rainLag * 2.0)
  in if not (isValid fp) then 0 else baseScore * rainPenalty * fpProb fp

computeSprayingWindows :: [ForecastPoint] -> [Window]
computeSprayingWindows fps =
  let indices = [0 .. length fps - 1]
      rawScores = map (computePointScore fps) indices
      smoothScores = ema 0.4 rawScores
      tagged = zip fps smoothScores
  in build tagged

build :: [(ForecastPoint, Double)] -> [Window]
build xs =
  map toWindow $
  filter (\g -> all (\(_, s) -> s >= threshold) g) $
  groupBy (\(_, a) (_, b) -> (a >= threshold) == (b >= threshold)) xs
  where
    toWindow ys =
      Window
        { wStart = fpTime (fst (head ys))
        , wEnd   = fpTime (fst (last ys))
        , wScore = sum (map snd ys) / fromIntegral (length ys)
        }

ema :: Double -> [Double] -> [Double]
ema alpha = scanl1 (\acc x -> alpha * x + (1 - alpha) * acc)