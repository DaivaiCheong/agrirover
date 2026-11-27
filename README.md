# AgriRover — Autonomous Tomato Rover, AI Vision & Unit Cost Optimizer

**One Utilities Cambodia** · Siem Reap  
Cambodia Digital Awards 2026 · *Digital Research & Innovation*

AgriRover autonomously scans tomato beds (`G1–G6`), pairs **plant-level AI Vision detection** with **7-in-1 root-zone soil telemetry**, computes live **Mulder's Chart** & dose prescriptions (`FastFocusCard`), and connects the React dashboard end-to-end with **FastAPI + MongoDB 7 (NoSQL) + Mosquitto MQTT** in Docker — with zero frontend mock fallbacks.

- **Full-Stack Live Data:** Every frontend page (`Today`, `Plan`, `Rover`, `Health`, `Crops`, `Finance`, `Farm`) reads and persists directly against MongoDB via FastAPI (`/api/v1/*`).
- **Interactive Accounting & Excel Workbook (`/finance`):** Scale across active plants (`69` seeded across `G1–G5`), customize unit prices and yields, and persist spreadsheet changes to MongoDB (`GET/PUT/POST-reset /api/v1/finance/spreadsheet`).
- **Mulder's Chart Agronomic Rules:** Evaluates live soil `N`, `P`, `K`, `pH`, `EC`, `Moisture`, and `Soil Temp` together with rover AI detections (`Early blight`, `Leaf curl`, `Yellow leaves`, `Blossom-end rot`, `Pest damage`) for Fast-Focus treatments (`DO THIS NOW`, `DO NOT MIX / AVOID`, `EXPECTED RESULT`, `WHY`).

---

## Documentation Hub

| Document | Contents |
|---|---|
| [docs/architecture/frontend-backend-db.md](docs/architecture/frontend-backend-db.md) | **Standard Architecture Guide:** MongoDB 7 (NoSQL) + FastAPI (`motor`) + React (`api.ts`), 3-tier request flow, `camelCase` conventions, and full-stack feature checklist. |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | End-to-end Tomato platform workflow, Mulder's Chart Fast-Focus treatments, Excel unit economics, and hardware safety hierarchy. |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Complete MongoDB NoSQL collections, embedded document structures, and composite indexes (`db.py` + `seed.py`). |
| [docs/BACKEND-DOCKER-GUIDE.md](docs/BACKEND-DOCKER-GUIDE.md) | Docker Compose stack (`mongo`, `broker`, `api`, `web`, `rover-sim`, `field-sim`), `mongosh` & backup ops, `.env` reference, and `/api/v1/*` API contract. |
| [apps/api/README.md](apps/api/README.md) | FastAPI + Motor async backend structure, idempotent Tomato seeder, and `pytest` suite. |
| [docs/PLAN.md](docs/PLAN.md) | Product roadmap, field validation plan, and hardware risks. |

---

## Run Full Stack with Docker (`MongoDB 7 + Mosquitto + FastAPI + React`)

```powershell
Copy-Item .env.example .env
docker compose up -d
# Or include simulated rover & ESP8266 field node telemetry:
docker compose --profile sim up -d
```

- Dashboard (`apps/web`): `http://localhost:5173`
- FastAPI Swagger UI (`apps/api`): `http://localhost:8000/docs`
- FastAPI Healthcheck: `http://localhost:8000/health`

### Local Development & Tests (Without Starting Full Docker Compose)

```powershell
# Backend tests (uses mongomock-motor automatically if MONGODB_URL is unset, or real MongoDB when set)
Push-Location apps/api
python -m pip install -r requirements.txt
python -m pytest -v
Pop-Location

# Frontend unit tests & production build
Push-Location apps/web
npm ci
npm test -- --run
npm run build
Pop-Location
```

---

## Repository Layout

```text
apps/web                    React + TypeScript + Three.js Tomato Dashboard (Vite)
apps/api                    FastAPI + Motor async MongoDB + MQTT Worker + pytest suite
edge/rover-agent            Rover navigation, guards, vision & MQTT agent (Python)
edge/rover-motor-controller Motor controller firmware (Arduino) + protocol tests
edge/esp8266-field-node     ESP8266 field telemetry & relay interlock firmware
docs/                       Workflow, MongoDB NoSQL schema, Docker guide & architecture
```

---

## Team

One Utilities Cambodia — Siem Reap · [oneutilities.com](https://oneutilities.com) · info@oneutilities.com  
Lead developer: Daivai Cheong.

© 2026 One Utilities Cambodia and Daivai Cheong. All rights reserved.
