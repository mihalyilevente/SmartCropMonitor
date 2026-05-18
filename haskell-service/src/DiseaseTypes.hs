{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE DeriveGeneric     #-}

module DiseaseTypes where

import Data.Aeson
import GHC.Generics

-- =============================================================================
-- INPUT
-- =============================================================================

data WP = WP
  { wpT  :: Maybe Double   -- temperature °C
  , wpH  :: Maybe Double   -- relative humidity %
  , wpR  :: Maybe Double   -- rain mm/h
  , wpDt :: String         -- ISO timestamp
  } deriving (Show, Generic)

instance FromJSON WP where
  parseJSON = withObject "WP" $ \v ->
    WP <$> v .:? "t"
       <*> v .:? "h"
       <*> v .:? "r"
       <*> v .:? "dt" .!= "2000-01-01T00:00:00"

data DiseaseInput = DiseaseInput
  { history_48h  :: [WP]
  , history_7d   :: [WP]
  , history_10d  :: [WP]
  , bbch_stage   :: Maybe Int
  } deriving (Show, Generic)

instance FromJSON DiseaseInput

-- =============================================================================
-- RISK LEVELS
-- =============================================================================

data RiskLevel = NoRisk | Low | Moderate | High | VeryHigh
  deriving (Show, Eq, Ord)

instance ToJSON RiskLevel where
  toJSON NoRisk  = String "NO_RISK"
  toJSON Low     = String "LOW"
  toJSON Moderate = String "MODERATE"
  toJSON High    = String "HIGH"
  toJSON VeryHigh = String "VERY_HIGH"

-- =============================================================================
-- OUTPUT
-- =============================================================================

data DiseaseResult = DiseaseResult
  { -- Botrytis
    botrytis_hours_48h      :: Int
  , botrytis_risk_level     :: RiskLevel
  , botrytis_action         :: Bool

    -- TOMCAST
  , tomcast_dsv_7d          :: Double
  , tomcast_action          :: Bool

    -- Blitecast
  , blitecast_p_value_day   :: Int
  , blitecast_p_value_7d    :: Double
  , blitecast_dsv_7d        :: Double
  , blitecast_risk_level    :: RiskLevel
  , blitecast_action        :: Bool

    -- Plasmopara
  , plasmopara_wetness_24h  :: Int
  , plasmopara_rain_10d     :: Double
  , plasmopara_rule_ok      :: Bool
  , plasmopara_epi          :: Maybe Double
  , plasmopara_risk_level   :: RiskLevel
  , plasmopara_action       :: Bool

  , any_action_required     :: Bool
  } deriving (Show, Generic)

instance ToJSON DiseaseResult