import { describe, expect, it } from "vitest";
import type { PlantMap, RoverCell, RoverPhotoCheck } from "../../../../lib/api";
import {
  handledTrees, knownCount, layoutOf, layoutOk, lookItems, parseTree, rangeOf, rangeText, roundSoil, soilLine, soilProblem, treesOf,
  type PlantEntry,
} from "../fieldlog/model";

const cell = (row: number, col: number, extra: Partial<RoverCell> = {}): RoverCell =>
  ({ row, col, plant: true, flagged: false, readings: {}, ...extra }) as RoverCell;
const check = (over: Partial<RoverPhotoCheck>): RoverPhotoCheck =>
  ({ status: "ok", label: "problem", title: "Possible nitrogen shortage", seen: null, also: null, crop: "guava", photoId: null, problem: null, ...over }) as RoverPhotoCheck;

describe("what needs the farmer", () => {
  it("leaves out a healthy tree, and a tree the rover did not plant", () => {
    const cells = [
      cell(0, 0, { check: check({ kind: "healthy", label: "healthy", title: "Healthy" }) }),
      cell(0, 1, { plant: false, flagged: true }),
      cell(0, 2, { flagged: true }),
    ];
    expect(lookItems(cells, new Map()).map((i) => [i.row, i.col])).toEqual([[0, 2]]);
  });

  it("puts a disease before yellow leaves, and yellow leaves before a plain 'not sure'", () => {
    const cells = [
      cell(2, 2, { check: check({ kind: "unsure", label: null, title: "Not sure" }) }),
      cell(1, 1, { flagged: true }),
      cell(0, 0, { check: check({ kind: "disease", title: "Spots with rings" }) }),
    ];
    expect(lookItems(cells, new Map()).map((i) => i.kind)).toEqual(["disease", "yellow", "unsure"]);
  });

  it("counts nothing from a photo check that could not run", () => {
    const cells = [cell(0, 0, { check: check({ status: "unavailable", kind: "disease" }) })];
    expect(lookItems(cells, new Map())).toEqual([]);
  });

  it("uses the newest finding for a tree over the round's own check", () => {
    const cells = [cell(0, 0, { check: check({ kind: "disease", title: "Old" }) })];
    const newest = new Map([["0,0", check({ kind: "pest", title: "Insects on leaves" })]]);
    const [item] = lookItems(cells, newest);
    expect(item.kind).toBe("pest");
    expect(item.what).toBe("Insects on leaves");
  });

  it("says Yellow leaves for a tree the rover flagged, whatever the photo said", () => {
    const [item] = lookItems([cell(3, 4, { flagged: true, check: check({ kind: "healthy", title: "Healthy" }) })], new Map());
    expect(item.what).toBe("Yellow leaves");
    expect(item.name).toBe("R4 T5");
  });
});

describe("what the farmer has already looked at", () => {
  const entry = (zone: string, tree: [number, number], at: string): PlantEntry =>
    ({ id: `${zone}-${tree}-${at}`, zone, at, tree, result: "notIt" }) as PlantEntry;

  it("counts a tree logged on or after the round finished, and no earlier", () => {
    const since = "2026-11-27T10:00:00.000Z";
    const plants = [entry("g1", [0, 0], "2026-11-27T10:30:00.000Z"), entry("g1", [1, 1], "2026-11-27T09:00:00.000Z")];
    expect([...handledTrees(plants, "g1", since)]).toEqual(["0,0"]);
  });

  it("ignores another block's entries", () => {
    const plants = [entry("g2", [0, 0], "2026-11-27T10:30:00.000Z")];
    expect(handledTrees(plants, "g1", null).size).toBe(0);
  });

  it("knows a tree the rover checked or the farmer logged, never more than the block has", () => {
    const checked = new Set(["0,0", "0,1"]);
    // 0,0 and 0,1 from the rover, plus 5,5 from the farmer; 0,1 is in both, so it counts once
    const plants = [entry("g1", [0, 1], "2026-11-27T10:00:00.000Z"), entry("g1", [5, 5], "2026-11-27T10:00:00.000Z")];
    expect(knownCount(checked, plants, "g1", 16)).toBe(3);
    expect(knownCount(checked, plants, "g1", 2)).toBe(2);   // never more than the block has
  });
});

describe("soil numbers", () => {
  it("averages a range of readings and shows the spread", () => {
    const r = rangeOf([40, 50, 60]);
    expect(r?.avg).toBe(50);
    expect(rangeText(r)).toBe("50 (40–60)");
  });

  it("shows one value when every reading agrees, and a dash when there are none", () => {
    expect(rangeText(rangeOf([52, 52]))).toBe("52");
    expect(rangeText(null)).toBe("—");
  });

  it("reads the rover's soil from a round, across its trees only", () => {
    const cells = [
      cell(0, 0, { readings: { soil_moisture: 40, soil_ec: 1.0, soil_ph: 6.0 } }),
      cell(0, 1, { readings: { soil_moisture: 60, soil_ec: 1.4, soil_ph: 6.4 } }),
      cell(0, 2, { plant: false, readings: { soil_moisture: 99 } }),
    ];
    const s = roundSoil(cells);
    expect(s.trees).toBe(2);
    expect(s.moisture?.avg).toBe(50);
    expect(s.ec?.n).toBe(2);
  });

  it("describes one tree's soil in words, or nothing when there is none", () => {
    expect(soilLine({ soil_moisture: 52.4, soil_ec: 1.13, soil_ph: 6.2 })).toBe("Soil from the rover: moisture 52 %, EC 1.1, pH 6.2");
    expect(soilLine({})).toBeNull();
  });

  it("refuses a reading with nothing in it, or a value out of range", () => {
    expect(soilProblem({})).toMatch(/at least one reading/);
    expect(soilProblem({ moisture: 120 })).toMatch(/0 to 100/);
    expect(soilProblem({ ph: 2 })).toMatch(/3 to 10/);
    expect(soilProblem({ ec: Number.NaN })).toMatch(/0 to 10/);
    expect(soilProblem({ moisture: 55, ph: 6.1 })).toBeNull();
  });
});

describe("trees and layouts", () => {
  it("reads a tree link: 2-3 is row 1, tree 2 from 0", () => {
    expect(parseTree("2-3")).toEqual([1, 2]);
    expect(parseTree("x")).toBeNull();
    expect(parseTree(null)).toBeNull();
  });

  it("lists a plant map's plants, or every spot of a grid", () => {
    const pm = { rows: 2, cols: 2, rowM: 1, plantM: 0.5, plants: [[0, 1], [1, 0]], crop: "Tomato", zone: "t1", label: "T1", updatedAt: null } as unknown as PlantMap;
    const grid = { rows: 2, cols: 2, rowM: 3, treeM: 3 };
    expect(treesOf(pm, layoutOf(pm, undefined))).toEqual([[0, 1], [1, 0]]);
    expect(treesOf(null, { ...grid })).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
  });

  it("accepts a grid the rover can run, and refuses one it cannot", () => {
    expect(layoutOk({ rows: 4, cols: 4, rowM: 5, treeM: 5 })).toBe(true);
    expect(layoutOk({ rows: 41, cols: 4, rowM: 5, treeM: 5 })).toBe(false);
    expect(layoutOk({ rows: 20, cols: 21, rowM: 5, treeM: 5 })).toBe(false);   // 420 trees, past the rover's 400
    expect(layoutOk({ rows: 4, cols: 4, rowM: 0.1, treeM: 5 })).toBe(false);
    expect(layoutOk(null)).toBe(false);
  });
});
