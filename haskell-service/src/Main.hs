{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric #-}

module Main where

import Web.Scotty
import Data.Aeson (FromJSON)
import Data.Maybe (catMaybes)
import GHC.Generics (Generic)
import Network.Wai.Middleware.RequestLogger (logStdoutDev)

import Stats

data InputPayload = InputPayload
  { labels :: [[Int]]
  , ndvi :: [[Double]]
  , num_features :: Int
  } deriving (Show, Generic)

instance FromJSON InputPayload

main :: IO ()
main = scotty 8081 $ do
  middleware logStdoutDev

  post "/field-stats" $ do
    body <- jsonData :: ActionM InputPayload

    let result = computeAll (labels body) (ndvi body) (num_features body)

    json result