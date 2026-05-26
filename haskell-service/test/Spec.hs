-- haskell-service/test/Spec.hs
-- Entry point for `stack test` / `cabal test`.

import Test.Hspec

import SatelliteAnomalySpec   (spec)
import StatsSpec               (spec)
import ValidationSpec          (spec)
import WeatherMetricsSpec      (spec)
import SprayingWindowSpec      (spec)
import BiomassSpec             (spec)
import DiseaseModelsSpec       (spec)
import IrrigationAdvisorSpec   (spec)
import FarmCalculatorsSpec     (spec)

main :: IO ()
main = hspec $ do
  describe "SatelliteAnomaly"    SatelliteAnomalySpec.spec
  describe "Stats"               StatsSpec.spec
  describe "Validation"          ValidationSpec.spec
  describe "WeatherMetrics"      WeatherMetricsSpec.spec
  describe "SprayingWindow"      SprayingWindowSpec.spec
  describe "Biomass"             BiomassSpec.spec
  describe "DiseaseModels"       DiseaseModelsSpec.spec
  describe "IrrigationAdvisor"   IrrigationAdvisorSpec.spec
  describe "FarmCalculators"     FarmCalculatorsSpec.spec