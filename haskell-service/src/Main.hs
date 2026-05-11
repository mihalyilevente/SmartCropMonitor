{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric #-}

module Main where

import Web.Scotty
import Data.Aeson hiding (json)
import Data.Aeson (Value, eitherDecode, encode)
import qualified Data.Text.Lazy as TL
import GHC.Generics
import Network.Wai.Middleware.RequestLogger (logStdoutDev)
import Network.HTTP.Types (status400)
import Data.Maybe (fromMaybe)

import Stats
import Validation
import WeatherMetrics (computeMetrics, LocationData)
import SprayingWindow (computeSprayingWindows, ForecastPoint)

-- =========================
-- WRAPPER PAYLOAD
-- =========================

data RequestWrapper = RequestWrapper
  { config :: Int
  , raw_data :: Maybe Value
  , labels :: Maybe [[Int]]
  , ndvi :: Maybe [[Double]]
  , num_features :: Maybe Int
  , scl_values :: Maybe [Int]
  , threshold :: Maybe Double
  } deriving (Show, Generic)

instance FromJSON RequestWrapper where
  parseJSON = withObject "RequestWrapper" $ \v ->
    RequestWrapper
      <$> v .:  "config"
      <*> v .:? "raw_data"
      <*> v .:? "labels"
      <*> v .:? "ndvi"
      <*> v .:? "num_features"
      <*> v .:? "scl_values"
      <*> v .:? "threshold"

instance ToJSON RequestWrapper

-- =========================
-- MAIN
-- =========================

main :: IO ()
main = scotty 8081 $ do

  middleware logStdoutDev

  post "/field-stats" $ do
    req <- jsonData :: ActionM RequestWrapper

    case config req of

      -- Sprying window
      4 -> case raw_data req of
            Just d -> do
              let forecastResult = fromJSON d :: Result (Value)
              case forecastResult of
                Success val ->
                  case fromJSON (findInObject "forecast_7d" val) of
                    Success points -> json (computeSprayingWindows points)
                    Error err -> do
                      status status400
                      text (mconcat ["Invalid Forecast format: ", TL.pack err])
                Error err -> do
                  status status400
                  text (mconcat ["Invalid raw_data JSON: ", TL.pack err])
            Nothing -> do
              status status400
              text "Missing raw_data for config=4"

      -- Agricultural metrics (Weather/Location)
      3 -> case raw_data req of
            Just d -> do
              let parsed = eitherDecode (encode d) :: Either String LocationData
              case parsed of
                Right locationData -> json (computeMetrics locationData)
                Left err -> do
                  status status400
                  text (mconcat ["Invalid weather payload: ", TL.pack err])
            Nothing -> do
              status status400
              text "Missing raw_data for config=3"

      -- NDVI metrics
      1 -> case raw_data req of
          Just d -> do
            let parsed = fromJSON d :: Result RawData
            case parsed of
              Success rd -> json (computeNDVIMetrics rd)
              Error err -> do
                status status400
                text (mconcat ["Invalid NDVI payload: ", TL.pack err])
          Nothing -> do
            status status400
            text "Missing raw_data for config=1"

      -- SCL validation
      2 -> case scl_values req of
            Just scl -> do
                let t = maybe 0.3 id (threshold req)
                json (validateSCL scl t)
            Nothing -> do
                status status400
                text "Missing scl_values"

      _ -> do
        status status400
        text "Unknown config"
