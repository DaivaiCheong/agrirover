# API

FastAPI + SQLAlchemy 2 + Alembic. Runs on the Raspberry Pi in production.

## Creating the first migration

The models are complete; generate the initial migration once the database is up:

```bash
docker compose exec api alembic revision --autogenerate -m "0001 initial schema"
docker compose exec api alembic upgrade head
```

## Where the logic lives

| Path | Responsibility |
|---|---|
| `app/services/rule_engine.py` | The only place that decides to apply water. Pure, tested, no I/O. |
| `app/workers/mqtt_ingest.py` | Subscribes to field telemetry and rover reports, validates, stores, evaluates. |
| `app/routers/missions.py` | Sends survey missions to the rover over MQTT. |
| `app/models/entities.py` | Twelve relations, including those reserved for the rover. |
| `app/core/security.py` | bcrypt + JWT. One place, auditable. |

The rule engine is deliberately pure so it can be tested without hardware,
a broker or a database — see `tests/test_rule_engine.py`.
