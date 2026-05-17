module BiomassSpec (spec) where

import Test.Hspec
import Biomass

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

approx :: Double -> Double -> Double -> Bool
approx tol expected actual = abs (actual - expected) <= tol

infix 4 ~==
(~==) :: Double -> Double -> Bool
(~==) = approx 1e-6

uniformInput :: Int -> Double -> Double -> Double -> Double -> BiomassInput
uniformInput n ndvi gndvi ndre ndwi =
  BiomassInput
    { ndvi_vals  = replicate n ndvi
    , gndvi_vals = replicate n gndvi
    , ndre_vals  = replicate n ndre
    , ndwi_vals  = replicate n ndwi
    , evi_raw    = Nothing
    }

uniformInputWithEvi :: Int -> Double -> Double -> Double -> Double
                    -> Double -> Double -> Double
                    -> BiomassInput
uniformInputWithEvi n ndvi gndvi ndre ndwi nir red blue =
  BiomassInput
    { ndvi_vals  = replicate n ndvi
    , gndvi_vals = replicate n gndvi
    , ndre_vals  = replicate n ndre
    , ndwi_vals  = replicate n ndwi
    , evi_raw    = Just EviRaw
        { nir_band  = replicate n nir
        , red_band  = replicate n red
        , blue_band = replicate n blue
        }
    }

-- ---------------------------------------------------------------------------
-- Reference calculations (mirrors Biomass.hs formulas)
-- ---------------------------------------------------------------------------

refEviApprox :: Double -> Double
refEviApprox v = 2.5 * v / (v + 1.5)

refEvi :: Double -> Double -> Double -> Double
refEvi nir red blue =
  let denom = nir + 6 * red - 7.5 * blue + 1
  in if abs denom < 1e-9 then 0.0 else 2.5 * (nir - red) / denom

refMsi :: Double -> Double
refMsi ndwi = 1.0 - ndwi

refCi :: Double -> Double
refCi ndre = ndre * 5.0

refBiomass :: Double -> Double -> Double -> Double -> Double
refBiomass ndvi evi ci msi =
  max 0.0 (0.50 + 3.20 * ndvi + 2.10 * evi + 0.45 * ci - 1.80 * msi)

-- ---------------------------------------------------------------------------
-- Spec
-- ---------------------------------------------------------------------------

spec :: Spec
spec = do

  -- -------------------------------------------------------------------------
  describe "safeMean / safeStd (via uniform inputs)" $ do

    it "returns 0 biomass_std for a uniform field (no variance)" $ do
      let r = computeBiomass (uniformInput 100 0.6 0.5 0.4 0.3)
      biomass_std r `shouldSatisfy` (~== 0.0)

    it "pixel_count equals the input length for clean data" $ do
      let r = computeBiomass (uniformInput 50 0.5 0.4 0.3 0.2)
      pixel_count r `shouldBe` 50

  -- -------------------------------------------------------------------------
  describe "biomassModel" $ do

    it "matches the reference formula for a typical cereal-crop pixel" $ do
      let ndvi = 0.65; evi = refEviApprox ndvi
          ci   = refCi 0.42; msi = refMsi 0.25
          expected = refBiomass ndvi evi ci msi
          r = computeBiomass (uniformInput 200 ndvi 0.55 0.42 0.25)
      biomass_tha r `shouldSatisfy` approx 0.01 expected

    it "never returns negative biomass" $ do
      -- very stressed, low-vegetation pixel
      let r = computeBiomass (uniformInput 100 0.05 0.05 0.05 0.95)
      biomass_tha r `shouldSatisfy` (>= 0.0)

    it "increases with higher NDVI (all else equal)" $ do
      let low  = computeBiomass (uniformInput 100 0.20 0.18 0.15 0.20)
          high = computeBiomass (uniformInput 100 0.80 0.75 0.60 0.20)
      biomass_tha high `shouldSatisfy` (> biomass_tha low)

    it "decreases with higher moisture stress (higher NDWI -> lower biomass)" $ do
      let wetField = computeBiomass (uniformInput 100 0.60 0.55 0.45 0.80)
          dryField = computeBiomass (uniformInput 100 0.60 0.55 0.45 0.10)
      biomass_tha dryField `shouldSatisfy` (< biomass_tha wetField)

  -- -------------------------------------------------------------------------
  describe "EVI calculation" $ do

    it "uses NDVI-based approximation when evi_raw is Nothing" $ do
      let ndvi = 0.60
          r    = computeBiomass (uniformInput 100 ndvi 0.50 0.40 0.30)
          eviExpected = refEviApprox ndvi
      evi_mean r `shouldSatisfy` approx 0.01 eviExpected

    it "uses raw bands when evi_raw is provided" $ do
      let nir = 0.80; red = 0.10; blue = 0.05
          r   = computeBiomass (uniformInputWithEvi 100 0.60 0.50 0.40 0.30 nir red blue)
          eviExpected = refEvi nir red blue
      evi_mean r `shouldSatisfy` approx 0.01 eviExpected

    it "raw-EVI and approximation produce different evi_mean values" $ do
      let ndvi = 0.60
          approxR = computeBiomass (uniformInput           100 ndvi 0.50 0.40 0.30)
          rawR    = computeBiomass (uniformInputWithEvi    100 ndvi 0.50 0.40 0.30 0.85 0.12 0.04)
      evi_mean approxR `shouldNotBe` evi_mean rawR

  -- -------------------------------------------------------------------------
  describe "msiFromNdwi / ciFromNdre" $ do

    it "msi_mean = 1 - ndwi_mean for uniform input" $ do
      let ndwi = 0.35
          r    = computeBiomass (uniformInput 80 0.55 0.48 0.38 ndwi)
      msi_mean r `shouldSatisfy` approx 1e-6 (refMsi ndwi)

    it "ci_mean = ndre * 5 for uniform input" $ do
      let ndre = 0.42
          r    = computeBiomass (uniformInput 80 0.55 0.48 ndre 0.30)
      ci_mean r `shouldSatisfy` approx 1e-6 (refCi ndre)

  -- -------------------------------------------------------------------------
  describe "filterOutliers" $ do

    it "removes extreme outlier and reduces pixel_count" $ do
      -- 99 normal pixels + 1 extreme outlier
      let normal  = replicate 99 0.60
          inp = BiomassInput
                  { ndvi_vals  = normal ++ [999.0]
                  , gndvi_vals = replicate 100 0.55
                  , ndre_vals  = replicate 100 0.42
                  , ndwi_vals  = replicate 100 0.30
                  , evi_raw    = Nothing
                  }
          r = computeBiomass inp
      pixel_count r `shouldBe` 99

    it "keeps all pixels when there are no outliers" $ do
      let r = computeBiomass (uniformInput 200 0.55 0.48 0.38 0.25)
      pixel_count r `shouldBe` 200

  -- -------------------------------------------------------------------------
  describe "computeConfidence" $ do

    it "returns 0 for an empty input (no pixels)" $ do
      let r = computeBiomass
                BiomassInput
                  { ndvi_vals  = []
                  , gndvi_vals = []
                  , ndre_vals  = []
                  , ndwi_vals  = []
                  , evi_raw    = Nothing
                  }
      confidence r `shouldBe` 0.0

    it "confidence is higher for a larger uniform field" $ do
      let small = computeBiomass (uniformInput 10  0.60 0.52 0.42 0.30)
          large = computeBiomass (uniformInput 500 0.60 0.52 0.42 0.30)
      confidence large `shouldSatisfy` (> confidence small)

    it "confidence is in [0, 1]" $ do
      let r = computeBiomass (uniformInput 300 0.65 0.55 0.45 0.25)
      confidence r `shouldSatisfy` (\c -> c >= 0.0 && c <= 1.0)

  -- -------------------------------------------------------------------------
  describe "output fields consistency" $ do

    it "biomass_min <= biomass_tha <= biomass_max" $ do
      let inp = BiomassInput
                  { ndvi_vals  = [0.3, 0.5, 0.6, 0.7, 0.8]
                  , gndvi_vals = [0.28, 0.45, 0.55, 0.65, 0.75]
                  , ndre_vals  = [0.20, 0.35, 0.42, 0.50, 0.60]
                  , ndwi_vals  = [0.40, 0.35, 0.30, 0.25, 0.20]
                  , evi_raw    = Nothing
                  }
          r = computeBiomass inp
      biomass_min r `shouldSatisfy` (<= biomass_tha r)
      biomass_tha r `shouldSatisfy` (<= biomass_max r)

    it "ndvi_mean is within the supplied NDVI range" $ do
      let vals = [0.40, 0.50, 0.60, 0.70, 0.80]
          inp  = BiomassInput
                   { ndvi_vals  = vals
                   , gndvi_vals = vals
                   , ndre_vals  = vals
                   , ndwi_vals  = vals
                   , evi_raw    = Nothing
                   }
          r = computeBiomass inp
      ndvi_mean r `shouldSatisfy` (\v -> v >= 0.40 && v <= 0.80)