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

### 3. Frontend (React/Next.js)
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
This service handles [опишите кратко роль сервиса, например: image processing/data analysis].

```bash
# Navigate to haskell-service directory
cd haskell-service

# Initialize and build the project
stack init --force
stack build

# Run the service
stack run
```

---
