import { describe, expect, it } from "vitest";
import { roundPlan } from "./rover";
import type { Advice, Cycle } from "./api";

describe("the day's rounds", () => {
  const g = (zone: string, rows: number, cols: number, rowM: number, treeM: number) => ({ zone, bedLabel: zone, grid: { rows, cols, rowM, treeM } }) as unknown as Cycle;
  it("runs block after block, each starting when the last should end", () => {
    const plan = roundPlan([g("g1", 4, 4, 5, 5), g("g2", 2, 5, 3, 3.5)], "07:00", [], "2026-11-05");
    expect(plan.map((p) => p.start)).toEqual(["07:00", "07:17"]);
    expect(plan[0].stops).toBe(16);
    expect(plan[0].doneAt).toBeNull();
  });
  it("marks only a round from today as done, and says when one stopped early", () => {
    const at = new Date(2026, 10, 5, 7, 20).toISOString();
    const advice = (surveyedAt: string, partial = false) => [{ zone: "g1", surveyedAt, partial } as unknown as Advice];
    expect(roundPlan([g("g1", 4, 4, 5, 5)], "07:00", advice(at), "2026-11-05")[0].doneAt).toBe(at);
    expect(roundPlan([g("g1", 4, 4, 5, 5)], "07:00", advice(at, true), "2026-11-05")[0].partial).toBe(true);
    expect(roundPlan([g("g1", 4, 4, 5, 5)], "07:00", advice(at), "2026-11-06")[0].doneAt).toBeNull();
  });
  it("leaves out a block with no grid", () => {
    expect(roundPlan([{ zone: "g9", bedLabel: "g9", grid: null } as unknown as Cycle], "07:00", [], "2026-11-05")).toEqual([]);
  });
});
import { CORNERS, DEFAULT_ROUTE, throughStops, cellName, cornerCell, estimate, fullLitresOf, headingAt, isRoute, kindOf, litresOf, minutes, route, serpentine, stopInfo } from "./rover";
import type { RoverCell } from "./api";

const cell = (over: Partial<RoverCell>): RoverCell => ({ row: 0, col: 0, plant: true, flagged: false, readings: {}, ...over });

describe("the rover's round", () => {
  it("visits every tree once, next to the last", () => {
    const path = serpentine(3, 4);
    expect(path.slice(0, 6)).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [1, 2]]);
    expect(new Set(path.map(String)).size).toBe(12);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1])).toBe(1);
    }
  });
  it("faces the way it is going", () => {
    const path = serpentine(2, 2);
    expect([0, 1, 2, 3].map((i) => headingAt(path, i))).toEqual([0, 0, -90, 180]);
  });
});

describe("the route set on the map", () => {
  // the same sequences as edge/rover-agent/tests/test_planner.py, so the map draws what the rover drives
  it("matches the rover's planner", () => {
    expect(route(2, 3, { start: "se", along: "rows" })).toEqual([[0, 2], [0, 1], [0, 0], [1, 0], [1, 1], [1, 2]]);
    expect(route(2, 3, { start: "sw", along: "across" })).toEqual([[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2]]);
    expect(route(2, 2, { start: "ne", along: "across" })).toEqual([[1, 1], [0, 1], [0, 0], [1, 0]]);
    expect(route(4, 7)).toEqual(serpentine(4, 7));
  });
  it("visits every tree once from any corner, next to the last", () => {
    for (const start of CORNERS) for (const along of ["rows", "across"] as const) {
      const path = route(3, 4, { start, along });
      expect(path[0]).toEqual(cornerCell(3, 4, start));
      expect(new Set(path.map(String)).size).toBe(12);
      for (let i = 1; i < path.length; i++) expect(Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1])).toBe(1);
    }
  });
  it("starts facing the second stop", () => {
    expect(headingAt(route(3, 4, { start: "ne", along: "rows" }), 0)).toBe(180);
    expect(headingAt(route(3, 4, { start: "nw", along: "across" }), 0)).toBe(90);     // down the map, towards row 1
    expect(headingAt(route(3, 4, { start: "sw", along: "across" }), 0)).toBe(-90);
  });
  it("counts row spacing for lanes across the rows", () => {
    // 3 rows × 2 trees across: 2 + 2 row gaps of 5 m and one tree gap of 3 m
    expect(estimate(3, 2, 5, 3, { start: "sw", along: "across" }).distanceM).toBe(23);
  });
  it("goes from the first plant to the last, through the empty spots, like the rover's through_stops", () => {
    // the tomato demo: 2 rows of 3 spots, plants on R1 T1, R1 T3, R2 T1, R2 T2
    const plants = new Set(["0,0", "0,2", "1,0", "1,1"]);
    expect(throughStops(route(2, 3), plants)).toEqual([[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0]]);
    expect(throughStops(route(2, 3), new Set(["1,1", "1,2"]))).toEqual([[1, 2], [1, 1]]);
    expect(throughStops(route(2, 3), new Set())).toEqual([]);
    const e = estimate(2, 3, 0.8, 0.5, DEFAULT_ROUTE, plants);
    expect(e.trees).toBe(4);                                  // stops at the 4 plants, not the 6 spots
    expect(e.distanceM).toBeCloseTo(0.5 * 4 + 0.8);
    expect(estimate(2, 3, 0.8, 0.5, DEFAULT_ROUTE, new Set(["1,1", "1,2"])).distanceM).toBeCloseTo(0.5);
  });
  it("only takes a saved route that is whole", () => {
    expect(isRoute({ start: "ne", along: "across" })).toBe(true);
    expect([isRoute(null), isRoute({ start: "up", along: "rows" }), isRoute({ start: "sw" })]).toEqual([false, false, false]);
  });
});

describe("the estimate", () => {
  it("uses row and tree spacing, and stops at every tree", () => {
    const e = estimate(2, 2, 5, 3);
    // 3 m along, 5 m across, 3 m back = 11 m; 2 turns of 90 degrees; 4 stops of 41 s
    expect([e.trees, e.distanceM, e.seconds]).toEqual([4, 11, 11 / 0.2 + 4 + 4 * 41]);
    expect(e.areaM2).toBe(60);
  });
  it("one row needs no turn", () => {
    expect(estimate(1, 3, 5, 2).seconds).toBeCloseTo(4 / 0.2 + 3 * 41);
  });
  it("reads as seconds, minutes or hours", () => {
    expect([minutes(45), minutes(600), minutes(7200)]).toEqual(["45 s", "10 min", "2.0 h"]);
  });
});

describe("what a tree shows", () => {
  const advice = (litres: number) => ({ litres, fullLitres: 10, notes: [], plant: true, row: 0, col: 0 });
  it("is one of four kinds", () => {
    expect(kindOf(undefined)).toBe("pending");
    expect(kindOf(cell({ plant: false }))).toBe("bare");
    expect(kindOf(cell({ advice: advice(0) }))).toBe("ok");
    expect(kindOf(cell({ advice: advice(4) }))).toBe("water");
  });
  it("adds up the water", () => {
    const cells = [cell({ advice: advice(4) }), cell({ advice: advice(1.5) }), cell({})];
    expect(litresOf(cells)).toBeCloseTo(5.5);
    expect(fullLitresOf(cells)).toBe(20);
  });
  it("numbers trees from one for people", () => {
    expect(cellName(0, 4)).toBe("R1 T5");
  });
});

describe("why it stopped", () => {
  it("knows the reasons the rover gives", () => {
    expect(stopInfo("battery_low")?.label).toBe("Low battery");
    expect(stopInfo("controller_nak:bumper")?.label).toBe("Bumper hit");
  });
  it("still says something readable for one it has not seen", () => {
    expect(stopInfo("error:OSError")?.label).toBe("error OSError");
    expect(stopInfo(null)).toBeNull();
  });
});
