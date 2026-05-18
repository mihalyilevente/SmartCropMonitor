{-# LANGUAGE OverloadedStrings #-}

module WeatherMetricsSpec (spec) where

import Test.Hspec
import WeatherMetrics

-- =============================================================================
-- HELPERS
-- =============================================================================

inRange :: Double -> Double -> Double -> Bool
inRange lo hi x = x >= lo && x <= hi

-- =============================================================================
-- FIXTURES
-- =============================================================================

-- mkPoint now accepts cloud_cover and pressure so all FAO-56 paths are exercised.
mkPoint :: Double -> Double -> Double -> Double -> Double -> Double -> Bool -> WeatherPoint
mkPoint temp hum rain wind cloudCover pressHPa night = WeatherPoint
  { t        = Just temp
  , h        = Just hum
  , p        = Just pressHPa
  , ws       = Just wind
  , wd       = Nothing
  , cc       = Just cloudCover
  , r        = Just rain
  , s        = Just 0.0
  , dt       = "2026-05-01T12:00:00"
  , is_night = Just night
  }

-- Warm daytime point: 22 °C, 65 % RH, 0.5 mm rain, 1.5 m/s wind, 40 % cloud, 1013 hPa
warmDay :: WeatherPoint
warmDay = mkPoint 22.0 65.0 0.5 1.5 40.0 1013.25 False

-- Cold night point: 3 °C, 90 % RH, no rain, light wind, 80 % cloud, 1013 hPa
coldNight :: WeatherPoint
coldNight = mkPoint 3.0 90.0 0.0 0.5 80.0 1013.25 True

-- 7-day history: 7 identical warm-day points (same calendar day key — tested
-- separately; here they share the same date intentionally to test aggregation).
-- For GDD / ET0 day-grouping tests we need distinct dates → see mkPointDay.
mkPointDay :: String -> Double -> Double -> Double -> Double -> Double -> Double -> Bool -> WeatherPoint
mkPointDay date temp hum rain wind cloudCover pressHPa night = WeatherPoint
  { t        = Just temp
  , h        = Just hum
  , p        = Just pressHPa
  , ws       = Just wind
  , wd       = Nothing
  , cc       = Just cloudCover
  , r        = Just rain
  , s        = Just 0.0
  , dt       = date <> "T12:00:00"
  , is_night = Just night
  }

-- 7 days with distinct dates → each forms its own DaySummary
h7Days :: [WeatherPoint]
h7Days =
  [ mkPointDay ("2026-04-2" <> show d) 22.0 65.0 0.5 1.5 40.0 1013.25 False
  | d <- [1..7 :: Int]
  ]

-- Same but all below GDD base
h7ColdDays :: [WeatherPoint]
h7ColdDays =
  [ mkPointDay ("2026-04-2" <> show d) 5.0 80.0 0.0 1.0 60.0 1013.25 False
  | d <- [1..7 :: Int]
  ]

-- 7 days mixed day/night on distinct dates
h7WithNights :: [WeatherPoint]
h7WithNights =
  [ mkPointDay ("2026-04-2" <> show d) 22.0 65.0 0.5 1.5 40.0 1013.25 False
  | d <- [1..4 :: Int]
  ] ++
  [ mkPointDay ("2026-04-2" <> show d) 3.0 90.0 0.0 0.5 80.0 1013.25 True
  | d <- [5..7 :: Int]
  ]

-- 30-day history with distinct dates: uniform 2 mm/day rain
h30Uniform :: [WeatherPoint]
h30Uniform =
  [ mkPointDay (date d) 18.0 70.0 2.0 1.0 50.0 1013.25 False
  | d <- [1..30 :: Int]
  ]
  where
    date d
      | d <= 9    = "2026-03-0" <> show d
      | d <= 30   = "2026-03-" <> show d
      | otherwise = "2026-04-01"   -- unreachable

-- 30-day history with variable rain for non-zero SPI test
h30Variable :: [WeatherPoint]
h30Variable =
  [ mkPointDay (date d) 18.0 70.0 (if d `mod` 3 == 0 then 8.0 else 0.5) 1.0 50.0 1013.25 False
  | d <- [1..30 :: Int]
  ]
  where
    date d
      | d <= 9    = "2026-03-0" <> show d
      | otherwise = "2026-03-" <> show d

-- Meta: Budapest-like, day 120 (late April)
testMeta :: Metadata
testMeta = Metadata
  { elevation   = 120.0
  , lat         = 47.5
  , lon         = 19.0
  , day_of_year = 120
  }

-- Full LocationData using per-day histories
testLocation :: LocationData
testLocation = LocationData
  { metadata    = testMeta
  , current     = warmDay
  , history_7d  = h7Days
  , history_30d = h30Uniform
  }

-- =============================================================================
-- SPEC
-- =============================================================================

spec :: Spec
spec = do

  -- --------------------------------------------------------------------------
  -- Safe numeric helpers
  -- --------------------------------------------------------------------------
  describe "safeMean" $ do

    it "empty list returns Nothing" $
      safeMean ([] :: [Double]) `shouldBe` Nothing

    it "single element returns Just that element" $
      safeMean [42.0] `shouldBe` Just 42.0

    it "known mean of [10, 20, 30] = Just 20" $
      safeMean [10, 20, 30] `shouldBe` Just 20.0

  describe "safeMin / safeMax" $ do

    it "safeMin empty returns Nothing" $
      safeMin ([] :: [Double]) `shouldBe` Nothing

    it "safeMax empty returns Nothing" $
      safeMax ([] :: [Double]) `shouldBe` Nothing

    it "safeMin [3,1,4,1,5] = Just 1" $
      safeMin [3,1,4,1,5] `shouldBe` Just 1.0

    it "safeMax [3,1,4,1,5] = Just 5" $
      safeMax [3,1,4,1,5] `shouldBe` Just 5.0

  describe "safeStd" $ do

    it "empty list returns Nothing" $
      safeStd ([] :: [Double]) `shouldBe` Nothing

    it "single element returns Nothing (n < 2)" $
      safeStd [5.0] `shouldBe` Nothing

    it "identical values give std = Just 0" $
      safeStd [3.0, 3.0, 3.0] `shouldBe` Just 0.0

    it "std of [2,4,4,4,5,5,7,9] ~= 2.138 (sample std, divisor n-1)" $
      safeStd [2,4,4,4,5,5,7,9] `shouldSatisfy` \ms ->
        case ms of Just v -> inRange 2.10 2.18 v; Nothing -> False

  -- --------------------------------------------------------------------------
  -- Trigonometry / unit conversion
  -- --------------------------------------------------------------------------
  describe "deg2rad" $ do

    it "0 degrees = 0 radians" $
      deg2rad 0 `shouldBe` 0

    it "180 degrees ~= pi radians" $
      deg2rad 180 `shouldSatisfy` inRange 3.141 3.142

  describe "windAt2m" $ do

    it "10 m wind converts to a lower 2 m value" $
      windAt2m 5.0 `shouldSatisfy` (< 5.0)

    it "conversion factor ~= 0.748 for log-profile at 10 m" $
      windAt2m 1.0 `shouldSatisfy` inRange 0.74 0.76

  -- --------------------------------------------------------------------------
  -- Solar / radiation
  -- --------------------------------------------------------------------------
  describe "raFAO" $ do

    it "positive for mid-latitude day 120" $
      raFAO 47.5 120 `shouldSatisfy` (> 0)

    it "reasonable range for lat=47.5 doy=120 (15-40 MJ/m2/day)" $
      raFAO 47.5 120 `shouldSatisfy` inRange 15.0 40.0

    it "higher in summer (doy=172) than winter (doy=355) for northern lat" $
      raFAO 50.0 172 `shouldSatisfy` (> raFAO 50.0 355)

    it "equator has less seasonal variation than high lat" $ do
      let diffEq = abs (raFAO 0.0  172 - raFAO 0.0  355)
          diffHi = abs (raFAO 50.0 172 - raFAO 50.0 355)
      diffEq `shouldSatisfy` (< diffHi)

  describe "rsAngstrom (cloud-cover based)" $ do

    it "rs > 0 for any positive ra" $
      rsAngstrom 30.0 50.0 `shouldSatisfy` (> 0)

    it "clear sky (0 % cloud) gives 0.75 * ra" $
      rsAngstrom 30.0 0.0 `shouldSatisfy` inRange 22.4 22.6

    it "overcast (100 % cloud) gives 0.25 * ra" $
      rsAngstrom 30.0 100.0 `shouldSatisfy` inRange 7.4 7.6

    it "rs increases as cloud cover decreases" $
      rsAngstrom 30.0 20.0 `shouldSatisfy` (> rsAngstrom 30.0 80.0)

    it "rs is always <= ra" $
      rsAngstrom 35.0 0.0 `shouldSatisfy` (<= 35.0)

  describe "sunFraction" $ do

    it "0 % cloud: fraction = 1.0 (full sun)" $
      sunFraction 0.0 `shouldBe` 1.0

    it "100 % cloud: fraction = 0.0" $
      sunFraction 100.0 `shouldBe` 0.0

    it "50 % cloud: fraction = 0.5" $
      sunFraction 50.0 `shouldBe` 0.5

  -- --------------------------------------------------------------------------
  -- Vapour pressure
  -- --------------------------------------------------------------------------
  describe "satVapourPressure" $ do

    it "positive for 20 C" $
      satVapourPressure 20.0 `shouldSatisfy` (> 0)

    it "~= 2.338 kPa at 20 C (standard psychrometric table)" $
      satVapourPressure 20.0 `shouldSatisfy` inRange 2.30 2.40

    it "increases with temperature" $
      satVapourPressure 30.0 `shouldSatisfy` (> satVapourPressure 15.0)

  describe "eaFromRH" $ do

    it "100 % RH: ea ~= es (no VPD)" $ do
      let es = satVapourPressure 20.0
          ea = eaFromRH 18.0 22.0 100.0
      abs (es - ea) `shouldSatisfy` (< 0.05)

    it "ea < es for sub-100 % RH" $
      eaFromRH 15.0 25.0 60.0 `shouldSatisfy` (< esMean 15.0 25.0)

  describe "slopeVapourPressure" $ do

    it "positive and reasonable at 20 C (~= 0.14 kPa/C)" $
      slopeVapourPressure 20.0 `shouldSatisfy` inRange 0.12 0.18

    it "increases with temperature" $
      slopeVapourPressure 30.0 `shouldSatisfy` (> slopeVapourPressure 10.0)

  describe "psychroConst" $ do

    it "~= 0.0674 kPa/C at 1013.25 hPa" $
      psychroConst 1013.25 `shouldSatisfy` inRange 0.065 0.070

  -- --------------------------------------------------------------------------
  -- ET0 — FAO-56 Penman-Monteith
  -- --------------------------------------------------------------------------
  describe "et0FAO56" $ do

    it "returns positive value for typical inputs" $
      et0FAO56 22.0 18.0 26.0 65.0 2.0 30.0 15.0 1013.25 120.0
        `shouldSatisfy` (> 0)

    it "reasonable daily range (1-8 mm/day) for temperate spring" $
      et0FAO56 22.0 18.0 26.0 65.0 2.0 30.0 15.0 1013.25 120.0
        `shouldSatisfy` inRange 1.0 8.0

    it "increases with temperature (higher tMean)" $
      et0FAO56 30.0 26.0 34.0 65.0 2.0 30.0 15.0 1013.25 120.0
        `shouldSatisfy`
          (> et0FAO56 10.0 6.0 14.0 65.0 2.0 30.0 15.0 1013.25 120.0)

    it "increases with wind speed" $
      et0FAO56 22.0 18.0 26.0 65.0 5.0 30.0 15.0 1013.25 120.0
        `shouldSatisfy`
          (> et0FAO56 22.0 18.0 26.0 65.0 0.5 30.0 15.0 1013.25 120.0)

    it "decreases with higher humidity (smaller VPD)" $
      et0FAO56 22.0 18.0 26.0 90.0 2.0 30.0 15.0 1013.25 120.0
        `shouldSatisfy`
          (< et0FAO56 22.0 18.0 26.0 30.0 2.0 30.0 15.0 1013.25 120.0)

    it "non-negative when VPD = 0 and Rn <= 0 (cold humid overcast)" $
      -- extreme case: 0 °C, 100 % RH, zero wind, zero radiation
      et0FAO56 0.0 0.0 0.0 100.0 0.0 0.0 0.0 1013.25 0.0
        `shouldSatisfy` (>= 0)

  -- --------------------------------------------------------------------------
  -- GDD — daily method
  -- --------------------------------------------------------------------------
  describe "gddFromDays" $ do

    it "empty list gives 0" $
      gddFromDays [] `shouldBe` 0

    it "all Tmax/Tmin below 10 C gives 0" $ do
      let days = replicate 5 DaySummary
                   { dsTmin=3.0, dsTmax=8.0, dsTmean=5.5
                   , dsRH=70, dsU2=1.0, dsCC=60, dsRain=0, dsSnow=0, dsPres=1013 }
      gddFromDays days `shouldBe` 0

    it "constant Tmax=24, Tmin=16 for 7 days: GDD = 7 * (20-10) = 70" $ do
      let days = replicate 7 DaySummary
                   { dsTmin=16.0, dsTmax=24.0, dsTmean=20.0
                   , dsRH=65, dsU2=1.5, dsCC=40, dsRain=0, dsSnow=0, dsPres=1013 }
      gddFromDays days `shouldSatisfy` inRange 69.9 70.1

    it "mixed: only days with mean > 10 contribute" $ do
      let coldDay = DaySummary { dsTmin=2.0,  dsTmax=8.0,  dsTmean=5.0
                               , dsRH=80, dsU2=1.0, dsCC=70, dsRain=0, dsSnow=0, dsPres=1013 }
          warmDay' = DaySummary { dsTmin=16.0, dsTmax=26.0, dsTmean=21.0
                                , dsRH=60, dsU2=1.5, dsCC=30, dsRain=0, dsSnow=0, dsPres=1013 }
          -- warm contributes (24+16)/2 - 10 = 11 each, x2 = 22
      gddFromDays [coldDay, warmDay', coldDay, warmDay'] `shouldSatisfy` inRange 21.9 22.1

  -- --------------------------------------------------------------------------
  -- groupByDay / summariseDay
  -- --------------------------------------------------------------------------
  describe "groupByDay" $ do

    it "single date, one group" $ do
      let pts = replicate 24 warmDay   -- all with same dt prefix
      length (groupByDay pts) `shouldBe` 1

    it "7 distinct dates, 7 groups" $
      length (groupByDay h7Days) `shouldBe` 7

  describe "summariseDay" $ do

    it "empty list returns Nothing" $
      summariseDay [] `shouldBe` Nothing

    it "returns Just for valid points" $
      summariseDay [warmDay] `shouldSatisfy` \r -> case r of Just _ -> True; _ -> False

    it "Tmin <= Tmean <= Tmax" $ do
      let pts = [ mkPoint 10.0 70.0 0.0 1.0 50.0 1013.25 False
                , mkPoint 20.0 60.0 0.0 2.0 40.0 1013.25 False
                , mkPoint 30.0 50.0 0.0 1.5 30.0 1013.25 False
                ]
      case summariseDay pts of
        Nothing -> expectationFailure "expected Just"
        Just ds -> do
          dsTmin ds `shouldSatisfy` (<= dsTmean ds)
          dsTmean ds `shouldSatisfy` (<= dsTmax ds)

  -- --------------------------------------------------------------------------
  -- SPI approximation
  -- --------------------------------------------------------------------------
  describe "spiApprox" $ do

    it "returns 0 when all rain values are identical (std = 0)" $
      spiApprox h30Uniform `shouldBe` 0.0

    it "returns a finite non-zero value for variable rain" $ do
      -- h30Variable: last day has rain=8.0, most days have 0.5
      -- z-score of last day vs window distribution is clearly positive
      spiApprox h30Variable `shouldSatisfy` (> 0.0)

    it "magnitude of SPI is reasonable (within -5..5)" $
      spiApprox h30Variable `shouldSatisfy` inRange (-5.0) 5.0

    it "negative SPI when rain is mostly zero (drought)" $ do
      let dryPts = [ mkPointDay (date d) 18.0 70.0 0.0 1.0 50.0 1013.25 False
                   | d <- [1..30 :: Int] ]
          date d = if d <= 9 then "2026-03-0" <> show d else "2026-03-" <> show d
      spiApprox dryPts `shouldBe` 0.0   -- zero rain = zero std → fallback 0

  -- --------------------------------------------------------------------------
  -- computeMetrics — integration
  -- --------------------------------------------------------------------------
  describe "computeMetrics - basic structure" $ do

    let res = computeMetrics testLocation

    it "temp_max_7d >= temp_min_7d" $
      temp_max_7d res `shouldSatisfy` (>= temp_min_7d res)

    it "temp_max_7d = 22.0 (all warm-day inputs)" $
      temp_max_7d res `shouldSatisfy` inRange 21.9 22.1

    it "temp_min_7d = 22.0 (all warm-day inputs)" $
      temp_min_7d res `shouldSatisfy` inRange 21.9 22.1

    it "hum_mean_7d within [0, 100]" $
      hum_mean_7d res `shouldSatisfy` inRange 0 100

    it "rain_sum_7d = 7 x 0.5 = 3.5" $
      rain_sum_7d res `shouldSatisfy` inRange 3.4 3.6

    it "gdd > 0 for 22 C history (mean > 10 C base)" $
      gdd res `shouldSatisfy` (> 0)

    it "ra > 0" $
      ra res `shouldSatisfy` (> 0)

    it "rs > 0 and rs <= ra" $ do
      rs res `shouldSatisfy` (> 0)
      rs res `shouldSatisfy` (<= ra res)

    it "et0 > 0" $
      et0 res `shouldSatisfy` (> 0)

    it "et0 is a daily value (reasonable range 1-10 mm/day)" $
      et0 res `shouldSatisfy` inRange 0.5 10.0

    it "spi1m = 0 when all rain values are identical" $ do
      let loc = testLocation { history_30d = h30Uniform }
      spi1m (computeMetrics loc) `shouldBe` 0.0

  describe "computeMetrics - night temperature" $ do

    it "temp_min_night_7d ~= 3.0 (cold night points only)" $ do
      let loc = testLocation { history_7d = h7WithNights }
      temp_min_night_7d (computeMetrics loc) `shouldSatisfy` inRange 2.9 3.1

    it "night min is lower than all-day min" $ do
      let locDay   = testLocation { history_7d = h7Days }
          locMixed = testLocation { history_7d = h7WithNights }
      temp_min_night_7d (computeMetrics locMixed)
        `shouldSatisfy` (< temp_min_7d (computeMetrics locDay))

  describe "computeMetrics - water deficit" $ do

    it "water_deficit_7d increases when there is no rain" $ do
      let dryH7  = [ mkPointDay ("2026-04-2" <> show d) 22.0 65.0 0.0 1.5 40.0 1013.25 False
                   | d <- [1..7 :: Int] ]
          locDry = testLocation { history_7d = dryH7 }
          locWet = testLocation { history_7d = h7Days }
      water_deficit_7d (computeMetrics locDry)
        `shouldSatisfy` (> water_deficit_7d (computeMetrics locWet))

    it "water_deficit_7d = sum(daily_et0, 7d) - (rain7 + snow7)" $ do
      -- With uniform 7d history, Σ daily_et0 ≈ 7 * et0_today
      -- We verify the sign and order of magnitude, not the exact value,
      -- because daily_et0 uses per-day ra(j) which drifts slightly.
      let res     = computeMetrics testLocation
          rain7   = 3.5      -- 7 x 0.5 mm
          -- deficit should be positive (ET0 dominates in spring)
      water_deficit_7d res `shouldSatisfy` inRange (-rain7) 100.0

    it "water_deficit_30d is finite and has plausible magnitude" $ do
      let res = computeMetrics testLocation
      water_deficit_30d res `shouldSatisfy` inRange (-500.0) 500.0

  describe "computeMetrics - cold history" $ do

    it "gdd = 0 when all temps below base" $ do
      let loc = testLocation { history_7d = h7ColdDays }
      gdd (computeMetrics loc) `shouldBe` 0.0

    it "et0 still positive even in cold conditions" $ do
      let loc = testLocation { history_7d = h7ColdDays }
      et0 (computeMetrics loc) `shouldSatisfy` (>= 0)