{-# LANGUAGE OverloadedStrings #-}

module StatsSpec (spec) where

import Test.Hspec
import Stats

-- ================================
-- Helpers
-- ================================

m1 :: Double -> [[Double]]
m1 v = [[v]]

uni :: Int -> Double -> [[Double]]
uni n v = replicate n (replicate n v)

runUni :: Double -> Double -> Double -> Double -> Double -> Double -> NDVIMetricsResult
runUni n g r re2 s16 s22 =
  computeNDVIMetrics RawData
    { nir      = m1 n
    , green    = m1 g
    , red      = m1 r
    , rededge2 = m1 re2
    , swir16   = m1 s16
    , swir22   = m1 s22
    }

px :: [[Double]] -> Double
px [[v]] = v
px _     = error "expected 1x1 map"

inRange :: Double -> Double -> Double -> Bool
inRange lo hi x = x >= lo && x <= hi

-- ================================
-- Tests
-- ================================

spec :: Spec
spec = do

  describe "calculateNDVI" $ do

    it "symmetric bands produce 0" $
      calculateNDVI 0.5 0.5 `shouldBe` 0.0

    it "nir >> red gives value close to 1" $
      calculateNDVI 0.9 0.1 `shouldSatisfy` inRange 0.79 0.81

    it "nir << red gives negative value" $
      calculateNDVI 0.1 0.9 `shouldSatisfy` (< 0)

    it "known value: nir=0.8 red=0.2 -> 0.6" $
      calculateNDVI 0.8 0.2 `shouldSatisfy` inRange 0.599 0.601

    it "result is always in [-1, 1] for positive inputs" $
      calculateNDVI 0.6 0.4 `shouldSatisfy` inRange (-1.0) 1.0

  describe "calculateGNDVI" $ do

    it "symmetric bands produce 0" $
      calculateGNDVI 0.5 0.5 `shouldBe` 0.0

    it "nir=0.8 green=0.3 gives positive value" $
      calculateGNDVI 0.8 0.3 `shouldSatisfy` (> 0)

    it "known value: nir=0.6 green=0.2 -> 0.5" $
      calculateGNDVI 0.6 0.2 `shouldSatisfy` inRange 0.499 0.501

  describe "calculateNDRE" $ do

    it "symmetric bands produce 0" $
      calculateNDRE 0.5 0.5 `shouldBe` 0.0

    it "nir=0.7 rededge2=0.4 gives positive result" $
      calculateNDRE 0.7 0.4 `shouldSatisfy` (> 0)

    it "known value: nir=0.6 re2=0.3 -> 0.333" $
      calculateNDRE 0.6 0.3 `shouldSatisfy` inRange 0.332 0.334

  describe "calculateNDWI" $ do

    it "symmetric bands produce 0" $
      calculateNDWI 0.5 0.5 `shouldBe` 0.0

    it "nir=0.2 swir16=0.8 gives negative result (dry soil)" $
      calculateNDWI 0.2 0.8 `shouldSatisfy` (< 0)

    it "nir=0.8 swir16=0.2 gives positive result (water/wet)" $
      calculateNDWI 0.8 0.2 `shouldSatisfy` (> 0)

  describe "calculateNMDI" $ do
    -- NMDI = (n - (s16 - s22)) / (n + (s16 - s22))
    -- With n=0.6, s16=0.3, s22=0.1: diff=0.2, result=(0.6-0.2)/(0.6+0.2)=0.4/0.8=0.5

    it "nir >> (swir16-swir22) gives positive value" $
      calculateNMDI 0.9 0.3 0.1 `shouldSatisfy` (> 0)

    it "known value: nir=0.6 swir16=0.3 swir22=0.1 -> 0.5" $
      -- diff = 0.3-0.1 = 0.2; (0.6-0.2)/(0.6+0.2) = 0.4/0.8 = 0.5
      calculateNMDI 0.6 0.3 0.1 `shouldSatisfy` inRange 0.499 0.501

    it "swir16 == swir22: diff=0 so result = n/n = 1.0" $
      -- diff = 0; (n - 0) / (n + 0) = 1.0
      calculateNMDI 0.6 0.4 0.4 `shouldSatisfy` inRange 0.99 1.01

    it "large swir difference reduces result toward -1" $
      -- diff = s16-s22 large relative to n -> result approaches -1
      calculateNMDI 0.2 0.8 0.1 `shouldSatisfy` (< 0)

  describe "zipMatrices" $ do

    it "adds two 2x2 matrices element-wise" $ do
      let a   = [[1,2],[3,4]] :: [[Double]]
          b   = [[10,20],[30,40]] :: [[Double]]
      zipMatrices (+) a b `shouldBe` [[11,22],[33,44]]

    it "1x1 matrix produces 1x1 result" $
      zipMatrices (*) [[3.0]] [[4.0]] `shouldBe` [[12.0]]

    it "preserves matrix shape for 3x3" $ do
      let res = zipMatrices (-) (uni 3 0.5) (uni 3 0.3)
      length res `shouldBe` 3
      length (res !! 0) `shouldBe` 3

  describe "zipMatrices3" $ do

    it "1x1 NMDI via zipMatrices3 matches calculateNMDI directly" $ do
      -- calculateNMDI 0.6 0.3 0.1 = 0.5
      let res = zipMatrices3 calculateNMDI [[0.6]] [[0.3]] [[0.1]]
      px res `shouldSatisfy` inRange 0.499 0.501

    it "1x1 result where swir16=swir22 gives 1.0" $ do
      let res = zipMatrices3 calculateNMDI [[0.6]] [[0.4]] [[0.4]]
      px res `shouldSatisfy` inRange 0.99 1.01

  describe "computeNDVIMetrics" $ do

    it "returns correct shape for 2x2 input" $ do
      let rd = RawData
                 { nir      = uni 2 0.7
                 , green    = uni 2 0.3
                 , red      = uni 2 0.2
                 , rededge2 = uni 2 0.4
                 , swir16   = uni 2 0.25
                 , swir22   = uni 2 0.15
                 }
          res = computeNDVIMetrics rd
      length (ndvi_map  res) `shouldBe` 2
      length (gndvi_map res) `shouldBe` 2
      length (ndre_map  res) `shouldBe` 2
      length (ndwi_map  res) `shouldBe` 2
      length (nmdi_map  res) `shouldBe` 2

    it "ndvi_map pixel matches calculateNDVI for 1x1" $ do
      let res = runUni 0.8 0.3 0.2 0.4 0.25 0.15
      px (ndvi_map res) `shouldSatisfy` inRange 0.598 0.602

    it "gndvi_map pixel matches calculateGNDVI for 1x1" $ do
      let res = runUni 0.8 0.3 0.2 0.4 0.25 0.15
      px (gndvi_map res) `shouldSatisfy` inRange 0.454 0.456

    it "ndre_map pixel matches calculateNDRE for 1x1" $ do
      let res = runUni 0.8 0.3 0.2 0.4 0.25 0.15
      px (ndre_map res) `shouldSatisfy` inRange 0.332 0.334

    it "ndwi_map pixel matches calculateNDWI for 1x1" $ do
      let res = runUni 0.8 0.3 0.2 0.4 0.25 0.15
      px (ndwi_map res) `shouldSatisfy` inRange 0.523 0.525

    it "all maps have consistent pixel count for 4x4 input" $ do
      let rd = RawData
                 { nir      = uni 4 0.7
                 , green    = uni 4 0.3
                 , red      = uni 4 0.2
                 , rededge2 = uni 4 0.4
                 , swir16   = uni 4 0.25
                 , swir22   = uni 4 0.15
                 }
          res   = computeNDVIMetrics rd
          total = sum . map length
      total (ndvi_map  res) `shouldBe` 16
      total (gndvi_map res) `shouldBe` 16
      total (ndwi_map  res) `shouldBe` 16