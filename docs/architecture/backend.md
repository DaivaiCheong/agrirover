# Backend: the farm server (design)

**Status: design, 2026-11-27.** The code in `apps/api` is built and tested. The parts marked *planned* are not built and need no code until the owner says so.

Part 2 of three (see [WORKFLOW.md](../WORKFLOW.md#three-parts-one-contract)). The frontend and the rover never call each other; they only reach the backend's two contracts below.

## Job

The backend is the farm's memory and its decision-maker:

- keeps every farm record in PostgreSQL (blocks, cycles, rounds, readings, photos, costs);
- decides the advice: water, feed, trees to look at, and what to do with a rover finding;
- sends the rover its orders (missions, e-stop) and takes back its state and reports;
- asks the photo model about a leaf photo, and keeps the answer with the tree's readings;
- sends the daily Telegram message.

It does **not** drive a motor, run a path, or draw a screen.

## Layout

| Folder | What lives there | Rule |
|---|---|---|
| `app/main.py` | Wires routers and the MQTT worker together | No business rules here |
| `app/routers/` | One file per area: HTTP in, HTTP out | Thin: validate, call a service, return. No rules inside |
| `app/services/` | The rules and the calculations (advice, rule engine, photo check, cost, schedule) | Pure where possible: no I/O, so it can be tested without a database. The few that read the database say so in their docstring |
| `app/models/entities.py` | The tables | The only place tables are defined; changes come with a migration |
| `app/schemas/` | Request and response shapes that need validation beyond the router | |
| `app/workers/` | `mqtt_ingest.py` (rover, sensors, valves), `telegram_worker.py` (the daily message) | Workers call services, never routers |
| `app/core/` | Settings, database session, security helpers | |
| `alembic/versions/` | Database migrations, one per change, numbered | Never edit an applied migration |
| `tests/` | Pytest. Pure services need no database; database tests skip unless the compose `db` is running | |

## Contract A: the API

HTTP and JSON under **`/api/v1`**. The interactive list is at `http://localhost:8000/docs`. The frontend calls it only through `apps/web/src/lib/api.ts`.

| Area | Router | Main endpoints |
|---|---|---|
| Rover | `missions.py` | `POST /missions` (send a round, 202), `GET /missions/live`, `GET /missions/live/frames/{row}/{col}`, `GET /missions/{id}`, `POST /missions/estop` |
| Rover test | `rover_test.py` | `GET /rover/test`, `POST /rover/test/move`, `POST /rover/test/stop`, `GET /rover/test/photo` |
| Advice | `advice.py` | `GET /advice`, `GET /advice/{zone}/growth`, `GET /schedule` |
| Photos | `photos.py` | `POST /photos/check`, `GET /photos`, `PUT /photos/{id}/confirm`, `GET /photos/{id}/image`, `GET /photos/tree` |
| Plant maps | `plant_maps.py` | `GET /plant-maps`, `PUT /plant-maps/{zone}`, `POST /plant-maps` |
| Blocks and farm | `zones.py`, `farm.py`, `setups.py`, `cycles.py` | `GET /zones`, `GET /farm/settings`, `GET /setups`, `GET/POST /cycles`, `GET /cycles/{id}/orchard` |
| Sensors and devices | `telemetry.py`, `conditions.py`, `devices.py`, `irrigation.py` | `/telemetry`, `/conditions`, `/devices`, `POST /zones/{zone}/irrigation` |
| Health | `leaf_tests.py`, `diagnosis.py`, `inspections.py` | `/leaf-tests`, `/diagnosis`, `/inspections` |
| Money | `costs.py`, `reports.py` | `/costs`, sales and harvests under `/cycles/{id}/...`, `/reports/compare`, CSV exports |
| Plan and today | `decisions.py`, `auth.py`, `assistant.py` | `GET /today` (decisions), `POST /auth/login` (a stub), `POST /assistant/chat` (answers 501 today) |

**Rules for the contract**

1. **Shapes change in this doc first.** Add or change an endpoint here, then build it, then update `lib/api.ts`.
2. **Additive by default.** A new field is fine; removing or renaming one needs a new version (`/api/v2`) and both versions running until the frontend moves.
3. **Errors** are `{"detail": "..."}`. The codes in use today: `409` the rover cannot take the order (already on a round, e-stopped, offline), `422` bad input, `503` the broker or a device is not reachable, `501` a feature not wired yet. The message says what happened and what to do next.
4. **Simulated data is labelled.** Every round, reading and photo from a simulator carries `simulated: true`, and the frontend shows it.
5. **No secrets in responses.** Keys and passwords come from `.env`, never from an endpoint.

**Login.** `POST /auth/login` is a stub with a `TODO` in `app/routers/auth.py`: it does not check a password, and no endpoint requires a token. Anyone who can reach the server can start the rover. This is listed in [WORKFLOW.md](../WORKFLOW.md#safety-who-can-stop-what). It must be fixed before the rover runs unattended.

### Planned for the Rover page (not built)

The Rover page's advice cards, field map and plant records are computed in the browser today (see the known gaps in WORKFLOW.md). When they move here, the backend gets:

| Endpoint | Returns | Source |
|---|---|---|
| `GET /rounds?block=` | The block's rounds, newest first: time, coverage, outcome, seed or source | `survey_mission` (already stored) |
| `GET /rounds/{id}/advice` | At most five cards, then the "can wait" list, the value line and each plant's status | The advice rules, as a pure service with snapshot tests |
| `GET /plants/{id}/history` | One record per plant: every round's soil reading, photo findings, actions and outcomes | `survey_finding`, `plant_photo`, action records |
| `POST /rounds/{id}/cards/{cardKey}/response` | Done, Later or Wrong, with the one answer for Wrong | A new `advice_response` table |

### Planned for the Field log (not built)

The Field log keeps the farmer's entries in the browser until these exist. Each one is a new table with one writer: the backend.

| Endpoint | Body or returns | Stored in (new table) |
|---|---|---|
| `POST /blocks/{zone}/soil-readings` | `{at, tree?: [row, col], moisture?, ec?, ph?, meter: "hand" \| "other", note?}`; at least one value | `farmer_soil_reading` |
| `GET /blocks/{zone}/soil-readings?limit=` | The block's readings, newest first | `farmer_soil_reading` |
| `POST /blocks/{zone}/trees/{row}/{col}/observations` | `{at, result: "confirmed" \| "notIt" \| "fixed" \| "checking", seen?, roverSaw?, did?, note?}` | `tree_observation` |
| `GET /blocks/{zone}/trees/{row}/{col}/observations` | The tree's entries, newest first | `tree_observation` |
| `GET /rounds/{id}/needs-you` | The trees of the round that need the farmer, most urgent first, with the rover's words and photo id; trees with an observation after the round are left out | Computed from `survey_finding` and the photo check; no table |

These use `recorded_by` on each row, like the other farmer tables, so login can be added later without a rewrite. `field_observation` is not used: it holds labour minutes and losses for the management reports, not trees.

The card shape is the one in `apps/web/src/features/rover/sim/advice.ts` (`AdviceCard`). That type becomes the contract, and the frontend copies it into `lib/api.ts` when the endpoint exists.

## Contract B: MQTT (rover and camera)

The backend subscribes and publishes on the topics in [rover-esp32.md](rover-esp32.md#mqtt-topics). Those are the only rover-facing topics; the backend never sends a motor frame.

**Backend subscribes** (`app/workers/mqtt_ingest.py`):

| Topic | Stores or does |
|---|---|
| `farm/<farm>/zone/<zone>/telemetry` | Sensor readings into `sensor_reading` |
| `farm/<farm>/zone/<zone>/valve/state` | Valve state, logged by the ingest worker |
| `devices/rover-01/status`, `devices/rover-01/brain/status` | Rover online or offline, so the top bar can say which |
| `devices/rover-01/mission/state` | Live round for `GET /missions/live` (kept in memory) |
| `devices/rover-01/mission/result` | Stored round (`survey_mission`, `survey_finding`) |
| `devices/rover-01/drive/evt` | Logged; the frontend does not read it |
| `devices/rover-cam-01/status` | Camera online or offline |

**Backend publishes:**

| Topic | When | Retained |
|---|---|---|
| `devices/rover-01/mission/set` | `POST /missions`, after the backend's own checks pass | no |
| `devices/rover-01/estop` | `POST /missions/estop` | **yes**, so a rebooted rover comes up stopped |

**Planned on contract B:** the photo upload endpoint (`POST /rover/photos`) that the ESP32-CAM posts to, and the `devices/rover-cam-01/snap` command with the mission id and the plant.

## Data ownership

Each table has exactly one writer. The full table list and columns are in [SCHEMA.md](../SCHEMA.md).

| Writer | Tables |
|---|---|
| Backend, from the rover's reports | `survey_mission`, `survey_finding`, `plant_photo` (from the rover's upload) |
| Backend, from sensors and devices | `device`, `sensor`, `sensor_reading`, `irrigation_event` |
| Backend, from people (through the API) | `zone`, `cycle` settings (`planting`, `crop_profile`), `cost_entry`, `sale`, `harvest`, `leaf_sample`, `leaf_result`, `plant_map`, `farm_setting` |
| Backend, from the rules | `daily_decision`, `action_proposal` (advice is computed on read today, not stored) |

The frontend never writes a table; it only asks an endpoint to.

## Decisions the backend makes

| Decision | Where | Can the rover override it? |
|---|---|---|
| Litres per tree, feed, flush, trees to look at | `services/advisor.py` | No |
| Whether a valve may open (rain, daylight, moisture, cooldown) | `services/rule_engine.py` | No: the firmware limit still applies on the device |
| Whether a round may start: the rover is online, not on a round, not e-stopped | `routers/missions.py` (refuses with `409`) | No |
| Whether a round may start in rain or on a low battery | **Not in the backend yet.** The Rover page checks both; the rover's own guards stop it on the device | See known gaps |
| Whether a leaf photo is a problem | `services/disease.py`: triage only, never a diagnosis | No |

The rover's own guards (battery, rain, link, e-stop) are checked again on the rover, so a round that starts is still stopped by the rover if conditions change.

## Tests and how to run

| What | Command | Needs |
|---|---|---|
| All backend tests | `python -m pytest` in `apps/api` | Nothing for the pure services; the database tests need the compose `db` running |
| A pure service | `python -m pytest tests/test_advisor.py` | Nothing |
| Contract B wiring | `tests/test_missions_and_ingest.py`, `tests/test_rover_live.py` | Nothing: they use fake brokers |
| Photo prompts | `scripts/eval_photo_check.py` | Ollama, and labelled photos |

**Acceptance for a change to the backend:** the pure service it touches has a test; any new endpoint is listed in the table above; any new topic is listed in rover-esp32.md; any new table has a migration and is listed in SCHEMA.md.

## Known gaps

| Gap | Fix |
|---|---|
| Login is a stub and nothing requires a token | Add auth before unattended runs (WORKFLOW.md safety section) |
| Rain and battery are checked only by the Rover page and the rover, not by the backend's round start | Add both checks to `POST /missions`, with the same `409` |
| The rover's advice and rounds for the Rover page are in the browser | Planned endpoints above |
| The Telegram message uses the older rule engine | Move to the round advice once it exists |
| The rover planner runs in `edge/rover-agent` on a PC, not on the server yet | Part of [rover-esp32.md](rover-esp32.md): rover-brain |
