{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric     #-}

module Main where

import Web.Scotty
import Data.Aeson hiding (json)
import Data.Aeson (Value(..), eitherDecode, encode, Result(..), fromJSON)
import qualified Data.Aeson.KeyMap as KM
import qualified Data.Aeson.Key    as K
import qualified Data.Text.Lazy    as TL
import GHC.Generics
import Network.Wai.Middleware.RequestLogger (logStdoutDev)
import Network.HTTP.Types (status400)
import Data.Maybe (fromMaybe)

import Stats
import Validation
import WeatherMetrics     (computeMetrics,          LocationData)
import SprayingWindow     (computeSprayingWindows,  ForecastPoint)
import SatelliteAnomaly   (computeSnapshotAnomaly,  SnapshotInput)
import Biomass            (computeBiomass,           BiomassInput)
import DiseaseModels      (computeDiseaseRisk)
import DiseaseTypes       (DiseaseInput)
import IrrigationAdvisor  (computeIrrigation,       IrrigationInput)
import FarmCalculators

data RequestWrapper = RequestWrapper
  { config       :: Int
  , raw_data     :: Maybe Value
  , labels       :: Maybe [[Int]]
  , ndvi         :: Maybe [[Double]]
  , num_features :: Maybe Int
  , scl_values   :: Maybe [Int]
  , threshold    :: Maybe Double
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
-- HELPERS
-- =========================

parseRaw :: FromJSON a => Value -> ActionM (Either String a)
parseRaw v = return $ eitherDecode (encode v)

badReq :: String -> ActionM ()
badReq msg = status status400 >> text (TL.pack msg)

withData :: FromJSON a => Maybe Value -> String -> (a -> ActionM ()) -> ActionM ()
withData Nothing  ctx _  = badReq ("Missing raw_data for " ++ ctx)
withData (Just v) ctx fn =
  case eitherDecode (encode v) of
    Right x  -> fn x
    Left err -> badReq ("Invalid payload for " ++ ctx ++ ": " ++ err)

-- =========================
-- MAIN
-- =========================

main :: IO ()
main = scotty 8081 $ do

  middleware logStdoutDev

  post "/field-stats" $ do
    req <- jsonData :: ActionM RequestWrapper

    case config req of

      -- ── Existing configs ─────────────────────────────────────────────────────

      -- Spraying window
      4 -> case raw_data req of
            Just d -> do
              let forecastResult = fromJSON d :: Result (Value)
              case forecastResult of
                Success val ->
                  case fromJSON (findInObject "forecast_7d" val) of
                    Success points -> json (computeSprayingWindows points)
                    Error err -> badReq ("Invalid Forecast format: " ++ err)
                Error err -> badReq ("Invalid raw_data JSON: " ++ err)
            Nothing -> badReq "Missing raw_data for config=4"

      -- Agricultural metrics (Weather/Location)
      3 -> case raw_data req of
            Just d -> do
              let parsed = eitherDecode (encode d) :: Either String LocationData
              case parsed of
                Right locationData -> json (computeMetrics locationData)
                Left err -> badReq ("Invalid weather payload: " ++ err)
            Nothing -> badReq "Missing raw_data for config=3"

      -- NDVI metrics
      1 -> case raw_data req of
            Just d -> do
              let parsed = fromJSON d :: Result RawData
              case parsed of
                Success rd -> json (computeNDVIMetrics rd)
                Error err -> badReq ("Invalid NDVI payload: " ++ err)
            Nothing -> badReq "Missing raw_data for config=1"

      -- SCL validation
      2 -> case scl_values req of
            Just scl -> do
                let t = fromMaybe 0.3 (threshold req)
                json (validateSCL scl t)
            Nothing -> badReq "Missing scl_values"

      -- Satellite snapshot anomaly
      5 -> case raw_data req of
            Just d -> do
              let parsed = fromJSON d :: Result SnapshotInput
              case parsed of
                Success inp -> json (computeSnapshotAnomaly inp)
                Error err -> badReq ("Invalid snapshot payload: " ++ err)
            Nothing -> badReq "Missing raw_data for config=5"

      -- Biomass
      6 -> case raw_data req of
            Just d -> case fromJSON d :: Result BiomassInput of
              Success inp -> json (computeBiomass inp)
              Error err   -> badReq err
            Nothing -> badReq "Missing raw_data for config=6"

      -- Disease model
      7 -> case raw_data req of
            Just d -> do
              let parsed = eitherDecode (encode d) :: Either String DiseaseInput
              case parsed of
                Right diseaseInput -> json (computeDiseaseRisk diseaseInput)
                Left err -> badReq ("Invalid disease payload: " ++ err)
            Nothing -> badReq "Missing raw_data for config=7"

      -- Irrigation decision-support
      8 -> case raw_data req of
            Just d -> do
              let parsed = eitherDecode (encode d) :: Either String IrrigationInput
              case parsed of
                Right irrigInput -> json (computeIrrigation irrigInput)
                Left err -> badReq ("Invalid irrigation payload: " ++ err)
            Nothing -> badReq "Missing raw_data for config=8"

      --Farm Calculators

      -- config=9: Irrigation Runtime Calculator
      9  -> withData (raw_data req) "config=9 (IrrigationRuntime)" $ \inp ->
              json (calcIrrigationRuntime (inp :: IrrigationRuntimeInput))

      -- config=10: Soil Water Balance
      10 -> withData (raw_data req) "config=10 (SoilWaterBalance)" $ \inp ->
              json (calcSoilWaterBalance (inp :: SoilWaterBalanceInput))

      -- config=11: Fertilizer Rate
      11 -> withData (raw_data req) "config=11 (FertilizerRate)" $ \inp ->
              json (calcFertilizerRate (inp :: FertilizerRateInput))

      -- config=12: Tank Mix
      12 -> withData (raw_data req) "config=12 (TankMix)" $ \inp ->
              json (calcTankMix (inp :: TankMixInput))

      -- config=13: Spray Volume
      13 -> withData (raw_data req) "config=13 (SprayVolume)" $ \inp ->
              json (calcSprayVolume (inp :: SprayVolumeInput))

      -- config=14: Soil Nutrient Balance
      14 -> withData (raw_data req) "config=14 (SoilNutrientBalance)" $ \inp ->
              json (calcSoilNutrientBalance (inp :: SoilNutrientInput))

      -- config=15: Lime Requirement
      15 -> withData (raw_data req) "config=15 (LimeRequirement)" $ \inp ->
              json (calcLimeRequirement (inp :: LimeInput))

      -- config=16: Machinery Cost
      16 -> withData (raw_data req) "config=16 (MachineryCost)" $ \inp ->
              json (calcMachineryCost (inp :: MachineryCostInput))

      -- config=17: Seed Rate
      17 -> withData (raw_data req) "config=17 (SeedRate)" $ \inp ->
              json (calcSeedRate (inp :: SeedRateInput))

      _ -> badReq "Unknown config"

findInObject :: TL.Text -> Value -> Value
findInObject key (Object o) =
    let k = K.fromText (TL.toStrict key)
    in fromMaybe Null (KM.lookup k o)
findInObject _ _ = Null