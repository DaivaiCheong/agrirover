import { describe, expect, it } from "vitest";
import type { CondParam, PlantMap, RoverCell, RoverPhotoCheck } from "../../../../lib/api";
import { handledTrees, layoutOf, layoutOk, lookItems, parseTree, treesOf, type PlantEntry } from "../fieldlog/model";
import {
  TABLE_KEYS, dailyRows, latestPerDay, outOfTarget, plantSoil, soilProblem, soilWords, statusOf, targetsFor, valueText, type SoilEntry,
} from "../fieldlog/soil";

const cell = (row: number, col: number, extra: Partial<RoverCell> = {}): RoverCell =>
  ({ row, col, plant: true, flagged: false, readings: {}, ...extra }) as RoverCell;
const check = (over: Partial<RoverPhotoCheck>): RoverPhotoCheck =>
  ({ status: "ok", label: "problem", title: "Possible nitrogen shortage", seen: null, also: null, crop: "guava", photoId: null, problem: null, ...over }) as RoverPhotoCheck;
const soil = (over: Partial<SoilEntry>): SoilEntry =>
  ({ id: Math.random().toString(36), zone: "g1", at: "2026-11-26T10:00:00.000Z", tree: [0, 0], meter: "hand", ...over }) as SoilEntry;
const params = (target: [number, number]) => [{ metric: "soil_ph", target }] as unknown as CondParam[];

describe("the plant table's columns", () => {
  it("covers the five soil parameters: pH, texture, rooting depth and drainage, organic matter, nutrients", () => {
    expect(TABLE_KEYS).toEqual(["ph", "texture", "depthCm", "drainage", "om", "n", "p", "k", "ca", "mg"]);
  });
});

describe("targets", () => {
  it("takes a guava block's pH from the farm server, and has no texture or depth target", () => {
    const t = targetsFor("Guava", params([5.5, 7.0]));
    expect(t.ph).toEqual([5.5, 7.0]);
    expect(t.textures).toBeUndefined();
    expect(t.words).toBe("pH 5.5–7.0");
  });

  it("gives a tomato block pH 6.0–6.8, loam or sandy loam, 60 cm roots and fast drainage", () => {
    const t = targetsFor("Tomato");
    expect(t.ph).toEqual([6.0, 6.8]);
    expect(t.words).toBe("pH 6.0–6.8 · loam or sandy loam · root depth 60 cm or more · drains fast");
    expect(statusOf("ph", 5.9, t)).toBe("low");
    expect(statusOf("ph", 6.8, t)).toBe("ok");
    expect(statusOf("texture", "clay", t)).toBe("check");
    expect(statusOf("texture", "sandyLoam", t)).toBe("ok");
    expect(statusOf("depthCm", 45, t)).toBe("low");
    expect(statusOf("drainage", "pools", t)).toBe("check");
  });

  it("does not judge a value with no target, such as N from the probe", () => {
    expect(statusOf("n", 65, targetsFor("Tomato"))).toBeNull();
    expect(statusOf("om", 1, targetsFor("Guava"))).toBeNull();
  });
});

describe("what a plant shows", () => {
  const roundAt = "2026-11-26T07:00:00.000Z";
  const reading = cell(0, 0, { readings: { soil_ph: 6.38, nitrogen: 65, phosphorus: 55, potassium: 146, soil_moisture: 19.9, soil_ec: 1.01 } });

  it("fills pH, N, P and K from the rover, and leaves what it cannot measure empty", () => {
    const s = plantSoil([0, 0], reading, roundAt, []);
    expect(s.ph).toMatchObject({ value: 6.38, source: "rover" });
    expect(s.n?.value).toBe(65);
    expect(s.texture).toBeUndefined();
    expect(s.ca).toBeUndefined();
  });

  it("takes the farmer's newer record of this plant over the rover's reading, and the rover's over an older one", () => {
    const newer = soil({ at: "2026-11-26T09:00:00.000Z", ph: 6.1 });
    const older = soil({ at: "2026-11-25T09:00:00.000Z", ph: 5.0 });
    expect(plantSoil([0, 0], reading, roundAt, [newer]).ph).toMatchObject({ value: 6.1, source: "you" });
    expect(plantSoil([0, 0], reading, roundAt, [older]).ph).toMatchObject({ value: 6.38, source: "rover" });
  });

  it("fills a plant from the block's record only where the plant has nothing of its own", () => {
    const block = soil({ tree: null, texture: "loam", depthCm: 60, ph: 7.2, at: "2026-11-27T09:00:00.000Z" });
    const s = plantSoil([0, 0], reading, roundAt, [block]);
    expect(s.texture).toMatchObject({ value: "loam", source: "block" });
    expect(s.ph).toMatchObject({ value: 6.38, source: "rover" });                 // a newer block value never replaces the plant's own
  });

  it("ignores another plant's record, and readings at a spot with no plant", () => {
    expect(plantSoil([1, 1], undefined, roundAt, [soil({ tree: [0, 0], ph: 6 })])).toEqual({});
    expect(plantSoil([0, 0], cell(0, 0, { plant: false, readings: { soil_ph: 9 } }), roundAt, [])).toEqual({});
  });

  it("lists the table values outside their targets", () => {
    const s = plantSoil([0, 0], reading, roundAt, [soil({ texture: "clay", depthCm: 70 })]);
    expect(outOfTarget(s, targetsFor("Tomato"))).toEqual(["texture"]);
    expect(outOfTarget(s, targetsFor("Guava", params([6.5, 7.0])))).toEqual(["ph"]);
  });
});

describe("soil records", () => {
  it("shows values the way a farmer reads them", () => {
    expect(valueText("ph", 6.2)).toBe("6.20");
    expect(valueText("depthCm", 60)).toBe("60 cm");
    expect(valueText("texture", "sandyLoam")).toBe("Sandy loam");
    expect(valueText("drainage", "pools")).toBe("Water pools");
    expect(valueText("moisture", 19.9)).toBe("19.9 %");
    expect(soilWords({ ph: 6.2, texture: "loam", depthCm: 60, drainage: "fast" })).toBe("pH 6.20, Loam, root depth 60 cm, drainage Fast");
  });

  it("refuses an empty record or a value out of range", () => {
    expect(soilProblem({})).toMatch(/at least one/);
    expect(soilProblem({ texture: "loam" })).toBeNull();
    expect(soilProblem({ ph: 2 })).toMatch(/3 to 10/);
    expect(soilProblem({ depthCm: 0 })).toMatch(/1 to 500/);
    expect(soilProblem({ ec: Number.NaN })).toMatch(/0 to 10/);
    expect(soilProblem({ ca: -1 })).toMatch(/Calcium/);
  });
});

describe("day by day", () => {
  const round = (startedAt: string, cells: RoverCell[] = []) => ({ startedAt, cells });

  it("keeps one round a day, the latest, newest day first", () => {
    const rs = [round("2026-11-25T01:00:00.000Z"), round("2026-11-26T01:00:00.000Z"), round("2026-11-26T09:00:00.000Z")];
    expect(latestPerDay(rs).map((r) => r.startedAt)).toEqual(["2026-11-26T09:00:00.000Z", "2026-11-25T01:00:00.000Z"]);
  });

  it("puts the rover's reading and the farmer's records on their day, for this plant and its block only", () => {
    const rs = [round("2026-11-26T05:00:00.000Z", [cell(0, 0, { readings: { soil_ph: 6.4 } })])];
    const records = [soil({ at: "2026-11-24T05:00:00.000Z", tree: null, ph: 6 }), soil({ at: "2026-11-26T06:00:00.000Z", tree: [1, 1], ph: 5 })];
    const health = [{ id: "h", zone: "g1", at: "2026-11-26T06:00:00.000Z", tree: [0, 0], result: "fixed" } as PlantEntry];
    const rows = dailyRows([0, 0], rs, records, health);
    expect(rows.map((r) => r.day.slice(-2))).toEqual(["26", "24"]);
    expect(rows[0].cell?.readings.soil_ph).toBe(6.4);
    expect(rows[0].soil).toEqual([]);                    // the other plant's record is not this plant's
    expect(rows[0].health).toHaveLength(1);
    expect(rows[1].roundAt).toBeNull();
    expect(rows[1].soil).toHaveLength(1);                // the block's record applies to every plant
  });
});

describe("what needs the farmer", () => {
  it("leaves out a healthy plant and a spot with no plant", () => {
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

  it("counts nothing from a photo check that could not run, and prefers the newest finding", () => {
    expect(lookItems([cell(0, 0, { check: check({ status: "unavailable", kind: "disease" }) })], new Map())).toEqual([]);
    const newest = new Map([["0,0", check({ kind: "pest", title: "Insects on leaves" })]]);
    expect(lookItems([cell(0, 0, { check: check({ kind: "disease" }) })], newest)[0].what).toBe("Insects on leaves");
  });

  it("counts a plant logged on or after the round finished, in this block only", () => {
    const entry = (zone: string, tree: [number, number], at: string) => ({ id: at, zone, at, tree, result: "notIt" }) as PlantEntry;
    const plants = [entry("g1", [0, 0], "2026-11-27T10:30:00.000Z"), entry("g1", [1, 1], "2026-11-27T09:00:00.000Z"), entry("g2", [2, 2], "2026-11-27T10:30:00.000Z")];
    expect([...handledTrees(plants, "g1", "2026-11-27T10:00:00.000Z")]).toEqual(["0,0"]);
  });
});

describe("plants and layouts", () => {
  it("reads a plant link: 2-3 is row 1, plant 2 from 0", () => {
    expect(parseTree("2-3")).toEqual([1, 2]);
    expect(parseTree("x")).toBeNull();
  });

  it("lists a plant map's plants, or every spot of a grid", () => {
    const pm = { rows: 2, cols: 2, rowM: 1, plantM: 0.5, plants: [[0, 1], [1, 0]], crop: "Tomato", zone: "t1", label: "T1", updatedAt: null } as unknown as PlantMap;
    expect(treesOf(pm, layoutOf(pm, undefined))).toEqual([[0, 1], [1, 0]]);
    expect(treesOf(null, { rows: 2, cols: 2, rowM: 3, treeM: 3 })).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
  });

  it("accepts a grid the rover can run, and refuses one it cannot", () => {
    expect(layoutOk({ rows: 4, cols: 4, rowM: 5, treeM: 5 })).toBe(true);
    expect(layoutOk({ rows: 41, cols: 4, rowM: 5, treeM: 5 })).toBe(false);
    expect(layoutOk({ rows: 20, cols: 21, rowM: 5, treeM: 5 })).toBe(false);   // 420 plants, past the rover's 400
    expect(layoutOk({ rows: 4, cols: 4, rowM: 0.1, treeM: 5 })).toBe(false);
    expect(layoutOk(null)).toBe(false);
  });
});
