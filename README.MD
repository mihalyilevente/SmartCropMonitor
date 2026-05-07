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

## Documentation

*   **`docs/`** — Core project guidelines:
    *   `CONTRIBUTING.md`: Instructions on how to contribute to the project.
    *   `SECURITY.md`: Security policies and vulnerability reporting.
    *   `MODEL_CARD.md`: Characteristics and performance indicators for the models.
    *    `DATA_SPEC.md`: Definition of Sentinel-2 data schema, band selection, spatial resolution rules, and auxiliary layer structure.
*   **`.github/`** — GitHub-specific workflows and templates:
    *   `ISSUE_TEMPLATE/`: Pre-defined formats for reporting bugs, requesting features, or documenting ML experiments.
    *   `PULL_REQUEST_TEMPLATE.md`: A checklist to ensure quality for all code submissions.
*   **`notebooks/`** — Contains research, data analysis, and experimental code.
*   **Root Directory**:
    *   `LICENSE.MD`: Legal terms regarding the use of this software.
    *   `CODE_OF_CONDUCT.md`: Standards for community engagement.
    *   `requirements.txt`: Global Python dependencies.

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
