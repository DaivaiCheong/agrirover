# AgriRover: End-to-End Tomato Platform Workflow

How AgriRover works end to end on `main`: autonomous morning rover monitoring, 3D CAD visualization, live soil telemetry paired with tomato AI vision, **Mulder's Chart Fast-Focus treatments & formula prescriptions**, an **interactive Excel Financial Calculator**, and full persistence in **FastAPI + MongoDB 7 (NoSQL)**.

**Contents:** [What AgriRover Is](#what-agrirover-is) · [Core Value Proposition](#core-value-proposition) · [System Architecture](#system-architecture) · [Farmer UI Workflow](#farmer-ui-workflow) · [Live-Telemetry Care Logic](#live-telemetry-care-logic) · [Unit Economics & Excel Ledger](#unit-economics--excel-ledger) · [Safety Hierarchy](#safety-hierarchy) · [Run with Docker](#run-with-docker)

---

## What AgriRover Is

AgriRover is an autonomous greenhouse & field monitoring system built for **tomato farming** across 6 managed blocks (`G1–G6`, `69` active tomato plants across 5 planted beds plus 1 ready bed):

1. **Daily Autonomous Rover Scan (`07:00 AM`):** Traverses each row plant-by-plant (`R1 T1`, `R1 T2`, …), captures canopy/fruit photos, and reads a 7-in-1 soil & ambient probe (`Moisture %`, `Soil pH`, `EC mS/cm`, `Soil Temp °C`, `N·P·K mg/kg`, `Air °C`, `RH %`).
2. **Read-Only Sensor Ingestion + MongoDB Storage:** Rover scans and fixed ESP8266 telemetry stream through Mosquitto MQTT into FastAPI and MongoDB 7, keeping every dashboard page live and synchronized.
3. **Soil + Vision Fusion & Exact Dosing:** Computes Mulder nutrient antagonisms and exact water pulses (`waterPulseLitres`), soil grams (`doseGramsPerPlant`), and foliar spray batch volumes (`calculatePrescription`).

---

## Core Value Proposition

| Farmer Problem | What AgriRover Does | Where in App & Code |
|---|---|---|
| Blanket watering wastes water and triggers leaf curl / blossom-end rot | Tracks plant moisture against `58%–72%` targets via 3D CAD & formula pulses (`(64 - liveMoisture) * 0.25 L`) | `Rover` (`/rover`), `Plan` (`/plan`), `prescriptionCalculator.ts` |
| Blanket NPK applications burn roots or trigger nutrient lockout | Evaluates **Mulder's Chart** antagonisms (`N >= 105` holds Urea; `K > 230` blocks extra K; `P > 85` blocks DAP) before prescribing | `PlantSoilModal`, `Health` (`/crop`), `agronomyEngine.ts` |
| Early foliar diseases spread across rows unnoticed | Captures daily canopy photos with bounding boxes & confidence scores; computes canopy-scaled spot sprays | `Health` (`/crop`), `lib/vision.ts` |
| Unclear profitability when local input rates change | Interactive **Excel-Style Spreadsheet Calculator** with live `fx` formulas & MongoDB persistence (`USD` & `៛`) | `Finance` (`/finance`), `financeSpreadsheet.ts` |

---

## System Architecture

```mermaid
flowchart LR
    Rover["Autonomous Rover<br>edge/rover-agent + ESP32"]
    Node["Field Weather Node<br>edge/esp8266-field-node"]
    MQTT(["MQTT Broker<br>Mosquitto :1883"])
    API["FastAPI Farm Server<br>apps/api :8000"]
    DB[("MongoDB 7 NoSQL<br>mongo:7 · Motor Async")]
    AI["Local Vision / AI<br>Ollama / Detector"]
    Web["Farmer Web App<br>apps/web :5173 (Zero Mocks)"]
    Farmer(["Farmer"])

    Rover -->|"07:00 AM scan telemetry + frames"| MQTT
    Node -->|"rain & mainline flow"| MQTT
    MQTT --> API
    API <--> DB
    API -.->|"optional triage"| AI
    API -->|"REST /api/v1/* (HTTP + JSON)"| Web
    Web --> Farmer
```

### Synchronized Tomato Targets (`G1–G6`)

- **Blocks:** `G1 Greenhouse North` (`Roma Tomato`, 15 plants), `G2 Commercial Bed A` (`Cherry Belle`, 10 plants), `G3 Raised Beds B` (`San Marzano`, 10 plants), `G4 Drip Plot C` (`Beefsteak`, 24 plants), `G5 Harvest Bed` (`Roma Tomato`, 10 plants), `G6 Open Field` (`0` plants, ready bed)
- **Soil pH:** `6.0 – 6.8`
- **Soil Moisture:** `58% – 72%`
- **Soil EC:** `0.8 – 2.5 mS/cm`
- **Soil Temperature:** `18 – 29 °C`

---

## Farmer UI Workflow

| Section | Route(s) | Purpose |
|---|---|---|
| **Today** | `/` | Unified morning summary synced with live MongoDB cycles, alerts, prescriptions, and unit economics. |
| **Plan** | `/plan` | Automated `07:00 AM` rover schedule, Recharts 7-day precision drip vs. blanket comparison, N-aware fertigation list, and growth milestones. |
| **Rover** | `/rover`, `/rover/history` | Interactive 3D CAD land plots (`SoilCad3D`) + `2D Map` with filter pills, live plant inspection modal, time-series trends, and past check cards. |
| **Health** | `/crop`, `/guide` | **Rover Vision Gallery** (searchable grid with toggleable AI boxes) + **Mulder's Chart Disease & Tank-Mix Guide**. |
| **Crops** | `/cycles`, `/cycles/:id/tomato` | Active tomato cycles (`G1–G6`), cultivars, plant counts, stage tasks, fruit sizing, and COP budget progress. |
| **Finance** | `/finance`, `/cop`, `/harvest` | **Interactive Excel Calculator** saved to MongoDB (`GET/PUT/POST-reset /api/v1/finance/spreadsheet`), COGS ledger, Margin KPIs, Block Breakdown, and Harvest/Sales logging. |
| **Farm** | `/beds`, `/stock`, `/equipment`, `/devices`, `/settings` | `G1–G6` bed management, editable soil profiles (`PUT /api/v1/zones/{zone}/profile`), input stock ledger, equipment assets, field devices, and economic settings. |

---

## Live-Telemetry Care Logic

1. **`evaluateAgronomyAction` (`apps/web/src/utils/agronomyEngine.ts`):**
   - Evaluates live probe `N`, `P`, `K`, `pH`, `EC`, `Moisture`, `Soil Temp` and AI findings for Mulder antagonisms (`Low K`, `High K`, `High P`, `Optimal/High N`, `Calcium vs. Sulfate/Phosphate Tank-Mix Safety`).
2. **`calculatePrescription` (`apps/web/src/utils/prescriptionCalculator.ts`):**
   - Computes exact nutrient grams/plant, moisture deficit drip pulses, canopy-scaled foliar volumes (`100 / 140 / 180 mL/plant`), and block batch tank-mix totals.
3. **4-Block Fast-Focus Cards (`FastFocusCard.tsx`):**
   - **⚡ `DO THIS NOW`**, **🚫 `DO NOT MIX / AVOID`**, **🎯 `EXPECTED RESULT`**, and **🔬 `WHY`**.

---

## Unit Economics & Excel Ledger

Default `/finance` spreadsheet baseline (`69` plants, `4,080 ៛/$`, persisted in `finance_workbooks` inside MongoDB):
- **COGS:** `$56.58` total (`$0.82 / plant` vs. `$1.15` traditional baseline — **29% saved**)
- **Projected Revenue:** `$248.40` (`310.5 kg @ $0.80/kg` — `$3.60 / plant`)
- **Net Profit & Margin:** `$191.82` (`77.2%` margin) + `$25.20` risk value protected across caught `Health` alerts
- Farmers can edit any blue input cell (`Plant Count`, `Cycle Days`, `Exchange Rate`, `AgriRover Qty`, `Std Qty`, `Unit Rate`, `Yield`, `Price`) and click **`Save to Database`** or **`Reset to Sample Farm`**.

---

## Safety Hierarchy

Lower firmware/hardware layers override higher-level server advisories:
- **Motor-controller firmware** (`edge/rover-motor-controller`): bounded burst & timeout interlocks
- **Rover edge agent** (`edge/rover-agent`): speed/distance step bounds, e-stop & battery guards
- **ESP8266 field node** (`edge/esp8266-field-node`): relay hardware timeout (`MAX_RUN_MS`)
- **FastAPI + Human Farmer** (`apps/api`, `apps/web`): validated MQTT ingestion & human-verified schedules

---

## Run with Docker

See [BACKEND-DOCKER-GUIDE.md](BACKEND-DOCKER-GUIDE.md) and [SCHEMA.md](SCHEMA.md) for full details.

```powershell
Copy-Item .env.example .env
docker compose --profile sim up -d
```

| URL | Service |
|---|---|
| `http://localhost:5173` | AgriRover Farmer Web App (`apps/web`) |
| `http://localhost:8000/docs` | FastAPI OpenAPI / Swagger UI (`apps/api`) |
| `http://localhost:8000/health` | API Healthcheck (`{"status": "ok", "db": "mongodb", "zones": 6}`) |
