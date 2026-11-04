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
| `app/workers/mqtt_ingest.py` | Subscribes to field telemetry and rover reports, validates, stores. |
| `app/services/metrics.py` | The readings a node may send: units, believable ranges, what is refused. Every reading goes through it. |
| `app/services/agronomy.py` | Rates a bed's readings against the crop's stage and raises alerts. Pure, advice only: it never waters. |
| `app/services/conditions.py`, `history.py` | Newest readings per bed with their rating; readings over time. |
| `app/services/setups.py` | Growing setups (density, spacing, yield per plant) and the harvest forecast. |
| `app/services/diagnosis.py` | A symptom the camera sees, set against the bed's live readings. |
| `app/routers/missions.py` | Sends survey missions to the rover over MQTT. |
| `app/models/entities.py` | Twelve relations, including those reserved for the rover. |
| `app/core/security.py` | bcrypt + JWT. One place, auditable. |

The rule engine is deliberately pure so it can be tested without hardware,
a broker or a database — see `tests/test_rule_engine.py`. So is the crop-conditions
engine — see `tests/test_agronomy.py`, which tests every threshold at its boundary.
