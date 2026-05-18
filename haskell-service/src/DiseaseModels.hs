{-# LANGUAGE OverloadedStrings #-}

module DiseaseModels
  ( computeDiseaseRisk
  ) where

import Data.Maybe  (fromMaybe, mapMaybe)
import Data.List   (nub, sortBy, sum)
import Data.Ord    (comparing)
import Prelude hiding (sum)

import DiseaseTypes

-- =============================================================================
-- Helpers
-- =============================================================================

safeDiv :: Double -> Double -> Double
safeDiv _ 0 = 0
safeDiv a b = a / b

clamp :: Double -> Double -> Double -> Double
clamp lo hi x = max lo (min hi x)

-- Data parser = "YYYY-MM-DD"
dateKey :: WP -> String
dateKey = take 10 . wpDt

groupByDay :: [WP] -> [[WP]]
groupByDay pts =
  let keys   = nub (map dateKey pts)
      sorted = sortBy (comparing dateKey) pts
  in  map (\k -> filter ((== k) . dateKey) sorted) keys

-- =============================================================================
-- BOTRYTIS RISK INDEX
-- Source: Jarvis 1977; порог 15 h / 48 h - EPPO
-- =============================================================================

botrytisHourOk :: WP -> Bool
botrytisHourOk wp =
  let temp = fromMaybe 0 (wpT wp)
      hum  = fromMaybe 0 (wpH wp)
  in  hum >= 90 && temp >= 15 && temp <= 25

botrytisRisk :: [WP] -> (Int, RiskLevel, Bool)
botrytisRisk pts =
  let hours = length (filter botrytisHourOk pts)
      level
        | hours >= 15 = High
        | hours >= 6  = Moderate
        | otherwise   = Low
      action = hours >= 15
  in  (hours, level, action)

-- =============================================================================
-- TOMCAST — Disease Severity Values (DSV)
-- Source: Pitblado 1992, таблица из оригинальной публикации
-- =============================================================================

dsvTable :: Double -> Int -> Int
dsvTable tmean lwHours
  | tmean < 13   = 0
  | tmean > 29   = 0
  | tmean <= 17  = lookupDSV lwHours [(7,1),(9,2),(12,3),(15,4)]
  | tmean <= 20  = lookupDSV lwHours [(5,1),(7,2),(9,3),(12,4)]
  | tmean <= 25  = lookupDSV lwHours [(3,1),(5,2),(7,3),(9,4)]
  | otherwise    = lookupDSV lwHours [(5,1),(7,2),(9,3),(12,4)]
  where
    lookupDSV h table =
      let eligible = filter (\(minH,_) -> h >= minH) table
      in  case eligible of
            [] -> 0
            _  -> snd (last eligible)

leafWetnessHours :: [WP] -> Int
leafWetnessHours = length . filter (\wp -> fromMaybe 0 (wpH wp) >= 90)

meanTempDuringLW :: [WP] -> Double
meanTempDuringLW pts =
  let wetPts = filter (\wp -> fromMaybe 0 (wpH wp) >= 90) pts
      temps  = mapMaybe wpT wetPts
  in  case temps of
        [] -> 0
        ts -> sum ts / fromIntegral (length ts)

-- DSV
dailyDSV :: [WP] -> Int
dailyDSV dayPts =
  let lw  = leafWetnessHours dayPts
      tm  = meanTempDuringLW dayPts
  in  dsvTable tm lw

-- Cum DSV
accumulatedDSV :: [WP] -> Double
accumulatedDSV pts =
  fromIntegral . sum . map dailyDSV $ groupByDay pts

tomcastRisk :: [WP] -> (Double, Bool)
tomcastRisk pts =
  let dsv    = accumulatedDSV pts
      action = dsv >= 20
  in  (dsv, action)

-- =============================================================================
-- BLITECAST / P-VALUE
-- Source: Wallin 1962; with TOMCAST — Fry et al. 1983
-- =============================================================================

wallinPValue :: Double -> Int -> Int
wallinPValue tmean lwH
  | tmean < 7.2  || tmean > 26.7 = 0
  | lwH   < 7                     = 0
  | tmean <= 11.6 = lookupP lwH [(7,1),(12,2),(18,3),(24,4)]
  | tmean <= 14.9 = lookupP lwH [(7,1),(9,2),(12,3),(18,4)]
  | tmean <= 17.7 = lookupP lwH [(7,1),(8,2),(10,3),(14,4)]
  | tmean <= 20.5 = lookupP lwH [(7,1),(8,2),(9,3),(12,4)]
  | tmean <= 23.8 = lookupP lwH [(7,1),(8,2),(10,3),(14,4)]
  | otherwise    = lookupP lwH [(7,1),(9,2),(12,3),(18,4)]
  where
    lookupP h table =
      let eligible = filter (\(minH,_) -> h >= minH) table
      in  case eligible of
            [] -> 0
            _  -> snd (last eligible)

dailyPValue :: [WP] -> Int
dailyPValue dayPts =
  let lw = leafWetnessHours dayPts
      tm = meanTempDuringLW dayPts
  in  wallinPValue tm lw

blitecastRisk :: [WP] -> (Int, Double, Double, RiskLevel, Bool)
blitecastRisk pts =
  let days    = groupByDay pts
      pDay    = case days of
                  [] -> 0
                  _  -> dailyPValue (last days)
      p7d     = fromIntegral . sum . map dailyPValue $ days
      dsv7d   = accumulatedDSV pts
      level
        | p7d >= 18 || dsv7d >= 20 = High
        | p7d >= 10                 = Moderate
        | p7d >= 1                  = Low
        | otherwise                 = NoRisk
      action  = level == High
  in  (pDay, p7d, dsv7d, level, action)

-- =============================================================================
-- PLASMOPARA VITICOLA — 10-10-24 + EPI
-- Source: Gessler et al. 2011 (EPI); 10-10-24 — EPPO PP 2/13
-- =============================================================================

tempOkForPlasmo :: [WP] -> Bool
tempOkForPlasmo pts = case pts of
  [] -> False
  _  -> fromMaybe 0 (wpT (last pts)) >= 10

rain10d :: [WP] -> Double
rain10d = sum . map (fromMaybe 0 . wpR)

wetness24h :: [WP] -> Int
wetness24h pts =
  let last24 = if length pts >= 24 then drop (length pts - 24) pts else pts
  in  leafWetnessHours last24

computeEPI :: [WP] -> Double
computeEPI pts =
  let temps   = mapMaybe wpT pts
      tmean   = if null temps then 0
                else sum temps / fromIntegral (length temps)
      rain    = rain10d pts
      wetH    = fromIntegral (wetness24h pts) :: Double

      fTemp   = clamp 0 1 ((tmean - 10) / 20)
      fRain   = clamp 0 1 (rain / 30)
      fWet    = clamp 0 1 (wetH / 48)

  in  fTemp * fRain * fWet

plasmoparaRisk :: [WP] -> Maybe Int -> (Int, Double, Bool, Maybe Double, RiskLevel, Bool)
plasmoparaRisk pts bbch =
  let wet24   = wetness24h pts
      r10d    = rain10d pts
      tOk     = tempOkForPlasmo pts
      bbchOk  = case bbch of
                  Nothing -> False
                  Just b  -> b >= 12

      ruleOk  = tOk && r10d >= 10 && wet24 >= 24 && bbchOk

      epi     = if bbchOk then Just (computeEPI pts) else Nothing

      level   = case epi of
                  Nothing -> NoRisk
                  Just e
                    | e >= 0.6  -> High
                    | e >= 0.3  -> Moderate
                    | ruleOk    -> Low
                    | otherwise -> NoRisk

      action  = ruleOk && level >= Moderate

  in  (wet24, r10d, ruleOk, epi, level, action)

computeDiseaseRisk :: DiseaseInput -> DiseaseResult
computeDiseaseRisk inp =
  let h48  = history_48h inp
      h7d  = history_7d  inp
      h10d = history_10d inp
      bbch = bbch_stage  inp

      (botHours, botLevel, botAction) = botrytisRisk h48

      -- TOMCAST
      (tDSV, tAction) = tomcastRisk h7d

      -- Blitecast
      (bPDay, bP7d, bDSV, bLevel, bAction) = blitecastRisk h7d

      -- Plasmopara (10  + bbch)
      (pWet, pRain, pRule, pEPI, pLevel, pAction) = plasmoparaRisk h10d bbch

      anyAction = botAction || tAction || bAction || pAction

  in  DiseaseResult
        { botrytis_hours_48h     = botHours
        , botrytis_risk_level    = botLevel
        , botrytis_action        = botAction

        , tomcast_dsv_7d         = tDSV
        , tomcast_action         = tAction

        , blitecast_p_value_day  = bPDay
        , blitecast_p_value_7d   = bP7d
        , blitecast_dsv_7d       = bDSV
        , blitecast_risk_level   = bLevel
        , blitecast_action       = bAction

        , plasmopara_wetness_24h = pWet
        , plasmopara_rain_10d    = pRain
        , plasmopara_rule_ok     = pRule
        , plasmopara_epi         = pEPI
        , plasmopara_risk_level  = pLevel
        , plasmopara_action      = pAction

        , any_action_required    = anyAction
        }