## Local Development Setup

### 1. Prerequisites
Ensure you have the following installed:
* **Python 3.9+**
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
    *   `CODE_OF_CONDUCT.md`: Standards for community engagement.
    *   `SECURITY.md`: Security policies and vulnerability reporting.
    *   `MODEL_CARD.md`: Characteristics and performance indicators for the models.
*   **`.github/`** — GitHub-specific workflows and templates:
    *   `ISSUE_TEMPLATE/`: Pre-defined formats for reporting bugs, requesting features, or documenting ML experiments.
    *   `PULL_REQUEST_TEMPLATE.md`: A checklist to ensure quality for all code submissions.
*   **`notebooks/`** — Contains research, data analysis, and experimental code.
*   **Root Directory**:
    *   `LICENSE.MD`: Legal terms regarding the use of this software.
    *   `requirements.txt`: Global Python dependencies.

---

git commit -m "chore(data): ingest latest weather and satellite imagery"

---
