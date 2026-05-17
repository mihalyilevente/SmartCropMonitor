{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE OverloadedStrings #-}

module Biomass
  ( computeBiomass
  , BiomassInput(..)
  , BiomassResult(..)
  , EviRaw(..)
  ) where

import Data.Aeson
import GHC.Generics
import Data.Maybe (fromMaybe)

-- =========================
-- INPUT
-- =========================

data BiomassInput = BiomassInput
  { ndvi_vals  :: [Double]
  , gndvi_vals :: [Double]
  , ndre_vals  :: [Double]
  , ndwi_vals  :: [Double]
  , evi_raw    :: Maybe EviRaw
  } deriving (Show, Generic)

instance FromJSON BiomassInput
instance ToJSON   BiomassInput

data EviRaw = EviRaw
  { nir_band   :: [Double]
  , red_band   :: [Double]
  , blue_band  :: [Double]
  } deriving (Show, Generic)

instance FromJSON EviRaw
instance ToJSON   EviRaw

data BiomassResult = BiomassResult
  { biomass_tha      :: Double
  , biomass_min      :: Double
  , biomass_max      :: Double
  , biomass_std      :: Double
  , evi_mean         :: Double
  , msi_mean         :: Double
  , ci_mean          :: Double
  , ndvi_mean        :: Double
  , confidence       :: Double
  , pixel_count      :: Int
  } deriving (Show, Generic)

instance FromJSON BiomassResult
instance ToJSON   BiomassResult

safeMean :: [Double] -> Double
safeMean [] = 0.0
safeMean xs = sum xs / fromIntegral (length xs)

safeStd :: [Double] -> Double
safeStd [] = 0.0
safeStd xs =
  let n  = fromIntegral (length xs)
      mu = sum xs / n
      sq = sum (map (\x -> (x - mu) ^ (2 :: Int)) xs)
  in  sqrt (sq / max 1 (n - 1))

filterOutliers :: [Double] -> [Double]
filterOutliers [] = []
filterOutliers xs =
  let mu  = safeMean xs
      std = safeStd   xs
      lo  = mu - 3 * std
      hi  = mu + 3 * std
  in  filter (\x -> x >= lo && x <= hi) xs

computeEVI :: [Double] -> [Double] -> [Double] -> [Double]
computeEVI nir red blue =
  zipWith3 (\n r b ->
    let denom = n + 6 * r - 7.5 * b + 1
    in  if abs denom < 1e-9 then 0.0
        else 2.5 * (n - r) / denom
  ) nir red blue

msiFromNdwi :: [Double] -> [Double]
msiFromNdwi = map (1.0 -)

ciFromNdre :: [Double] -> [Double]
ciFromNdre = map (* 5.0)


--   Coefficients calibrated for t/ha (aboveground dry biomass, cereal crops).
--   Literature sources:
--     - Clevers & Gitelson (2013) – NDVI / red-edge biomass
--     - Gitelson et al. (2005)   – CI-based chlorophyll / biomass
--     - Running et al. (2004)    – EVI / GPP / biomass (MODIS)

biomassModel :: Double -> Double -> Double -> Double -> Double
biomassModel ndvi evi ci msi =
  let a0 =  0.50
      a1 =  3.20
      a2 =  2.10
      a3 =  0.45
      a4 =  1.80
      raw = a0 + a1 * ndvi + a2 * evi + a3 * ci - a4 * msi
  in  max 0.0 raw

computeConfidence :: Int -> Double -> Double
computeConfidence n stdVal =
  let sizeFactor = min 1.0 (fromIntegral n / 500.0)
      varPenalty = max 0.0 (1.0 - stdVal / 2.0)
  in  sizeFactor * varPenalty

computeBiomass :: BiomassInput -> BiomassResult
computeBiomass inp =
  let
      ndvi  = filterOutliers (ndvi_vals  inp)
      gndvi = filterOutliers (gndvi_vals inp)
      ndre  = filterOutliers (ndre_vals  inp)
      ndwi  = filterOutliers (ndwi_vals  inp)

      eviVals = case evi_raw inp of
                  Just er -> filterOutliers $
                               computeEVI (nir_band er) (red_band er) (blue_band er)
                  Nothing ->
                               map (\v -> 2.5 * v / (v + 1.5)) ndvi

      msiVals = msiFromNdwi ndwi
      ciVals  = ciFromNdre  ndre

      n = minimum [length ndvi, length eviVals, length ciVals, length msiVals]
      bVals = zipWith4 biomassModel
                (take n ndvi)
                (take n eviVals)
                (take n ciVals)
                (take n msiVals)

      bMean = safeMean bVals
      bStd  = safeStd  bVals
      bMin  = if null bVals then 0.0 else minimum bVals
      bMax  = if null bVals then 0.0 else maximum bVals
      conf  = computeConfidence n bStd

  in  BiomassResult
        { biomass_tha  = bMean
        , biomass_min  = bMin
        , biomass_max  = bMax
        , biomass_std  = bStd
        , evi_mean     = safeMean eviVals
        , msi_mean     = safeMean msiVals
        , ci_mean      = safeMean ciVals
        , ndvi_mean    = safeMean ndvi
        , confidence   = conf
        , pixel_count  = n
        }

zipWith4 :: (a -> b -> c -> d -> e) -> [a] -> [b] -> [c] -> [d] -> [e]
zipWith4 f (a:as) (b:bs) (c:cs) (d:ds) = f a b c d : zipWith4 f as bs cs ds
zipWith4 _ _      _      _      _      = []