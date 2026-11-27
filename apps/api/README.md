# AgriRover API (`apps/api`)

FastAPI + SQLAlchemy 2 (async `asyncpg`) + Alembic + MQTT worker backend. Runs inside Docker for local development and on the farm Raspberry Pi in production.

## Quickstart with Docker

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d db broker api
```

On startup, `docker-compose.yml` automatically waits for Postgres readiness (`pg_isready`), runs pending migrations (`alembic upgrade head`), executes idempotent seeding (`python -m app.services.seed`), and starts Uvicorn on `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`).

For complete Docker instructions, `.env` variables, database resets, and the Tomato API contract checklist matching the React frontend on `main`, see:
- [`docs/BACKEND-DOCKER-GUIDE.md`](../../docs/BACKEND-DOCKER-GUIDE.md)
- [`docs/SCHEMA.md`](../../docs/SCHEMA.md)
- [`docs/WORKFLOW.md`](../../docs/WORKFLOW.md)

## Database Migrations (Alembic)

Migrations live in `alembic/versions/` (`0001` through `0010`).

```bash
# Check current revision
docker compose exec api alembic current

# Apply all migrations
docker compose exec api alembic upgrade head

# Create a new migration after changing app/models/entities.py
docker compose exec api alembic revision --autogenerate -m "0011 tomato schema"
```

Always run `python -m pytest` against Postgres (`TEST_DATABASE_URL` set) so `tests/test_migrations.py` confirms zero schema drift between `entities.py` and Alembic migrations.

## Where the Backend Logic Lives

| Path | Responsibility |
|---|---|
| `app/models/entities.py` | SQLAlchemy 2 schema (29 tables across users, zones, crops, rover scans, AI photos, costs, harvests, sales). |
| `app/core/config.py`, `db.py`, `security.py` | Environment settings, async engine/session pool, bcrypt + JWT auth. |
| `app/workers/mqtt_ingest.py` | Subscribes to field node telemetry and rover mission reports, validates metrics, stores in PostgreSQL. |
| `app/services/metrics.py` | Validates and converts sensor readings (`pct`, `pH`, `mS/cm`, `C`, `mg/kg`) and rejects bad probe values. |
| `app/services/rule_engine.py`, `decisions.py` | Pure irrigation threshold & safety lockout checks. |
| `app/services/advisor.py`, `conditions.py`, `history.py` | Per-plant water/feed advice, bed condition rating, and telemetry history series. |
| `app/services/disease.py`, `photo_library.py` | Local Ollama vision photo screening & plant photo triage storage. |
| `app/services/cost.py`, `cop_report.py` | Cycle cost-of-production calculations, KHR/USD conversion, harvest & sales aggregation. |
| `app/routers/*.py` | FastAPI `/api/v1/*` endpoints mounted in `app/main.py`. |
