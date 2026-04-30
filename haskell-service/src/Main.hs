{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric #-}

module Main where

import Web.Scotty
import Data.Aeson (FromJSON, ToJSON, (.:?), parseJSON, withObject)
import GHC.Generics (Generic)
import Network.Wai.Middleware.RequestLogger (logStdoutDev)
import Control.Applicative ((<|>))
import Network.HTTP.Types (status400)

import Stats
import Validation

data InputPayload = InputPayload
  { labels       :: Maybe [[Int]]
  , ndvi         :: Maybe [[Double]]
  , num_features :: Maybe Int
  , scl_values   :: Maybe [Int]
  , threshold    :: Maybe Double
  } deriving (Show, Generic)

instance FromJSON InputPayload where
    parseJSON = withObject "InputPayload" $ \v -> InputPayload
        <$> v .:? "labels"
        <*> v .:? "ndvi"
        <*> v .:? "num_features"
        <*> v .:? "scl_values"
        <*> v .:? "threshold"

instance ToJSON InputPayload

main :: IO ()
main = scotty 8081 $ do
  middleware logStdoutDev

  post "/field-stats" $ do
    body <- jsonData :: ActionM InputPayload

    case (labels body, ndvi body, num_features body) of
      (Just lbs, Just nd, Just nf) -> do
          let statsResult = computeAll lbs nd nf
          json statsResult

      _ -> case scl_values body of
          Just scl -> do
              let t = maybe 0.3 id (threshold body)
                  vResult = validateSCL scl t
              json vResult
          _ -> status status400 >> text "Invalid payload"