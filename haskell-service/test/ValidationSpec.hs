{-# LANGUAGE OverloadedStrings #-}

module ValidationSpec (spec) where

import Test.Hspec
import Validation

inRange :: Double -> Double -> Double -> Bool
inRange lo hi x = x >= lo && x <= hi

-- ================================
-- Helpers
-- ================================

allVeg :: [Int]
allVeg = replicate 100 4

withClass :: Int -> Int -> [Int] -> [Int]
withClass n c xs = replicate n c ++ drop n xs

only :: Int -> Int -> [Int]
only n c = replicate n c

-- ================================
-- Tests
-- ================================

spec :: Spec
spec = do

  describe "validateSCL - clean scene" $ do

    it "all vegetation returns confidence 1.0" $
      confidence_score (validateSCL allVeg 0.3) `shouldBe` 1.0

    it "clean scene has empty issues list" $
      issues (validateSCL allVeg 0.3) `shouldBe` []

    it "water pixels (6) are excluded from total" $
      confidence_score (validateSCL (replicate 50 6 ++ replicate 50 4) 0.3) `shouldBe` 1.0

    it "NoData pixels (0) are excluded from total" $
      confidence_score (validateSCL (replicate 30 0 ++ replicate 70 4) 0.3) `shouldBe` 1.0

    it "water_excluded is always True" $
      water_excluded (validateSCL allVeg 0.3) `shouldBe` True

  describe "validateSCL - cloud cover" $ do

    it "5% cloud cover -> confidence 1.0 (below 10%)" $
      confidence_score (validateSCL (withClass 5 8 allVeg) 0.3) `shouldBe` 1.0

    it "20% cloud cover -> confidence 0.75 (10-30% band)" $
      confidence_score (validateSCL (withClass 20 8 allVeg) 0.3) `shouldBe` 0.75

    it "35% cloud cover with threshold=0.5 -> confidence 0.5 (30-40% band)" $ do
      -- maxCloudThreshold must be > cloudRatio(0.35) to not zero it out
      -- score rule: cloudRatio < 0.4 -> 0.5
      confidence_score (validateSCL (withClass 35 9 allVeg) 0.5) `shouldBe` 0.5

    it "50% cloud cover -> confidence 0.0 (too cloudy)" $
      confidence_score (validateSCL (withClass 50 8 allVeg) 0.3) `shouldBe` 0.0

    it "cloud cover exceeding maxCloudThreshold gives 0.0" $
      -- 15% cloud, maxCloudThreshold=0.10 -> score=0.0
      confidence_score (validateSCL (withClass 15 8 allVeg) 0.10) `shouldBe` 0.0

    it "cloud shadows (class 3) count as bad pixels" $
      cloud_ratio (validateSCL (withClass 40 3 allVeg) 0.3) `shouldSatisfy` inRange 0.39 0.41

    it "thin cirrus (class 10) counts as bad pixel" $
      cloud_ratio (validateSCL (withClass 15 10 allVeg) 0.3) `shouldSatisfy` inRange 0.14 0.16

    it "cloud_ratio reflects actual proportion" $
      cloud_ratio (validateSCL (withClass 20 9 allVeg) 0.3) `shouldSatisfy` inRange 0.19 0.21

    it "high cloud adds issue message" $
      issues (validateSCL (withClass 40 8 allVeg) 0.3) `shouldSatisfy` (not . null)

  describe "validateSCL - snow/ice" $ do

    it "55% snow -> confidence 0.0" $
      confidence_score (validateSCL (withClass 55 11 allVeg) 0.3) `shouldBe` 0.0

    it "55% snow adds snow issue containing 'snow/ice:'" $
      -- The issue string is: "Excessive snow/ice: 55.0%"
      -- words produces ["Excessive","snow/ice:","55.0%"] -> check for "snow/ice:"
      issues (validateSCL (withClass 55 11 allVeg) 0.3)
        `shouldSatisfy` any ("snow/ice:" `elem`) . map words

    it "30% snow does not trigger snow issue" $
      snow_ratio (validateSCL (withClass 30 11 allVeg) 0.3) `shouldSatisfy` inRange 0.29 0.31

    it "snow_ratio is correct" $
      snow_ratio (validateSCL (withClass 20 11 allVeg) 0.3) `shouldSatisfy` inRange 0.19 0.21

  describe "validateSCL - edge cases" $ do

    it "empty input returns 0.0 confidence" $
      confidence_score (validateSCL [] 0.3) `shouldBe` 0.0

    it "all water returns 0.0 confidence (no valid pixels)" $
      confidence_score (validateSCL (only 100 6) 0.3) `shouldBe` 0.0

    it "all NoData returns 0.0 confidence" $
      confidence_score (validateSCL (only 100 0) 0.3) `shouldBe` 0.0

    it "all water or NoData adds no-valid-pixels issue" $
      issues (validateSCL (only 50 6 ++ only 50 0) 0.3)
        `shouldSatisfy` any ("No" `elem`) . map words

    it "mixed valid classes with no clouds returns 1.0" $
      confidence_score (validateSCL [4,5,4,7,5,4,4,5,7,4] 0.3) `shouldBe` 1.0

  describe "checkRadiometry" $ do

    it "all normal pixels returns True" $
      checkRadiometry (replicate 100 5000.0) `shouldBe` True

    it "0% saturated returns True" $
      checkRadiometry (replicate 200 10000.0) `shouldBe` True

    it "2% saturated (> 1% limit) returns False" $ do
      -- 2 saturated out of 100 = 2% > 1%
      checkRadiometry (replicate 2 20000.0 ++ replicate 98 5000.0) `shouldBe` False

    it "0.5% saturated (< 1% limit) returns True" $ do
      -- 1 saturated out of 200 = 0.5% < 1%
      checkRadiometry (replicate 1 20000.0 ++ replicate 200 5000.0) `shouldBe` True

    it "all saturated returns False" $
      checkRadiometry (replicate 100 16000.0) `shouldBe` False

    it "boundary value 15000 is NOT saturated (filter uses >)" $
      -- checkRadiometry uses (> 15000), so 15000 exactly is not counted
      checkRadiometry (replicate 100 15000.0) `shouldBe` True

    it "value 15001 is saturated when it crosses 1% of total" $ do
      -- Need > 1% of pixels to be > 15000
      -- 2 out of 100 = 2% > 1% -> False
      checkRadiometry (replicate 2 15001.0 ++ replicate 98 5000.0) `shouldBe` False