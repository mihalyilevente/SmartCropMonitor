{-# LANGUAGE DeriveGeneric #-}

module Stats where

import GHC.Generics (Generic)
import Data.Aeson (ToJSON)
import Data.Maybe (catMaybes)

data FieldStats = FieldStats
  { field_id :: Int
  , area_px :: Int
  , mean_ndvi :: Double
  , std_ndvi :: Double
  } deriving (Show, Generic)

instance ToJSON FieldStats

mean :: [Double] -> Double
mean xs = sum xs / fromIntegral (length xs)

stddev :: [Double] -> Double
stddev xs =
  let m = mean xs
  in sqrt (mean (map (\x -> (x - m) ^ 2) xs))

extractMask :: Int -> [[Int]] -> [[Bool]]
extractMask i = map (map (== i))

applyMask :: [[Double]] -> [[Bool]] -> [Double]
applyMask ndvi mask =
  [ v | (ndviRow, maskRow) <- zip ndvi mask
      , (v, m) <- zip ndviRow maskRow
      , m ]

maybeToList :: Maybe a -> [a]
maybeToList (Just x) = [x]
maybeToList Nothing = []

computeField :: Int -> [[Int]] -> [[Double]] -> Maybe FieldStats
computeField fid labels ndvi =
  let mask = extractMask fid labels
      values = applyMask ndvi mask
      clean = filter (not . isNaN) values
  in if null clean
     then Nothing
     else Just FieldStats
          { field_id = fid
          , area_px = length clean
          , mean_ndvi = mean clean
          , std_ndvi = stddev clean
          }

computeAll :: [[Int]] -> [[Double]] -> Int -> [FieldStats]
computeAll labels ndvi n =
  catMaybes [computeField i labels ndvi | i <- [1..n]]
