# Hamon: Data Harmonization & Schema Extraction Workbench

A full-stack platform for semi-automated schema extraction, visual document ingestion, and enterprise data harmonization.

---

## 🏛️ Architecture & Port Mapping

| Service | Port | Description |
| :--- | :--- | :--- |
| **Frontend** | `3000` | Next.js 14 LTS (React 18), Tailwind CSS, Lucide icons, `@retab` components |
| **Backend API** | `8001` | FastAPI, PyMongo native `AsyncMongoClient`, LiteLLM, BDI-Kit |
| **mongo-app** | `27017` | Application database (`extraction_app_db`) for uploads, runs, and drafts |
| **mongo-target** | `27018` | Simulated enterprise target database (`company_enterprise_db`) |

---

## 🚀 Quickstart

### 1. Prerequisites
* **Docker Desktop** installed and running.
* **Node.js 20+ LTS** & **npm**.
* **Python 3.12+**.

### 2. Start Database Containers
Ensure both MongoDB instances are running:
```bash
docker compose up -d
```
Verify they are healthy:
```bash
docker ps --filter "name=hamon-mongo"
```

### 3. Initialize Python Environment & Install Dependencies
```bash
# Create and activate Python 3.12 virtual environment
python3.12 -m venv .venv
source .venv/bin/activate

# Install backend dependencies (using uv for fast resolution)
pip install uv
uv pip install -r backend/requirements.txt

# Install frontend dependencies
npm install
cd frontend && npm install && cd ..
```

### 4. Run Development Servers
Start both the FastAPI backend and Next.js frontend concurrently:
```bash
npm run dev
```

* **Web UI**: Open [http://localhost:3000](http://localhost:3000)
* **Backend API Docs**: Open [http://localhost:8001/docs](http://localhost:8001/docs)
* **API Health Check**: [http://localhost:8001/api/health](http://localhost:8001/api/health)

---

## 🧪 Testing

### Run All Automated Tests
Runs backend unit & integration tests (`pytest`) followed by frontend production build validation (`next build`):
```bash
source .venv/bin/activate
npm test
```

### Run Backend Tests Only
```bash
cd backend
pytest -v
```

### Test API Health via CLI
```bash
curl -s http://localhost:8001/api/health | jq .
```
Expected response:
```json
{
  "status": "ok",
  "databases": {
    "app_db": true,
    "target_db": true
  }
}
```

### Test Lifespan Resiliency (Simulate DB Downtime)
The backend does not crash if a database is booting or unreachable:
```bash
# 1. Stop target database
docker stop hamon-mongo-target

# 2. Check health (server remains online, status: 200)
curl -s http://localhost:8001/api/health | jq .
# Result: {"status":"ok","databases":{"app_db":true,"target_db":false}}

# 3. Restore target database
docker start hamon-mongo-target
```

---

## 🐳 Dev Container (VS Code)

1. Open this repository in **VS Code**.
2. When prompted (or via `Cmd + Shift + P` → `Dev Containers: Reopen in Container`), select reopen in container.
3. The unified container automatically joins the Docker network with `mongo-app` and `mongo-target`, sets up Python 3.12 + Node.js 20 LTS, and forwards all ports (`3000`, `8001`, `27017`, `27018`).

---

## 📚 External References

Reference repositories and cached documentation snapshots are managed via:
```bash
python3 scripts/sync_references.py
```
See [`.reference/INDEX.md`](.reference/INDEX.md) for local file trees and links.
