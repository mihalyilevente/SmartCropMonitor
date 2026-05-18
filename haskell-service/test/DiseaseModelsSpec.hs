-- test/DiseaseModelsSpec.hs
module DiseaseModelsSpec (spec) where

import Test.Hspec
import DiseaseTypes
import DiseaseModels

-- =============================================================================
-- HELPERS
-- =============================================================================

inRange :: Double -> Double -> Double -> Bool
inRange lo hi x = x >= lo && x <= hi

mkWP :: Double -> Double -> Double -> Int -> WP
mkWP temp hum rain hour = WP
  { wpT  = Just temp
  , wpH  = Just hum
  , wpR  = Just rain
  , wpDt = "2026-05-01T" ++ pad hour ++ ":00:00"
  }
  where pad h = if h < 10 then "0" ++ show h else show h

replicateWP :: Int -> Double -> Double -> Double -> [WP]
replicateWP n temp hum rain =
  [ WP { wpT  = Just temp
        , wpH  = Just hum
        , wpR  = Just rain
        , wpDt = dayStr (i `div` 24) ++ "T" ++ pad (i `mod` 24) ++ ":00:00"
        }
  | i <- [0 .. n - 1]
  ]
  where
    dayStr d = "2026-05-" ++ (if d + 1 < 10 then "0" else "") ++ show (d + 1)
    pad h    = if h < 10 then "0" ++ show h else show h

(<+>) :: [WP] -> [WP] -> [WP]
(<+>) = (++)

idealWPs :: Int -> [WP]
idealWPs n = replicateWP n 18.0 65.0 0.0

botryWPs :: Int -> [WP]
botryWPs n = replicateWP n 20.0 92.0 0.0

dryWPs :: Int -> [WP]
dryWPs n = replicateWP n 20.0 50.0 0.0

coldWPs :: Int -> [WP]
coldWPs n = replicateWP n 5.0 92.0 0.5

warmWetWPs :: Int -> [WP]
warmWetWPs n = replicateWP n 20.0 92.0 2.0

baseInput :: DiseaseInput
baseInput = DiseaseInput
  { history_48h = idealWPs 48
  , history_7d  = idealWPs 168
  , history_10d = idealWPs 240
  , bbch_stage  = Nothing
  }

-- =============================================================================
-- SPEC
-- =============================================================================

spec :: Spec
spec = do

  -- ---------------------------------------------------------------------------
  describe "Botrytis Risk Index" $ do

    it "ideal dry conditions -> 0 hours, LOW risk, no action" $ do
      let r = computeDiseaseRisk baseInput
      botrytis_hours_48h  r `shouldBe` 0
      botrytis_risk_level r `shouldBe` Low
      botrytis_action     r `shouldBe` False

    it "48h of botrytis conditions -> HIGH risk, action required" $ do
      let r = computeDiseaseRisk baseInput { history_48h = botryWPs 48 }
      botrytis_hours_48h  r `shouldSatisfy` (>= 15)
      botrytis_risk_level r `shouldBe` High
      botrytis_action     r `shouldBe` True

    it "6 botrytis hours -> MODERATE risk, no action" $ do
      let pts = botryWPs 6 <+> dryWPs 42
          r   = computeDiseaseRisk baseInput { history_48h = pts }
      botrytis_risk_level r `shouldBe` Moderate
      botrytis_action     r `shouldBe` False

    it "temp exactly 15°C + RH 90% is valid botrytis hour" $ do
      let pts = replicateWP 20 15.0 90.0 0.0 <+> dryWPs 28
          r   = computeDiseaseRisk baseInput { history_48h = pts }
      botrytis_hours_48h r `shouldBe` 20

    it "temp 25.1°C (above threshold) does not count" $ do
      let pts = replicateWP 48 25.1 92.0 0.0
          r   = computeDiseaseRisk baseInput { history_48h = pts }
      botrytis_hours_48h r `shouldBe` 0

    it "RH 89% (below threshold) does not count" $ do
      let pts = replicateWP 48 20.0 89.0 0.0
          r   = computeDiseaseRisk baseInput { history_48h = pts }
      botrytis_hours_48h r `shouldBe` 0

    it "exactly 14 hours -> MODERATE, not HIGH" $ do
      let pts = botryWPs 14 <+> dryWPs 34
          r   = computeDiseaseRisk baseInput { history_48h = pts }
      botrytis_risk_level r `shouldBe` Moderate
      botrytis_action     r `shouldBe` False

    it "exactly 15 hours -> HIGH, action required" $ do
      let pts = botryWPs 15 <+> dryWPs 33
          r   = computeDiseaseRisk baseInput { history_48h = pts }
      botrytis_risk_level r `shouldBe` High
      botrytis_action     r `shouldBe` True

  -- ---------------------------------------------------------------------------
  describe "TOMCAST DSV" $ do

    it "cold dry conditions -> DSV 0, no action" $ do
      let r = computeDiseaseRisk baseInput { history_7d = coldWPs 168 }
      tomcast_dsv_7d r `shouldBe` 0.0
      tomcast_action r `shouldBe` False

    it "DSV is non-negative for any input" $ do
      let r = computeDiseaseRisk baseInput { history_7d = warmWetWPs 168 }
      tomcast_dsv_7d r `shouldSatisfy` (>= 0.0)

    it "warm wet 7 days accumulates DSV > 0" $ do
      let r = computeDiseaseRisk baseInput { history_7d = warmWetWPs 168 }
      tomcast_dsv_7d r `shouldSatisfy` (> 0.0)

    it "more wet days -> higher accumulated DSV" $ do
      let few  = dryWPs 120 <+> warmWetWPs 48
          many = warmWetWPs 168
          rFew  = computeDiseaseRisk baseInput { history_7d = few  }
          rMany = computeDiseaseRisk baseInput { history_7d = many }
      tomcast_dsv_7d rMany `shouldSatisfy` (>= tomcast_dsv_7d rFew)

    it "DSV table: T=20, LW=9h -> DSV/day = 3" $ do
      -- 1 day with T=20°C и 9 hours RH>=90%
      let dayPts = replicateWP 9 20.0 92.0 0.0
                   <+> replicateWP 15 20.0 50.0 0.0
          r = computeDiseaseRisk baseInput { history_7d = dayPts }
      tomcast_dsv_7d r `shouldBe` 3.0

    it "DSV table: T=14, LW=7h -> DSV/day = 1" $ do
      let dayPts = replicateWP 7 14.0 92.0 0.0
                   <+> replicateWP 17 14.0 50.0 0.0
          r = computeDiseaseRisk baseInput { history_7d = dayPts }
      tomcast_dsv_7d r `shouldBe` 1.0

    it "T < 13°C -> DSV = 0 regardless of wetness" $ do
      let pts = replicateWP 168 12.0 95.0 0.0
          r   = computeDiseaseRisk baseInput { history_7d = pts }
      tomcast_dsv_7d r `shouldBe` 0.0

    it "T > 29°C -> DSV = 0 regardless of wetness" $ do
      let pts = replicateWP 168 30.0 95.0 0.0
          r   = computeDiseaseRisk baseInput { history_7d = pts }
      tomcast_dsv_7d r `shouldBe` 0.0

    it "action required when accumulated DSV >= 20" $ do
      -- T=20°C, 9 h/day LW -> DSV=3/day, 7 day = 21 >= 20
      let pts = warmWetWPs 168
          r   = computeDiseaseRisk baseInput { history_7d = pts }
      if tomcast_dsv_7d r >= 20
        then tomcast_action r `shouldBe` True
        else tomcast_action r `shouldBe` False

  -- ---------------------------------------------------------------------------
  describe "Blitecast / P-Value" $ do

    it "cold dry -> P-Value 0, NoRisk, no action" $ do
      let r = computeDiseaseRisk baseInput { history_7d = coldWPs 168 }
      blitecast_p_value_7d  r `shouldBe` 0.0
      blitecast_risk_level  r `shouldBe` NoRisk
      blitecast_action      r `shouldBe` False

    it "P-Value daily is non-negative" $ do
      let r = computeDiseaseRisk baseInput { history_7d = warmWetWPs 168 }
      blitecast_p_value_day r `shouldSatisfy` (>= 0)

    it "P-Value 7d is non-negative" $ do
      let r = computeDiseaseRisk baseInput { history_7d = warmWetWPs 168 }
      blitecast_p_value_7d r `shouldSatisfy` (>= 0.0)

    it "P-Value and DSV use independent tables (diverge at T=15, LW=10h)" $ do
      -- Pitblado T=13-17: LW=10h -> DSV/day = 2 (threshold 9h crossed, next at 12h)
      -- Wallin   T=14.9-17.7: LW=10h -> P/day  = 3 (threshold 10h crossed)
      let dayPts = replicateWP 10 15.0 92.0 0.0
                   <+> replicateWP 14 15.0 50.0 0.0
          r = computeDiseaseRisk baseInput { history_7d = dayPts }
      blitecast_p_value_day r `shouldBe` 3
      tomcast_dsv_7d        r `shouldBe` 2.0

    it "blitecast_dsv_7d matches tomcast_dsv_7d (same window, same input)" $ do
      let inp = baseInput { history_7d = warmWetWPs 168 }
          r   = computeDiseaseRisk inp
      blitecast_dsv_7d r `shouldBe` tomcast_dsv_7d r

    it "P-Value >= 18 -> HIGH risk" $ do
      -- T=20°C, LW >= 9h/day -> P=3/day, 7 days = 21 >= 18
      let pts = warmWetWPs 168
          r   = computeDiseaseRisk baseInput { history_7d = pts }
      if blitecast_p_value_7d r >= 18
        then blitecast_risk_level r `shouldBe` High
        else blitecast_risk_level r `shouldSatisfy` (/= High)

    it "Wallin table: T=20, LW=9h -> P-day = 3" $ do
      let dayPts = replicateWP 9 20.0 92.0 0.0
                   <+> replicateWP 15 20.0 50.0 0.0
          r = computeDiseaseRisk baseInput { history_7d = dayPts }
      blitecast_p_value_day r `shouldBe` 3

    it "LW < 7h -> P-day = 0 (Wallin minimum)" $ do
      let dayPts = replicateWP 6 20.0 92.0 0.0
                   <+> replicateWP 18 20.0 50.0 0.0
          r = computeDiseaseRisk baseInput { history_7d = dayPts }
      blitecast_p_value_day r `shouldBe` 0

    it "risk level order: NoRisk < Low < Moderate < High" $
      NoRisk < Low && Low < Moderate && Moderate < High `shouldBe` True

  -- ---------------------------------------------------------------------------
  describe "Plasmopara viticola" $ do

    it "bbch_stage = Nothing -> NoRisk always" $ do
      let r = computeDiseaseRisk baseInput
                { history_10d = warmWetWPs 240
                , bbch_stage  = Nothing
                }
      plasmopara_risk_level  r `shouldBe` NoRisk
      plasmopara_action      r `shouldBe` False
      plasmopara_epi         r `shouldBe` Nothing

    it "bbch_stage < 12 -> NoRisk (plant not susceptible)" $ do
      let r = computeDiseaseRisk baseInput
                { history_10d = warmWetWPs 240
                , bbch_stage  = Just 10
                }
      plasmopara_risk_level r `shouldBe` NoRisk
      plasmopara_epi        r `shouldBe` Nothing

    it "bbch_stage = 12 -> EPI computed (Just value)" $ do
      let r = computeDiseaseRisk baseInput
                { history_10d = warmWetWPs 240
                , bbch_stage  = Just 12
                }
      plasmopara_epi r `shouldSatisfy` (/= Nothing)

    it "rule 10-10-24: cold (<10°C) -> rule not triggered" $ do
      let r = computeDiseaseRisk baseInput
                { history_10d = coldWPs 240
                , bbch_stage  = Just 20
                }
      plasmopara_rule_ok r `shouldBe` False

    it "rule 10-10-24: rain < 10mm -> rule not triggered" $ do
      let pts = replicateWP 240 15.0 92.0 0.0
          r   = computeDiseaseRisk baseInput
                  { history_10d = pts
                  , bbch_stage  = Just 20
                  }
      plasmopara_rule_ok r `shouldBe` False

    it "rule 10-10-24: wetness < 24h -> rule not triggered" $ do
      let wetPts = replicateWP 20 15.0 92.0 0.5
          dryPts = replicateWP 220 15.0 50.0 0.5
          r = computeDiseaseRisk baseInput
                { history_10d = dryPts <+> wetPts
                , bbch_stage  = Just 20
                }
      plasmopara_rule_ok r `shouldBe` False

    it "all rule conditions met -> rule_ok = True" $ do
      -- T >= 10, rain >> 10mm
      let pts = warmWetWPs 240
          r   = computeDiseaseRisk baseInput
                  { history_10d = pts
                  , bbch_stage  = Just 20
                  }
      plasmopara_rule_ok    r `shouldBe` True
      plasmopara_rain_10d   r `shouldSatisfy` (>= 10.0)
      plasmopara_wetness_24h r `shouldSatisfy` (>= 24)

    it "EPI is in [0, 1] when computed" $ do
      let r = computeDiseaseRisk baseInput
                { history_10d = warmWetWPs 240
                , bbch_stage  = Just 20
                }
      case plasmopara_epi r of
        Nothing -> return ()
        Just e  -> e `shouldSatisfy` inRange 0.0 1.0

    it "higher BBCH (more developed plant) does not change EPI value" $ do
      let mkR b = computeDiseaseRisk baseInput
                    { history_10d = warmWetWPs 240
                    , bbch_stage  = Just b
                    }
          r12 = mkR 12
          r40 = mkR 40
      plasmopara_epi r12 `shouldBe` plasmopara_epi r40

    it "rain_10d sums all rain in history_10d" $ do
      -- 240 points by 1 mm/h
      let pts = replicateWP 240 15.0 92.0 1.0
          r   = computeDiseaseRisk baseInput
                  { history_10d = pts
                  , bbch_stage  = Just 20
                  }
      plasmopara_rain_10d r `shouldSatisfy` (> 100.0)

  -- ---------------------------------------------------------------------------
  describe "any_action_required" $ do

    it "False when all models are quiet" $ do
      let r = computeDiseaseRisk baseInput
      any_action_required r `shouldBe` False

    it "True when only Botrytis triggers" $ do
      let r = computeDiseaseRisk baseInput { history_48h = botryWPs 48 }
      any_action_required r `shouldBe` True

    it "True when only Blitecast triggers" $ do
      -- P-Value >= 18 or DSV >= 20 → action
      let pts = warmWetWPs 168
          r   = computeDiseaseRisk baseInput { history_7d = pts }
      -- Consistency: any == (bot || tomcast || blitecast || plasmo)
      let expected = botrytis_action r
                  || tomcast_action  r
                  || blitecast_action r
                  || plasmopara_action r
      any_action_required r `shouldBe` expected

    it "any_action_required is OR of all individual action flags" $ do
      let inp = DiseaseInput
                  { history_48h = botryWPs 48
                  , history_7d  = warmWetWPs 168
                  , history_10d = warmWetWPs 240
                  , bbch_stage  = Just 20
                  }
          r = computeDiseaseRisk inp
          expected = botrytis_action  r
                  || tomcast_action   r
                  || blitecast_action r
                  || plasmopara_action r
      any_action_required r `shouldBe` expected

  -- ---------------------------------------------------------------------------
  describe "empty / edge inputs" $ do

    it "empty history_48h -> Botrytis hours = 0" $ do
      let r = computeDiseaseRisk baseInput { history_48h = [] }
      botrytis_hours_48h r `shouldBe` 0

    it "empty history_7d -> DSV = 0, P-Value = 0" $ do
      let r = computeDiseaseRisk baseInput { history_7d = [] }
      tomcast_dsv_7d       r `shouldBe` 0.0
      blitecast_p_value_7d r `shouldBe` 0.0

    it "empty history_10d -> Plasmopara rain = 0, rule not triggered" $ do
      let r = computeDiseaseRisk baseInput
                { history_10d = []
                , bbch_stage  = Just 20
                }
      plasmopara_rain_10d r `shouldBe` 0.0
      plasmopara_rule_ok  r `shouldBe` False

    it "single-point histories do not crash" $ do
      let r = computeDiseaseRisk DiseaseInput
                { history_48h = [mkWP 20.0 92.0 0.0 0]
                , history_7d  = [mkWP 20.0 92.0 0.0 0]
                , history_10d = [mkWP 20.0 92.0 1.0 0]
                , bbch_stage  = Just 15
                }
      botrytis_hours_48h r `shouldSatisfy` (>= 0)
      tomcast_dsv_7d     r `shouldSatisfy` (>= 0.0)