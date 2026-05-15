{-# LANGUAGE OverloadedStrings #-}

module WeatherMetricsSpec (spec) where

import Test.Hspec
import WeatherMetrics

inRange :: Double -> Double -> Double -> Bool
inRange lo hi x = x >= lo && x <= hi

-- ================================
-- Fixtures
-- ================================

mkPoint :: Double -> Double -> Double -> Double -> Bool -> WeatherPoint
mkPoint temp hum rain wind night = WeatherPoint
  { t        = Just temp
  , h        = Just hum
  , p        = Nothing
  , ws       = Just wind
  , wd       = Nothing
  , cc       = Nothing
  , r        = Just rain
  , s        = Just 0.0
  , dt       = "2026-05-01T12:00:00"
  , is_night = Just night
  }

warmDay :: WeatherPoint
warmDay = mkPoint 22.0 65.0 0.5 1.5 False

coldNight :: WeatherPoint
coldNight = mkPoint 3.0 90.0 0.0 0.5 True

-- 7-day history: mix of day/night, no rain
h7Stable :: [WeatherPoint]
h7Stable = replicate 7 warmDay

-- 7-day history with cold nights
h7WithNights :: [WeatherPoint]
h7WithNights = replicate 4 warmDay ++ replicate 3 coldNight

-- 30-day history: uniform rain 2mm/day
h30Uniform :: [WeatherPoint]
h30Uniform = replicate 30 (mkPoint 18.0 70.0 2.0 1.0 False)

-- Meta: Budapest-like, day 120 (late April)
testMeta :: Metadata
testMeta = Metadata
  { elevation   = 120.0
  , lat         = 47.5
  , lon         = 19.0
  , day_of_year = 120
  }

-- Full LocationData
testLocation :: LocationData
testLocation = LocationData
  { metadata    = testMeta
  , current     = warmDay
  , history_7d  = h7Stable
  , history_30d = h30Uniform
  }

-- ================================
-- Tests
-- ================================

spec :: Spec
spec = do

  -- --------------------------------
  describe "safeMean" $ do

    it "empty list returns 0" $
      safeMean [] `shouldBe` 0

    it "single element returns that element" $
      safeMean [42.0] `shouldBe` 42.0

    it "known mean of [10, 20, 30] = 20" $
      safeMean [10, 20, 30] `shouldBe` 20.0

  describe "safeMin / safeMax" $ do

    it "safeMin empty returns 0" $
      safeMin [] `shouldBe` 0

    it "safeMax empty returns 0" $
      safeMax [] `shouldBe` 0

    it "safeMin [3,1,4,1,5] = 1" $
      safeMin [3,1,4,1,5] `shouldBe` 1.0

    it "safeMax [3,1,4,1,5] = 5" $
      safeMax [3,1,4,1,5] `shouldBe` 5.0

  -- --------------------------------
  describe "deg2rad" $ do

    it "0 degrees = 0 radians" $
      deg2rad 0 `shouldBe` 0

    it "180 degrees = pi radians" $
      deg2rad 180 `shouldSatisfy` inRange 3.14 3.15

  describe "raFAO" $ do

    it "positive for mid-latitude day 120" $
      raFAO 47.5 120 `shouldSatisfy` (> 0)

    it "reasonable range for lat=47.5 doy=120 (15-40 MJ/m2/day)" $
      raFAO 47.5 120 `shouldSatisfy` inRange 15.0 40.0

    it "higher in summer (doy=172) than winter (doy=355) for northern lat" $
      raFAO 50.0 172 `shouldSatisfy` (> raFAO 50.0 355)

    it "equator has less seasonal variation than high lat" $ do
      let diffEq  = abs (raFAO 0.0  172 - raFAO 0.0  355)
          diffHi  = abs (raFAO 50.0 172 - raFAO 50.0 355)
      diffEq `shouldSatisfy` (< diffHi)

  describe "rsAngstrom" $ do

    it "rs > 0 for positive ra and sunshine" $
      rsAngstrom 30.0 6 12 `shouldSatisfy` (> 0)

    it "rs increases with sunshine hours" $
      rsAngstrom 30.0 8 12 `shouldSatisfy` (> rsAngstrom 30.0 4 12)

    it "full sunshine (n = nMax) gives 0.75 * ra" $
      rsAngstrom 30.0 12 12 `shouldSatisfy` inRange 22.4 22.6

    it "zero sunshine gives 0.25 * ra" $
      rsAngstrom 30.0 0 12 `shouldSatisfy` inRange 7.4 7.6

  -- --------------------------------
  describe "vpd" $ do

    it "100% humidity gives VPD = 0" $
      vpd 20.0 100.0 `shouldSatisfy` inRange (-0.01) 0.01

    it "VPD increases as humidity decreases" $
      vpd 20.0 50.0 `shouldSatisfy` (> vpd 20.0 80.0)

    it "VPD is positive for sub-100% humidity" $
      vpd 25.0 60.0 `shouldSatisfy` (> 0)

    it "VPD at 20C 60% humidity in reasonable range (0.8-1.2 kPa)" $
      vpd 20.0 60.0 `shouldSatisfy` inRange 0.8 1.2

  -- --------------------------------
  describe "gddCalc" $ do

    it "empty list gives 0" $
      gddCalc [] `shouldBe` 0

    it "all temperatures below 10C give 0 GDD" $ do
      let pts = replicate 5 (mkPoint 5.0 60.0 0.0 1.0 False)
      gddCalc pts `shouldBe` 0

    it "constant 20C for 7 days gives 70 GDD" $ do
      let pts = replicate 7 (mkPoint 20.0 60.0 0.0 1.0 False)
      gddCalc pts `shouldSatisfy` inRange 69.9 70.1

    it "mixed temps: only temps > 10 contribute" $ do
      let cold = mkPoint 8.0  60.0 0.0 1.0 False
          warm = mkPoint 22.0 60.0 0.0 1.0 False
          pts  = [cold, warm, cold, warm]
      gddCalc pts `shouldSatisfy` inRange 23.9 24.1

  -- --------------------------------
  describe "et0Calc" $ do

    it "returns positive value for typical inputs" $
      et0Calc 22.0 30.0 15.0 2.0 65.0 `shouldSatisfy` (> 0)

    it "increases with temperature" $
      et0Calc 30.0 30.0 15.0 2.0 65.0 `shouldSatisfy` (> et0Calc 10.0 30.0 15.0 2.0 65.0)

    it "increases with wind speed" $
      et0Calc 22.0 30.0 15.0 5.0 65.0 `shouldSatisfy` (> et0Calc 22.0 30.0 15.0 1.0 65.0)

  -- --------------------------------
  describe "computeMetrics - structure" $ do

    let res = computeMetrics testLocation

    it "temp_max_7d >= temp_min_7d" $
      temp_max_7d res `shouldSatisfy` (>= temp_min_7d res)

    it "temp_max_7d is the max of 7d history (22.0)" $
      temp_max_7d res `shouldSatisfy` inRange 21.9 22.1

    it "temp_min_7d is the min of 7d history (22.0, same input)" $
      temp_min_7d res `shouldSatisfy` inRange 21.9 22.1

    it "hum_mean_7d is within realistic range [0, 100]" $
      hum_mean_7d res `shouldSatisfy` inRange 0 100

    it "rain_sum_7d = 7 * 0.5 = 3.5" $
      rain_sum_7d res `shouldSatisfy` inRange 3.4 3.6

    it "gdd > 0 for warm 7d history (temps > 10)" $
      gdd res `shouldSatisfy` (> 0)

    it "ra is positive" $
      ra res `shouldSatisfy` (> 0)

    it "rs is positive and <= ra" $ do
      rs res `shouldSatisfy` (> 0)
      rs res `shouldSatisfy` (<= ra res)

    it "et0 is positive" $
      et0 res `shouldSatisfy` (> 0)

    it "spi1m = 0 when all rain values are identical (std=0)" $ do
      let loc = testLocation { history_30d = replicate 30 (mkPoint 18.0 70.0 2.0 1.0 False) }
          r   = computeMetrics loc
      spi1m r `shouldBe` 0.0

  describe "computeMetrics - night temps" $ do

    it "temp_min_night_7d comes from night points only" $ do
      let loc = testLocation { history_7d = h7WithNights }
          r   = computeMetrics loc
      temp_min_night_7d r `shouldSatisfy` inRange 2.9 3.1

    it "night temps are lower than all-day temps" $ do
      let locDay   = testLocation { history_7d = h7Stable }
          locMixed = testLocation { history_7d = h7WithNights }
          rDay     = computeMetrics locDay
          rMixed   = computeMetrics locMixed
      temp_min_night_7d rMixed `shouldSatisfy` (< temp_min_7d rDay)

  describe "computeMetrics - water deficit" $ do

    it "water_deficit_7d = et0 - rain - snow" $ do
      let r           = computeMetrics testLocation
          rain7       = 7 * 0.5
          expectedDef = et0 r - rain7
      water_deficit_7d r `shouldSatisfy` inRange (expectedDef - 0.5) (expectedDef + 0.5)

    it "zero rain increases water deficit" $ do
      let dryH7  = replicate 7 (mkPoint 22.0 65.0 0.0 1.5 False)
          locDry = testLocation { history_7d = dryH7 }
          r      = computeMetrics locDry
      water_deficit_7d r `shouldSatisfy` (> 0)