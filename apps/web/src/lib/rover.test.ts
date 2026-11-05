import { describe, expect, it } from "vitest";
import { cellName, estimate, headingAt, kindOf, litresToWater, serpentine, stopInfo, toCheck } from "./rover";
import type { RoverCell } from "./api";

const cell = (over: Partial<RoverCell>): RoverCell => ({ row: 0, col: 0, plant: true, needs_water: false, flagged: false, dryness: 0.2, suggested_ml: 0, ...over });

describe("the rover's path", () => {
  it("visits every cell once, one step at a time", () => {
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

describe("the estimate matches the rover's own report", () => {
  it("2 x 5 at 0.5 m: 4.5 m and 36.5 s, as the rover reported in a real run", () => {
    const e = estimate(2, 5, 0.5);
    expect([e.cells, e.distanceM, e.seconds]).toEqual([10, 4.5, 36.5]);
  });
  it("one row needs no turn; one column turns once", () => {
    expect(estimate(1, 3, 0.5).seconds).toBeCloseTo(1 / 0.2 + 3);
    expect(estimate(3, 1, 0.5).seconds).toBeCloseTo(1 / 0.2 + 2 + 3);
  });
  it("gives the area covered", () => {
    expect(estimate(4, 10, 0.5).areaM2).toBe(10);
  });
});

describe("what a cell shows", () => {
  it("is one of four kinds", () => {
    expect(kindOf(undefined)).toBe("pending");
    expect(kindOf(cell({ plant: false }))).toBe("bare");
    expect(kindOf(cell({}))).toBe("ok");
    expect(kindOf(cell({ needs_water: true }))).toBe("water");
  });
  it("lists only what someone should look at, and adds up the water", () => {
    const cells = [cell({ col: 0 }), cell({ col: 1, needs_water: true, suggested_ml: 200 }), cell({ col: 2, flagged: true }), cell({ col: 3, needs_water: true, suggested_ml: 150, flagged: true })];
    expect(toCheck(cells).map((c) => c.col)).toEqual([1, 2, 3]);
    expect(litresToWater(cells)).toBeCloseTo(0.35);
  });
  it("numbers cells from one for people", () => {
    expect(cellName(0, 4)).toBe("R1 C5");
  });
});

describe("why it stopped", () => {
  it("knows the reasons the rover gives", () => {
    expect(stopInfo("battery_low")?.label).toBe("Low battery");
    expect(stopInfo("controller_nak:bumper")?.label).toBe("Bumper hit");
  });
  it("still says something readable for one it has not seen", () => {
    expect(stopInfo("error:OSError")?.label).toBe("error OSError");
    expect(stopInfo("error:OSError")?.next).toMatch(/log/);
    expect(stopInfo(null)).toBeNull();
  });
});
