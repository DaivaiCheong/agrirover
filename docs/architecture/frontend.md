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
| `/rover` | Field log: what needs the farmer, the next round, the block map, the soil log, the plant log, the rounds | `GET /missions/live`, `GET /missions`, `GET /missions/{id}`, `POST /missions`, `GET /cycles`, `GET /zones`, `GET /plant-maps`, `GET /inspections/{zone}`; the logs are kept in this browser (see known gaps) |
| `/rover/setup` | Setup, done once per block: plant map, route, camera, photo of every tree | `PUT /plant-maps/{zone}`, `POST /plant-maps` (the route and camera are kept in this browser, as before) |
| `/rover/advice` | Advice (the agronomist's report) | Simulated rounds today; `GET /rounds/{id}/advice` when built |
| `/rover/round` | Round: a replay of a round, stop by stop | Simulated rounds today. The live view (`GET /missions/live`) comes with the rover's live telemetry; it is not built |
| `/rover/plants` | Plants (one record per plant) | Simulated rounds today; `GET /plants/{id}/history` when built |
| `/rover/about`, `/growth`, `/sop`, `/history`, `/test` | Older rover tabs | Unchanged |
| `/crop` and the other health and farm pages | Health, Crops, Finance, Farm | Unchanged by the rover work |

The section's tab bar holds the rover tabs in this order: Field log, Advice, Round, Plants, Setup, What it does, Growth, SOP, History, Test.

### The Field log, as a farmer uses it

The Field log exists so the farmer does not have to check every tree. The rover checks them all; the farmer looks only at what the rover flags, and writes down what they find.

| Part | What the farmer does there |
|---|---|
| Known condition, Need you, Soil readings, Last round | Reads the block's state at a glance. Each number appears once |
| Needs you | Opens the flagged trees, or walks them one at a time (Field walk: Confirmed a problem, Not a problem, Fixed it, or Add details) |
| Next round | Sees what is ready, ticks the three checks by eye, and starts a round. A missing check says why it cannot start |
| Block map | Taps any tree to open its record: the rover's readings and photo check, and what the farmer logged for it |
| Soil log | Logs a hand-meter reading for the block or one tree. The rover's soil for each round is shown beside it |
| Plant log | Logs what the farmer sees on a tree, what they decided, and what they did |
| Rounds | Sees the last five rounds: when, the result, spots checked and flagged |

A spot where the rover saw no tree is known too: it shows as "No tree seen" and is counted in Known condition.

The farmer's answers leave the Needs you list at once, and the next round checks the tree again.

## The top bar (every rover tab)

One strip above the tabs, present on every rover tab:

- the rover's state chip: **Docked**, **Scouting** (with progress when a round runs elsewhere), or **Stopped** with the reason;
- the battery, as a percentage, with its voltage in the tooltip (never a voltage as a percentage on its own);
- the **E-stop**, a red button on a yellow collar: one press stops; once engaged it becomes **Release**, which asks for a 1.5 s hold.

It reads `GET /missions/live` every 2 s and calls `POST /missions/estop`. It does not hold rover state of its own.

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
| The farmer's soil readings and plant entries (Field log) are kept in this browser, in `fieldlog/store.ts` | Rule 3: farm data in the browser | Planned endpoints in backend.md ("Field log"). Until they exist the log is per device and is lost if the browser's storage is cleared |
| "Which trees need you" is worked out in the browser (`fieldlog/model.ts`, `lookItems`) | Rule 3: decisions in the browser | Planned `GET /rounds/{id}/needs-you`, next to the round advice |
