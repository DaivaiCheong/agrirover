import { beforeEach, describe, expect, it } from "vitest";
import type { BedConditions, RoverCell, SavedPhoto } from "./api";
import { buildDemoOrchardData } from "./roverDemo";
import {
  buildBlockSoilRows,
  defaultBlockSoilProfile,
  getBlockSoilProfile,
  getRoverContext,
  parsePlantLabel,
  resetBlockSoilProfile,
  resolveBlockGrid,
  saveBlockSoilProfile,
  setRoverContext,
  summarizePlantSoil,
  targetsFromConditions,
} from "./soil";

const cell = (row: number, col: number, over: Partial<RoverCell> = {}): RoverCell => ({
  row,
  col,
  plant: true,
  flagged: false,
  canopy: 0.42,
  chlorosis: 0,
  readings: {
    soil_ph: 6.3,
    soil_moisture: 25,
    soil_ec: 1.0,
    soil_temperature: 24.5,
    nitrogen: 70,
    phosphorus: 55,
    potassium: 140,
  },
  ...over,
});

const g1Conditions = {
  zone: "g1",
  params: [
    { metric: "soil_ph", target: [6.0, 6.8] },
    { metric: "soil_moisture", target: [58, 72] },
    { metric: "soil_ec", target: [0.8, 2.5] },
    { metric: "soil_temperature", target: [18, 29] },
  ],
} as unknown as BedConditions;

describe("soil plant evaluation", () => {
  it("extracts stage targets from bed conditions", () => {
    expect(targetsFromConditions(g1Conditions)).toEqual({
      ph: [6.0, 6.8],
      moisture: [58, 72],
      ec: [0.8, 2.5],
      soilTemp: [18, 29],
    });
  });

  it("classifies optimal, attention, missing plant, and unrecorded cells", () => {
    const profile = defaultBlockSoilProfile("g1");
    const cells: RoverCell[] = [
      cell(0, 0, { readings: { soil_ph: 6.4, soil_moisture: 64, soil_ec: 1.4, soil_temperature: 24, nitrogen: 110, phosphorus: 75, potassium: 185 } }), // optimal
      cell(0, 1, { flagged: true, chlorosis: 0.18, readings: { soil_ph: 6.4, soil_moisture: 64, soil_ec: 1.4, soil_temperature: 24, nitrogen: 110, phosphorus: 75, potassium: 185 } }), // attention: yellow leaves
      cell(1, 0, { plant: false, readings: {} }), // unrecorded: no plant seen
    ];
    const photos = [
      { id: "p1", zone: "g1", tree: "R1 T2", takenAt: "2026-11-27T08:00:00Z", modelLabel: "problem", expertLabel: null },
    ] as SavedPhoto[];

    const rows = buildBlockSoilRows({
      zone: "g1",
      rows: 2,
      cols: 2,
      cells,
      conditions: g1Conditions,
      photos,
      profile,
    });

    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["R1 T1", "optimal"],
      ["R1 T2", "attention"],
      ["R2 T1", "unrecorded"],
      ["R2 T2", "unrecorded"],
    ]);
    expect(rows[1].issues).toContain("Yellow leaves");
    expect(rows[1].camera.photoSaved).toBe(true);
    expect(rows[1].texture).toBe("Sandy loam");
    expect(rows[1].rootingSummary).toBe("65 cm · Well drained");
    expect(summarizePlantSoil(rows)).toEqual({ total: 4, optimal: 1, attention: 1, unrecorded: 2, visionAlerts: 1 });
  });

  it("flags out-of-range soil pH, moisture, EC, and soil temp", () => {
    const rows = buildBlockSoilRows({
      zone: "g1",
      rows: 1,
      cols: 1,
      cells: [
        cell(0, 0, {
          readings: { soil_ph: 4.8, soil_moisture: 15, soil_ec: 3.1, soil_temperature: 33 },
        }),
      ],
      conditions: g1Conditions,
      profile: defaultBlockSoilProfile("g1"),
    });

    expect(rows[0].status).toBe("attention");
    expect(rows[0].states).toEqual({ ph: "low", moisture: "low", ec: "high", soilTemp: "high" });
    expect(rows[0].issues).toHaveLength(4);
  });

  it("parses plant labels and resolves fallback block grids", () => {
    expect(parsePlantLabel("R2 T4")).toEqual([1, 3]);
    expect(parsePlantLabel("invalid")).toBeNull();
    expect(resolveBlockGrid({ zone: { zone: "g6", areaM2: 50 } as never })).toEqual({
      rows: 3,
      cols: 2,
      rowM: 3,
      treeM: 3,
    });
  });

  describe("local block soil storage & rover context", () => {
    const store = () => {
      const mem = new Map<string, string>();
      return {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => { mem.set(k, v); },
        removeItem: (k: string) => { mem.delete(k); },
      };
    };

    beforeEach(() => {
      Object.assign(globalThis, { localStorage: store(), sessionStorage: store() });
    });

    it("saves, loads, and resets block soil profiles", () => {
      expect(getBlockSoilProfile("g1").texture).toBe("Sandy loam");
      saveBlockSoilProfile("g1", {
        texture: "Clay loam",
        rootingDepthCm: 80,
        drainage: "Moderately well drained",
        organicMatterPct: 3.5,
      });
      expect(getBlockSoilProfile("g1")).toMatchObject({
        texture: "Clay loam",
        rootingDepthCm: 80,
        drainage: "Moderately well drained",
        organicMatterPct: 3.5,
      });
      resetBlockSoilProfile("g1");
      expect(getBlockSoilProfile("g1").texture).toBe("Sandy loam");
    });

    it("persists selected block and plant context across tabs", () => {
      setRoverContext({ zone: "g1", plant: "R1 T2" });
      expect(getRoverContext()).toEqual({ zone: "g1", plant: "R1 T2" });
    });

    it("provides realistic sample orchard data for G1-G6 when offline", () => {
      const demo = buildDemoOrchardData();
      expect(demo.zones).toHaveLength(6);
      const g1Round = demo.roundsById.get("demo-g1-0")!;
      const rows = buildBlockSoilRows({
        zone: "g1",
        rows: g1Round.rows!,
        cols: g1Round.cols!,
        cells: g1Round.cells,
        conditions: demo.conditions.find((c) => c.zone === "g1"),
        advice: demo.advice.find((a) => a.zone === "g1"),
        profile: defaultBlockSoilProfile("g1"),
      });
      expect(summarizePlantSoil(rows)).toEqual({ total: 16, optimal: 13, attention: 2, unrecorded: 1, visionAlerts: 2 });
    });
  });
});
