# Data Specification

## Source

Data is retrieved from STAC API:
- Endpoint: https://earth-search.aws.element84.com/v1
- Collection: sentinel-2-l2a

Provider: Element84 Earth Search (Sentinel-2 L2A COG)

---

## Spatial Resolution

| Resolution | Bands |
|----------|------|
| 10m | blue, green, red, nir |
| 20m | rededge1, rededge2, rededge3, swir16, swir22, scl |
| 60m | coastal, nir09 |

---

## Available Bands

### Reflectance Bands (used in models)

| Band | Description | Resolution |
|------|------------|-----------|
| blue | B02 | 10m |
| green | B03 | 10m |
| red | B04 | 10m |
| nir | B08 | 10m |
| rededge1 | B05 | 20m |
| rededge2 | B06 | 20m |
| rededge3 | B07 | 20m |
| nir08 | B8A | 20m |
| swir16 | B11 | 20m |
| swir22 | B12 | 20m |

---

## Auxiliary Layers

| Layer | Description |
|------|------------|
| scl | Scene Classification Layer |
| aot | Aerosol Optical Thickness |
| wvp | Water Vapor |

---

## Data Format

- Format: Cloud Optimized GeoTIFF (COG)
- Access: HTTPS
- CRS: EPSG:326XX (UTM zones depending on tile)

