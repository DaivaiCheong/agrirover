import { describe, expect, it } from "vitest";
import type { Advice, Cycle, SavedPhoto } from "./api";
import { farmBlocks, photoKeys, readNotes, toLookAt } from "./farm3d";

describe("the rover's notes on a tree", () => {
  it("marks a problem to look at, and keeps an expected sign apart", () => {
    expect(readNotes(["Yellow leaves: low feed"])).toMatchObject({ alert: "look", yellow: true, note: "Yellow leaves: low feed" });
    expect(readNotes(["Yellow leaves: expected"])).toMatchObject({ alert: "expected", yellow: true });
    expect(readNotes(["Small canopy: look", "Dry"])).toMatchObject({ alert: null, yellow: false, note: "Small canopy · Dry" });
    expect(readNotes(["No probe reading"])).toMatchObject({ alert: null, note: "" });
  });
});

describe("the farm in 3D", () => {
  const cycle = (zone: string, rows: number, cols: number) =>
    ({ zone, bedLabel: zone.toUpperCase(), status: "active", grid: { rows, cols, rowM: 3, treeM: 2 } }) as unknown as Cycle;
  const advice = [{ zone: "g2", trees: [
    { row: 1, col: 0, plant: true, litres: 0, fullLitres: 0, notes: ["Yellow leaves: low feed"] },
    { row: 0, col: 0, plant: true, litres: 0, fullLitres: 0, notes: [] },
  ] }] as unknown as Advice[];

  it("draws every tree of every growing block, a tree the round missed as not reached", () => {
    const [g1, g2] = farmBlocks(advice, [cycle("g2", 2, 2), cycle("g1", 1, 2)], new Set(["g2:1,0"]));
    expect(g1.zone).toBe("g1");
    expect(g1.trees.every((t) => t.reached === false)).toBe(true);
    const t = g2.trees.find((x) => x.row === 1 && x.col === 0)!;
    expect(t).toMatchObject({ alert: "look", yellow: true, photo: true, reached: true });
    expect(toLookAt([g1, g2]).map((x) => `${x.block.zone} ${x.tree.row},${x.tree.col}`)).toEqual(["g2 1,0"]);
  });

  it("reads a saved photo's tree name back into row and tree", () => {
    expect([...photoKeys([{ zone: "g2", tree: "R2 T1" }, { zone: "g2", tree: null }] as SavedPhoto[])]).toEqual(["g2:1,0"]);
  });
});
