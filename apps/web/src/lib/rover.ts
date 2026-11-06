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

/** Degrees the rover faces on arriving at step i: 0 along the row, -90 towards the next row. It starts facing along row 1. */
export function headingAt(path: [number, number][], i: number): number {
  if (i <= 0 || i >= path.length) return 0;
  const [r0, c0] = path[i - 1], [r1, c1] = path[i];
  if (r1 !== r0) return -90;
  return c1 > c0 ? 0 : 180;
}

/** Distance and time on a real rover: its moves, turns, photos and probe stops. */
export function estimate(rows: number, cols: number, rowM: number, treeM: number) {
  const path = serpentine(rows, cols);
  let distanceM = 0, turns = 0;
  for (let i = 1; i < path.length; i++) {
    distanceM += path[i][0] !== path[i - 1][0] ? rowM : treeM;
    const before = i === 1 ? 0 : headingAt(path, i - 1);
    const delta = Math.abs(headingAt(path, i) - before);
    turns += Math.min(delta, 360 - delta);
  }
  return {
    trees: path.length, distanceM, areaM2: rows * cols * rowM * treeM,
    seconds: distanceM / ROVER.cruiseMps + turns / ROVER.turnDps + path.length * (ROVER.photoS + ROVER.probeS),
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
