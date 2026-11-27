# AgriRover Backend, Docker & NoSQL (MongoDB) Guide

Practical reference for running, seeding, inspecting, and developing the **FastAPI + Motor (`MongoDB 7`) + Mosquitto MQTT + React** Docker stack on `main`.

> Also see [architecture/frontend-backend-db.md](architecture/frontend-backend-db.md) for the end-to-end Frontend ↔ FastAPI ↔ MongoDB request lifecycle and coding standards.

---

## 1. Docker Compose Stack (`docker-compose.yml`)

| Service | Image / Build | Port(s) | Purpose & Startup Behavior |
|---|---|---|---|
| `mongo` | `mongo:7` | `27017` | Primary NoSQL document & telemetry database (`./mongodata:/data/db`). Healthchecked via `mongosh --quiet --eval "db.adminCommand('ping').ok"`. |
| `broker` | `eclipse-mosquitto:2` | `1883` | Local MQTT broker (`./infra/mosquitto.conf`) receiving ESP field telemetry and rover scans. |
| `api` | `./apps/api/Dockerfile` | `8000` | FastAPI backend (`python -m app.services.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`). |
| `web` | `./apps/web/Dockerfile` | `5173` | Vite + React dashboard (`npm run dev -- --host 0.0.0.0`), zero offline mock data. |
| `rover-sim` *(profile `sim`)* | `./edge/rover-agent/Dockerfile` | — | Optional simulated rover worker publishing MQTT missions to `broker`. |
| `field-sim` *(profile `sim`)* | `./edge/field-node-sim/Dockerfile` | — | Optional simulated ESP8266 field sensor emitting telemetry (`SIM_SCENARIO=dry\|wet\|rain`). |

---

## 2. Quickstart & Day-to-Day Operations

### Initial Setup (Windows PowerShell)

```powershell
# 1. Create local .env from template (.env is git-ignored)
Copy-Item .env.example .env

# 2. Start MongoDB 7, Mosquitto broker, FastAPI backend, and React web UI
docker compose up -d

# Or include simulated rover & field node telemetry:
docker compose --profile sim up -d
```

### Operations Cheat Sheet

| Task | Command |
|---|---|
| Watch API seed & uvicorn logs | `docker compose logs -f api` |
| Check running containers & healthchecks | `docker compose ps` |
| Re-run idempotent Tomato seed manually | `docker compose exec api python -m app.services.seed` |
| Open interactive `mongosh` shell | `docker compose exec mongo mongosh agrirover` |
| Back up MongoDB database | `docker compose exec -T mongo mongodump --db=agrirover --archive > agrirover.archive` |
| Clean DB wipe & re-seed (**dev only**) | `docker compose down && Remove-Item -Recurse -Force ./mongodata && docker compose up -d` |
| Stop all containers | `docker compose --profile sim down` |

---

## 3. Environment Configuration (`.env`)

Key variables in [`.env.example`](../.env.example), read by [`apps/api/app/core/config.py`](../apps/api/app/core/config.py):

| Variable | Default / Example | Used By | Notes |
|---|---|---|---|
| `MONGODB_URL` | `mongodb://mongo:27017` | `api` | Use `mongodb://mongo:27017` inside Docker; use `mongodb://127.0.0.1:27017` from host Python commands. |
| `MONGODB_DB` | `agrirover` | `api`, `seed` | Target MongoDB database name. |
| `MQTT_HOST`, `MQTT_PORT`, `FARM_NAME` | `broker`, `1883`, `farm-01` | `api`, `rover-sim`, `field-sim` | Topic prefixes `farm/{FARM_NAME}/zone/{zone}/telemetry` and `devices/rover-01/mission/*`. |
| `VITE_API_BASE` | `http://localhost:8000/api/v1` | `apps/web` | FastAPI base URL read by `apps/web/src/lib/api.ts`. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | `api` | Allowed browser origins for CORS preflight requests. |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `PHOTO_MATCHES` | `http://host.docker.internal:11434`, `gemma4`, `false` | `api` | Set `OLLAMA_MODEL=` empty to disable Ollama image triage. |
| `PHOTO_DIR` | `/farm-photos` | `api` | Disk volume mounted from `./farm-photos:/farm-photos`. |

---

## 4. Running Tests Against Docker MongoDB (Matches GitHub Actions CI)

CI (`.github/workflows/ci.yml`) runs `pytest` against a live `mongo:7` service container:

```powershell
# Start MongoDB container on localhost:27017
docker compose up -d mongo

# Point FastAPI test runner at local MongoDB
$env:MONGODB_URL = "mongodb://127.0.0.1:27017"
$env:MONGODB_DB = "agrirover_ci"
Push-Location apps/api
python -m pip install -r requirements.txt
python -m pytest -v
Pop-Location
```

> If `MONGODB_URL` is omitted or set to `mongomock://localhost` (`tests/conftest.py`), `app/core/db.py` uses `mongomock-motor` in-memory for isolated unit runs.

---

## 5. Frontend ↔ Backend API Contract (`/api/v1/*`)

The React app (`apps/web/src/lib/api.ts`) requires a live FastAPI backend and surfaces clear connection error notices whenever the API is unavailable.

| Area / Pages | Endpoints | Purpose |
|---|---|---|
| Farm & Soil | `GET/POST /api/v1/zones`, `PUT /api/v1/zones/{zone}/profile`, `GET /api/v1/conditions`, `GET /api/v1/decisions/today`, `GET/PUT /api/v1/farm/settings`, `GET /api/v1/devices` | `G1–G6` beds, soil profiles, 9-metric telemetry bands, irrigation decisions, devices, economic settings. |
| Crops & Advisory | `GET/POST /api/v1/cycles`, `PATCH /api/v1/cycles/{id}`, `POST /api/v1/cycles/{id}/close`, `GET /api/v1/cycles/{id}/orchard`, `POST/DELETE .../jobs/{job}/done`, `POST .../fruit`, `GET /api/v1/advice`, `GET /api/v1/schedule` | Active tomato crop cycles, daily per-block drip + nutrient advice, 14-day schedule, harvest/sales tracking. |
| Rover & Telemetry | `GET/POST /api/v1/missions`, `GET /api/v1/missions/{id}`, `GET /api/v1/telemetry/{zone}` | Autonomous rover grids (`cells[]` with soil NPK/pH/EC/moisture & vision detections) + hourly bucketed time-series charts. |
| Finance & Excel | `GET/PUT /api/v1/finance/spreadsheet`, `POST /api/v1/finance/spreadsheet/reset`, `GET/POST/DELETE /api/v1/costs`, `GET /api/v1/cycles/{id}/cop`, `GET/POST /api/v1/cycles/{id}/harvests`, `.../sales`, `/api/v1/stock/*`, `/api/v1/assets*` | Interactive Excel ledger workbook persisted in MongoDB, cost entries, COP analysis, stock inventory, and equipment depreciation. |
| Health & Photos | `GET /api/v1/photos`, `POST /api/v1/photos`, `POST /api/v1/photos/check`, `GET /api/v1/photos/guide`, `GET/POST /api/v1/leaf-tests`, `PUT .../results` | Tomato disease guide, rover/uploaded photo curation, and lab tissue nutrient results. |

---

## 6. MQTT Ingestion Topics (`apps/api/app/workers/mqtt_ingest.py`)

- **Fixed Field Node Telemetry:** `farm/{FARM_NAME}/zone/{zone}/telemetry`
  ```json
  {
    "device": "ESP-FIELD-01",
    "measurements": [
      { "metric": "soil_moisture", "value": 64.2, "unit": "%" },
      { "metric": "rain", "value": 0, "unit": "bool" }
    ]
  }
  ```
- **Rover Round State & Final Report:**
  - `devices/rover-01/mission/state` (updates live mission progress state)
  - `devices/rover-01/mission/result` (validates cell metrics via `metrics.py` and inserts a `surveys` document + `telemetry` documents into MongoDB)
