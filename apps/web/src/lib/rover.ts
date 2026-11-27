import type { Advice, Cycle, RoverCell } from "./api";

/** The rover's limits, from edge/rover-agent/rover/config.py. probeS is an estimate until the probe arm is built. */
export const ROVER = { cruiseMps: 0.2, turnDps: 45, photoS: 1, probeS: 40, batteryStopV: 11.1, maxTrees: 400, simSpeedup: 40 } as const;

/** Every tree once: along row 1, across, back along row 2. The same path as rover/planner.py. */
export function serpentine(rows: number, cols: number): [number, number][] {
  const path: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) path.push([r, r % 2 === 0 ? i : cols - 1 - i]);
  }
  return path;
}

/** Where the round starts: s = row 1, n = the last row; w = tree 1, e = the last tree. The same names as rover/planner.py. */
export type Corner = "sw" | "se" | "nw" | "ne";
/** Lanes along each row (tree to tree), or across the rows (row to row, the same tree number). */
export type Along = "rows" | "across";
export type Route = { start: Corner; along: Along };
export const CORNERS: Corner[] = ["sw", "se", "nw", "ne"];
export const DEFAULT_ROUTE: Route = { start: "sw", along: "rows" };
export const isRoute = (x: unknown): x is Route =>
  typeof x === "object" && x !== null && CORNERS.includes((x as Route).start) && ((x as Route).along === "rows" || (x as Route).along === "across");

/** Every tree once, serpentine, from the start corner, in lanes along the rows or across them. The same path as rover/planner.py route(). */
export function route(rows: number, cols: number, r: Route = DEFAULT_ROUTE): [number, number][] {
  const base = r.along === "rows" ? serpentine(rows, cols) : serpentine(cols, rows).map(([a, b]) => [b, a] as [number, number]);
  const flipRow = r.start[0] === "n", flipCol = r.start[1] === "e";
  return base.map(([row, col]) => [flipRow ? rows - 1 - row : row, flipCol ? cols - 1 - col : col]);
}

export const spotKey = (row: number, col: number) => `${row},${col}`;

/** The part of the route from its first plant to its last: the rover drives all of it, through the empty spots between,
 *  and stops at the plants only. The same as through_stops() in rover/planner.py. Empty when no plant is on the route. */
export function throughStops(path: [number, number][], plants: Set<string>): [number, number][] {
  const at = path.flatMap(([r, c], i) => (plants.has(spotKey(r, c)) ? [i] : []));
  return at.length ? path.slice(at[0], at[at.length - 1] + 1) : [];
}

/** The corner tree a start corner names, as [row, col] from 0. */
export const cornerCell = (rows: number, cols: number, c: Corner): [number, number] => [c[0] === "n" ? rows - 1 : 0, c[1] === "e" ? cols - 1 : 0];

/** Screen degrees for a step: 0 towards the last tree, 180 towards tree 1, -90 towards the last row (up the map), 90 towards row 1. */
function stepHeading(a: [number, number], b: [number, number]): number {
  if (b[0] !== a[0]) return b[0] > a[0] ? -90 : 90;
  return b[1] > a[1] ? 0 : 180;
}

/** Degrees the rover faces on arriving at step i. On the start tree it faces its second stop, as the person placed it. */
export function headingAt(path: [number, number][], i: number): number {
  if (path.length < 2 || i < 0 || i >= path.length) return 0;
  return i === 0 ? stepHeading(path[0], path[1]) : stepHeading(path[i - 1], path[i]);
}

/** Distance and time on a real rover: its moves, turns, photos and probe stops. With `plants`, only through them. */
export function estimate(rows: number, cols: number, rowM: number, treeM: number, r: Route = DEFAULT_ROUTE, plants?: Set<string>) {
  const full = route(rows, cols, r);
  const path = plants ? throughStops(full, plants) : full;
  const stops = plants ? path.filter(([a, b]) => plants.has(spotKey(a, b))).length : path.length;
  let distanceM = 0, turns = 0;
  for (let i = 1; i < path.length; i++) {
    distanceM += path[i][0] !== path[i - 1][0] ? rowM : treeM;
    const before = headingAt(path, i - 1);
    const delta = Math.abs(headingAt(path, i) - before);
    turns += Math.min(delta, 360 - delta);
  }
  return {
    trees: stops, distanceM, areaM2: rows * cols * rowM * treeM,
    seconds: distanceM / ROVER.cruiseMps + turns / ROVER.turnDps + stops * (ROVER.photoS + ROVER.probeS),
  };
}

export type RoundSlot = { zone: string; label: string; start: string; stops: number; metres: number; seconds: number; doneAt: string | null; partial: boolean };

/** The day's rounds, block after block from the start time, on a real rover's estimated times. Driving between blocks is not counted. */
export function roundPlan(cycles: Cycle[], start: string, advice: Advice[], today: string): RoundSlot[] {
  const [h, m] = start.split(":").map(Number);
  let at = h * 60 + m;
  const byZone = new Map(advice.map((a) => [a.zone, a]));
  const out: RoundSlot[] = [];
  for (const c of cycles) {
    if (!c.grid) continue;
    const est = estimate(c.grid.rows, c.grid.cols, c.grid.rowM, c.grid.treeM);
    const a = byZone.get(c.zone);
    const doneToday = a?.surveyedAt && new Date(a.surveyedAt).toLocaleDateString("sv-SE") === today ? a.surveyedAt : null;
    out.push({ zone: c.zone, label: c.bedLabel, start: `${String(Math.floor(at / 60) % 24).padStart(2, "0")}:${String(Math.round(at % 60)).padStart(2, "0")}`,
               stops: est.trees, metres: est.distanceM, seconds: est.seconds, doneAt: doneToday, partial: Boolean(a?.partial && doneToday) });
    at += est.seconds / 60;
  }
  return out;
}

export const minutes = (seconds: number) => (seconds < 90 ? `${Math.round(seconds)} s` : seconds < 5400 ? `${(seconds / 60).toFixed(0)} min` : `${(seconds / 3600).toFixed(1)} h`);

export type CellKind = "pending" | "bare" | "ok" | "water";
export const kindOf = (c?: RoverCell): CellKind => (!c ? "pending" : !c.plant ? "bare" : (c.advice?.litres ?? 0) > 0 ? "water" : "ok");

export const STATUS_WORD: Record<string, [string | undefined, string]> = {
  queued: ["wip", "Waiting for rover"], running: ["info", "On its round"], completed: ["ok", "Completed"],
  aborted: ["warn", "Stopped"], failed: ["alert", "Failed"], rejected: ["warn", "Refused"], lost: ["alert", "Rover lost"],
};

/** Why the rover stopped, and what the operator does next. Every reason the rover software can give. */
export const STOPS: { key: string; label: string; does: string; next: string }[] = [
  { key: "estop", label: "E-stop", does: "Stops before its next move.", next: "Check the block. Release, then start again." },
  { key: "rain", label: "Rain", does: "Stops. Wet soil compacts and the electronics must stay dry.", next: "Move it under cover. Run the round when the soil has drained." },
  { key: "battery_low", label: "Low battery", does: `Stops below ${ROVER.batteryStopV} V, before deep discharge.`, next: "Charge fully, then run the round again." },
  { key: "link_lost", label: "Lost link", does: "Stops when it cannot reach the farm server.", next: "Check the Wi-Fi and the server. Fetch the report from the rover if needed." },
  { key: "geofence", label: "Edge of block", does: "Refuses any move that leaves the block.", next: "Check the start tree and the rows and spacing." },
  { key: "controller_bumper", label: "Bumper hit", does: "Motors cut at once, in the firmware.", next: "Clear the obstacle. Check the rover for damage." },
  { key: "controller_timeout", label: "Motor controller silent", does: "Stops. The firmware also stops by itself.", next: "Check the USB cable and the controller." },
];

export function stopInfo(reason: string | null | undefined) {
  if (!reason) return null;
  const key = reason === "controller_nak:bumper" ? "controller_bumper" : reason;
  return STOPS.find((s) => s.key === key) ?? { key: reason, label: reason.replace(/[_:]/g, " "), does: "", next: "Check the rover log before running it again." };
}

export const litresOf = (cells: RoverCell[]) => cells.reduce((s, c) => s + (c.advice?.litres ?? 0), 0);
export const fullLitresOf = (cells: RoverCell[]) => cells.reduce((s, c) => s + (c.advice?.fullLitres ?? 0), 0);
export const cellName = (row: number, col: number) => `R${row + 1} T${col + 1}`;
