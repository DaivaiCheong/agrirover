# AgriRover — Autonomous Tomato Rover, AI Vision & Unit Cost Optimizer

**One Utilities Cambodia** · Siem Reap  
Cambodia Digital Awards 2026 · *Digital Research & Innovation*

AgriRover autonomously scans tomato beds (`G1–G6`), pairs **plant-level AI Vision detection** with **7-in-1 root-zone soil telemetry**, delivers **soil-linked 4-step care procedures**, and proves **per-plant cost savings & crop-loss prevention** in USD (`$`) and Cambodian Riel (`៛`).

- **Read-Only Farmer Experience:** `/rover` (`3D CAD` + `2D Map` + live `Plant condition`) and `/crop` (`Rover Vision Gallery` + `Tomato Disease & Treatment Guide`) require zero manual setup or field entry.
- **Synced Across Every Page:** `Today` (`/`), `Plan` (`/plan`), `Rover` (`/rover`), `Health` (`/crop`), `Crops` (`/cycles`), `Finance` (`/finance`), and `Farm` (`/beds`) share unified Tomato targets (**pH `6.0–6.8`**, **Moisture `58%–72%`**, **EC `0.8–2.5 mS/cm`**, **Soil Temp `18–29 °C`**, **NPK `mg/kg`**).
- **Per-Plant Unit Economics (`/finance`):** Operation cost of **`$0.75` (`~3,065 ៛`) per tomato plant** vs. **`$1.02` (`~4,165 ៛`)** traditional (**28% water saved**, **22% nutrients saved**, **35% spot-treatment saved**) plus live crop-loss prevention linked to active vision alerts.

---

## Documentation Hub

| Document | Contents |
|---|---|
| [docs/architecture/frontend-backend-db.md](docs/architecture/frontend-backend-db.md) | **Standard Architecture Guide:** Why PostgreSQL 16 + `JSONB` (vs. MongoDB), 3-tier request flow, `camelCase` ↔ `snake_case` conventions, and full-stack feature checklist. |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | End-to-end Tomato platform workflow, read-only UX, Mulder's Chart Fast-Focus treatments, and unit economics. |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Complete PostgreSQL schema (`0001–0010` entities & indexes) plus Migration `0011` Tomato Backend Upgrade Blueprint. |
| [docs/BACKEND-DOCKER-GUIDE.md](docs/BACKEND-DOCKER-GUIDE.md) | Docker Compose stack (`db`, `broker`, `api`, `web`, `sim`), Alembic & DB ops commands, `.env` reference, and `/api/v1/*` API contract checklist. |
| [apps/api/README.md](apps/api/README.md) | FastAPI server architecture, migrations, and service modules. |
| [docs/PLAN.md](docs/PLAN.md) | Product roadmap, field validation plan, and hardware risks. |

---

## Try It Locally

### Frontend Only (Instant Synced Tomato Mode — No Docker/DB Required)

```powershell
cd apps/web
npm ci
npm run build
npm test
npm run dev
```

Open `http://127.0.0.1:5173`. When the backend API is not running, the app runs seamlessly against the shared live Tomato store (`Sample data · Synced with AgriRover`).

### Full Stack with Docker (`PostgreSQL 16 + Mosquitto + FastAPI + React + Simulators`)

```powershell
Copy-Item .env.example .env
docker compose --profile sim up -d
```

- Dashboard: `http://localhost:5173`
- FastAPI Swagger Docs: `http://localhost:8000/docs`
- Rover agent standalone simulation: `cd edge/rover-agent && pip install -r requirements.txt && python -m rover sim`

---

## Repository Layout

```text
apps/web                    React + TypeScript + Three.js Tomato Dashboard (Vite)
apps/api                    FastAPI + SQLAlchemy 2 + Alembic + MQTT Worker + Tests
edge/rover-agent            Rover navigation, guards, vision & MQTT agent (Python)
edge/rover-motor-controller Motor controller firmware (Arduino) + protocol tests
edge/esp8266-field-node     ESP8266 field telemetry & relay interlock firmware
docs/                       Workflow, database schema, backend Docker guide & architecture
```

---

## Team

One Utilities Cambodia — Siem Reap · [oneutilities.com](https://oneutilities.com) · info@oneutilities.com  
Lead developer: Daivai Cheong.

© 2026 One Utilities Cambodia and Daivai Cheong. All rights reserved.
