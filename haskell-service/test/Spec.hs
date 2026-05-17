-- haskell-service/test/Spec.hs
-- Entry point for `stack test` / `cabal test`.
-- Imports every *Spec module and runs them under hspec.

import Test.Hspec

import SatelliteAnomalySpec (spec)
import StatsSpec             (spec)
import ValidationSpec        (spec)
import WeatherMetricsSpec    (spec)
import SprayingWindowSpec    (spec)
import BiomassSpec           (spec)

main :: IO ()
main = hspec $ do
  describe "SatelliteAnomaly" SatelliteAnomalySpec.spec
  describe "Stats"            StatsSpec.spec
  describe "Validation"       ValidationSpec.spec
  describe "WeatherMetrics"   WeatherMetricsSpec.spec
  describe "SprayingWindow"   SprayingWindowSpec.spec
  describe "Biomass"          BiomassSpec.spec