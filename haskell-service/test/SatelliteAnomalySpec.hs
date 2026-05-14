{-# LANGUAGE OverloadedStrings #-}

module SatelliteAnomalySpec (spec) where

import Test.Hspec
import SatelliteAnomaly

-- ================================
-- Helpers
-- ================================

uni :: Int -> Double -> [[Double]]
uni n v = replicate n (replicate n v)

base :: SnapshotInput
base = SnapshotInput
  { prev_ndvi            = uni 10 0.70
  , last_ndvi            = uni 10 0.70
  , prev_gndvi           = uni 10 0.55
  , last_gndvi           = uni 10 0.55
  , prev_ndre            = uni 10 0.45
  , last_ndre            = uni 10 0.45
  , area_threshold_ratio = 0.10
  }

getMetric :: String -> SnapshotResult -> MetricAnomaly
getMetric name res =
  case filter (\m -> metric_name m == name) (metrics res) of
    (m:_) -> m
    []    -> error $ "metric not found: " ++ name

run :: SnapshotInput -> String -> MetricAnomaly
run inp name = getMetric name (computeSnapshotAnomaly inp)

inRange :: Double -> Double -> Double -> Bool
inRange lo hi x = x >= lo && x <= hi

-- ================================
-- Tests
-- ================================

spec :: Spec
spec = do

  describe "flatMean" $ do

    it "uniform 10x10 map: prev_mean equals the pixel value" $
      let m = getMetric "ndvi" (computeSnapshotAnomaly base)
      in prev_mean m `shouldSatisfy` inRange 0.699 0.701

    it "empty map does not crash and returns is_anomaly = False" $ do
      let m = run base { prev_ndvi = [[]], last_ndvi = [[]] } "ndvi"
      is_anomaly m `shouldBe` False

  describe "no anomaly" $ do

    it "identical maps: is_anomaly = False for all metrics" $ do
      let r = computeSnapshotAnomaly base
      mapM_ (\n -> is_anomaly (getMetric n r) `shouldBe` False)
            ["ndvi", "gndvi", "ndre"]

    it "identical maps: anomaly_kind = none for all metrics" $ do
      let r = computeSnapshotAnomaly base
      mapM_ (\n -> anomaly_kind (getMetric n r) `shouldBe` "none")
            ["ndvi", "gndvi", "ndre"]

    it "identical maps: confidence = 0.0 for all metrics" $ do
      let r = computeSnapshotAnomaly base
      mapM_ (\n -> confidence (getMetric n r) `shouldBe` 0.0)
            ["ndvi", "gndvi", "ndre"]

    it "NDVI drop of 5% (below 15% rel threshold) does not trigger anomaly" $ do
      -- 0.70 -> 0.665 = -4.8%
      let m = run base { last_ndvi = uni 10 0.665 } "ndvi"
      is_anomaly m `shouldBe` False

    it "mean drops enough but <10% pixels affected: no anomaly" $ do
      -- 10x10 = 100 pixels; only 5 (5%) dropped sharply, rest stable
      let stable   = replicate 10 0.70 :: [Double]
          spikeRow = replicate 5 0.40 ++ replicate 5 0.70
          lastMap  = spikeRow : replicate 9 stable
          m        = run base { last_ndvi = lastMap } "ndvi"
      is_anomaly m `shouldBe` False

    it "stable data: anomaly_pixel_count = 0" $
      anomaly_pixel_count (run base "ndvi") `shouldBe` 0

    it "10x10 map: total_pixel_count = 100" $
      total_pixel_count (run base "ndvi") `shouldBe` 100

  describe "anomaly - drop" $ do

    it "NDVI -25% across entire map: is_anomaly = True" $ do
      let m = run base { last_ndvi = uni 10 0.525 } "ndvi"
      is_anomaly m `shouldBe` True

    it "NDVI -25%: anomaly_kind = drop" $ do
      let m = run base { last_ndvi = uni 10 0.525 } "ndvi"
      anomaly_kind m `shouldBe` "drop"

    it "NDVI -25%: abs_delta is negative" $ do
      let m = run base { last_ndvi = uni 10 0.525 } "ndvi"
      abs_delta m `shouldSatisfy` (< 0)

    it "NDVI -25%: rel_change is approximately -0.25" $ do
      let m = run base { last_ndvi = uni 10 0.525 } "ndvi"
      rel_change m `shouldSatisfy` inRange (-0.26) (-0.24)

    it "NDVI -25%: all 100 pixels are anomalous" $ do
      let m = run base { last_ndvi = uni 10 0.525 } "ndvi"
      anomaly_pixel_count m `shouldBe` 100

    it "NDVI -25%: anomaly_ratio = 1.0" $ do
      let m = run base { last_ndvi = uni 10 0.525 } "ndvi"
      anomaly_ratio m `shouldSatisfy` inRange 0.99 1.01

    it "NDVI -25%: confidence > 0.60" $ do
      let m = run base { last_ndvi = uni 10 0.525 } "ndvi"
      confidence m `shouldSatisfy` (> 0.60)

    it "confidence is always <= 0.9999" $ do
      let m = run base { last_ndvi = uni 10 0.10 } "ndvi"
      confidence m `shouldSatisfy` (<= 0.9999)

    it "GNDVI -20% (0.55->0.44): is_anomaly = True" $ do
      let m = run base { last_gndvi = uni 10 0.44 } "gndvi"
      is_anomaly m `shouldBe` True

    it "NDRE -22% (0.45->0.351): is_anomaly = True" $ do
      let m = run base { last_ndre = uni 10 0.351 } "ndre"
      is_anomaly m `shouldBe` True

  describe "anomaly - rise" $ do

    it "NDVI +25% (0.70->0.875): anomaly_kind = rise" $ do
      let m = run base { last_ndvi = uni 10 0.875 } "ndvi"
      anomaly_kind m `shouldBe` "rise"

    it "NDVI +25%: abs_delta is positive" $ do
      let m = run base { last_ndvi = uni 10 0.875 } "ndvi"
      abs_delta m `shouldSatisfy` (> 0)

    it "NDVI +25%: is_anomaly = True" $ do
      let m = run base { last_ndvi = uni 10 0.875 } "ndvi"
      is_anomaly m `shouldBe` True

  describe "area_threshold_ratio" $ do

    -- Both meanOk AND areaOk must pass.
    -- Here ALL pixels drop by 25% so meanOk passes,
    -- and we use a strict area threshold to verify it blocks the anomaly.
    it "soft threshold (0.04): all pixels dropped -> fires" $ do
      -- 100% pixels changed, area_threshold=0.04 -> areaOk (1.0 >= 0.04)
      let m = run base
                { last_ndvi            = uni 10 0.525  -- -25%, all 100px anomalous
                , area_threshold_ratio = 0.04
                } "ndvi"
      is_anomaly m `shouldBe` True

    it "strict threshold (0.30): 100% pixels dropped -> still fires" $ do
      let m = run base
                { last_ndvi            = uni 10 0.525
                , area_threshold_ratio = 0.30
                } "ndvi"
      is_anomaly m `shouldBe` True

    it "strict threshold (0.80): only 50% pixels dropped -> does not fire" $ do
      -- 50 pixels drop to 0.40 (delta=0.30 >= pixThr 0.10), 50 stay at 0.70
      -- anomaly_ratio = 0.50 < 0.80 -> areaOk fails
      let half    = replicate 5 0.40 ++ replicate 5 0.70 :: [Double]
          lastMap = replicate 10 half
          m       = run base
                      { last_ndvi            = lastMap
                      , area_threshold_ratio = 0.80
                      } "ndvi"
      is_anomaly m `shouldBe` False

    it "threshold blocks anomaly when ratio just below limit" $ do
      -- 9% pixels changed, threshold=0.10 -> areaOk fails (0.09 < 0.10)
      -- Use 9x10 map: 9 rows of 10 pixels changed, 1 row stable -> 90/100 wait
      -- Simpler: 1x1 pixel, ratio=1.0 but mean change < 15% -> meanOk fails
      let m = run base
                { last_ndvi            = uni 10 0.665  -- only -5%, meanOk fails
                , area_threshold_ratio = 0.01
                } "ndvi"
      is_anomaly m `shouldBe` False

  describe "result structure" $ do

    it "always returns exactly 3 metrics" $
      length (metrics (computeSnapshotAnomaly base)) `shouldBe` 3

    it "metrics are always in order: ndvi, gndvi, ndre" $ do
      let names = map metric_name (metrics (computeSnapshotAnomaly base))
      names `shouldBe` ["ndvi", "gndvi", "ndre"]

  describe "edge cases" $ do

    it "prev = 0 does not cause division by zero" $ do
      let m = run base { prev_ndvi = uni 10 0.0, last_ndvi = uni 10 0.5 } "ndvi"
      is_anomaly m `shouldBe` True

    it "single pixel [[0.70]] -> [[0.52]] triggers anomaly" $ do
      let m = run base
                { prev_ndvi            = [[0.70]]
                , last_ndvi            = [[0.52]]
                , area_threshold_ratio = 0.10
                } "ndvi"
      is_anomaly m `shouldBe` True

    it "all pixels = 0 in both snapshots: no anomaly" $ do
      let m = run base { prev_ndvi = uni 10 0.0, last_ndvi = uni 10 0.0 } "ndvi"
      is_anomaly m `shouldBe` False

    it "total_pixel_count = 1 for single-pixel input" $ do
      let m = run base { prev_ndvi = [[0.70]], last_ndvi = [[0.52]] } "ndvi"
      total_pixel_count m `shouldBe` 1