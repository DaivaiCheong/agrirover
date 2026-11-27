# AgriRover Backend, Docker & Database Engineer Guide

Practical reference for running, migrating, seeding, debugging, and extending the FastAPI + PostgreSQL + Mosquitto + Docker stack to serve the 100%-Tomato AgriRover frontend on `main`.

---

## 1. Docker Compose Stack (`docker-compose.yml`)

| Container Service | Image / Build | Port(s) | Purpose & Startup Behavior |
|---|---|---|---|
| `db` | `postgres:16-alpine` | `5432` | Primary relational + time-series telemetry database (`./pgdata` volume). Runs `pg_isready` healthcheck before `api` starts. |
| `broker` | `eclipse-mosquitto:2` | `1883` | Local MQTT broker (`./infra/mosquitto.conf`) receiving rover scans and ESP field node telemetry. |
| `api` | `./apps/api/Dockerfile` | `8000` | FastAPI backend (`uvicorn app.main:app --reload`). Automatically executes `alembic upgrade head && python -m app.services.seed` on boot. |
| `web` | `./apps/web/Dockerfile` | `5173` | Vite + React dashboard (`npm run dev -- --host 0.0.0.0`). |
| `rover-sim` *(profile `sim`)* | `./edge/rover-agent/Dockerfile` | — | Optional simulated rover worker talking to `broker` over MQTT (`--profile sim`). |
| `field-sim` *(profile `sim`)* | `./edge/field-node-sim/Dockerfile` | — | Optional simulated ESP8266 field sensor emitting moisture & rain (`SIM_SCENARIO=dry\|wet\|rain`). |

---

## 2. Quickstart Commands (Docker & Local Dev)

### A. Initial Setup (Windows PowerShell)

```powershell
# 1. Create local .env from template (never commit .env)
Copy-Item .env.example .env

# 2. Optional: enable local Gemma vision triage via Ollama on host
ollama pull gemma4

# 3. Start DB, MQTT broker, FastAPI backend, and React web UI
docker compose up -d

# Or include simulated rover & field node telemetry:
docker compose --profile sim up -d
```

### B. Day-to-Day Backend & Database Operations

| Task | Command |
|---|---|
| Watch API startup, Alembic & seed logs | `docker compose logs -f api` |
| Check running containers & Postgres health | `docker compose ps` |
| Run pending DB migrations manually | `docker compose exec api alembic upgrade head` |
| Inspect current Alembic revision | `docker compose exec api alembic current` |
| Autogenerate a new migration after editing `entities.py` | `docker compose exec api alembic revision --autogenerate -m "description"` |
| Open interactive `psql` prompt inside DB | `docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB` |
| Back up PostgreSQL DB (`pg_dump`) + photos | `docker compose exec -T db pg_dump -U aaf aiautofarm > backup.sql` (and archive `./farm-photos/`) |
| Full clean database wipe & re-seed (**dev only**) | `docker compose down && Remove-Item -Recurse -Force ./pgdata && docker compose up -d` |
| Stop all services | `docker compose --profile sim down` |

---

## 3. Environment Configuration (`.env`)

Key variables defined in [`.env.example`](../.env.example) and loaded by [`apps/api/app/core/config.py`](../apps/api/app/core/config.py):

| Variable | Default / Example | Used By | Notes |
|---|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `aaf`, `change-me`, `aiautofarm` | `db`, `api` | Postgres credentials (`DATABASE_URL` must match). |
| `DATABASE_URL` | `postgresql+asyncpg://aaf:change-me@db:5432/aiautofarm` | `api` (Alembic + SQLAlchemy) | Inside Docker use host `db`; for local host scripts use `127.0.0.1:5432`. |
| `MQTT_HOST`, `MQTT_PORT`, `FARM_NAME` | `broker`, `1883`, `farm-01` | `api`, `rover-sim`, `field-sim` | Topic pattern: `farm/{FARM_NAME}/zone/{zone}/telemetry` & `devices/rover-01/mission/*`. |
| `VITE_API_BASE` | `http://localhost:8000/api/v1` | `apps/web` | Backend base URL baked/read by Vite frontend. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | `api` | Include both `localhost` and `127.0.0.1` so browser preflights succeed. |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `PHOTO_MATCHES` | `http://host.docker.internal:11434`, `gemma4`, `false` | `api` | Set `OLLAMA_MODEL=` empty to disable local LLM image triage. |
| `PHOTO_DIR` | `/farm-photos` | `api` | Persisted via `./farm-photos:/farm-photos` volume mount. |

---

## 4. Running Backend & Database Tests Against Docker Postgres

CI (`.github/workflows/ci.yml`) runs **all API tests including migration parity checks** against a live `postgres:16-alpine` instance:

```powershell
# Ensure Postgres container from docker-compose is running on port 5432:
docker compose up -d db

# Point test runner at local Postgres and run full pytest suite:
$env:TEST_DATABASE_URL = "postgresql://aaf:change-me@127.0.0.1:5432/postgres"
Push-Location apps/api
pip install -r requirements.txt
python -m pytest
Pop-Location
```

> **Schema Integrity Rule (`tests/test_migrations.py`):**
> - Every table/column change in `apps/api/app/models/entities.py` **must** have a matching Alembic migration in `apps/api/alembic/versions/` (`compare_metadata == []`).
> - `sensor_reading` must keep **only one time index**: `ix_sensor_reading_zone_metric_time` on `(zone_id, metric, recorded_at)`.

---

## 5. Frontend ↔ Backend API Contract (`/api/v1/*`)

The React app (`apps/web/src/lib/api.ts`) talks to `/api/v1` and gracefully displays `Sample data · Synced with AgriRover` when offline. When connecting the live backend to the Tomato UI on `main`, ensure these endpoints return shapes matching `api.ts`:

### Core Endpoints Consumed by the Tomato UI

| Page | Method & Path | Required Fields / Notes |
|---|---|---|
| `Today`, `Farm`, `Rover`, `Crops` | `GET /api/v1/zones` | `[{ zone, label, areaM2, moisturePct, rain, supplyVoltage, waterPh, recordedAt }]` |
| `Today`, `Crops`, `Plan`, `Finance` | `GET /api/v1/cycles` | Active tomato cycles (`crop: "tomato"`, `cropName: "Tomato"`, `variety`, `plantCount`, `day`, `stageTitle`, `grid: { rows, cols, rowM, treeM }`, `forecast`). |
| `Today`, `Farm`, `Rover`, `Health` | `GET /api/v1/conditions` | Live `params[]` (`soil_moisture`, `soil_ph`, `soil_ec`, `soil_temperature`, `nitrogen`, `phosphorus`, `potassium`, `air_temperature`, `air_humidity`) with tomato target bands (`58–72%`, `6.0–6.8`, `0.8–2.5`, `18–29 °C`), plus active `alerts[]`. |
| `Today`, `Plan` | `GET /api/v1/advice` | Per-block `water: { litres, fullLitres, savedLitres }`, `feed`, and `trees[]` plant advice list. |
| `Rover`, `Health`, `History`, `Finance` | `GET /api/v1/missions`<br>`GET /api/v1/missions/{id}` | Mission list & per-cell array `cells[]`: `{ row, col, plant, flagged, canopy, chlorosis, disease, disease_confidence, readings, advice }`. `disease` accepts `"early_blight"`, `"leaf_curl"`, `"chlorosis"`, `"blossom_end_rot"`, `"pest_damage"`. |
| `Rover History`, `Farm Trends` | `GET /api/v1/telemetry/{zone}?metrics=...&hours=...&points=...` | Bucketed metric time-series arrays `series[metric] = [{ t, v }]`. |
| `Plan` | `GET /api/v1/schedule?days=14` | Daily `dates[]`, block `water[]` forecasts, and `events[]` (`kind`: `water \| feed \| foliar \| task \| stage \| harvest`). |
| `Finance`, `Block Breakdown` | `GET /api/v1/cycles/{id}/cop`<br>`GET /api/v1/cycles/{id}/harvests`<br>`GET /api/v1/cycles/{id}/sales` | Cycle cost categories, USD + KHR totals (`khrPerUsd: 4085`), yield kg, and sales ledger. |
| `Farm > Stock`, `Equipment`, `Devices`, `Settings` | `GET /api/v1/stock/items`<br>`GET /api/v1/assets`<br>`GET /api/v1/devices`<br>`GET /api/v1/farm/settings` | Inventory items, equipment depreciation, active rover/drip controllers, and farm economic settings. |

---

## 6. MQTT Ingestion Topics (`apps/api/app/workers/mqtt_ingest.py`)

- **Fixed Field Node Telemetry:** `farm/{FARM_NAME}/zone/{zone}/telemetry`
  ```json
  {
    "device": "ESP-FIELD-01",
    "fw": "1.0.0",
    "sampleCount": 16,
    "measurements": [
      { "metric": "soil_moisture", "value": 64.2, "unit": "pct", "sensor": "S-A-25", "quality": "valid" },
      { "metric": "rain", "value": 0, "unit": "bool", "quality": "valid" }
    ]
  }
  ```
- **Rover Round State & Final Report:**
  - `devices/rover-01/mission/state` (real-time cell updates during scan)
  - `devices/rover-01/mission/result` (persisted into `survey_mission`, `survey_finding`, and `sensor_reading`)

---

## 7. Backend Transition Notes (`Guava` → `Tomato`)

> **Heads-up for Backend Devs:** Earlier commits in `apps/api/app/services/` still carry `guava.py`, `guava_diseases.py`, `demo_orchard.py`, and guava assertions in `apps/api/tests/` so existing CI stays green while frontend work landed first on `main`.

When switching the backend database seed and advisory rules over to Tomato cleanly:
1. Update `services/seed.py` & create `services/tomato.py` + migration `0011` (detailed in [SCHEMA.md](SCHEMA.md#3-recommended-migration-0011-tomato-backend--ai-vision-alignment)).
2. Align `services/advisor.py` nutrient hold thresholds (`Soil N >= 80 mg/kg` holds extra nitrogen feeds; `Moisture 58–72%`, `pH 6.0–6.8`, `EC 0.8–2.5 mS/cm`).
3. Update `apps/api/tests/test_schema.py`, `test_advisor.py`, `test_schedule.py`, and `test_ui_api.py` together in the same commit as the backend migration and test with Docker Postgres before pushing.
