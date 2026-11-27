# Frontend: the dashboard (design)

**Status: design, 2026-11-27.** Part 1 of three (see [WORKFLOW.md](../WORKFLOW.md#three-parts-one-contract)). The screens in `apps/web` are built. The gaps are listed at the end and in WORKFLOW.md.

## Job

The frontend shows the farm and takes the farmer's actions. It answers three questions on each screen: what is happening, what to do, and what it is based on. It never decides an amount itself.

## Rules

1. **One door to the backend.** Only `apps/web/src/lib/api.ts` calls `fetch`. Every screen gets its data through a function there.
2. **No MQTT, no rover address.** The browser never talks to the broker or the rover. Rover state comes from `GET /missions/live` and the rover's status, through the backend.
3. **View state only.** Open tab, the block picked, the tree picked, which card is open. Farm data is never kept in the browser as the source of truth. A preference (such as "show the layers") may live in `localStorage`.
4. **Show decisions, do not make them.** Water litres, feed doses, what needs a look: the backend decides them and the screen shows them with their evidence. A screen may count, sort and group what the backend sent (for example "3 things to do"); it may not turn a reading into an amount.
5. **Simulated data is labelled.** A simulated round, reading or photo carries a visible "Simulated" or "sim" tag. Nothing that is simulated looks real.
6. **Each screen is one folder or one file.** New rover screens go in `features/rover/ui/`. A screen has its own styles, scoped to its own class (for the Rover page: `.rv2`), so no other page changes.
7. **Shared design tokens only in `styles/theme.css`.** A change there changes every page; a change in a screen's own CSS changes only that screen.
8. **Safety controls never move.** The E-stop stays in the same place on every tab of its section and works with the keyboard.

## Layout

| Folder | What lives there |
|---|---|
| `src/main.tsx`, `src/App.tsx` | Entry point and the route table. Each section wraps its pages in `Section` |
| `src/components/Shell.tsx` | The sidebar and the `SECTIONS` table: each section's title and tabs |
| `src/components/Section.tsx` | A section's heading, its tab bar, and any section-wide controls (the rover top bar) |
| `src/components/` | Shared pieces: `ui.tsx` (panels, tags, notices, toolbar), `Farm3D.tsx` (the 3D block), `RoverMap.tsx`, `SafeStop.tsx`, `PlantCard.tsx` |
| `src/pages/` | One file per screen. A page calls `lib/api.ts`, shows the result, and passes actions back |
| `src/lib/` | `api.ts` (the one door), `format.ts`, `usePoll.ts`, `useData.ts`, and pure helpers with tests (`today.ts`, `problems.ts`, `rover.ts`) |
| `src/features/rover/` | The Rover page's own code (see below) |
| `src/styles/theme.css` | Shared tokens and base styles |

### The Rover feature

| Folder | Status | What it is |
|---|---|---|
| `features/rover/ui/` | **Target home for screens** | `AdviceView`, `PlantsView`, `RoundView`, `AdviceCard`, `WhyPanel`, `FieldMap`, `RoverBar`, `rover.css` |
| `features/rover/store.ts` | Interim | Keeps simulated rounds and Done / Later / Wrong answers in `localStorage` until the backend owns them |
| `features/rover/sim/` | **Interim, to move out** | A physics twin, the advice rules, the plant and camera models. It runs in the browser today. It belongs in a rover-side simulator and in the backend, and is listed as a known gap in WORKFLOW.md |

`features/rover/sim/` is kept out of the screens: `ui/` imports only types, the advice function, and the battery's charge curve (`roverState.ts`) from it. The move later touches those few imports, not the screens.

## Routes

| Path | Screen | Data |
|---|---|---|
| `/` | Today | `GET /today`, `GET /advice` |
| `/plan` | Plan | `GET /schedule` |
| `/rover` | Soil: every plant in a table with its soil values; start a round; set the block's soil | `GET /conditions`, `GET /missions`, `GET /missions/{id}`, `GET /missions/live`, `POST /missions`, `GET /plant-maps`, `GET /cycles`, `GET /zones`; the farmer's values are kept in this browser |
| `/rover/history` | History: one plant, one row a day (the day's last round and what the farmer logged); all rounds below | `GET /missions`, `GET /missions/{id}` for up to 30 days, `GET /conditions` |
| `/rover/setup` | Setup, done once per block: plant map, route, camera, photo of every tree | `PUT /plant-maps/{zone}`, `POST /plant-maps` (the route and camera are kept in this browser, as before) |
| `/rover/advice` | Advice (the agronomist's report) | Simulated rounds today; `GET /rounds/{id}/advice` when built |
| `/rover/round` | Round: a replay of a round, stop by stop | Simulated rounds today. The live view (`GET /missions/live`) comes with the rover's live telemetry; it is not built |
| `/rover/plants` | Plants (one record per plant) | Simulated rounds today; `GET /plants/{id}/history` when built |
| `/rover/about`, `/growth`, `/sop`, `/test` | Older rover tabs | Unchanged |
| `/crop` and the other health and farm pages | Health, Crops, Finance, Farm | Unchanged by the rover work |

The section's tab bar holds the rover tabs in this order: Soil, History, Setup, Advice, Round, Plants, What it does, Growth, SOP, Test.

### The Soil table

One row a plant. The columns are the five soil parameters: soil pH, texture, rooting depth and drainage, organic matter, and essential nutrients (N, P, K, Ca, Mg).

| Value | Where it comes from |
|---|---|
| pH, N, P, K (also moisture and EC, in the plant's record and History) | The rover's probe, from the last round. N, P and K show the trend only, never a dose |
| Texture, root depth, drainage, organic matter, Ca, Mg | The farmer or a lab test, for the whole block (grey italics) or one plant (marked "you") |
| Targets | pH, moisture and EC from `GET /conditions` for the crop. For tomato only, also loam or sandy loam, root depth 60 cm or more, fast drainage (the farmer's guide, in `fieldlog/soil.ts`) |

A plant's newest own value wins (rover or farmer); a block value fills only what the plant has nothing of its own for. A value outside its target is marked Low, High or Check.

## Acceptance for a screen change

- The screen gets its data from `lib/api.ts` (or from `features/rover/store.ts` while that is interim) and nothing else.
- Every number on screen appears once per view, with a unit a farmer reads (litres, minutes, rows, "today").
- No persistent label is longer than three words; longer sentences go in a "Why" panel or a tooltip.
- Colour is never the only signal: each status has a word or an icon too.
- Touch targets are at least 44 px; text meets WCAG AA contrast.
- `npx tsc -b` passes; `npm test` passes; the screen was opened in the browser preview with no console errors.

## Known gaps

| Gap | Breaks | Target |
|---|---|---|
| The physics twin, advice rules and plant simulation run in `features/rover/sim/` | Rules 4, 5 | A rover-side simulator; advice in the backend |
| `lib/rover.ts` copies the rover's route planner | Rule 2 (duplicated logic) | The backend returns the route |
| Simulated rounds and feedback are stored in the browser | Rule 3 | The backend stores rounds and responses |
| The farmer's soil readings and plant entries (Soil tab) are kept in this browser, in `fieldlog/store.ts` | Rule 3: farm data in the browser | Planned endpoints in backend.md ("Field log"). Until they exist the log is per device and is lost if the browser's storage is cleared |
| "Which trees need you" is worked out in the browser (`fieldlog/model.ts`, `lookItems`) | Rule 3: decisions in the browser | Planned `GET /rounds/{id}/needs-you`, next to the round advice |
