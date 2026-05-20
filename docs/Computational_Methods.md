# Computational Methods

## Overview

This document describes the computational layer of the system: a collection of deterministic mathematical models used for environmental analysis, agronomic decision support, and risk estimation. The methods presented here are not machine learning models, but a combination of:

- physically grounded equations (e.g. FAO-56 Penman–Monteith),
    
- empirical agronomic indices,
    
- remote sensing-derived transformations,
    
- rule-based risk models calibrated from literature,
    
- statistical aggregation functions.
    

The goal of this layer is to transform raw meteorological and geospatial time series into interpretable, decision-ready variables such as:

- evapotranspiration (ET₀),
    
- water deficit indicators,
    
- disease risk scores,
    
- biomass estimates,
    
- irrigation requirements,
    
- spraying suitability windows.
    

All computations are deterministic, reproducible, and parameterized by crop type, field properties, and environmental context.

---

## Design Principles

### 1. Physical interpretability

Where possible, models are derived from established physical or agronomic theory (e.g. radiation balance, vapor pressure dynamics, crop coefficients).

### 2. Empirical calibration

When theoretical formulation is insufficient, coefficients are taken from peer-reviewed agronomic literature or domain standards (EPPO, FAO, Gitelson, Jarvis, etc.).

### 3. Modular composition

Each subsystem operates independently:

- Weather metrics → derived physical variables
    
- Remote sensing → vegetation indices
    
- Risk models → rule-based aggregation of signals
    
- Decision models → weighted scoring functions
    

### 4. Robustness to missing data

All computations explicitly handle missing or partial inputs using safe aggregation functions and fallback heuristics.

### 5. Temporal aggregation

Hourly observations are consistently aggregated into:

- daily summaries (primary unit for agronomic models),
    
- multi-day windows (7d, 10d, 30d) for stress and disease dynamics.
    

---

## System Components

The computational layer is structured into four major domains:

### 1. Weather Physics Core

Implements FAO-56 Penman–Monteith and supporting radiation models:

- saturation vapor pressure
    
- net radiation (Rn)
    
- extraterrestrial radiation (Ra)
    
- solar radiation (Rs)
    
- evapotranspiration (ET₀)
    
- vapor pressure deficit (VPD)
    

### 2. Vegetation & Remote Sensing Metrics

Transforms spectral bands into agronomic indicators:

- NDVI, NDWI, NDRE, GNDVI
    
- EVI (Enhanced Vegetation Index)
    
- chlorophyll proxies (CI)
    
- moisture stress indices (MSI)
    

### 3. Crop Water Balance Model

Estimates water availability and demand:

- ET₀ accumulation
    
- precipitation aggregation
    
- water deficit (ET₀ − precipitation)
    
- soil moisture interpretation
    
- SPI drought approximation
    

### 4. Risk & Decision Models

Rule-based scoring systems for:

- fungal disease risk (Botrytis, Plasmopara, Blight models)
    
- irrigation scheduling
    
- spraying window optimization
    

Each model produces:

- a risk score,
    
- categorical urgency level,
    
- binary action recommendation.
    

---

## Output Philosophy

All model outputs are designed to be:

- **interpretable** (each value maps to a physical or agronomic meaning),
    
- **traceable** (inputs and intermediate signals preserved),
    
- **actionable** (converted into irrigation, spraying, or alert decisions),
    
- **composable** (can be combined across modules without re-training).
    

---

## Reference Frameworks

The system is grounded in the following domains:

- FAO-56 Irrigation and evapotranspiration methodology
    
- EPPO plant protection thresholds
    
- Jarvis (1977) humidity–temperature disease models
    
- Wallin (1962) Blight index
    
- Pitblado (1992) TOMCAST DSV system
    
- Gitelson et al. vegetation index research
    
- Clevers & Gitelson biomass estimation frameworks
    
- McKee et al. SPI drought index formulation
    

## 2. Input Variables

Let:

- $NDVI = {x_i^{NDVI}}_{i=1}^{n}$
    
- $GNDVI = {x_i^{GNDVI}}_{i=1}^{n}$
    
- $NDRE = {x_i^{NDRE}}_{i=1}^{n}$
    
- $NDWI = {x_i^{NDWI}}_{i=1}^{n}$
    

If raw spectral bands are available:

- $NIR = {n_i}$
    
- $RED = {r_i}$
    
- $BLUE = {b_i}$
    

---

## 3. Robust Statistics

### Mean

$$
\mu_X = \frac{1}{n} \sum_{i=1}^{n} x_i  
$$

### Standard Deviation (sample)

$$
\sigma_X = \sqrt{\frac{1}{n-1} \sum_{i=1}^{n} (x_i - \mu_X)^2}  
$$

---

## 4. Outlier Filtering

A 3-sigma rule is applied:

$$
x_i \in [\mu_X - 3\sigma_X,\ \mu_X + 3\sigma_X]  
$$

Only values satisfying the condition are retained.

---

## 5. Vegetation Indices

### 5.1 EVI (Enhanced Vegetation Index)

For each pixel:

$$
EVI = 2.5 \cdot \frac{NIR - RED}{NIR + 6 \cdot RED - 7.5 \cdot BLUE + 1}  
$$

If denominator is near zero, value is set to 0.

---

### 5.2 Simplified EVI (fallback)

If spectral bands are unavailable:

$$
EVI \approx 2.5 \cdot \frac{NDVI}{NDVI + 1.5}  
$$

---

### 5.3 MSI (Moisture Stress Index approximation)

$$
MSI = 1 - NDWI  
$$

---

### 5.4 CI (Chlorophyll Index approximation)

$$
CI = 5 \cdot NDRE  
$$

---

## 6. Biomass Model

Above-ground biomass (t/ha) is computed as a linear empirical regression:

$$
B = a_0 + a_1 NDVI + a_2 EVI + a_3 CI - a_4 MSI  
$$

Where coefficients are calibrated from literature:

- $a_0 = 0.50$
    
- $a_1 = 3.20$
    
- $a_2 = 2.10$
    
- $a_3 = 0.45$
    
- $a_4 = 1.80$
    

Final constraint:

$$
B = \max(0, B)  
$$

---

## 7. Aggregation Across Pixels

Given pixel-level biomass $B_i$:

### Mean biomass

$$
\bar{B} = \frac{1}{n} \sum_{i=1}^{n} B_i  
$$

### Min / Max

$$
B_{min} = \min(B_i), \quad B_{max} = \max(B_i)  
$$

### Standard deviation

$$
\sigma_B = \sqrt{\frac{1}{n-1} \sum (B_i - \bar{B})^2}  
$$

---

## 8. Confidence Model

Confidence depends on sample size and variance:

$$
C = S(n) \cdot V(\sigma_B)  
$$

Where:

### Sample size factor

$$
S(n) = \min\left(1, \frac{n}{500}\right)  
$$

### Variance penalty

$$
V(\sigma_B) = \max\left(0, 1 - \frac{\sigma_B}{2}\right)  
$$

Final:

$$
C = S(n) \cdot V(\sigma_B)  
$$

---

## 9. Pixel Alignment Constraint

Because input arrays may differ in length:

$$
n = \min(|NDVI|, |EVI|, |CI|, |MSI|)  
$$

Only first $n$ aligned elements are used for computation.

---

## 10. Output Variables

The system outputs:

- $B_{mean}$ — mean biomass (t/ha)
    
- $B_{min}, B_{max}$
    
- $\sigma_B$
    
- $EVI_{mean}$
    
- $MSI_{mean}$
    
- $CI_{mean}$
    
- $NDVI_{mean}$
    
- $C$ — confidence score
    
- $n$ — pixel count
    

---

## 11. Notes on Calibration

Coefficients are empirically derived from:

- Clevers & Gitelson (2013)
    
- Gitelson et al. (2005)
    
- Running et al. (2004, MODIS EVI/GPP framework)
    

Model is:

- linear
    
- physically constrained (non-negative biomass)
    
- robustified via outlier removal
    
- variance-sensitive via confidence weighting
    
# 12. Disease Risk Modeling Framework

## 12.1 Overview

This module implements a rule-based and epidemiological disease risk engine based on:

- Leaf wetness duration
    
- Temperature constraints
    
- Rain accumulation
    
- Phenological stage (BBCH)
    
- Classical plant pathology models:
    
    - Botrytis cinerea (Jarvis, 1977)
        
    - TOMCAST (Pitblado, 1992)
        
    - Blitecast (Wallin, 1962; Fry et al., 1983)
        
    - Plasmopara viticola risk (EPPO / Gessler et al., 2011)
        

The system is deterministic and threshold-driven, with optional probabilistic modulation via EPI.

---

## 12.2 Preprocessing

### 12.2.1 Temporal grouping

Observations are grouped by day:

$$
D_k = {WP_i : date(WP_i) = k}  
$$

where:

- $WP$ — weather point observation
    
- $k$ — calendar day
    

---

## 12.3 Shared Environmental Conditions

### Leaf Wetness Indicator

$$
LW(WP_i) =  
\begin{cases}  
1, & H_i \geq 90 \  
0, & \text{otherwise}  
\end{cases}  
$$

where $H_i$ is relative humidity.

---

### Mean temperature during wetness

$$
T_{LW} =  
\frac{1}{|W|} \sum_{i \in W} T_i  
$$

where $W = {i : H_i \geq 90}$

---

## 12.4 Botrytis Risk Model (Jarvis, 1977)

### Hourly infection condition

$$
I_{bot}(t) =  
\begin{cases}  
1, & 90% \leq RH \land 15^\circ C \leq T \leq 25^\circ C \  
0, & \text{otherwise}  
\end{cases}  
$$

---

### Accumulated infection hours

$$
H_{bot} = \sum I_{bot}(t)  
$$

---

### Risk classification

$$
Risk =  
\begin{cases}  
High, & H_{bot} \geq 15 \  
Moderate, & H_{bot} \geq 6 \  
Low, & \text{otherwise}  
\end{cases}  
$$

Action trigger:

$$
Action = (H_{bot} \geq 15)  
$$

---

## 12.5 TOMCAST Model (Pitblado, 1992)

### Disease Severity Value (DSV)

$$
DSV = f(T_{mean}, LW_{hours})  
$$

Piecewise lookup function:

- $T < 13^\circ C \Rightarrow DSV = 0$
    
- $T > 29^\circ C \Rightarrow DSV = 0$
    

Otherwise:

$$
DSV = \text{lookup}(T_{mean}, LW_{hours})  
$$

---

### Leaf wetness hours

$$
LW = \sum LW(t)  
$$

---

### Accumulated disease pressure

$$
DSV_{7d} = \sum_{k=1}^{7} DSV_k  
$$

---

### Action threshold

$$
Action = (DSV_{7d} \geq 20)  
$$

---

## 12.6 Blitecast Model (Wallin, 1962; Fry et al., 1983)

### P-value function

$$
P = f(T_{mean}, LW_{hours})  
$$

Piecewise lookup based on temperature regime:

$$
P \in {0,1,2,3,4}  
$$

---

### Aggregation

Daily:

$$
P_{day}  
$$

Weekly:

$$
P_{7d} = \sum P_{day}  
$$

---

### Combined disease pressure

$$
RiskScore = {P_{7d}, DSV_{7d}}  
$$

---

### Risk classification

$$
Risk =  
\begin{cases}  
High, & P_{7d} \geq 18 \lor DSV_{7d} \geq 20 \  
Moderate, & P_{7d} \geq 10 \  
Low, & P_{7d} \geq 1 \  
NoRisk, & \text{otherwise}  
\end{cases}  
$$

---

## 12.7 Plasmopara viticola (Downy Mildew)

### Preconditions

$$
T \geq 10^\circ C  
$$

$$
Rain_{10d} \geq 10mm  
$$

$$
LW_{24h} \geq 24h  
$$

$$
BBCH \geq 12  
$$

---

### Rain accumulation

$$
R_{10d} = \sum_{i=1}^{10} rain_i  
$$

---

### Wetness accumulation

$$
LW_{24h} = \sum_{t=-24h}^{0} LW(t)  
$$

---

## 12.8 EPI Model (Environmental Potential Index)

### Normalized components

Temperature factor:

$$
f_T = \text{clamp}\left(0,1,\frac{T_{mean}-10}{20}\right)  
$$

Rain factor:

$$
f_R = \text{clamp}\left(0,1,\frac{R}{30}\right)  
$$

Wetness factor:

$$
f_W = \text{clamp}\left(0,1,\frac{LW}{48}\right)  
$$

---

### EPI

$$
EPI = f_T \cdot f_R \cdot f_W  
$$

---

### Risk classification

$$
Risk =  
\begin{cases}  
High, & EPI \geq 0.6 \  
Moderate, & EPI \geq 0.3 \  
Low, & rule_ok \  
NoRisk, & \text{otherwise}  
\end{cases}  
$$

---

## 12.9 Decision Logic (Plasmopara)

$$
RuleOk = T_{ok} \land R_{10d} \geq 10 \land LW_{24h} \geq 24 \land BBCH \geq 12  
$$

$$
Action = RuleOk \land (Risk \geq Moderate)  
$$

---

## 12.10 System-Level Aggregation

### Individual disease engines

- Botrytis: $R_B$
    
- TOMCAST: $R_T$
    
- Blitecast: $R_{BL}$
    
- Plasmopara: $R_P$
    

---

### Global action trigger

$$
Action_{global} = R_B \lor R_T \lor R_{BL} \lor R_P  
$$

---

## 12.11 Notes

- System is **rule-based epidemiological modeling engine**
    
- No probabilistic inference beyond empirical thresholds
    
- Models are aligned with EPPO / classical phytopathology literature
    
- Designed for operational agricultural decision support rather than statistical learning
    

# 13. Irrigation Decision Model

## 13.1 Overview

This module implements a rule-based irrigation advisory system combining:

- Crop water demand (FAO-56 Kc approach)
    
- Water balance (ET₀, rainfall, deficit)
    
- Remote sensing indicators (NDVI, NDWI)
    
- Soil moisture constraints
    
- Climatic drought indices (SPI, VPD)
    
- Field-type operational constraints
    

The system outputs:

- irrigation urgency class
    
- recommended dose (mm, m³/ha)
    
- total field-level water demand (m³)
    

---

## 13.2 Core Variables

Let:

- $ET_0$ — reference evapotranspiration (mm/day)
    
- $K_c$ — crop coefficient
    
- $P$ — precipitation
    
- $WD_{7d}$ — 7-day water deficit
    
- $SM$ — volumetric soil moisture
    
- $NDVI, NDWI$ — vegetation stress indices
    
- $SPI$ — standardized precipitation index
    
- $VPD$ — vapor pressure deficit
    

---

## 13.3 Crop Water Demand Model (FAO-56)

### Crop evapotranspiration

$$
ET_c = ET_0 \cdot K_c  
$$

### Weekly demand

$$
ET_{c,7d} = 7 \cdot ET_0 \cdot K_c  
$$

---

## 13.4 Water Balance Model

### Effective rainfall

$$
P_{eff} = 0.75 \cdot P_{7d}  
$$

### Net water deficit

$$
WD_{7d} = ET_{c,7d} - P_{eff}  
$$

Only positive deficits are considered irrigation demand drivers.

---

## 13.5 Crop-Specific Parameters

Each crop is defined by:

- $K_c$ — canopy transpiration factor
    
- $p$ — depletion fraction (RAW threshold)
    
- $D_{max}$ — maximum irrigation dose (mm)
    
- $SM_{crit}, SM_{high}$ — soil moisture thresholds
    

---

## 13.6 Field-Type Modifiers

Field operational constraints modify irrigation response:

$$
Dose_{adj} =  
\begin{cases}  
0, & \text{water bodies / protected zones} \  
0.6-0.8 \cdot Dose, & \text{pasture / nursery systems} \  
Dose, & \text{standard agricultural fields}  
\end{cases}  
$$

---

## 13.7 Signal-Based Scoring System

The system constructs a linear additive risk score:

$$
S = \sum_i s_i  
$$

where each $s_i$ is an agronomic signal.

---

### 13.7.1 Soil moisture stress

$$
s_{SM} =  
\begin{cases}  
4.0, & SM < SM_{crit} \  
2.0, & SM < SM_{high} \  
-1.0, & SM > 0.35  
\end{cases}  
$$

---

### 13.7.2 Water deficit stress

$$
s_{WD} =  
\begin{cases}  
3.0, & WD_{7d} > 20 \  
1.5, & WD_{7d} > 10 \  
0.5, & WD_{7d} > 5 \  
-2.0, & WD_{7d} < -10  
\end{cases}  
$$

---

### 13.7.3 Evapotranspiration demand

$$
ET_c = ET_0 \cdot K_c  
$$

$$
s_{ET} =  
\begin{cases}  
2.0, & ET_c > 5 \  
1.0, & ET_c > 3  
\end{cases}  
$$

---

### 13.7.4 Precipitation signal

$$
s_P =  
\begin{cases}  
2.0, & P_{7d} < 5 \  
1.0, & P_{7d} < 15 \  
-2.0, & P_{7d} > 40  
\end{cases}  
$$

---

### 13.7.5 Drought index (SPI)

$$
s_{SPI} =  
\begin{cases}  
2.0, & SPI < -1.5 \  
1.0, & SPI < -1.0 \  
-1.0, & SPI > 1.0  
\end{cases}  
$$

---

### 13.7.6 Atmospheric demand (VPD)

$$
s_{VPD} =  
\begin{cases}  
1.0, & VPD > 2.0  
\end{cases}  
$$

---

### 13.7.7 Remote sensing vegetation stress

NDWI-based stress:

$$
s_{NDWI} =  
\begin{cases}  
2.0, & NDWI < -0.2 \  
1.0, & NDWI < -0.1 \  
-1.0, & NDWI > 0.1  
\end{cases}  
$$

NDVI-based canopy condition:

$$
s_{NDVI} =  
\begin{cases}  
1.0, & NDVI < 0.25 \  
-0.5, & NDVI > 0.65  
\end{cases}  
$$

---

## 13.8 Total Irrigation Score

$$
S_{total} = \sum s_i  
$$

---

## 13.9 Urgency Classification

$$
Urgency(S) =  
\begin{cases}  
CRITICAL, & S \geq 9 \  
HIGH, & S \geq 6 \  
MODERATE, & S \geq 3 \  
LOW, & S \geq 1 \  
NONE, & S < 1  
\end{cases}  
$$

---

## 13.10 Irrigation Decision Rule

$$
Irrigate =  
\begin{cases}  
1, & Urgency \in {CRITICAL, HIGH, MODERATE} \  
0, & otherwise  
\end{cases}  
$$

---

## 13.11 Dose Calculation Model

### Primary formulation (water deficit driven)

$$
Dose = WD_{7d} \cdot p  
$$

with:

- $p$ — depletion fraction (crop-dependent)
    

CRITICAL adjustment:

$$
Dose_{CRITICAL} = 1.3 \cdot WD_{7d} \cdot p  
$$

---

### FAO fallback formulation

$$
Dose = ET_c \cdot 7 - 0.75 \cdot P_{7d}  
$$

---

### Constraints

$$
Dose = \min(Dose, D_{max})  
$$

$$
Dose = \max(Dose, 0)  
$$

---

## 13.12 Unit Conversion

### Volume per hectare

$$
1 \text{ mm} = 10 \text{ m}^3/\text{ha}  
$$

$$
Dose_{m^3/ha} = 10 \cdot Dose_{mm}  
$$

---

### Field-level volume

$$
V = Dose_{m^3/ha} \cdot Area_{ha}  
$$

---

## 13.13 System Output Structure

For each field:

- Urgency class $U$
    
- Score $S$
    
- Irrigation decision $I$
    
- Dose (mm)
    
- Dose (m³/ha)
    
- Total volume (m³)
    

Plus traceability signals:

- ET₀
    
- water deficit
    
- rainfall
    
- soil moisture
    
- NDWI
    
- SPI
    

---

## 13.14 Global Aggregation

### Field ranking

Fields are sorted by:

$$
Rank = f(Urgency)  
$$

---

### System-wide water demand

$$
V_{total} = \sum V_i  
$$

---

### Operational summary

- number of fields requiring irrigation
    
- critical/high/moderate counts
    
- total water requirement
    

---

## 13.15 Model Nature

This system is:

- deterministic scoring engine
    
- FAO-56 inspired water balance model
    
- hybrid of physical + heuristic thresholds
    
- not probabilistic, but signal-weighted
    
- designed for operational irrigation planning
    
# 14. Spraying Window Optimization Model

## 14.1 Overview

This module defines a **temporal optimization model** for pesticide spraying operations based on forecasted meteorological conditions.

The system identifies contiguous time intervals (“windows”) where conditions are:

- meteorologically valid for spraying
    
- low drift risk
    
- low precipitation interference
    
- optimal vapor pressure deficit (VPD)
    
- acceptable temperature and wind constraints
    

The model produces **time windows with aggregated suitability scores**.

---

## 14.2 Input Representation

Each forecast point is defined as:

$$
F_i = (t_i, W_i, p_i)  
$$

where:

- $t_i$ — timestamp
    
- $W_i$ — weather state vector
    
- $p_i$ — probability/confidence of forecast
    

Weather vector:

$$
W = (T, WS, RH, R, ET_0, VPD)  
$$

---

## 14.3 Hard Feasibility Constraints

A forecast point is valid if:

$$
R \leq 0.05  
$$

$$
WS < 3.5  
$$

$$
5^\circ C < T < 28^\circ C  
$$

Define feasibility indicator:

$$
\mathbb{I}(F_i) =  
\begin{cases}  
1, & \text{constraints satisfied} \  
0, & \text{otherwise}  
\end{cases}  
$$

---

## 14.4 Rain Lag Effect Model

To model delayed soil/leaf wetness effects, a decayed rainfall accumulation is used:

$$
RL_i = \sum_{j=1}^{k} R_{i-j} \cdot \lambda^j  
$$

where:

- $\lambda = 0.6$ (decay factor)
    
- lookback horizon $k = 3$
    

This introduces **memory of recent precipitation events**.

---

## 14.5 Vapor Pressure Deficit Suitability Function

Optimal VPD is centered around:

$$
VPD^* = 1.0  
$$

Suitability function:

$$s_{VPD}(x)=\exp\left(-1.5\cdot|x-1|^2\right)$$

This models nonlinear physiological sensitivity of spray deposition and evaporation losses.

---

## 14.6 Point-Level Scoring Model

Each forecast point is assigned a composite score:

$$
S_i = \mathbb{I}(F_i) \cdot P_i \cdot R_i \cdot B_i  
$$

where:

### 14.6.1 Base score decomposition

Wind suitability:

$$
S_{wind} = \max\left(0, 1 - \frac{WS}{3.5}\right)  
$$

Temperature suitability:

$$
S_{temp} =  
\begin{cases}  
1, & T \leq 20 \  
\frac{28 - T}{8}, & T > 20  
\end{cases}  
$$

Humidity suitability:

$$
S_{hum} = 1 - \frac{|RH - 70|}{100}  
$$

VPD suitability:

$$
S_{vpd} = s_{VPD}(VPD)  
$$

---

### 14.6.2 Base aggregation

$$
S_{base} =  
0.3 S_{wind}

- 0.2 S_{vpd}
    
- 0.2 S_{temp}
    
- 0.3 S_{hum}  
    ]
    

---

### 14.6.3 Rain penalty (memory effect)

$$
P_{rain} = e^{-2 \cdot RL_i}  
$$

---

### 14.6.4 Final score

$$
S_i =  
S_{base} \cdot P_{rain} \cdot p_i \cdot \mathbb{I}(F_i)  
$$

---

## 14.7 Temporal Smoothing

To reduce high-frequency volatility in forecast scoring:

$$S^{EMA}_t = \alpha S_t + (1-\alpha) S^{EMA}_{t-1}$$

where:

- $\alpha = 0.4$
    

This produces **smoothed operational readiness curve**.

---

## 14.8 Window Construction Model

### 14.8.1 Thresholding

A point is “spraying-eligible” if:

$$
S_i \geq 0.7  
$$

---

### 14.8.2 Temporal grouping

Forecast points are partitioned into contiguous segments:

$$
G_k = {F_i : \mathbb{I}(S_i \geq 0.7)}  
$$

with adjacency constraint in time ordering.

---

### 14.8.3 Window definition

Each valid group defines a spraying window:

$$
W_k = (t_{start}, t_{end}, \bar{S})  
$$

where:

$$
\bar{S} = \frac{1}{|G_k|} \sum_{i \in G_k} S_i  
$$

---

## 14.9 Window Validity Constraint

A window is accepted only if:

$$
|G_k| \geq 2  
$$

This enforces **temporal stability of conditions** (avoids single-point spikes).

---

## 14.10 Output Representation

Each window contains:

- start time $t_{start}$
    
- end time $t_{end}$
    
- mean suitability score $\bar{S}$
    

---

## 14.11 System Interpretation

This module implements:

- **forecast-driven scheduling optimization**
    
- drift-aware pesticide application timing model
    
- nonlinear atmospheric suitability scoring
    
- short-term precipitation memory effects
    
- EMA-based temporal stabilization
    

---

## 14.12 Integration Role in Full System

Within the global agro-computational stack:

- Biomass → production state estimation
    
- Disease → epidemiological risk
    
- Irrigation → water balance control
    
- Spraying windows → **operation scheduling layer**
    

This is the **temporal execution optimizer** of the system.

### 15. Unified Decision Layer

- irrigation + spraying + disease coupling
    
- conflict resolution (spray vs irrigation vs disease risk)
    
- resource scheduling
    

### 16. Spatio-temporal aggregation

- field clustering
    
- regional optimization
    
- neighbor effects
    

### 17. Uncertainty propagation

- forecast uncertainty → action confidence
    
- sensor error modeling
    

# 15. Meteorological Physics & Agrometeorological Metrics

## 15.1 Overview

This module implements a physically grounded meteorological computation layer based on:

- FAO-56 Penman–Monteith reference evapotranspiration
    
- Solar radiation modelling (Angström + astronomical geometry)
    
- Vapour pressure thermodynamics
    
- Hydrological balance (ET₀ vs precipitation)
    
- Thermal accumulation (GDD)
    
- Drought indexing (SPI approximation)
    

This is the **physical forcing layer** for all downstream agronomic decision systems.

---

## 15.2 Fundamental State Variables

Each weather observation is defined as:

$$
W_i = (T, RH, P, WS, WD, CC, R, S, t)  
$$

Where:

- $T$ — air temperature (°C)
    
- $RH$ — relative humidity (%)
    
- $P$ — atmospheric pressure (hPa)
    
- $WS$ — wind speed (m/s)
    
- $CC$ — cloud cover (%)
    
- $R$ — rainfall (mm)
    
- $S$ — snow water equivalent (mm)
    

---

## 15.3 Saturation Vapour Pressure Model

### Saturation pressure

$$e_s(T)=0.6108\cdot\exp\left(\frac{17.27T}{T+237.3}\right)$$

---

### Mean saturation vapour pressure

$$e_s=\frac{e_s(T_{min})+e_s(T_{max})}{2}$$

---

### Actual vapour pressure (RH-based)

$$e_a=\frac{RH}{100}\cdot e_s$$

---

### Vapour pressure deficit

$$VPD=e_s-e_a$$

---

## 15.4 Penman–Monteith ET₀ Model (FAO-56)

### Full formulation

$$ET_0 = \frac{0.408\Delta(R_n-G) + \gamma \left( \frac{900}{T+273} \right) u_2(e_s-e_a)}{\Delta + \gamma(1 + 0.34u_2)}$$
---

### Components

#### Slope of vapour pressure curve

$$\Delta=\frac{4098\cdot e_s}{(T+237.3)^2}$$

---

#### Psychrometric constant

$$\gamma=0.000665\cdot P_{kPa}$$

---

## 15.5 Radiation Physics Layer

## 15.5.1 Extraterrestrial radiation

Astronomical radiation at top of atmosphere:

$$R_a=f(\varphi, J)$$

where:

- $\varphi$ = latitude
    
- $J$ = day of year
    

(standard FAO-56 solar geometry formulation)

---

## 15.5.2 Angström solar radiation model

$$R_s=(0.25+0.50\cdot n/N)\cdot R_a$$

where:

- $n/N = 1 - CC$ (cloud-adjusted sunshine fraction)
    

---

## 15.5.3 Net radiation

### Net shortwave radiation

$$R_{ns}=(1-\alpha)R_s$$

---

### Net longwave radiation

$$R_{nl}=\sigma\frac{(T_{max}+273)^4+(T_{min}+273)^4}{2}\cdot f(e_a)\cdot f(R_s/R_{so})$$

---

### Net radiation balance

$$R_n=R_{ns}-R_{nl}$$

---

## 15.6 Thermal Accumulation (GDD)

$$GDD=\sum \max\left(0,\frac{T_{max}+T_{min}}{2}-10\right)$$

---

## 15.7 Water Balance Model

### Evapotranspiration vs precipitation deficit

$$
WD = \sum ET_0 - \sum P  
$$

Interpretation:

- $WD > 0$ → water stress
    
- $WD < 0$ → surplus
    

---

## 15.8 Snow Contribution

Snow is treated as water equivalent:

$$
P_{total} = R + S  
$$

---

## 15.9 Soil Heat Flux Assumption

$$
G \approx 0  
$$

(valid for daily timestep FAO-56 approximation)

---

## 15.10 SPI Approximation (1-month)

### Standardised anomaly

$$
SPI = \frac{x - \mu}{\sigma}  
$$

where:

- $x$ = current precipitation total
    
- $\mu, \sigma$ = empirical climatology over window
    

---

## 15.11 Daily Aggregation Logic

Hourly observations are grouped:

$$
D_k = {W_i : date(W_i)=k}  
$$

Each day produces:

- $T_{min}, T_{max}, T_{mean}$
    
- $RH_{mean}$
    
- $WS_{mean}$
    
- $P_{sum}$
    

---

## 15.12 ET₀ Temporal Integration

Daily ET₀ is computed via FAO-56, then aggregated:

$$
ET_{0,7d} = \sum_{i=1}^{7} ET_{0,i}  
$$

$$
ET_{0,30d} = \sum_{i=1}^{30} ET_{0,i}  
$$

---

## 15.13 Water Deficit Metrics

### 7-day deficit

$$
WD_{7d} = ET_{0,7d} - P_{7d}  
$$

### 30-day deficit

$$
WD_{30d} = ET_{0,30d} - P_{30d}  
$$

---

## 15.14 Outputs of the System

### Temperature statistics

- $T_{min,7d}$
    
- $T_{max,7d}$
    
- night-adjusted extrema
    

---

### Hydrological indicators

- precipitation sum
    
- water deficit (7d, 30d)
    
- SPI index
    

---

### Energy balance

- $R_a$
    
- $R_s$
    
- $ET_0$
    

---

### Vegetation forcing metrics

- GDD
    
- humidity means
    
- radiation forcing
    

---

## 15.15 System Interpretation

This module represents:

- **physical boundary layer of agro-model**
    
- FAO-56 compliant evapotranspiration engine
    
- radiation-driven energy balance system
    
- hydrological stress estimator
    
- input provider for:
    
    - irrigation model
        
    - disease risk model
        
    - spraying window model
        
    - biomass model calibration
        

---

## 15.16 Architectural Role

Within full system stack:

- WeatherMetrics → **physical state reconstruction**
    
- Irrigation → water control decisions
    
- Disease → biological response layer
    
- Spraying → operational scheduling
    
- Biomass → production outcome model
    

This is the **lowest-level deterministic physical layer** of the system.