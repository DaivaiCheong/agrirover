import { describe, expect, it } from "vitest";
import { cellName, estimate, fullLitresOf, headingAt, kindOf, litresOf, minutes, serpentine, stopInfo } from "./rover";
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
