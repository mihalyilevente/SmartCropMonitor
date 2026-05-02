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
  , dataField :: Maybe Value
  , labels :: Maybe [[Int]]
  , ndvi :: Maybe [[Double]]
  , num_features :: Maybe Int
  , scl_values :: Maybe [Int]
  , threshold :: Maybe Double
  } deriving (Show, Generic)

instance FromJSON RequestWrapper where
  parseJSON = withObject "RequestWrapper" $ \v ->
    RequestWrapper
      <$> v .: "config"
      <*> v .:? "dataField"
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

      -- =========================
      -- AGRICULTURAL METRICS (YOUR CASE)
      -- =========================
      3 -> case dataField req of
            Just d -> do
              let parsed = eitherDecode (encode d) :: Either String LocationData

              case parsed of
                Right locationData -> do
                  let result = computeMetrics locationData
                  json result

                Left err -> do
                  status status400
                  text (mconcat ["Invalid weather payload: ", TL.pack err])

            Nothing -> do
              status status400
              text "Missing data field for config=3"

      -- =========================
      -- IMAGE STATS
      -- =========================
      1 -> case (labels req, ndvi req, num_features req) of
            (Just lbs, Just nd, Just nf) -> do
                let statsResult = computeAll lbs nd nf
                json statsResult

            _ -> do
                status status400
                text "Invalid image stats payload"

      -- =========================
      -- SCL VALIDATION
      -- =========================
      2 -> case scl_values req of
            Just scl -> do
                let t = maybe 0.3 id (threshold req)
                    vResult = validateSCL scl t
                json vResult

            Nothing -> do
                status status400
                text "Missing scl_values"

      -- =========================
      -- UNKNOWN CONFIG
      -- =========================
      _ -> do
        status status400
        text "Unknown config"