import type { Block3D, Tree3D, TreeAlert } from "../components/Farm3D";
import type { Advice, Cycle, RoverCell, SavedPhoto } from "./api";

/** What the rover's notes on a tree mean for the 3D farm. Only yellow leaves the soil does not expect are a tree to go and
 *  photograph: dry soil and a small canopy are already on Today as water and growth, and marking them too buried the few
 *  trees a photo can help with (22 marks on the demo farm, against 4). */
export function readNotes(notes: string[]): { alert: TreeAlert; yellow: boolean; note: string } {
  const yellow = notes.some((n) => n.startsWith("Yellow leaves"));
  const look = notes.filter((n) => n.startsWith("Yellow leaves") && n !== "Yellow leaves: expected");
  const shown = notes.filter((n) => n !== "No probe reading" && n !== "No tree seen");
  return { alert: look.length ? "look" : yellow ? "expected" : null, yellow, note: shown.join(" · ").replace(/: look/g, "") };
}

/** Trees with a saved photo, as "zone:row,col" from 0. A saved photo names its tree "R2 T1". */
export function photoKeys(photos: SavedPhoto[]): Set<string> {
  const out = new Set<string>();
  for (const p of photos) {
    const m = p.tree?.match(/^R(\d+) T(\d+)$/);
    if (p.zone && m) out.add(`${p.zone}:${Number(m[1]) - 1},${Number(m[2]) - 1}`);
  }
  return out;
}

/** The whole farm from each block's newest round: every growing block with a grid, in name order. */
export function farmBlocks(advice: Advice[], cycles: Cycle[], photos: Set<string>): Block3D[] {
  const byZone = new Map(advice.map((a) => [a.zone, a]));
  return cycles.filter((c) => c.status === "active" && c.grid).sort((a, b) => a.zone.localeCompare(b.zone)).map((c) => {
    const g = c.grid!;
    const a = byZone.get(c.zone);
    const seen = new Map((a?.trees ?? []).map((t) => [`${t.row},${t.col}`, t]));
    const trees: Tree3D[] = [];
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const t = seen.get(`${row},${col}`);
        const r = t ? readNotes(t.notes) : null;
        trees.push({ row, col, plant: t ? t.plant : true, reached: Boolean(t), alert: r?.alert ?? null, yellow: r?.yellow, note: r?.note,
                     photo: photos.has(`${c.zone}:${row},${col}`) });
      }
    }
    return { zone: c.zone, label: c.bedLabel, rows: g.rows, cols: g.cols, rowM: g.rowM, treeM: g.treeM, trees };
  });
}

/** One block from the rover's own cells, live during a round: trees not reached yet stay faint. */
export function roverBlock(zone: string, label: string, rows: number, cols: number, rowM: number, treeM: number,
                           cells: RoverCell[], photos: Set<string>): Block3D {
  const byCell = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));
  const trees: Tree3D[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = byCell.get(`${row},${col}`);
      const r = c?.advice ? readNotes(c.advice.notes) : c?.flagged ? { alert: "look" as const, yellow: true, note: "Yellow leaves" } : null;
      trees.push({ row, col, plant: c ? c.plant : true, reached: Boolean(c), canopy: c?.canopy ?? null, alert: r?.alert ?? null,
                   yellow: r?.yellow ?? Boolean(c?.flagged), note: r?.note, photo: photos.has(`${zone}:${row},${col}`) });
    }
  }
  return { zone, label, rows, cols, rowM, treeM, trees };
}

/** The trees worth the walk, problems first, each block in order. */
export function toLookAt(blocks: Block3D[]) {
  return blocks.flatMap((b) => b.trees.filter((t) => t.alert).map((t) => ({ block: b, tree: t })))
    .sort((x, y) => Number(y.tree.alert === "look") - Number(x.tree.alert === "look"));
}
