// The farmer's log of soil and plant health, and what the rover's round asks of the farmer.
// Pure: no React and no storage, so it can be tested. The log itself is kept by store.ts.

import type { Cycle, FindingKind, PlantMap, RoverCell, RoverPhotoCheck } from "../../../../lib/api";
import { ROVER, cellName } from "../../../../lib/rover";

/** A tree (or plant), by row and column from 0. */
export type Tree = [number, number];
export const treeKey = (row: number, col: number) => `${row},${col}`;
export const treeName = (row: number, col: number) => cellName(row, col);

/** "2-3", the form Plant health links use, back to [1, 2]. */
export function parseTree(value: string | null): Tree | null {
  const m = value?.match(/^(\d+)-(\d+)$/);
  return m ? [Number(m[1]) - 1, Number(m[2]) - 1] : null;
}

/** When an ISO time reads on a farm screen: "27 Nov, 06:40". */
export function whenText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ---- the block: its grid, and which spots hold a tree

export interface Layout { rows: number; cols: number; rowM: number; treeM: number }

/** The block's grid: its plant map if it has one, else the growing crop's grid. */
export function layoutOf(pm: PlantMap | null, cycle: Cycle | undefined): Layout | null {
  if (pm) return { rows: pm.rows, cols: pm.cols, rowM: pm.rowM, treeM: pm.plantM };
  const g = cycle?.grid;
  return g ? { rows: g.rows, cols: g.cols, rowM: g.rowM, treeM: g.treeM } : null;
}

/** Whether the rover can run a round on this grid (the same limits the rover software enforces). */
export function layoutOk(l: Layout | null): boolean {
  return Boolean(l) && l!.rows >= 1 && l!.cols >= 1 && l!.rows <= 40 && l!.cols <= 40 && l!.rows * l!.cols <= ROVER.maxTrees
    && l!.rowM >= 0.2 && l!.rowM <= 10 && l!.treeM >= 0.2 && l!.treeM <= 10;
}

/** The trees of the block: the plant map's plants, or every spot of the grid. */
export function treesOf(pm: PlantMap | null, l: Layout | null): Tree[] {
  if (pm) return pm.plants.map(([r, c]) => [r, c] as Tree);
  if (!l) return [];
  const out: Tree[] = [];
  for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) out.push([r, c]);
  return out;
}

// ---- what the farmer writes down

export type SoilMeter = "hand" | "other";
export const METER: Record<SoilMeter, string> = { hand: "Hand meter", other: "Other" };

/** A soil reading the farmer wrote down. `tree` null means the whole block. */
export interface SoilEntry {
  id: string; zone: string; at: string; tree: Tree | null;
  moisture?: number; ec?: number; ph?: number; meter: SoilMeter; note?: string;
}

/** What the farmer saw on a tree. */
export type Seen = "healthy" | "yellowLower" | "spotsRings" | "spotsSmall" | "curledYoung" | "wilting" | "insects" | "other" | "unsure";
export const SEEN: Record<Seen, string> = {
  healthy: "Healthy", yellowLower: "Yellow lower leaves", spotsRings: "Spots with rings", spotsSmall: "Small grey spots",
  curledYoung: "Curled young leaves", wilting: "Drooping", insects: "Insects on leaves", other: "Something else", unsure: "Not sure",
};

/** What the farmer decided about the tree. */
export type Result = "confirmed" | "notIt" | "fixed" | "checking";
export const RESULT: Record<Result, string> = {
  confirmed: "Confirmed a problem", notIt: "Not a problem", fixed: "Fixed it", checking: "Still checking",
};

/** One thing the farmer logged for a tree. `roverSaw` is the rover's words when the farmer answered its flag. */
export interface PlantEntry {
  id: string; zone: string; at: string; tree: Tree; result: Result;
  seen?: Seen; roverSaw?: string; did?: string; note?: string;
}

// ---- what the rover's round asks of the farmer

/** Findings a farmer should go and look at. "healthy" is not one. */
export const NEEDS_LOOK: FindingKind[] = ["disease", "pest", "nutrient", "problem", "unsure"];
const SEVERITY: Record<FindingKind | "yellow", number> = { disease: 0, pest: 1, nutrient: 2, yellow: 2, problem: 3, unsure: 4, healthy: 9 };

/** A photo check's kind, the same rule Plant health uses. */
export function kindOfFinding(f: RoverPhotoCheck): FindingKind {
  return f.kind ?? (f.label === "healthy" ? "healthy" : f.label ? "problem" : "unsure");
}

export interface LookItem {
  row: number; col: number; name: string;
  /** what the rover saw, in words */ what: string;
  kind: FindingKind | "yellow";
  flagged: boolean;
  /** the rover's photo of the tree, if the check kept one */ photoId: string | null;
  readings: Record<string, number>;
}

/** The trees of a round that need the farmer: yellow leaves, or a photo check that found something other than healthy.
 *  `findings` are the newest photo checks by tree. A check that could not run (status "unavailable") counts for nothing. */
export function lookItems(cells: RoverCell[], findings: Map<string, RoverPhotoCheck | null>): LookItem[] {
  const out: LookItem[] = [];
  for (const c of cells) {
    if (!c.plant) continue;
    const raw = findings.get(treeKey(c.row, c.col)) ?? c.check ?? null;
    const f = raw && raw.status !== "unavailable" ? raw : null;
    const k = f ? kindOfFinding(f) : null;
    const kind: FindingKind | "yellow" | null = k && NEEDS_LOOK.includes(k) ? k : c.flagged ? "yellow" : null;
    if (!kind) continue;
    out.push({
      row: c.row, col: c.col, name: treeName(c.row, c.col),
      what: kind === "yellow" ? "Yellow leaves" : f?.title ?? "Needs a look",
      kind, flagged: c.flagged, photoId: f?.photoId ?? null, readings: c.readings ?? {},
    });
  }
  return out.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind] || a.row - b.row || a.col - b.col);
}

/** Trees the farmer logged on or after `since` (the newest round's finish). Once logged, a tree is no longer one to look at. */
export function handledTrees(plants: PlantEntry[], zone: string, since: string | null): Set<string> {
  const from = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
  return new Set(plants.filter((e) => e.zone === zone && Date.parse(e.at) >= from).map((e) => treeKey(e.tree[0], e.tree[1])));
}

/** Trees whose condition is known: checked by the rover in its newest round, or logged by the farmer. Never more than the block has. */
export function knownCount(checked: Set<string>, plants: PlantEntry[], zone: string, total: number): number {
  const all = new Set(checked);
  for (const e of plants) if (e.zone === zone) all.add(treeKey(e.tree[0], e.tree[1]));
  return Math.min(total, all.size);
}

// ---- soil numbers

export interface Range { avg: number; min: number; max: number; n: number }
export function rangeOf(values: number[]): Range | null {
  if (!values.length) return null;
  return { avg: values.reduce((s, x) => s + x, 0) / values.length, min: Math.min(...values), max: Math.max(...values), n: values.length };
}

const numbers = (xs: (number | undefined)[]) => xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));

/** The rover's soil readings for a round, across its trees. */
export function roundSoil(cells: RoverCell[]) {
  const trees = cells.filter((c) => c.plant);
  const read = (k: string) => numbers(trees.map((c) => c.readings?.[k]));
  return { moisture: rangeOf(read("soil_moisture")), ec: rangeOf(read("soil_ec")), ph: rangeOf(read("soil_ph")), trees: trees.length };
}

/** "52 (41–63)" for a range; "52" when all readings agree. */
export function rangeText(r: Range | null, digits = 0): string {
  if (!r) return "—";
  const avg = r.avg.toFixed(digits);
  return r.n > 1 && r.min !== r.max ? `${avg} (${r.min.toFixed(digits)}–${r.max.toFixed(digits)})` : avg;
}

export const numText = (x: number | undefined, digits = 0) => (x === undefined ? "—" : x.toFixed(digits));

/** The rover's soil readings for one tree, in words. */
export function soilLine(r: Record<string, number>): string | null {
  const parts: string[] = [];
  if (r.soil_moisture !== undefined) parts.push(`moisture ${r.soil_moisture.toFixed(0)} %`);
  if (r.soil_ec !== undefined) parts.push(`EC ${r.soil_ec.toFixed(1)}`);
  if (r.soil_ph !== undefined) parts.push(`pH ${r.soil_ph.toFixed(1)}`);
  return parts.length ? `Soil from the rover: ${parts.join(", ")}` : null;
}

/** Why a soil reading cannot be saved, or null when it can. NaN (text that is not a number) counts as missing. */
export function soilProblem(v: { moisture?: number; ec?: number; ph?: number }): string | null {
  if (v.moisture === undefined && v.ec === undefined && v.ph === undefined) return "Write at least one reading: moisture, EC or pH.";
  if (v.moisture !== undefined && !(v.moisture >= 0 && v.moisture <= 100)) return "Moisture is a percentage, from 0 to 100.";
  if (v.ec !== undefined && !(v.ec >= 0 && v.ec <= 10)) return "EC is in mS/cm, from 0 to 10.";
  if (v.ph !== undefined && !(v.ph >= 3 && v.ph <= 10)) return "pH is from 3 to 10.";
  return null;
}
