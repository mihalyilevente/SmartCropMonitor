## Local Development Setup

### 1. Prerequisites
Ensure you have the following installed:
* **Python 3.12**
* **Node.js & npm**
* **Haskell Stack** & **Cabal**

### 2. Backend (FastAPI)
The backend handles the core logic and API endpoints.

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the server
# Note: In PyCharm, you can mark 'backend' as 'Sources Root'
uvicorn app.main:app --reload
```
The API will be available at `http://localhost:8000`.

### 3. Frontend (React)
The web interface for monitoring.

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
The dashboard will be available at `http://localhost:3000`.

### 4. Haskell Service
This service handles.

```bash
# Navigate to haskell-service directory
cd haskell-service

# Initialize and build the project
stack init --force
stack build

# Run the service
stack run
```
Here is a clean, professional, and clear section for your **README.md** written in English. It outlines the exact steps needed to clone the required submodules/repositories into their designated folders and explains how to generate the topography data.

---

## Weather Simulation Setup (WRF & WPS)

This section describes how to clone the necessary core meteorological models and prepare the high-resolution 7.5 arc-second GMTED2010 topography dataset.

### 1. External Repositories Installation

The project uses external sources for `WPS` (Weather Preprocessing System) and `WRF` (Weather Research and Forecasting). They must be cloned into their respective service directories.

From the root of the monorepository, run the following commands:

```bash
# Clone WPS into the wrf-preprocessor service
git clone https://github.com/wrf-model/WPS.git wrf-preprocessor/WPS

# Clone WRF into the wrf-runner service
git clone https://github.com/wrf-model/WRF.git wrf-runner/WRF

```

---

### 2. Topography Data Preparation (GMTED2010 7.5 arc-seconds)

`geogrid.exe` requires terrestrial static data converted into the specialized WPS binary format. Follow these steps to process the raw data using QGIS and a Python utility script.

#### Step A: Download Raw Data from USGS

1. Download the **Mean Statistic, 7.5 arc-seconds** dataset from the official USGS servers:
* [USGS GMTED2010 mn75_grd.zip](https://www.google.com/search?q=https://edcintl.cr.usgs.gov/downloads/sciweb1/shared/topo/downloads/GMTED/Grid_ZipFiles/be15_grd.zip) (Ensure you select the `mn75` version for the mean elevation data).


2. Extract the downloaded archive. You will see a folder containing `.adf` files (Esri Grid format), where the main dataset file is usually named `w001001.adf`.

#### Step B: Export to GeoTIFF via QGIS

1. Launch **QGIS** and drag-and-drop the `w001001.adf` file onto the main map canvas.
2. In the top menu, go to **Raster** $\rightarrow$ **Conversion** $\rightarrow$ **Translate (Convert Format)...**
3. Configure the following parameters in the translation window:
* **Input layer:** Select your loaded elevation grid layer.
* **Advanced Parameters** $\rightarrow$ **Output data type:** Select **Int16** *(Strictly required for WRF)*.
* **Converted:** Click the three dots `...`, choose **Save to File...**, and save the file as `D:\topo.tif`.


4. Click **Run** to execute the export.

#### Step C: Convert GeoTIFF to WPS Binary Format

To format the GeoTIFF image into big-endian matrix tiles along with the necessary geographical passport (`index` file), use the automated Python conversion script.

1. Ensure you have the required dependencies installed in your workspace:
```bash
pip install rasterio numpy

```


2. Create and run a temporary script (e.g., `make_topo.py`) using the code block below:

```python
import os
import numpy as np
import rasterio

# Minimalist conversion script for GMTED2010 7.5s grid
tif_path = r"D:\topo.tif"
output_dir = "backend/data/storage/topo/gmted2010_7.5s"
os.makedirs(output_dir, exist_ok=True)

with rasterio.open(tif_path) as src:
    topo_data = src.read(1)
    bounds = src.bounds
    res_x, res_y = src.res  
    height, width = topo_data.shape

# Replace NoData artifacts with sea level (0 meters)
topo_data[topo_data < -1000] = 0
topo_data = topo_data.astype(np.int16)

# Generate WPS compliant filename matrix
tile_name = f"00001-{width:05d}.00001-{height:05d}"
output_file = os.path.join(output_dir, tile_name)

print(f"Writing WPS binary tile matrix: {width}x{height}...")
with open(output_file, "wb") as f:
    # Force big-endian byte swapping for Fortran unformatted read compatibility
    topo_data.byteswap().tofile(f)

# Build the required geogrid metadata index descriptor
index_content = f"""type=continuous
signed=yes
projection=regular_ll
dx={res_x:.9f}
dy={res_y:.9f}
known_x=1.0
known_y={height:.1f}
known_lat={bounds.top:.6f}
known_lon={bounds.left:.6f}
wordsize=2
tile_x={width}
tile_y={height}
tile_z=1
units="meters"
description="GMTED2010 7.5 arc-seconds elevation"
"""

with open(os.path.join(output_dir, "index"), "w") as f:
    f.write(index_content)

print("Target terrain dataset generation completed successfully.")

```

#### Step D: Final Integrity Check

Navigate to the newly generated folder. Your file tree structure must match this layout perfectly:

```text
backend/data/storage/topo/
└── gmted2010_7.5s/
    ├── 00001-XXXXX.00001-YYYYY  # The processed binary grid tile (No extension)
    └── index                    # The terrain passport configuration (No extension)

```

The resulting topography path is mounted natively into the Docker ecosystem using `docker-compose.yml` volumes for deployment executions.
## Documentation

* **`docs/`** — Core project documentation and technical guidelines:
    * `CONTRIBUTING.md` — Instructions for contributing to the project.
    * `SECURITY.md` — Security policies and vulnerability disclosure process.
    * `MODEL_CARD.md` — ML model characteristics, limitations, and performance indicators.
    * `DATA_SPEC.md` — Sentinel-2 data schema, band selection rules, spatial resolution definitions, and auxiliary layer structure.
    * `ARCHITECTURE.md` — System architecture, processing pipeline, and service interaction overview.
    * `API_SPEC.md` — API endpoints, request/response schemas, and authentication details.
    * `Computational_Methods.md` — Calculations, methodology.


### Documentation Assets

* **`docs/assets/`** — Static assets used across documentation:
    * `diagrams/` — System architecture, workflow, and database diagrams.
    * `ui/` — UI screenshots and interface mockups.
    * `visualizations/` — Generated plots, graphs, NDVI maps, and analytical figures.

---

## GitHub Configuration

* **`.github/`** — GitHub workflows and collaboration templates:
    * `ISSUE_TEMPLATE/` — Templates for bug reports, feature requests, and ML experiment tracking.
    * `PULL_REQUEST_TEMPLATE.md` — Standardized checklist for pull requests.

---

## Research and Experimentation

* **`notebooks/`** — Research notebooks, exploratory analysis, prototyping, and experiments.

---

## Root Directory

* `LICENSE.md` — AGPLv3 open-source license.
* `COMMERCIAL-LICENSE.md` — Commercial licensing terms and usage conditions.
* `CODE_OF_CONDUCT.md` — Community participation and behavior standards.
* `README.md` — Project overview, setup instructions, and quick start guide.
* `requirements.txt` — Global Python dependencies.
* `.env.example` — Example environment configuration template.

---
## Dual Licensing

This project is distributed under a dual licensing model.

You may choose between an open-source license or a commercial license depending on your use case.

---

## 1. Open Source License (AGPLv3)

This software is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

You may use, modify, and distribute this software under the terms of the AGPL-3.0 license.

### Key obligations under AGPL-3.0:

- If you run this software as a network service (e.g., SaaS, API, web application),
  you must provide access to the corresponding source code, including modifications.
- Any distributed or network-deployed version must remain under AGPL-3.0.

See the LICENSE file for full license terms.

---

## 2. Commercial License

A separate commercial license is available for individuals or organizations
that do not wish to comply with the requirements of the AGPL-3.0 license.

The commercial license grants additional rights, including:

- Use in proprietary or closed-source software
- Use in commercial SaaS or hosted services without source code disclosure
- Embedding into paid products or services
- Redistribution without AGPL obligations

---

## Commercial Licensing

For commercial licensing inquiries, please contact:

📧 nikita.manaenkov@gmail.com

---

## 3. Important Note

The commercial license is an alternative to the AGPL license.
You must choose one of the two licensing options depending on your use case.
---


git commit -m "chore(data): ingest latest weather and satellite imagery"

---
