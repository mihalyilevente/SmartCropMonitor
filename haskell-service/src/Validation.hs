{-# LANGUAGE DeriveGeneric #-}

module Validation where

import GHC.Generics (Generic)
import Data.Aeson (ToJSON)

data ValidationResult = ValidationResult
  { is_valid       :: Bool
  , quality_report :: String
  , cloud_ratio    :: Double
  , nan_ratio      :: Double
  } deriving (Show, Generic)

instance ToJSON ValidationResult

validateSCL :: [Int] -> Double -> ValidationResult
validateSCL sclValues maxCloudThreshold =
    let total  = fromIntegral $ length sclValues
        bad    = fromIntegral $ length $ filter (`elem` [3, 8, 9, 10]) sclValues
        snow   = fromIntegral $ length $ filter (== 11) sclValues
        ratio  = bad / total
        sRatio = snow / total

        (valid, msg)
            | ratio > maxCloudThreshold = (False, "High cloud cover: " ++ show (ratio * 100) ++ "%")
            | sRatio > 0.5              = (False, "Too much snow")
            | otherwise                 = (True, "OK")
    in ValidationResult valid msg ratio 0.0


checkRadiometry :: [Double] -> Bool
checkRadiometry pixels =
    let limit = 15000.0
        saturated = length $ filter (> limit) pixels
    in (fromIntegral saturated / fromIntegral (length pixels)) < 0.01