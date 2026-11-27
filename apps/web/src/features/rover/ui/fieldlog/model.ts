// The block, its trees, what the farmer sees on them, and what the rover's round asks of the farmer.
// Pure: no React and no storage, so it can be tested. Soil values are in soil.ts; the log is kept by store.ts.

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
  return l !== null && l.rows >= 1 && l.cols >= 1 && l.rows <= 40 && l.cols <= 40 && l.rows * l.cols <= ROVER.maxTrees
    && l.rowM >= 0.2 && l.rowM <= 10 && l.treeM >= 0.2 && l.treeM <= 10;
}

/** The trees of the block: the plant map's plants, or every spot of the grid. */
export function treesOf(pm: PlantMap | null, l: Layout | null): Tree[] {
  if (pm) return pm.plants.map(([r, c]) => [r, c] as Tree);
  if (!l) return [];
  const out: Tree[] = [];
  for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) out.push([r, c]);
  return out;
}

// ---- what the farmer sees on a tree

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
    out.push({ row: c.row, col: c.col, name: treeName(c.row, c.col), kind, what: kind === "yellow" ? "Yellow leaves" : f?.title ?? "Needs a look" });
  }
  return out.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind] || a.row - b.row || a.col - b.col);
}

/** Trees the farmer logged on or after `since` (the newest round's finish). Once logged, a tree is no longer one to look at. */
export function handledTrees(plants: PlantEntry[], zone: string, since: string | null): Set<string> {
  const from = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
  return new Set(plants.filter((e) => e.zone === zone && Date.parse(e.at) >= from).map((e) => treeKey(e.tree[0], e.tree[1])));
}
