// Replay of a simulated round, stop by stop. Pure: it only reads the round's own record and its advice; it drives nothing.
// `reached` is how many stops the rover has checked so far (0 … total).

import type { Advice, PlantStatus } from "../sim/advice";
import type { PlantId, RoundData } from "../sim/scout";

/** Stops per second of replay at each speed. A 97-stop round takes about 20 s at 10×. */
export const SPEEDS = [1, 10, 60] as const;
export type Speed = (typeof SPEEDS)[number];
export const STOPS_PER_SECOND: Record<Speed, number> = { 1: 0.5, 10: 5, 60: 30 };

export interface Replay {
  total: number;                             // stops in the round
  reached: number;                           // stops checked so far
  /** plants at the stop checked last, shown as "now" */ current: PlantId[];
  visited: Set<PlantId>;
  status: Record<PlantId, PlantStatus>;      // the advice's status for checked plants; "unchecked" for the rest
  seen: number;                              // checked plants with a photo
  looks: number;                             // checked plants the rover marked to look at
  waterL: number;                            // litres for checked plants, from the water cards
  signs: Record<PlantId, string[]>;          // what the camera saw, in words, for checked plants
}

export function stopTotal(round: RoundData): number {
  return round.plants.reduce((m, o) => Math.max(m, o.stop + 1), 0);
}

export function replayAt(round: RoundData, advice: Advice | null, reached: number, words: (sign: string) => string): Replay {
  const total = stopTotal(round);
  const n = Math.max(0, Math.min(total, Math.floor(reached)));
  const visited = new Set<PlantId>();
  const status: Record<PlantId, PlantStatus> = {};
  const signs: Record<PlantId, string[]> = {};
  let seen = 0;
  for (const o of round.plants) {
    status[o.id] = "unchecked";
    if (o.stop < n) {
      visited.add(o.id);
      status[o.id] = advice?.status[o.id] ?? "fine";
      signs[o.id] = o.signs.filter((s) => s.p >= 0.5).map((s) => words(s.sign));
      if (o.seen > 0) seen++;
    }
  }
  const looks = [...visited].filter((id) => status[id] === "look").length;
  let waterL = 0;
  for (const c of [...(advice?.cards ?? []), ...(advice?.canWait ?? [])]) {
    if (!c.amount || c.amount.hold) continue;
    for (const [id, l] of Object.entries(c.amount.perPlantL)) if (visited.has(id)) waterL += l;
  }
  const current = n === 0 ? [] : round.plants.filter((o) => o.stop === n - 1).map((o) => o.id);
  return { total, reached: n, current, visited, status, seen, looks, waterL, signs };
}
