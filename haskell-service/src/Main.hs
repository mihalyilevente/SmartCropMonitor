{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric #-}

module Main where

import Web.Scotty
import Data.Aeson hiding (json)
import qualified Data.Text.Lazy as TL
import GHC.Generics
import Network.Wai.Middleware.RequestLogger (logStdoutDev)
import Network.HTTP.Types (status400)

import Stats
import Validation
import WeatherMetrics (computeMetrics, LocationData)

-- =========================
-- WRAPPER PAYLOAD
-- =========================

data RequestWrapper = RequestWrapper
  { config :: Int
  , raw_data :: Maybe RawData
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

      1 -> case raw_data req of
          Just rd -> do
            json (computeNDVIMetrics rd)
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