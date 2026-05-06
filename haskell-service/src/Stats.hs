{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE OverloadedStrings #-}

module Stats where

import GHC.Generics
import Data.Aeson

data RawData = RawData
  { nir      :: [[Double]]
  , green    :: [[Double]]
  , red      :: [[Double]]
  , rededge2 :: [[Double]]
  , swir16   :: [[Double]]
  , swir22   :: [[Double]]
  } deriving (Show, Generic)

instance FromJSON RawData
instance ToJSON RawData

data NDVIMetricsResult = NDVIMetricsResult
    { ndvi_map :: [[Double]]
    , gndvi_map :: [[Double]]
    , ndre_map :: [[Double]]
    , ndwi_map :: [[Double]]
    , nmdi_map :: [[Double]]
    } deriving (Show, Generic)

instance ToJSON NDVIMetricsResult

calculateNDVI :: Double -> Double -> Double
calculateNDVI n r = (n - r) / (n + r)

calculateGNDVI :: Double -> Double -> Double
calculateGNDVI n g = (n - g) / (n + g)

calculateNDRE :: Double -> Double -> Double
calculateNDRE n re2 = (n - re2) / (n + re2)

calculateNDWI :: Double -> Double -> Double
calculateNDWI n s16 = (n - s16) / (n + s16)

calculateNMDI :: Double -> Double -> Double -> Double
calculateNMDI n s16 s22 = (n - (s16 - s22)) / (n + (s16 - s22))

zipMatrices :: (Double -> Double -> Double) -> [[Double]] -> [[Double]] -> [[Double]]
zipMatrices f = zipWith (zipWith f)

zipMatrices3 :: (Double -> Double -> Double -> Double) -> [[Double]] -> [[Double]] -> [[Double]] -> [[Double]]
zipMatrices3 f = zipWith3 (zipWith3 f)

computeNDVIMetrics :: RawData -> NDVIMetricsResult
computeNDVIMetrics rd =
  let
    ndvi = zipMatrices calculateNDVI (nir rd) (red rd)
    gndvi = zipMatrices calculateGNDVI (nir rd) (green rd)
    ndre = zipMatrices calculateNDRE (nir rd) (rededge2 rd)
    ndwi = zipMatrices calculateNDWI (nir rd) (swir16 rd)
    nmdi = zipMatrices3 calculateNMDI (nir rd) (swir16 rd) (swir22 rd)


  in NDVIMetricsResult
    { ndvi_map = ndvi
    , gndvi_map = gndvi
    , ndre_map = ndre
    , ndwi_map = ndwi
    , nmdi_map = nmdi
    }