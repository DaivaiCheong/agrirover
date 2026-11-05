import type { RoverCell } from "./api";

/** The rover's limits, from edge/rover-agent/rover/config.py. They give the real-time estimate on screen. */
export const ROVER = { cruiseMps: 0.2, turnDps: 45, photoS: 1, batteryStopV: 11.1, maxCells: 400, simSpeedup: 10 } as const;

/** Every cell once: along row 1, one step over, back along row 2. The same path as rover/planner.py. */
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

/** Distance and time on a real rover: the sum of its moves, turns and photos. Matches the rover's own report. */
export function estimate(rows: number, cols: number, cellM: number) {
  const path = serpentine(rows, cols);
  const distanceM = (path.length - 1) * cellM;
  let turns = 0;
  for (let i = 1; i < path.length; i++) {
    const before = i === 1 ? 0 : headingAt(path, i - 1);
    const delta = Math.abs(headingAt(path, i) - before);
    turns += Math.min(delta, 360 - delta);
  }
  return {
    cells: path.length, areaM2: rows * cols * cellM * cellM, distanceM,
    seconds: distanceM / ROVER.cruiseMps + turns / ROVER.turnDps + path.length * ROVER.photoS,
  };
}

export const minutes = (seconds: number) => (seconds < 90 ? `${Math.round(seconds)} s` : `${(seconds / 60).toFixed(1)} min`);

export type CellKind = "pending" | "bare" | "ok" | "water";
export const kindOf = (c?: RoverCell): CellKind => (!c ? "pending" : !c.plant ? "bare" : c.needs_water ? "water" : "ok");

export const STATUS_WORD: Record<string, [string | undefined, string]> = {
  queued: ["wip", "Waiting for rover"], running: ["info", "Surveying"], completed: ["ok", "Completed"],
  aborted: ["warn", "Stopped"], failed: ["alert", "Failed"], rejected: ["warn", "Refused"], lost: ["alert", "Rover lost"],
};

/** Why the rover stopped, and what the operator does next. Every reason the rover software can give. */
export const STOPS: { key: string; label: string; does: string; next: string }[] = [
  { key: "estop", label: "E-stop", does: "Stops before its next move.", next: "Check the bed. Release, then start again." },
  { key: "rain", label: "Rain", does: "Stops. Wet soil compacts and the electronics must stay dry.", next: "Move it under cover. Survey when the soil has drained." },
  { key: "battery_low", label: "Low battery", does: `Stops below ${ROVER.batteryStopV} V, before deep discharge.`, next: "Charge fully, then survey the bed again." },
  { key: "link_lost", label: "Lost link", does: "Stops when it cannot reach the farm server.", next: "Check the Wi-Fi and the server. Fetch the report from the rover if needed." },
  { key: "geofence", label: "Edge of bed", does: "Refuses any move that leaves the bed.", next: "Check the start corner and the grid size." },
  { key: "controller_bumper", label: "Bumper hit", does: "Motors cut at once, in the firmware.", next: "Clear the obstacle. Check the rover for damage." },
  { key: "controller_timeout", label: "Motor controller silent", does: "Stops. The firmware also stops by itself.", next: "Check the USB cable and the controller." },
];

export function stopInfo(reason: string | null | undefined) {
  if (!reason) return null;
  const key = reason === "controller_nak:bumper" ? "controller_bumper" : reason;
  return STOPS.find((s) => s.key === key) ?? { key: reason, label: reason.replace(/[_:]/g, " "), does: "", next: "Check the rover log before running it again." };
}

/** Cells someone should go and look at, in the order the rover found them. */
export function toCheck(cells: RoverCell[]) {
  return cells.filter((c) => c.needs_water || c.flagged);
}

export const litresToWater = (cells: RoverCell[]) => cells.reduce((s, c) => s + (c.needs_water ? c.suggested_ml ?? 0 : 0), 0) / 1000;
export const cellName = (row: number, col: number) => `R${row + 1} C${col + 1}`;
