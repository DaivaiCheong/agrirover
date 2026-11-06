import { describe, expect, it } from "vitest";
import type { LeafNutrient, LeafSample } from "./api";
import { rangeIn, resultLine, toValues } from "./leaf";

const N: LeafNutrient = { code: "n", name: "Nitrogen", symbol: "N", base: "g/kg", range: [17.9, 21.2] };
const ZN: LeafNutrient = { code: "zn", name: "Zinc", symbol: "Zn", base: "mg/kg", range: [13, 126] };
const AL: LeafNutrient = { code: "al", name: "Aluminium", symbol: "Al", base: "mg/kg", range: null };

const sample = (over: Partial<LeafSample>) => ({ results: [{}], low: [], high: [], check: [], ...over }) as unknown as LeafSample;

describe("rangeIn", () => {
  it("shows a major nutrient's range in the unit being typed", () => {
    expect(rangeIn(N, "g/kg")).toBe("17.9–21.2");
    expect(rangeIn(N, "%")).toBe("1.79–2.12");
  });
  it("leaves a trace nutrient in mg/kg whatever the major unit is", () => {
    expect(rangeIn(ZN, "%")).toBe("13–126");
  });
  it("says so when there is no range", () => {
    expect(rangeIn(AL, "g/kg")).toBe("No range");
  });
});

describe("toValues", () => {
  it("sends what was typed, each in its own unit, and skips blanks", () => {
    expect(toValues([N, ZN, AL], { n: "1.9", zn: " 40 ", al: "  " }, "%")).toEqual([
      { nutrient: "n", value: 1.9, unit: "%" }, { nutrient: "zn", value: 40, unit: "mg/kg" },
    ]);
  });
  it("keeps a zero: a lab can report one", () => {
    expect(toValues([ZN], { zn: "0" }, "g/kg")).toEqual([{ nutrient: "zn", value: 0, unit: "mg/kg" }]);
  });
});

describe("resultLine", () => {
  it("says it is waiting until a result comes", () => {
    expect(resultLine(sample({ results: [] }))).toBe("Waiting for lab");
  });
  it("names only what is out of range", () => {
    expect(resultLine(sample({ low: ["K", "Mg"], high: ["Zn"] }))).toBe("Low K, Mg · High Zn");
    expect(resultLine(sample({ check: ["N"] }))).toBe("Check unit N");
  });
  it("says in range when nothing is out", () => {
    expect(resultLine(sample({}))).toBe("In range");
  });
});
