// Each plant's soil: the five things that matter (pH, texture, rooting depth and drainage, organic matter, essential
// nutrients), where each value came from, how it compares to the crop's targets, and its day by day history.
// Pure: no React and no storage, so it can be tested.

import type { CondParam, RoverCell } from "../../../../lib/api";
import type { PlantEntry, Tree } from "./model";

export type Texture = "sand" | "loamySand" | "sandyLoam" | "loam" | "siltLoam" | "clayLoam" | "clay";
export const TEXTURE: Record<Texture, string> = {
  sand: "Sand", loamySand: "Loamy sand", sandyLoam: "Sandy loam", loam: "Loam", siltLoam: "Silt loam", clayLoam: "Clay loam", clay: "Clay",
};
export type Drainage = "fast" | "slow" | "pools";
export const DRAINAGE: Record<Drainage, string> = { fast: "Fast", slow: "Slow", pools: "Water pools" };

/** What can be known about the soil at a plant. The rover's probe measures pH, N, P, K, moisture and EC; the rest comes
 *  from the farmer or a lab test. */
export interface SoilValues {
  ph?: number; texture?: Texture; depthCm?: number; drainage?: Drainage; om?: number;
  n?: number; p?: number; k?: number; ca?: number; mg?: number; moisture?: number; ec?: number;
}
export type ParamKey = keyof SoilValues;

/** The columns of the plant table, in order. */
export const TABLE_KEYS: ParamKey[] = ["ph", "texture", "depthCm", "drainage", "om", "n", "p", "k", "ca", "mg"];
export const LABEL: Record<ParamKey, string> = {
  ph: "Soil pH", texture: "Texture", depthCm: "Root depth", drainage: "Drainage", om: "Organic matter",
  n: "Nitrogen (N)", p: "Phosphorus (P)", k: "Potassium (K)", ca: "Calcium (Ca)", mg: "Magnesium (Mg)", moisture: "Moisture", ec: "EC",
};
const SHORT: Record<ParamKey, string> = {
  ph: "pH", texture: "", depthCm: "root depth", drainage: "drainage", om: "organic matter",
  n: "N", p: "P", k: "K", ca: "Ca", mg: "Mg", moisture: "moisture", ec: "EC",
};
export const ALL_KEYS = Object.keys(LABEL) as ParamKey[];

export type Meter = "hand" | "lab" | "other";
export const METER: Record<Meter, string> = { hand: "Hand meter", lab: "Lab test", other: "Other" };

/** Soil values the farmer wrote down. `tree` null means the whole block. */
export interface SoilEntry extends SoilValues { id: string; zone: string; at: string; tree: Tree | null; meter: Meter; note?: string }

export function valueText(key: ParamKey, v: number | string): string {
  if (key === "texture") return TEXTURE[v as Texture] ?? String(v);
  if (key === "drainage") return DRAINAGE[v as Drainage] ?? String(v);
  const x = Number(v);
  if (key === "ph" || key === "ec") return x.toFixed(2);
  if (key === "depthCm") return `${Math.round(x)} cm`;
  if (key === "om") return `${x.toFixed(1)} %`;
  if (key === "moisture") return `${x.toFixed(1)} %`;
  return String(Math.round(x));
}

/** "pH 6.20, Loam, root depth 60 cm": the values of one entry in words. */
export function soilWords(e: SoilValues): string {
  return ALL_KEYS.filter((k) => e[k] !== undefined)
    .map((k) => [SHORT[k], valueText(k, e[k]!)].filter(Boolean).join(" "))
    .join(", ");
}

/** Why a soil record cannot be saved, or null when it can. NaN (text that is not a number) is refused. */
export function soilProblem(v: SoilValues): string | null {
  if (ALL_KEYS.every((k) => v[k] === undefined)) return "Write at least one value.";
  const outside = (x: number | undefined, lo: number, hi: number) => x !== undefined && !(x >= lo && x <= hi);
  if (outside(v.ph, 3, 10)) return "pH is from 3 to 10.";
  if (outside(v.depthCm, 1, 500)) return "Root depth is in centimetres, from 1 to 500.";
  if (outside(v.om, 0, 100)) return "Organic matter is a percentage, from 0 to 100.";
  if (outside(v.moisture, 0, 100)) return "Moisture is a percentage, from 0 to 100.";
  if (outside(v.ec, 0, 10)) return "EC is in mS/cm, from 0 to 10.";
  for (const k of ["n", "p", "k", "ca", "mg"] as const) if (outside(v[k], 0, 100000)) return `${LABEL[k]} is in mg/kg, 0 or more.`;
  return null;
}

// ---- targets

export interface Targets {
  ph?: [number, number]; moisture?: [number, number]; ec?: [number, number];
  textures?: Texture[]; minDepthCm?: number; drainage?: Drainage[];
  /** the targets in words, for the line above the table */ words: string;
}

export const isTomato = (crop: string | null | undefined) => /tomato/i.test(crop ?? "");

/** pH, moisture and EC targets come from the farm server (the crop's own stage targets). The tomato texture, rooting depth
 *  and drainage targets are the farmer's guide (loam or sandy loam, 60 cm or more, drains fast); other crops have none. */
export function targetsFor(crop: string | null | undefined, params: CondParam[] = []): Targets {
  const of = (metric: string) => params.find((p) => p.metric === metric)?.target ?? undefined;
  const t: Targets = { ph: of("soil_ph"), moisture: of("soil_moisture"), ec: of("soil_ec"), words: "" };
  if (isTomato(crop)) {
    t.ph ??= [6.0, 6.8];
    t.textures = ["loam", "sandyLoam"];
    t.minDepthCm = 60;
    t.drainage = ["fast"];
  }
  t.words = [
    t.ph && `pH ${t.ph[0].toFixed(1)}–${t.ph[1].toFixed(1)}`,
    t.textures && "loam or sandy loam",
    t.minDepthCm && `root depth ${t.minDepthCm} cm or more`,
    t.drainage && "drains fast",
  ].filter(Boolean).join(" · ");
  return t;
}

export type Status = "ok" | "low" | "high" | "check" | null;
/** How a value compares to its target; null when there is no target. */
export function statusOf(key: ParamKey, value: number | string, t: Targets): Status {
  const band = key === "ph" ? t.ph : key === "moisture" ? t.moisture : key === "ec" ? t.ec : undefined;
  if (band) { const x = Number(value); return x < band[0] ? "low" : x > band[1] ? "high" : "ok"; }
  if (key === "texture" && t.textures) return t.textures.includes(value as Texture) ? "ok" : "check";
  if (key === "depthCm" && t.minDepthCm !== undefined) return Number(value) >= t.minDepthCm ? "ok" : "low";
  if (key === "drainage" && t.drainage) return t.drainage.includes(value as Drainage) ? "ok" : "check";
  return null;
}

// ---- what each plant shows now

export type Source = "rover" | "you" | "block";
export interface Shown { value: number | string; source: Source; at: string }
export type PlantSoil = Partial<Record<ParamKey, Shown>>;

const ROVER_KEY: Partial<Record<ParamKey, string>> = {
  ph: "soil_ph", n: "nitrogen", p: "phosphorus", k: "potassium", moisture: "soil_moisture", ec: "soil_ec",
};
export const sameTree = (a: Tree | null, b: Tree) => Boolean(a) && a![0] === b[0] && a![1] === b[1];

/** For one plant, each value's newest source: the rover's last reading or the farmer's record of this plant; a record for
 *  the whole block fills in only what the plant has nothing of its own for. `entries` are this block's. */
export function plantSoil(tree: Tree, cell: RoverCell | undefined, roundAt: string | null, entries: SoilEntry[]): PlantSoil {
  const own = entries.filter((e) => sameTree(e.tree, tree)), block = entries.filter((e) => e.tree === null);
  const out: PlantSoil = {};
  for (const key of ALL_KEYS) {
    const found: Shown[] = [];
    const roverKey = ROVER_KEY[key];
    const reading = roverKey && cell?.plant ? cell.readings?.[roverKey] : undefined;
    if (reading !== undefined && roundAt) found.push({ value: reading, source: "rover", at: roundAt });
    for (const e of own) if (e[key] !== undefined) found.push({ value: e[key]!, source: "you", at: e.at });
    if (!found.length) for (const e of block) if (e[key] !== undefined) found.push({ value: e[key]!, source: "block", at: e.at });
    if (found.length) out[key] = found.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a));
  }
  return out;
}

/** The table's values that are outside their targets. */
export function outOfTarget(soil: PlantSoil, t: Targets): ParamKey[] {
  return TABLE_KEYS.filter((k) => {
    const s = soil[k];
    if (!s) return false;
    const st = statusOf(k, s.value, t);
    return st !== null && st !== "ok";
  });
}

// ---- day by day

/** The calendar day on this device, as "2026-11-26". */
export const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");

/** One round a day, the day's latest, newest day first. */
export function latestPerDay<T extends { startedAt: string }>(rounds: T[]): T[] {
  const seen = new Set<string>();
  return [...rounds].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).filter((r) => {
    const day = dayKey(r.startedAt);
    if (seen.has(day)) return false;
    seen.add(day);
    return true;
  });
}

export interface DayRow { day: string; roundAt: string | null; cell: RoverCell | undefined; soil: SoilEntry[]; health: PlantEntry[] }

/** A plant's days, newest first: the day's latest round, and what the farmer recorded (for the plant, or for the block). */
export function dailyRows(
  tree: Tree, rounds: { startedAt: string; cells: RoverCell[] }[], soil: SoilEntry[], health: PlantEntry[],
): DayRow[] {
  const days = new Map<string, DayRow>();
  const row = (day: string) => {
    let r = days.get(day);
    if (!r) { r = { day, roundAt: null, cell: undefined, soil: [], health: [] }; days.set(day, r); }
    return r;
  };
  for (const round of rounds) {
    const r = row(dayKey(round.startedAt));
    if (!r.roundAt || Date.parse(round.startedAt) > Date.parse(r.roundAt)) {
      r.roundAt = round.startedAt;
      r.cell = round.cells.find((c) => c.row === tree[0] && c.col === tree[1]);
    }
  }
  for (const e of soil) if (e.tree === null || sameTree(e.tree, tree)) row(dayKey(e.at)).soil.push(e);
  for (const e of health) if (sameTree(e.tree, tree)) row(dayKey(e.at)).health.push(e);
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}
