{-# LANGUAGE OverloadedStrings #-}

module SprayingWindowSpec (spec) where

import Test.Hspec
import SprayingWindow
import Data.Time (UTCTime, parseTimeOrError, defaultTimeLocale)

inRange :: Double -> Double -> Double -> Bool
inRange lo hi x = x >= lo && x <= hi

parseT :: String -> UTCTime
parseT = parseTimeOrError True defaultTimeLocale "%Y-%m-%dT%H:%M:%SZ"

mkFp :: String -> Double -> Double -> Double -> Double -> Double -> Double -> Double -> ForecastPoint
mkFp ts_ temp wind hum rain et0_ vpd_ prob = ForecastPoint
  { fpTime    = parseT ts_
  , fpWeather = Weather
      { wTemp = temp
      , wWind = wind
      , wHum  = hum
      , wRain = rain
      , wEt0  = et0_
      , wVpd  = vpd_
      }
  , fpProb = prob
  }

ideal :: String -> ForecastPoint
ideal ts_ = mkFp ts_ 18.0 1.5 65.0 0.0 3.5 1.0 1.0

windy :: String -> ForecastPoint
windy ts_ = mkFp ts_ 18.0 5.0 65.0 0.0 3.5 1.0 1.0

rainy :: String -> ForecastPoint
rainy ts_ = mkFp ts_ 18.0 1.5 65.0 1.0 3.5 1.0 1.0

cold :: String -> ForecastPoint
cold ts_ = mkFp ts_ 3.0 1.5 65.0 0.0 3.5 1.0 1.0

hot :: String -> ForecastPoint
hot ts_ = mkFp ts_ 30.0 1.5 65.0 0.0 3.5 1.0 1.0

timestamps :: [String]
timestamps = [ "2026-05-01T" ++ pad h ++ ":00:00Z" | h <- [0..23 :: Int] ]
  where pad h = if h < 10 then "0" ++ show h else show h

ts :: Int -> String
ts i = timestamps !! i

spec :: Spec
spec = do

  describe "isValid" $ do

    it "ideal conditions -> True" $
      isValid (ideal (ts 0)) `shouldBe` True

    it "rain > 0.05 -> False" $
      isValid (rainy (ts 0)) `shouldBe` False

    it "wind >= 3.5 -> False" $
      isValid (windy (ts 0)) `shouldBe` False

    it "temp <= 5.0 -> False" $
      isValid (cold (ts 0)) `shouldBe` False

    it "temp >= 28.0 -> False" $
      isValid (hot (ts 0)) `shouldBe` False

    it "rain exactly 0.05 is still valid" $
      isValid (mkFp (ts 0) 18.0 1.5 65.0 0.05 3.5 1.0 1.0) `shouldBe` True

    it "wind exactly 3.5 is not valid" $
      isValid (mkFp (ts 0) 18.0 3.5 65.0 0.0 3.5 1.0 1.0) `shouldBe` False

    it "temp exactly 5.0 is not valid" $
      isValid (mkFp (ts 0) 5.0 1.5 65.0 0.0 3.5 1.0 1.0) `shouldBe` False

  describe "vpdScore" $ do

    it "vpd=1.0 (optimum) gives score close to 1.0" $
      vpdScore 1.0 `shouldSatisfy` inRange 0.99 1.01

    it "score decreases as vpd moves away from 1.0" $
      vpdScore 3.0 `shouldSatisfy` (< vpdScore 1.0)

    it "score is symmetric around optimum" $
      vpdScore 0.5 `shouldSatisfy` inRange (vpdScore 1.5 - 0.01) (vpdScore 1.5 + 0.01)

    it "score is always in [0, 1]" $
      mapM_ (\v -> vpdScore v `shouldSatisfy` inRange 0.0 1.0)
            [0.0, 0.5, 1.0, 2.0, 5.0, 10.0]

  describe "calculateRainLag" $ do

    it "no rain in history gives lag 0" $
      calculateRainLag (map ideal (take 5 timestamps)) 4 `shouldBe` 0

    it "rain at index 0 contributes decayed to index 3" $ do
      let fps = rainy (ts 0) : map ideal (drop 1 (take 4 timestamps))
      calculateRainLag fps 3 `shouldSatisfy` (> 0)

    it "recent rain contributes more than older rain" $ do
      let fps4       = map ideal (take 4 timestamps)
          withRecent = take 3 fps4 ++ [rainy (ts 3)]
          withOld    = rainy (ts 0) : drop 1 fps4
      calculateRainLag withRecent 4 `shouldSatisfy`
        (> calculateRainLag withOld 4)

  describe "computePointScore" $ do

    it "invalid point gives score 0" $
      computePointScore [windy (ts 0)] 0 `shouldBe` 0

    it "ideal point gives score > 0" $
      computePointScore (map ideal (take 5 timestamps)) 2 `shouldSatisfy` (> 0)

    it "ideal point gives score <= 1" $
      computePointScore (map ideal (take 5 timestamps)) 2 `shouldSatisfy` (<= 1.0)

    it "prob=0.5 roughly halves the score compared to prob=1.0" $ do
      let fps1  = map ideal (take 5 timestamps)
          fps05 = map (\fp -> fp { fpProb = 0.5 }) fps1
          s1    = computePointScore fps1  2
          s2    = computePointScore fps05 2
      s2 `shouldSatisfy` inRange (s1 * 0.4) (s1 * 0.6)

    it "rain lag reduces score" $ do
      let fps      = rainy (ts 0) : map ideal (drop 1 (take 5 timestamps))
          fpsClean = map ideal (take 5 timestamps)
      computePointScore fps 3 `shouldSatisfy`
        (< computePointScore fpsClean 3)

  describe "ema" $ do

    it "single element unchanged" $
      ema 0.4 [5.0] `shouldBe` [5.0]

    it "length preserved" $
      length (ema 0.4 (replicate 10 1.0)) `shouldBe` 10

    it "constant series stays constant" $
      ema 0.4 [2.0, 2.0, 2.0] `shouldBe` [2.0, 2.0, 2.0]

    it "smoothed series has smaller range than raw" $ do
      let raw      = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0] :: [Double]
          smoothed = ema 0.4 raw
          range xs = maximum xs - minimum xs
      range smoothed `shouldSatisfy` (< range raw)

    it "alpha=1.0 is identity" $
      ema 1.0 [1.0, 2.0, 3.0] `shouldBe` [1.0, 2.0, 3.0]

  describe "computeSprayingWindows" $ do

    it "all invalid conditions -> no windows" $
      computeSprayingWindows (map windy (take 10 timestamps)) `shouldBe` []

    it "all ideal conditions -> at least one window" $
      computeSprayingWindows (map ideal (take 10 timestamps)) `shouldSatisfy` (not . null)

    it "window score is in [0, 1]" $ do
      let ws = computeSprayingWindows (map ideal (take 10 timestamps))
      mapM_ (\w -> wScore w `shouldSatisfy` inRange 0.0 1.0) ws

    it "window start <= window end" $ do
      let ws = computeSprayingWindows (map ideal (take 10 timestamps))
      mapM_ (\w -> wStart w `shouldSatisfy` (<= wEnd w)) ws

    it "all-windy sequence produces no windows" $
      computeSprayingWindows (map windy (take 20 timestamps)) `shouldBe` []

    it "windy block in the middle produces windows with valid scores" $ do
      let withGap = map ideal (take 4 timestamps)
                 ++ map windy (take 3 (drop 4 timestamps))
                 ++ map ideal (take 3 (drop 7 timestamps))
          ws = computeSprayingWindows withGap
      mapM_ (\w -> wScore w `shouldSatisfy` inRange 0.0 1.0) ws

    it "empty input gives empty output" $
      computeSprayingWindows [] `shouldBe` []