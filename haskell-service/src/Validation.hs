{-# LANGUAGE DeriveGeneric #-}

module Validation where

import GHC.Generics (Generic)
import Data.Aeson (ToJSON)

data ValidationResult = ValidationResult
  { confidence_score :: Double
  , quality_report :: String
  , cloud_ratio :: Double
  , snow_ratio :: Double
  , water_excluded :: Bool
  , issues :: [String]
  } deriving (Show, Generic)

instance ToJSON ValidationResult

-- SCL Classes:
-- 0: No Data
-- 1: Saturated/Defective
-- 2: Dark Area Pixels
-- 3: Cloud Shadows
-- 4: Vegetation
-- 5: Non-Vegetated
-- 6: Water (EXCLUDED FROM VALIDATION)
-- 7: Unclassified
-- 8: Cloud Medium Probability
-- 9: Cloud High Probability
-- 10: Thin Cirrus
-- 11: Snow/Ice

validateSCL :: [Int] -> Double -> ValidationResult
validateSCL sclValues maxCloudThreshold =
    let
        filteredValues = filter (`notElem` [0, 6]) sclValues
        total  = fromIntegral $ length filteredValues

        -- Bad pixels: clouds, shadows, cirrus
        badPixels = fromIntegral $ length $ filter (`elem` [3, 8, 9, 10]) filteredValues

        -- Snow/ice pixels
        snowPixels = fromIntegral $ length $ filter (== 11) filteredValues

        -- Calculate ratios
        cloudRatio = if total > 0 then badPixels / total else 0.0
        snowRatio  = if total > 0 then snowPixels / total else 0.0

        -- Collect issues
        issueList = concat
            [ if cloudRatio > 0.3 then ["High cloud cover: " ++ show (cloudRatio * 100) ++ "%"] else []
            , if snowRatio > 0.5 then ["Excessive snow/ice: " ++ show (snowRatio * 100) ++ "%"] else []
            , if total == 0 then ["No valid pixels after filtering"] else []
            ]

        -- Calculate confidence score
        score
            | total == 0                      = 0.0
            | snowRatio > 0.5                 = 0.0
            | cloudRatio > maxCloudThreshold  = 0.0
            | cloudRatio < 0.1                = 1.0  -- Ideal: <10% cloud
            | cloudRatio < 0.2                = 0.75 -- Good: <20% cloud
            | cloudRatio < 0.3                = 0.5  -- Acceptable: <30% cloud
            | otherwise                       = 0.0  -- Too cloudy

        report
            | null issueList = "Validation passed. Cloud: " ++ show (cloudRatio * 100) ++
                              "%, Snow: " ++ show (snowRatio * 100) ++ "%"
            | otherwise = "Issues detected. " ++ unwords issueList

    in ValidationResult score report cloudRatio snowRatio True issueList


checkRadiometry :: [Double] -> Bool
checkRadiometry pixels =
    let limit = 15000.0
        saturated = length $ filter (> limit) pixels
    in (fromIntegral saturated / fromIntegral (length pixels)) < 0.01