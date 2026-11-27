# AgriRover API (`apps/api`)

FastAPI + Motor (`AsyncIOMotorClient` for MongoDB 7 NoSQL) + MQTT worker backend. Runs inside Docker alongside `mongo:7` and `eclipse-mosquitto:2` for local development and edge deployment.

## Quickstart with Docker

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d mongo broker api
```

On container boot (`docker-compose.yml`), `api` executes `python -m app.services.seed` (idempotent index creation + Tomato `G1–G6` initial farm seeding if empty) and starts Uvicorn on `http://localhost:8000` (Swagger UI at `http://localhost:8000/docs`, OpenAPI JSON at `http://localhost:8000/openapi.json`).

For Docker operations, `.env` variables, MongoDB collections, and `/api/v1/*` endpoint documentation, see:
- [`docs/BACKEND-DOCKER-GUIDE.md`](../../docs/BACKEND-DOCKER-GUIDE.md)
- [`docs/SCHEMA.md`](../../docs/SCHEMA.md)
- [`docs/architecture/frontend-backend-db.md`](../../docs/architecture/frontend-backend-db.md)

## Running Tests

```powershell
# Against local or Docker MongoDB:
$env:MONGODB_URL = "mongodb://127.0.0.1:27017"
$env:MONGODB_DB = "agrirover_test"
python -m pytest -v

# Or isolated without external mongod (uses mongomock-motor when MONGODB_URL=mongomock://localhost):
python -m pytest -v
```

## Module Structure

| Path | Responsibility |
|---|---|
| `app/main.py` | FastAPI app (`AgriRover API` v2.0.0), lifespan (`seed_farm` + `ingest_lifespan`), CORS, error boundary, `/health`. |
| `app/core/config.py`, `db.py`, `security.py` | Pydantic `Settings` (`MONGODB_URL`, `MONGODB_DB`, MQTT, Ollama), Motor MongoDB client & indexes (`ensure_indexes`), bcrypt + JWT helpers. |
| `app/models/enums.py` | Domain enums (`Role`, `MissionStatus`, `AbortReason`, `CostCategory`, `Currency`, etc.). |
| `app/services/seed.py` | Idempotent NoSQL Tomato farm seeder (`G1–G6` zones, 69 active plants, 14d surveys, 72h hourly telemetry, Excel workbook, stock, assets, devices). |
| `app/services/tomato.py`, `metrics.py` | Tomato stage calendar, target bands, Mulder/dose helper rules, and sensor quality/range validation. |
| `app/services/farm_service.py` | Zone summaries, live `conditions` & alerts, daily drip/nutrient `advice`, 14-day `schedule`, `cycle_orchard_view`, soil profiles. |
| `app/services/finance_service.py` | Interactive Excel workbook persistence (`finance_workbooks`) and cycle COP (`build_cop_report`). |
| `app/services/rover_service.py` | Bucketed MongoDB `telemetry` aggregation series + active MQTT mission progress state. |
| `app/workers/mqtt_ingest.py` | Async `aiomqtt` worker subscribing to fixed node telemetry (`farm/{farm}/zone/{zone}/telemetry`) and rover mission topics (`devices/rover-01/mission/*`). |
| `app/routers/*.py` | Modular `/api/v1/*` routes: `farm_routes.py`, `cycles_routes.py`, `missions_routes.py`, `finance_routes.py`, `health_routes.py`. |
