# API Documentation

> **Base URL:** `/api/v1`
> 
> **Authentication:** Endpoints currently accept `user_id` as a query or body parameter. JWT-based auth (`Authorization: Bearer <token>`) is planned — see `/auth/login`.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Alert Suppression](#2-alert-suppression)
3. [Calculators](#3-calculators)
4. [eGN Report](#4-egn-report)
5. [Grazing Rotation](#5-grazing-rotation)

---

## 1. Authentication

**Prefix:** `/auth`  
**Tag:** `auth`

### `POST /auth/register`

Register a new user.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `username` | string | ✓ | Unique username |
| `password` | string | ✓ | Plain-text password (hashed with bcrypt) |
| `email` | string | | Email address |
| `first_name` | string | | |
| `last_name` | string | | |
| `phone` | string | | |
| `country` | string | | |
| `city` | string | | |
| `farm_name` | string | | |
| `farm_size_ha` | float | | Total farm area in hectares |

**Example request**
```json
{
  "username": "john_farmer",
  "password": "s3cur3pass",
  "email": "john@farm.com",
  "farm_name": "Green Valley Farm",
  "farm_size_ha": 120.5
}
```

**Response `200`**
```json
{
  "status": "user created",
  "user_id": 42,
  "username": "john_farmer",
  "email": "john@farm.com",
  "email_enabled": false,
  "first_name": null,
  "last_name": null,
  "phone": null,
  "country": null,
  "city": null,
  "farm_name": "Green Valley Farm",
  "farm_size_ha": 120.5
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `Username already registered` |
| `400` | `Email already registered` |

---

### `POST /auth/login`

Authenticate a user and receive an access token.

**Request body**

| Field | Type | Required |
|---|---|---|
| `username` | string | ✓ |
| `password` | string | ✓ |

**Example request**
```json
{
  "username": "john_farmer",
  "password": "s3cur3pass"
}
```

**Response `200`**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user_id": 42,
  "username": "john_farmer",
  "email": "john@farm.com",
  "email_enabled": false,
  "farm_name": "Green Valley Farm",
  "farm_size_ha": 120.5
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `Invalid username or password` |

---

### `GET /auth/user/{user_id}`

Get a user's profile.

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `user_id` | integer | User ID |

**Response `200`** — same shape as the login response (without `access_token`).

**Errors**

| Status | Detail |
|---|---|
| `404` | `User not found` |

---

### `PATCH /auth/user/{user_id}`

Update a user's profile. All fields are optional — only provided fields are updated.

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `user_id` | integer | User ID |

**Request body** — any subset of:

| Field | Type |
|---|---|
| `email` | string |
| `email_enabled` | boolean |
| `first_name` | string |
| `last_name` | string |
| `phone` | string |
| `country` | string |
| `city` | string |
| `farm_name` | string |
| `farm_size_ha` | float |

**Response `200`**
```json
{
  "status": "updated",
  "user_id": 42,
  "email": "new@email.com",
  ...
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `Email already in use` |
| `404` | `User not found` |

---

## 2. Alert Suppression

**Prefix:** `/alert-suppression`  
**Tag:** `alert-suppression`

Suppression rules allow silencing specific alert types for defined fields, crop types, or locations — optionally within a date range or seasonal window.

### Suppression Rule Object

```json
{
  "id": 1,
  "user_id": 42,
  "name": "Suppress frost alerts post-harvest",
  "description": "Ignore frost alerts after winter wheat is harvested",
  "is_active": true,
  "field_ids": [10, 11],
  "crop_types": null,
  "location_ids": null,
  "alert_types": ["FROST_ALERT"],
  "season_month_from": 10,
  "season_day_from": 1,
  "season_month_to": 12,
  "season_day_to": 31,
  "arm_after_harvest": true,
  "valid_from": null,
  "valid_until": "2026-01-01T00:00:00",
  "created_at": "2025-05-01T10:00:00",
  "updated_at": "2025-05-01T10:00:00"
}
```

**Field reference**

| Field | Type | Description |
|---|---|---|
| `name` | string (max 200) | Rule name |
| `description` | string (max 1000) | Optional description |
| `is_active` | boolean | Whether the rule is enforced |
| `field_ids` | int[] \| null | Apply only to these field IDs. Takes precedence over `crop_types`. |
| `crop_types` | string[] \| null | Apply to fields with these crop types |
| `location_ids` | int[] \| null | Restrict to these location IDs |
| `alert_types` | string[] \| null | Alert type codes to suppress. `null` = suppress all types |
| `season_month_from` | int 1–12 \| null | Start month of seasonal window |
| `season_day_from` | int 1–31 \| null | Start day (defaults to 1) |
| `season_month_to` | int 1–12 \| null | End month. Wraps across year-end if `month_from > month_to` |
| `season_day_to` | int 1–31 \| null | End day (defaults to 28) |
| `arm_after_harvest` | boolean | Only activate after a HARVESTING event is logged this year |
| `valid_from` | datetime \| null | Rule not active before this datetime |
| `valid_until` | datetime \| null | Rule expires after this datetime |

---

### `GET /alert-suppression/`

List all suppression rules for a user.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`** — array of suppression rule objects, newest first.

---

### `POST /alert-suppression/`

Create a new suppression rule.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Request body** — suppression rule fields (see field reference above). `name` is required.

**Response `201`** — created suppression rule object.

---

### `GET /alert-suppression/{rule_id}`

Get a single suppression rule.

**Path parameters**

| Parameter | Type |
|---|---|
| `rule_id` | integer |

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`** — suppression rule object.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Suppression rule not found` |

---

### `PATCH /alert-suppression/{rule_id}`

Update a suppression rule. All fields are optional.

**Response `200`** — updated suppression rule object.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Suppression rule not found` |

---

### `DELETE /alert-suppression/{rule_id}`

Delete a suppression rule.

**Response `204`** — no content.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Suppression rule not found` |

---

### `POST /alert-suppression/{rule_id}/toggle`

Toggle `is_active` on a rule (active → inactive or vice versa).

**Response `200`** — updated suppression rule object.

---

## 3. Calculators

**Prefix:** `/calculators`  
**Tag:** `Calculators`

Agronomic calculation utilities. All endpoints are `POST` and return a JSON result object. If a calculation fails, `503` is returned.

---

### `POST /calculators/irrigation-runtime`

Calculate how long an irrigation system needs to run to deliver a target amount of water.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `target_mm` | float > 0 | ✓ | | Target irrigation depth in mm |
| `area_ha` | float > 0 | ✓ | | Field area in hectares |
| `flow_lph` | float > 0 | ✓ | | System flow rate in L/h |
| `efficiency` | float 0.1–1.0 | | `0.85` | System efficiency (0–1) |

**Example request**
```json
{
  "target_mm": 25,
  "area_ha": 10,
  "flow_lph": 50000,
  "efficiency": 0.9
}
```

---

### `POST /calculators/soil-water-balance`

Step through a daily soil water balance model.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `initial_sw` | float | ✓ | | Initial soil water content in mm |
| `field_cap` | float | ✓ | | Field capacity in mm |
| `wilting_pt` | float | ✓ | | Wilting point in mm |
| `root_depth` | float | | `30.0` | Root zone depth in cm |
| `cn` | float 40–99 | | `75.0` | SCS curve number for runoff |
| `steps` | Step[] | ✓ | | Daily steps (see below) |

**Step object**

| Field | Type | Default | Description |
|---|---|---|---|
| `date` | string | | ISO date `YYYY-MM-DD` |
| `precip_mm` | float | `0.0` | Precipitation |
| `irrigation_mm` | float | `0.0` | Irrigation applied |
| `et0` | float | `0.0` | Reference evapotranspiration |
| `kc` | float | `1.0` | Crop coefficient |

---

### `POST /calculators/fertilizer-rate`

Calculate fertilizer product quantities needed to meet NPK targets.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `need` | NutrientNeed | ✓ | NPK requirement in kg/ha |
| `area_ha` | float > 0 | ✓ | Field area in ha |
| `products` | FertProduct[] | ✓ | Available fertilizer products |
| `splits` | int 1–4 | | Number of application splits |

**NutrientNeed**

| Field | Type | Default |
|---|---|---|
| `n_kg_ha` | float | `0.0` |
| `p_kg_ha` | float | `0.0` |
| `k_kg_ha` | float | `0.0` |

**FertProduct**

| Field | Type | Description |
|---|---|---|
| `name` | string | Product name |
| `n_pct` | float | Nitrogen % |
| `p_pct` | float | Phosphorus % |
| `k_pct` | float | Potassium % |
| `cost_per_kg` | float | Cost per kg |

---

### `POST /calculators/tank-mix`

Calculate total product and water volumes for a spray tank mix.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `area_ha` | float > 0 | ✓ | | Area to spray in ha |
| `water_vol_l_ha` | float > 0 | ✓ | | Water volume in L/ha |
| `products` | TankProduct[] | ✓ | | Products to mix |
| `water_ph` | float 1–14 | | `7.0` | Water pH |

**TankProduct**

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | string | | Product name |
| `rate_l_ha` | float | | Application rate L/ha |
| `type` | string | `"SC"` | Formulation type |
| `ph_min` | float | `5.0` | Minimum compatible pH |
| `ph_max` | float | `8.0` | Maximum compatible pH |

---

### `POST /calculators/spray-volume`

Calculate spray volume per hectare from nozzle and equipment parameters.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `nozzle_l_min` | float > 0 | ✓ | | Output per nozzle in L/min |
| `speed_km_h` | float > 0 | ✓ | | Travel speed in km/h |
| `boom_m` | float > 0 | ✓ | | Total boom width in m |
| `area_ha` | float > 0 | ✓ | | Area in ha |
| `nozzles` | int ≥ 1 | | `1` | Number of nozzles |

---

### `POST /calculators/soil-nutrient-balance`

Calculate the NPK soil nutrient balance (inputs minus crop offtake).

**Request body** — all fields are optional floats, defaulting to `0.0`:

| Field | Description |
|---|---|
| `n_soil`, `p_soil`, `k_soil` | Soil nutrient stock in kg/ha |
| `n_fert`, `p_fert`, `k_fert` | Fertilizer inputs in kg/ha |
| `n_crop`, `p_crop`, `k_crop` | Crop offtake in kg/ha |
| `n_atm` | Atmospheric N deposition (default `10.0`) |
| `n_fixation` | Biological N fixation |

---

### `POST /calculators/lime-requirement`

Calculate lime application rate to raise soil pH to a target.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `current_ph` | float 3–9 | ✓ | | Current soil pH |
| `target_ph` | float 3–9 | ✓ | | Target soil pH |
| `area_ha` | float > 0 | ✓ | | Area in ha |
| `soil_texture` | string | | `"loam"` | `sandy` \| `loam` \| `clay` |
| `om_pct` | float 0–20 | | `2.0` | Organic matter % |
| `lime_ecce` | float 0.1–1.0 | | `0.9` | Lime calcium carbonate equivalent (0–1) |

---

### `POST /calculators/machinery-cost`

Calculate total and per-hectare machinery operating costs.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `purchase_price` | float > 0 | ✓ | | |
| `salvage_value` | float | | `0.0` | End-of-life value |
| `life_years` | float > 0 | | `10.0` | |
| `annual_hours` | float > 0 | | `500.0` | |
| `fuel_l_h` | float > 0 | | `15.0` | Fuel consumption L/h |
| `fuel_price` | float > 0 | | `1.5` | Fuel price per litre |
| `oil_pct` | float ≥ 0 | | `0.15` | Oil cost as fraction of fuel cost |
| `repair_pct` | float ≥ 0 | | `0.03` | Annual repair cost as fraction of purchase price |
| `labour_h` | float ≥ 0 | | `15.0` | Labour cost per hour |
| `capacity_ha_h` | float > 0 | ✓ | | Field capacity in ha/h |
| `area_ha` | float > 0 | ✓ | | Total area to work in ha |

---

### `POST /calculators/seed-rate`

Calculate seeding rate and total seed quantity.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `target_plants_m2` | float > 0 | ✓ | | Target plant density |
| `tkw_g` | float > 0 | ✓ | | Thousand kernel weight in grams |
| `area_ha` | float > 0 | ✓ | | Field area in ha |
| `germination_pct` | float 1–100 | | `95.0` | Seed germination % |
| `field_emergence` | float 0.01–1.0 | | `0.85` | Field emergence rate (0–1) |
| `row_spacing_cm` | float > 0 | | `12.5` | Row spacing in cm |

---

### Reference Endpoints

Static agronomic reference data. No parameters required.

| Endpoint | Description |
|---|---|
| `GET /calculators/reference` | Full reference dataset |
| `GET /calculators/reference/crops` | Crop Kc stages, target plant density, NPK uptake, typical yield |
| `GET /calculators/reference/fertilizers` | Common fertilizer NPK compositions |
| `GET /calculators/reference/soil-textures` | Field capacity and wilting point by soil texture |
| `GET /calculators/reference/ph-ranges` | Optimal pH ranges by crop group |
| `GET /calculators/reference/spray-guidelines` | Recommended spraying conditions (temp, wind, humidity) |

**Supported crops:** `wheat_winter`, `corn`, `sunflower`, `soybeans`, `rapeseed_winter`, `sugar_beet`, `potato`

**Supported fertilizers:** `urea`, `CAN`, `DAP`, `MAP`, `MOP`, `SOP`, `NPK_15_15_15`, `NPK_20_10_10`

---

## 4. eGN Report

**Prefix:** `/egn`  
**Tag:** `eGN Report`

Generates an electronic Farm Notebook (eGN) report aggregating all field, season, fertilization, pesticide, and operation data for a given year. Includes a compliance check against eGN submission requirements.

---

### `GET /egn/report/{user_id}`

Return the full eGN report data as JSON.

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `user_id` | integer | User ID |

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `year` | integer | current year | Season year to report on |

**Response `200`**

```json
{
  "report_year": 2025,
  "generated_at": "2025-11-01T09:00:00",
  "section_3_1_farm": {
    "farm_name": "Green Valley Farm",
    "farm_size_ha": 120.5,
    "farm_reg_number": "SK-123456",
    "farm_owner_name": "John Smith",
    "farm_operator": "John Smith",
    "contact": {
      "first_name": "John",
      "last_name": "Smith",
      "email": "john@farm.com",
      "phone": "+421900000000",
      "country": "SK",
      "city": "Nitra"
    }
  },
  "section_3_2_fields": [
    {
      "id": 10,
      "label": "North Field",
      "field_type": "arable",
      "lpis_id": "SK-LPIS-001",
      "cadastral_ref": null,
      "area_ha": 25.3,
      "soil_type": "chernozem",
      "soil_texture": "loam",
      "organic_matter": 3.2,
      "previous_crop": "CORN",
      "previous_crop_year": 2024,
      "eco": {
        "has_buffer_zone": true,
        "buffer_zone_m": 5.0,
        "is_non_productive": false,
        "in_nitrate_zone": false,
        "organic_farming": false
      }
    }
  ],
  "section_3_3_7_seasons": [...],
  "section_3_4_fertilization": [...],
  "section_3_5_pesticides": [...],
  "section_3_6_operations": [...],
  "totals": {
    "fields_count": 5,
    "total_area_ha": 87.4,
    "seasons_count": 5,
    "fert_events": 12,
    "spray_events": 8,
    "operations_count": 31,
    "total_harvest_t": 450.2,
    "total_n_kg": 9800.0
  }
}
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `User not found` |

---

### `GET /egn/report/{user_id}/summary`

Return a compact summary with totals and compliance score. Faster than the full report.

**Query parameters**

| Parameter | Type | Default |
|---|---|---|
| `year` | integer | current year |

**Response `200`**

```json
{
  "year": 2025,
  "totals": {
    "fields_count": 5,
    "total_area_ha": 87.4,
    "seasons_count": 5,
    "fert_events": 12,
    "spray_events": 8,
    "operations_count": 31,
    "total_harvest_t": 450.2,
    "total_n_kg": 9800.0
  },
  "score": 78,
  "status": "WARNINGS",
  "issues": [
    "3.3 [North Field / WHEAT_WINTER] Sowing date missing"
  ],
  "warnings": [
    "3.1 Registration number not set",
    "3.2 [South Field] LPIS ID missing"
  ]
}
```

**Compliance statuses**

| Status | Meaning |
|---|---|
| `READY` | No issues or warnings |
| `WARNINGS` | No blocking issues, but optional fields are missing |
| `INCOMPLETE` | Mandatory fields missing — report cannot be submitted |

**Score** — starts at 100, minus 10 per issue and 3 per warning.

---

### `GET /egn/report/{user_id}/pdf`

Generate and download a PDF version of the eGN report.

**Query parameters**

| Parameter | Type | Default |
|---|---|---|
| `year` | integer | current year |

**Response `200`**

- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="egn_report_{farm_name}_{year}.pdf"`

The PDF contains all eGN sections (3.1–3.7) in a formatted A4 layout, including the compliance checklist. Requires `reportlab` to be installed on the server.

**Errors**

| Status | Detail |
|---|---|
| `404` | `User not found` |
| `500` | `reportlab not installed` |

---

## 5. Grazing Rotation

**Prefix:** `/rotation`  
**Tag:** `rotation`

Manages automated grazing rotation plans for pasture fields. Plans are generated from current biomass data and sorted by growth-stage readiness.

---

### Growth Stage Reference

| Stage code | EVI / Biomass thresholds | Recommended action |
|---|---|---|
| `dormant` | EVI < 0.15 or biomass < 0.3 t/ha | Rest — avoid grazing |
| `early` | EVI < 0.30 or biomass < 1.0 t/ha | Light grazing only (< 30% utilisation) |
| `active` | EVI < 0.50 or biomass < 2.5 t/ha | Begin rotation block |
| `peak` | EVI < 0.65 or biomass < 4.0 t/ha | Graze now — prime condition |
| `over` | EVI ≥ 0.65 and biomass ≥ 4.0 t/ha | Mow / top before grazing |

---

### Rotation Object

```json
{
  "id": 1,
  "location_id": 5,
  "user_id": 42,
  "name": "Spring rotation 2025",
  "description": "Main herd rotation",
  "plan_start": "2025-04-01T00:00:00",
  "plan_end": "2025-06-15T00:00:00",
  "total_aum_target": 50.0,
  "notes": null,
  "created_at": "2025-03-20T10:00:00",
  "entries": [
    {
      "id": 1,
      "rotation_id": 1,
      "field_id": 10,
      "field_label": "Paddock A",
      "sequence": 0,
      "graze_start": "2025-04-01T00:00:00",
      "graze_end": "2025-04-08T00:00:00",
      "rest_end": "2025-04-29T00:00:00",
      "planned_aum": 12.5,
      "actual_aum": null,
      "status": "PLANNED",
      "biomass_at_start": 3.84,
      "biomass_at_end": null,
      "notes": null,
      "growth_stage": {
        "stage": "Peak / Mature",
        "code": "peak",
        "color": "#2e7d32",
        "icon": "🌾"
      }
    }
  ]
}
```

---

### Entry Status Transitions

```
PLANNED → GRAZING | SKIPPED
GRAZING → RESTING | COMPLETED | SKIPPED
RESTING → COMPLETED | GRAZING | SKIPPED
COMPLETED → (terminal)
SKIPPED → PLANNED
```

---

### `POST /rotation/plan`

Auto-generate a rotation plan for all active pasture fields at a location. Fields are ordered by growth-stage readiness (peak first, dormant last). Each entry receives sequential graze and rest windows calculated from the current biomass.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `user_id` | integer | ✓ | Owner of the plan |
| `location_id` | integer | ✓ | Location with active pasture fields |
| `name` | string | ✓ | Plan name |
| `plan_start` | datetime | ✓ | Start date/time for the first grazing window |
| `total_aum_target` | float | | Target total animal units per month |
| `description` | string | | |
| `notes` | string | | |

**Example request**
```json
{
  "user_id": 42,
  "location_id": 5,
  "name": "Spring rotation 2025",
  "plan_start": "2025-04-01T00:00:00",
  "total_aum_target": 50.0
}
```

**Response `200`** — full rotation object including generated entries.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location not found` |
| `404` | `No active pasture fields at this location` |

---

### `GET /rotation/location/{location_id}`

List rotation plans for a location, newest first.

**Path parameters**

| Parameter | Type |
|---|---|
| `location_id` | integer |

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `10` | Maximum number of plans to return |

**Response `200`** — array of rotation objects. Each entry includes the current growth stage recalculated from the latest biomass reading.

---

### `PATCH /rotation/entry/{entry_id}`

Update a rotation entry. Enforces valid status transitions (see table above).

**Path parameters**

| Parameter | Type |
|---|---|
| `entry_id` | integer |

**Request body** — all fields optional:

| Field | Type | Description |
|---|---|---|
| `status` | string | New status — must follow valid transitions |
| `actual_aum` | float | Actual AUM recorded after grazing |
| `biomass_at_start` | float | Biomass snapshot at graze start (t/ha) |
| `biomass_at_end` | float | Biomass snapshot at graze end (t/ha) |
| `notes` | string | |
| `graze_start` | datetime | Override planned graze start |
| `graze_end` | datetime | Override planned graze end |
| `rest_end` | datetime | Override planned rest end |

**Response `200`**
```json
{
  "message": "Entry updated",
  "id": 1,
  "status": "GRAZING",
  "field_label": "Paddock A"
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `Cannot transition from COMPLETED to GRAZING. Allowed: none` |
| `404` | `Rotation entry not found` |

---

### `DELETE /rotation/{rotation_id}`

Delete a rotation plan and all its entries.

**Path parameters**

| Parameter | Type |
|---|---|
| `rotation_id` | integer |

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`**
```json
{
  "message": "Rotation deleted",
  "id": 1
}
```

**Errors**

| Status | Detail |
|---|---|
| `403` | `Access denied` |
| `404` | `Rotation not found` |

---

## 6. Events, Rules & Tasks

**Prefix:** `/events`  
**Tag:** `Alerts & Tasks`

Manages system-generated and manual alert events, custom trigger rules, and field tasks.

---

### Event Object

```json
{
  "id": 1,
  "user_id": 42,
  "event_type": "FROST_ALERT",
  "event_hash": "a3f9...",
  "dedup_key": "frost|loc_5|2025-11-01",
  "severity": "WARNING",
  "status": "ACTIVE",
  "created_at": "2025-11-01T06:00:00",
  "updated_at": "2025-11-01T06:00:00",
  "expires_at": null,
  "extra_metadata": {"temp_c": -3.2, "location_id": 5}
}
```

**Event statuses:** `ACTIVE` · `ACKNOWLEDGED` · `RESOLVED` · `IGNORED` · `EXPIRED`

---

### `GET /events/user/{user_id}`

List all events for a user, newest first.

**Response `200`** — array of event objects.

---

### `GET /events/user/{user_id}/active`

List only `ACTIVE` events for a user.

**Response `200`** — array of event objects.

---

### `GET /events/{event_id}`

Get a single event by ID.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Alert not found` |

---

### `POST /events/manual`

Create a manual alert. Deduplicates against active events with the same `dedup_key`.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `user_id` | integer | ✓ | | |
| `event_type` | EventType | ✓ | | Alert type enum value |
| `severity` | string | | `"INFO"` | `INFO` \| `WARNING` \| `CRITICAL` |
| `dedup_key` | string | ✓ | | Unique key for deduplication |
| `extra_metadata` | dict | | | Any additional context |

**Response `200`** — created event object. Triggers urgent email delivery if applicable.

**Errors**

| Status | Detail |
|---|---|
| `400` | `Failed to create alert` |
| `409` | `Active alert with this dedup_key already exists` |

---

### `PATCH /events/{event_id}/status`

Update the status of an event.

**Request body**

```json
{ "status": "ACKNOWLEDGED" }
```

**Response `200`**
```json
{ "message": "Alert status updated", "new_status": "ACKNOWLEDGED" }
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `Alert not found` |

---

### Rules

Custom alert rules evaluate metric snapshots (from weather or sensor data) and auto-create events when conditions are met.

---

### Rule Condition

A condition can be **simple** or **compound** (nested with AND/OR logic).

**Simple condition**
```json
{
  "metric": "temp",
  "operator": "<=",
  "value": 0,
  "location_id": 5
}
```

**Compound condition**
```json
{
  "logic": "AND",
  "conditions": [
    {"metric": "temp", "operator": "<=", "value": 2},
    {"metric": "wind_speed", "operator": ">", "value": 5}
  ]
}
```

Allowed operators: `>` `<` `>=` `<=` `==` `!=`

---

### Rule Object

```json
{
  "id": 1,
  "user_id": 42,
  "name": "Frost warning",
  "is_active": true,
  "event_type": "FROST_ALERT",
  "condition": {
    "metric": "temp",
    "operator": "<=",
    "value": 0,
    "location_id": 5
  },
  "action": {
    "notify": true,
    "severity": "WARNING"
  },
  "created_at": "2025-10-01T10:00:00",
  "updated_at": "2025-10-01T10:00:00"
}
```

---

### `GET /events/rules/user/{user_id}`

List all rules for a user, newest first.

**Response `200`** — array of rule objects.

---

### `POST /events/rules/create`

Create a new alert rule.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `user_id` | integer | ✓ | | |
| `name` | string | ✓ | | Rule name |
| `event_type` | EventType | ✓ | | Type of event to create on trigger |
| `condition` | RuleCondition | ✓ | | Simple or compound condition |
| `action` | RuleAction | ✓ | | `notify` (bool) and `severity` (string) |
| `location_id` | integer | | | Scope the rule to a specific location |
| `is_active` | boolean | | `true` | |

**Response `200`** — created rule object.

---

### `PATCH /events/rules/{rule_id}`

Update an existing rule. All fields optional. When updating `condition`, existing `location_id` and `sensor_id` scopes are preserved unless explicitly overridden.

**Response `200`** — updated rule object.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Rule not found` |

---

### `PATCH /events/rules/{rule_id}/toggle`

Toggle `is_active` on a rule.

**Response `200`**
```json
{ "id": 1, "is_active": false }
```

---

### `DELETE /events/rules/{rule_id}`

Delete a rule.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `user_id` | integer | If provided, ownership is verified |

**Response `200`**
```json
{ "message": "Rule deleted", "id": 1 }
```

**Errors**

| Status | Detail |
|---|---|
| `403` | `Not your rule` |
| `404` | `Rule not found` |

---

### Tasks

---

### Task Object

```json
{
  "id": 1,
  "user_id": 42,
  "field_id": 10,
  "event_id": 5,
  "task_type": "SOIL_SAMPLING",
  "status": "TODO",
  "priority": "HIGH",
  "task_timestamp": "2025-11-05T09:00:00",
  "created_at": "2025-11-01T10:00:00",
  "updated_at": "2025-11-01T10:00:00",
  "extra_metadata": null,
  "latitude": 48.1234,
  "longitude": 17.5678
}
```

**Task statuses:** `TODO` · `IN_PROGRESS` · `DONE` · `CANCELLED`  
**Task priorities:** `LOW` · `MEDIUM` · `HIGH` · `CRITICAL`

---

### `GET /events/tasks`

List all tasks for a user.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`** — array of task objects, ordered by `task_timestamp` descending. Geographic coordinates are decoded from PostGIS geometry.

---

### `POST /events/tasks`

Create a new task.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `user_id` | integer | ✓ | | |
| `task_type` | string | ✓ | | Free-form task type label |
| `task_timestamp` | datetime | ✓ | | When the task should be performed |
| `field_id` | integer | | | Associated field |
| `event_id` | integer | | | Associated event |
| `status` | Status_task | | `TODO` | |
| `priority` | Priority_task | | `MEDIUM` | |
| `latitude` | float | | | Task location |
| `longitude` | float | | | Task location |
| `extra_metadata` | dict | | | |

**Response `200`** — created task object.

---

### `PATCH /events/tasks/{task_id}`

Update task status or priority.

**Request body**

| Field | Type |
|---|---|
| `status` | Status_task |
| `priority` | Priority_task |

**Response `200`**
```json
{ "message": "Task updated successfully" }
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `Task not found` |

---

## 7. Sensors

**Tag:** `sensor_management` · `sensor_data`

Manages hardware sensors and their time-series data.

---

### `POST /add_sensor`

Register a new sensor for a user. Returns a one-time API key — store it securely, it will not be shown again.

**Request body** — `SensorCreate` schema:

| Field | Type | Required | Description |
|---|---|---|---|
| `user_id` | integer | ✓ | Owner |
| `label` | string | ✓ | Human-readable sensor name |
| `latitude` | float | ✓ | |
| `longitude` | float | ✓ | |
| `meteorological` | boolean | ✓ | `true` for weather sensors |

**Response `200`**
```json
{
  "status": "sensor added",
  "sensor_id": 7,
  "sensor_api_key": "Xk9mZ2..."
}
```

> ⚠ `sensor_api_key` is returned only once. Save it immediately.

**Errors**

| Status | Detail |
|---|---|
| `400` | `Error creating sensor` |

---

### `POST /sensor_data`

Submit a batch of sensor readings. The sensor is authenticated by its API key included in the payload (`SensorDataBatch` schema).

**Response `200`**
```json
{ "status": "success", "processed_items": 24 }
```

**Errors**

| Status | Detail |
|---|---|
| `401` | Invalid or missing sensor API key |
| `500` | Internal processing error |

---

### `GET /user_sensors/{user_id}`

List all sensors belonging to a user.

**Response `200`**
```json
[
  {
    "id": 7,
    "label": "Field A weather station",
    "activation_status": true,
    "meteorological": true,
    "added_at": "2025-04-01T12:00:00"
  }
]
```

---

### `GET /sensor_status/{sensor_id}`

Get status and last-contact time for a single sensor.

**Response `200`**
```json
{
  "sensor_id": 7,
  "label": "Field A weather station",
  "activation_status": true,
  "last_contact": "2025-11-01T08:00:00",
  "is_active": true
}
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `Sensor not found` |

---

### `GET /user_sensors_latest/{user_id}`

Get the most recent reading from every sensor owned by a user.

**Response `200`**
```json
[
  {
    "sensor_id": 7,
    "label": "Field A weather station",
    "last_seen": "2025-11-01T08:00:00",
    "current_values": {
      "temp": 12.4,
      "humidity": 78.2,
      "pressure": 1013.5,
      "status": "OK"
    }
  }
]
```

---

### `GET /sensor_history/{sensor_id}`

Get time-series data for a sensor, formatted for charting.

**Query parameters**

| Parameter | Type | Default | Constraints | Description |
|---|---|---|---|---|
| `days` | integer | `7` | 1–30 | How many days back to fetch |

**Response `200`**
```json
{
  "sensor_id": 7,
  "labels": ["2025-10-25T10:00:00", "2025-10-25T11:00:00"],
  "datasets": {
    "temp":     [11.2, 11.8],
    "humidity": [80.1, 79.4],
    "pressure": [1012.0, 1012.2]
  }
}
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `Sensor not found` |

---

### `PATCH /update_sensor/{sensor_id}`

Update sensor metadata or location. Only provided fields are updated.

**Request body** — `SensorUpdate` schema (any subset of label, latitude, longitude, activation\_status, meteorological).

**Response `200`**
```json
{
  "status": "updated",
  "sensor_id": 7,
  "updated_fields": ["label", "location"]
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `Error updating sensor` |
| `404` | `Sensor not found` |

---

## 8. Weather

**Tag:** `Weather` · `Spraying`

Weather history, real-time data, statistical summaries, and spraying window calculations.

---

### `GET /user/weather-history`

All stored weather history records across all locations for a user.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`** — array of `WeatherHistory` ORM objects, newest first.

---

### `GET /user/weather-current`

Fetch live weather data for a specific location from the external weather service. Also evaluates custom alert rules against the result.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `location_id` | integer | ✓ |
| `user_id` | integer | ✓ |

**Response `200`** — weather data object from the external provider.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location not found or access denied` |
| `500` | `Failed to fetch weather data` |

---

### `GET /location/{location_id}/latest-weather`

Return the most recently stored weather history record and its computed metrics for a location. Also evaluates custom alert rules.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`**
```json
{
  "history": {
    "temp": 8.4,
    "humidity": 82.0,
    "precipitation": 0.0,
    "soil_moisture_0_to_1cm": 0.34,
    "soil_temperature_0cm": 7.1,
    "wind_speed": 3.2,
    "timestamp": "2025-11-01T07:00:00Z"
  },
  "metrics": {
    "gdd_base_10": 1240.5,
    "et0": 2.1,
    "rain_cum_30d": 48.3,
    "water_deficit_7d": -12.0,
    "spi_1m": -0.45,
    "rs_mj_m2_day": 8.2
  }
}
```

Returns `{"history": null, "metrics": null}` if no data is available.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location not found` |

---

### `GET /location/{location_id}/weather-charts`

Return full time-series weather and metrics data for a location, suitable for charting. Each data point includes both weather observations and the latest computed metrics for that timestamp.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`** — array of data points:

```json
[
  {
    "timestamp": "2025-10-01T06:00:00Z",
    "weather_data": {
      "temp": 11.2,
      "humidity": 75.0,
      "precipitation": 0.0,
      "soil_moisture": 0.31,
      "soil_temperature": 10.4,
      "wind_speed": 2.8
    },
    "metrics_data": {
      "gdd": 1210.0,
      "rain_cum_30d": 42.1,
      "et0": 2.3,
      "water_deficit": -8.5,
      "spi_1m": -0.2,
      "rs_mj_m2_day": 9.4
    }
  }
]
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location not found` |

---

### `GET /location/{location_id}/weather-stats`

Return aggregate statistics (avg, min, max, std) for all weather and metrics columns over a selected time period.

**Query parameters**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `user_id` | integer | ✓ | | |
| `period` | string | | `all` | `all` \| `day` \| `night` \| `7d` \| `30d` |

**Period definitions**

| Value | Meaning |
|---|---|
| `all` | All available records |
| `day` | Last 24 hours |
| `7d` | Last 7 days |
| `30d` | Last 30 days |
| `night` | All records where `is_night = true` |

**Response `200`**
```json
{
  "record_count": 168,
  "period": "7d",
  "history": {
    "temp":     {"avg": 9.4, "min": 2.1, "max": 16.8, "std": 3.2},
    "humidity": {"avg": 79.2, "min": 55.0, "max": 96.0, "std": 8.1}
  },
  "metrics": {
    "gdd_base_10": {"avg": 1220.0, "min": 1180.0, "max": 1260.0, "std": 22.4},
    "et0":         {"avg": 2.1, "min": 0.8, "max": 3.9, "std": 0.7}
  }
}
```

**History columns:** `temp`, `humidity`, `dew_point`, `vapour_pressure_deficit`, `precipitation`, `rain`, `pressure`, `cloud_coverage`, `wind_speed`, `wind_deg`, `soil_temperature_0cm`, `soil_moisture_0_to_1cm`

**Metrics columns:** `temp_min_day_7d`, `temp_max_day_7d`, `temp_min_night_7d`, `temp_max_night_7d`, `gdd_base_10`, `rain_cum_7d`, `rain_cum_30d`, `humidity_mean_7d`, `humidity_mean_30d`, `heat_days_count_7d`, `frost_days_count_7d`, `heat_days_count_30d`, `frost_days_count_30d`, `et0`, `water_deficit_7d`, `water_deficit_30d`, `spi_1m`, `ra_mj_m2_day`, `rs_mj_m2_day`

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location not found` |

---

### `GET /{location_id}/spraying-windows`

Calculate recommended spraying windows based on the last available weather forecast for a location.

**Response `200`** — spraying window object (structure determined by `calculate_spraying_window` service). Each window indicates whether conditions meet the spraying guidelines:

| Guideline | Value |
|---|---|
| Temperature | 10–25 °C |
| Max wind speed | 4 m/s |
| Humidity | 40–95 % |
| Avoid rain within | 4 hours |

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location with id {id} not found` |
| `503` | `Spraying windows calculation failed. Check weather data availability.` |

---

## 9. Fields & Locations

**Tag:** `Fields` · `Segmentation` · `Biomass` · `Pasture` · `History` · `Data`

Manages user locations, field units (parcels), biomass analysis, and satellite data processing.

---

### `POST /locations`

Create a new user location (a point on the map representing a farm area).

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `label` | string | ✓ | Location name |
| `lat` | float | ✓ | Latitude |
| `lon` | float | ✓ | Longitude |

**Response `200`**
```json
{ "status": "location added", "id": 5 }
```

---

### `GET /user/files`

List all satellite analysis records for a user's locations.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`**
```json
[
  {
    "id": 12,
    "location_label": "North Farm",
    "date": "2025-10-15",
    "filename": "loc_5_20251015.nc",
    "fields_found": 8,
    "download_url": "/api/v1/download/loc_5_20251015.nc"
  }
]
```

---

### `GET /user_fields`

List all fields for a user as a flat array (not GeoJSON), for management panels.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `user_id` | integer | ✓ | |
| `location_id` | integer | | Filter by location |

**Response `200`**
```json
[
  {
    "id": 10,
    "location_id": 5,
    "label": "North Field",
    "field_type": "arable",
    "crop_type": "WHEAT_WINTER",
    "season_year": 2025,
    "area_ha": 25.3,
    "status": "active",
    "source": "segmentation",
    "manual_added": false,
    "created_at": "2025-04-01T10:00:00",
    "updated_at": "2025-10-15T08:00:00"
  }
]
```

---

### `PATCH /{field_id}`

Update field metadata. All fields optional.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Request body**

| Field | Type | Description |
|---|---|---|
| `label` | string | |
| `field_type` | FieldType | |
| `crop_type` | string | |
| `season_year` | integer | |
| `status` | string | `active` \| `inactive` \| `archived` |

**Response `200`**
```json
{
  "message": "Field updated successfully",
  "id": 10,
  "label": "North Field",
  "field_type": "arable",
  "crop_type": "WHEAT_WINTER",
  "season_year": 2025,
  "status": "active"
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `Invalid status value` |
| `404` | `Field not found or access denied` |

---

### `POST /manual-add-field`

Manually add a field with a GeoJSON MultiPolygon geometry. Validates shape and checks for intersections with existing fields.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `location_id` | integer | ✓ | |
| `label` | string (1–128) | ✓ | |
| `field_type` | FieldType | ✓ | |
| `geometry` | dict | ✓ | GeoJSON MultiPolygon |
| `crop_type` | string | | |
| `season_year` | integer | | |

**Response `200`**
```json
{
  "message": "Field created successfully",
  "field": {
    "id": 15,
    "label": "East Paddock",
    "field_type": "pasture",
    "area_ha": 12.4,
    "manual_added": true,
    "status": "active"
  }
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `Invalid GeoJSON` |
| `400` | `Geometry must be MULTIPOLYGON` |
| `400` | Validation error from shape checks |
| `404` | `Location not found` |
| `409` | `Field intersects with existing fields` |

---

### Segmentation

Automatic field boundary detection from satellite imagery.

---

### `POST /segment-preview/{location_id}`

Run segmentation and return a preview without saving. Use this to show the user detected fields before confirmation.

**Response `200`**
```json
{
  "status": "ok",
  "location_id": 5,
  "num_detected": 7,
  "fields": [
    {"id": 0, "area_ha": 18.2, "geometry": {...}}
  ],
  "preview_b64": "iVBORw0KGgo..."
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | Validation error |
| `500` | Segmentation error |

---

### `POST /segment-confirm/{location_id}`

Save selected fields from a segmentation preview.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `selected_ids` | int[] | ✓ | IDs of detected fields to save |
| `fields_data` | dict[] | ✓ | Field metadata array |

**Response `200`**
```json
{
  "status": "ok",
  "location_id": 5,
  "saved_count": 5,
  "field_ids": [10, 11, 12, 13, 14]
}
```

---

### `POST /segment-fields/{location_id}`

Run full segmentation and save all detected fields automatically (no preview step).

**Response `200`**
```json
{ "status": "success", "message": "Segmentation completed for location 5" }
```

---

### `POST /locations/{location_id}/generate-grid`

Generate an aligned spatial grid timeseries from raw NetCDF files for a location.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `use_sr` | boolean | `false` | Use super-resolution processing |

**Response `200`**
```json
{
  "status": "success",
  "message": "Grid timeseries generated successfully",
  "location_id": 5,
  "grid_path": "/data/grids/loc_5_grid.nc"
}
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `No files available for grid generation` |
| `500` | Internal processing error |

---

### Biomass

---

### `GET /locations/{location_id}/biomass`

Get the latest biomass reading for every active field at a location.

**Response `200`**
```json
{
  "location_id": 5,
  "location_label": "North Farm",
  "fields": [
    {
      "field_id": 10,
      "field_label": "North Field",
      "field_type": "arable",
      "area_ha": 25.3,
      "analysis_date": "2025-10-20",
      "biomass_tha": 3.84,
      "confidence": 0.91,
      "evi": 0.62,
      "msi": 0.38,
      "ci": 0.55,
      "ground_truth": null,
      "extra": null
    }
  ]
}
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location not found` |
| `404` | `No active fields for this location` |

---

### `GET /fields/{field_id}/biomass`

Get biomass history for a single field.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `20` | Max records to return |

**Response `200`**
```json
{
  "field_id": 10,
  "field_label": "North Field",
  "field_type": "arable",
  "area_ha": 25.3,
  "history": [
    {
      "id": 55,
      "analysis_date": "2025-10-20",
      "biomass_tha": 3.84,
      "confidence": 0.91,
      "evi": 0.62,
      "msi": 0.38,
      "ci": 0.55,
      "ground_truth": null,
      "extra": null
    }
  ]
}
```

**Errors**

| Status | Detail |
|---|---|
| `404` | `Field not found` |

---

### Pasture

---

### `GET /locations/{location_id}/pasture`

Get a pasture management overview for all active pasture fields at a location. Includes latest biomass, growth stage classification, dry matter availability, AUM capacity, and grazing recommendations.

**Response `200`**
```json
{
  "location_id": 5,
  "location_label": "North Farm",
  "total_pasture_ha": 48.5,
  "total_aum_capacity": 38.2,
  "field_count": 4,
  "fields": [
    {
      "field_id": 12,
      "label": "Paddock A",
      "area_ha": 12.0,
      "analysis_date": "2025-10-20",
      "biomass_tha": 3.84,
      "evi": 0.6200,
      "msi": 0.3800,
      "ci": 0.5500,
      "confidence": 0.9100,
      "dm_available_kg": 2304.0,
      "aum_capacity": 6.4,
      "growth_stage": {
        "stage": "Peak / Mature",
        "code": "peak",
        "color": "#2e7d32",
        "icon": "🌾"
      },
      "recommendation": {
        "action": "Graze now — prime condition",
        "rest_days": 21,
        "graze_days": 7,
        "note": "Peak DM availability. Maximise AUM stocking for 5–8 days.",
        "aum_capacity": 6.4,
        "area_ha": 12.0
      },
      "has_biomass_data": true
    }
  ]
}
```

**AUM formula:** `biomass_t_ha × 1000 × area_ha × 0.25 (DM ratio) × 0.50 (utilisation) ÷ (12 kg/AUM/day × 30 days)`

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location not found` |

---

### `GET /fields/{field_id}/pasture-history`

Get biomass history for a single pasture field with growth stage and AUM capacity per reading.

**Query parameters**

| Parameter | Type | Default |
|---|---|---|
| `limit` | integer | `30` |

**Response `200`**
```json
{
  "field_id": 12,
  "label": "Paddock A",
  "area_ha": 12.0,
  "history": [
    {
      "id": 55,
      "analysis_date": "2025-10-20",
      "biomass_tha": 3.84,
      "evi": 0.62,
      "msi": 0.38,
      "ci": 0.55,
      "confidence": 0.91,
      "dm_available_kg": 2304.0,
      "aum_capacity": 6.4,
      "growth_stage": {
        "stage": "Peak / Mature",
        "code": "peak",
        "color": "#2e7d32",
        "icon": "🌾"
      }
    }
  ]
}
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `Field is not of type 'pasture'` |
| `404` | `Field not found` |

---

## 10. Field Work

**Prefix:** `/fieldwork`  
**Tag:** `Field Work`

Records and queries agronomic operations — sowing, fertilization, spraying, harvesting, and other field work events. Also manages season records and analytics.

---

### `GET /fieldwork/user/{user_id}`

List all field work records for a user.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `100` | |
| `offset` | integer | `0` | |
| `work_type` | FieldWorkType | | Filter by operation type |

**Response `200`** — array of `FieldWorkRead` objects, newest first. Each record includes `field_label`, and — where applicable — `fertilization` or `pesticide` sub-records.

---

### `GET /fieldwork/field/{field_id}`

List field work records for a specific field.

**Query parameters**

| Parameter | Type | Default |
|---|---|---|
| `limit` | integer | `50` |
| `work_type` | FieldWorkType | |

---

### `GET /fieldwork/{work_id}`

Get a single field work record by ID.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Record not found` |

---

### `POST /fieldwork/create`

Create a generic agronomic operation (no typed sub-record).

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `user_id` | integer | ✓ | | |
| `field_id` | integer | ✓ | | |
| `work_type` | FieldWorkType | ✓ | | |
| `work_date` | datetime | ✓ | | |
| `work_status` | FieldWorkStatus | | `PLANNED` | |
| `season_id` | integer | | | Link to a season record |
| `operator_name` | string | | | |
| `equipment` | string | | | |
| `tillage_depth_cm` | float | | | |
| `irrigation_mm` | float | | | |
| `work_cost` | float | | | |
| `harvest_ton` | float | | | |
| `extra_metadata` | dict | | | |

---

### `POST /fieldwork/sowing`

*eGN 3.3* — Create a sowing or planting event. Creates a `FieldWork` record and upserts a `SeasonRecord` for the crop year. Automatically sets `work_type` to `PLANTING` for transplanted crops (tomato, onion, fruit trees, berries, grapes); all others use `SOWING`.

**Request body** — all `FieldWorkCreate` fields, plus:

| Field | Type | Required | Description |
|---|---|---|---|
| `season_year` | integer | ✓ | |
| `crop` | string | ✓ | Crop type identifier |
| `variety` | string | | |
| `sowing_date` | date | | Defaults to `work_date` |
| `sowing_rate_kg_ha` | float | | |
| `seed_treatment` | SeedTreatmentType | | |
| `seed_treatment_note` | string | | |
| `tillage_type` | TillageType | | |
| `notes` | string | | |

Also updates `crop_type` and `season_year` on the `FieldUnit` record.

---

### `POST /fieldwork/fertilization`

*eGN 3.4* — Record a fertilization event. Creates a `FieldWork` + `FertilizationLog`.

**Request body** — all `FieldWorkCreate` fields, plus:

| Field | Type | Description |
|---|---|---|
| `application_date` | date | Defaults to `work_date` |
| `product_name` | string | |
| `product_type` | string | |
| `is_organic` | boolean | |
| `n_kg_ha` | float | Nitrogen kg/ha |
| `p2o5_kg_ha` | float | Phosphorus kg/ha |
| `k2o_kg_ha` | float | Potassium kg/ha |
| `s_kg_ha` | float | Sulfur kg/ha |
| `mg_kg_ha` | float | Magnesium kg/ha |
| `dose_kg_ha` | float | Product dose kg/ha |
| `total_dose_kg` | float | Total product kg |
| `application_method` | FertilizationMethod | |
| `notes` | string | |

---

### `POST /fieldwork/spraying`

*eGN 3.5* — Record a pesticide / PPP application. Creates a `FieldWork` + `PesticideLog`.

**Request body** — all `FieldWorkCreate` fields, plus:

| Field | Type | Description |
|---|---|---|
| `application_date` | date | Defaults to `work_date` |
| `product_trade_name` | string | Required |
| `active_substance` | string | |
| `registration_number` | string | |
| `dose_l_ha` | float | |
| `dose_kg_ha` | float | |
| `water_volume_l_ha` | float | |
| `total_product_used` | float | |
| `target_crop` | string | |
| `target_type` | PesticideTargetType | |
| `target_organism` | string | |
| `wind_speed_ms` | float | |
| `temperature_c` | float | |
| `bbch_stage` | string | BBCH growth stage code |
| `pre_harvest_interval_days` | integer | PHI in days |
| `operator_name` | string | |
| `operator_cert` | string | Operator certificate number |
| `equipment` | string | |
| `notes` | string | |

---

### `POST /fieldwork/harvest/{season_id}`

*eGN 3.7* — Record harvest results against an existing season. Creates a `HARVESTING` `FieldWork` record if one doesn't already exist. Auto-computes `yield_t_ha` if `harvest_total_t` and `harvest_area_ha` are provided and `yield_t_ha` is not.

**Request body**

| Field | Type |
|---|---|
| `harvest_date` | date |
| `harvest_area_ha` | float |
| `harvest_total_t` | float |
| `yield_t_ha` | float |
| `moisture_pct` | float |
| `protein_pct` | float |
| `quality_extra` | dict |
| `notes` | string |
| `work_cost` | float |
| `operator_name` | string |
| `equipment` | string |

**Response `200`** — updated `SeasonRecord` object.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Season record not found` |

---

### `PATCH /fieldwork/{work_id}`

Update a field work record.

**Request body**

| Field | Type |
|---|---|
| `work_status` | FieldWorkStatus |
| `work_cost` | float |
| `harvest_ton` | float |
| `operator_name` | string |
| `equipment` | string |
| `extra_metadata` | dict |

> `extra_metadata` is merged with the existing value, not replaced.

---

### `DELETE /fieldwork/{work_id}`

Delete a field work record.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Errors**

| Status | Detail |
|---|---|
| `403` | `Not your record` |
| `404` | `Record not found` |

---

### Season Records

---

### `GET /fieldwork/seasons/field/{field_id}`

Get full crop-rotation history for a field, newest season first.

**Response `200`** — array of `SeasonRecord` objects.

---

### `GET /fieldwork/seasons/{season_id}`

Get a single season record.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Season not found` |

---

### `PATCH /fieldwork/seasons/{season_id}`

Update a season record. Auto-recomputes `yield_t_ha` if `harvest_total_t` and `harvest_area_ha` are both present.

---

### Analytics

---

### `GET /fieldwork/analytics/work-types/user/{user_id}`

Deep statistics broken down by work type: counts, completion rates, costs, harvest totals, monthly breakdown, and status distribution.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `year` | integer | Filter to a specific year |

**Response `200`**
```json
{
  "year_filter": 2025,
  "types": [
    {
      "work_type": "SPRAYING",
      "count": 18,
      "completed": 16,
      "completion_rate": 0.889,
      "cancelled": 1,
      "failed": 0,
      "total_cost": 4320.0,
      "avg_cost": 240.0,
      "min_cost": 180.0,
      "max_cost": 310.0,
      "total_harvest_ton": 0.0,
      "avg_harvest_ton": 0.0,
      "fields_involved": 5,
      "by_month": [
        {"month": "2025-04", "count": 6, "total_cost": 1440.0}
      ],
      "by_status": [
        {"status": "COMPLETED", "count": 16},
        {"status": "CANCELLED", "count": 1}
      ]
    }
  ],
  "summary": {
    "most_frequent": "SPRAYING",
    "most_expensive_avg": "HARVESTING",
    "best_completion_rate": "SOWING",
    "worst_completion_rate": "IRRIGATION",
    "total_cost": 28400.0,
    "total_harvest_ton": 450.2
  }
}
```

---

### `GET /fieldwork/analytics/locations/user/{user_id}`

Farm-level and per-location breakdown: operations count, costs, harvest, completion rate, area, and per-operation-type breakdown.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `year` | integer | Filter to a specific year |

**Response `200`**
```json
{
  "farm": {
    "farm_name": "Green Valley Farm",
    "farm_size_ha": 120.5,
    "total_ops": 62,
    "total_cost": 28400.0,
    "cost_per_ha": 235.7,
    "total_harvest_ton": 450.2,
    "harvest_per_ha": 3.74,
    "completion_rate": 0.903,
    "locations_count": 3,
    "total_area_ha": 87.4
  },
  "locations": [
    {
      "location_id": 5,
      "location_label": "North Farm",
      "total_ops": 28,
      "completed": 26,
      "completion_rate": 0.929,
      "total_cost": 13200.0,
      "avg_cost_per_op": 471.4,
      "total_harvest_ton": 210.5,
      "fields_count": 4,
      "total_area_ha": 42.0,
      "cost_per_ha": 314.3,
      "harvest_per_ha": 5.01,
      "most_common_type": "SPRAYING",
      "by_type": [...],
      "by_month": [...]
    }
  ]
}
```

---

## 11. Utils

**Tag:** `Synchronisation` · `Utils`

Administrative and maintenance endpoints. These endpoints trigger background processing jobs or maintenance tasks.

---

### `GET /users/{user_id}/locations/{location_id}/stats`

Return image analysis statistics for a location — how many satellite images are suitable for segmentation and/or NDVI analysis.

**Response `200`**
```json
{
  "location_label": "North Farm",
  "stats": {
    "suitable_for_segmentation_only": 4,
    "suitable_for_ndvi_and_segmentation": 18,
    "total_suitable_images": 22,
    "total_records_checked": 30
  }
}
```

Suitability thresholds: `is_valid >= 0.75` → NDVI + segmentation; `is_valid >= 0.50` → segmentation only.

**Errors**

| Status | Detail |
|---|---|
| `404` | `Location not found for this user` |

---

### `POST /sync/full`

Trigger a full synchronization in the background (satellite data fetch, biomass estimation, DEM, weather).

**Response `200`**
```json
{ "status": "Full synchronization started in background" }
```

---

### `POST /sync/short`

Trigger a short synchronization (weather data only) in the background.

**Response `200`**
```json
{ "status": "Short sync (weather) started in background" }
```

---

### `POST /cleanup/storage`

Clean up failed or excess dataset files from storage.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `dry_run` | boolean | `true` | If `true`, reports what would be deleted without deleting |
| `retention_limit` | integer | server config | Max number of datasets to retain per location |

**Response `200`** — cleanup report object with counts of deleted and retained files.

---

### `POST /briefing/test`

Send a test morning briefing email to a user. Requires the user to have `email` set and `email_enabled = true`.

**Query parameters**

| Parameter | Type | Required |
|---|---|---|
| `user_id` | integer | ✓ |

**Response `200`**
```json
{ "status": "sent", "to": "john@farm.com" }
```

**Errors**

| Status | Detail |
|---|---|
| `400` | `User has no email set` |
| `400` | `Email notifications are disabled for this user` |
| `404` | `User not found` |
| `500` | `Failed to send email — check server logs` |