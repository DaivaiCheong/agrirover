import { describe, expect, it } from "vitest";
import type { Advice, BedConditions } from "./api";
import { problems } from "./problems";

const param = (metric: string, value: number, target: [number, number], direction: "low" | "high" | null) =>
  ({ metric, label: metric, short: metric, unit: metric === "soil_moisture" ? "pct" : "mS/cm", decimals: metric === "soil_ec" ? 2 : 1, value,
     recordedAt: null, status: "ok", direction, target });
const bed = (zone: string, params: unknown[], alerts: unknown[]) => ({ zone, label: zone.toUpperCase(), params, alerts }) as unknown as BedConditions;
const advice = (zone: string, notes: string[][], litres = 0) =>
  ({ zone, cycleId: `c-${zone}`, water: { litres }, trees: notes.map((n, i) => ({ row: 0, col: i, plant: true, notes: n })) }) as unknown as Advice;

describe("today's problems", () => {
  it("puts the number that shows a problem beside it, and the one thing to do", () => {
    const [p] = problems([bed("g3", [param("soil_moisture", 51.5, [65, 75], "low")],
      [{ id: "bloom_floor", severity: "critical", title: "Moisture below the bloom floor", message: "x", metrics: ["soil_moisture"] }])],
      [advice("g3", [], 237)]);
    expect(p).toMatchObject({ problem: "Moisture below the bloom floor", action: "Water 237 L today", severity: "critical" });
    expect(p.evidence).toEqual({ label: "soil_moisture", value: "51.5 %", target: "65–75", direction: "low" });
  });

  it("says hungry trees once: the yellow leaves and the low EC are one problem", () => {
    const list = problems([bed("g2", [param("soil_ec", 0.68, [1.2, 1.8], "low")],
      [{ id: "low_ec", severity: "warning", title: "Nutrients running low", message: "x", metrics: ["soil_ec"] }])],
      [advice("g2", [["Yellow leaves: low feed"], ["Yellow leaves: low feed"], ["Yellow leaves: expected"]])]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ problem: "2 trees hungry: yellow leaves", link: { to: "/crop?zone=g2" } });
    expect(list[0].evidence?.value).toBe("0.68");
  });

  it("uses the measured words when no single reading shows it, and lists critical first", () => {
    const list = problems([bed("g4", [], [
      { id: "fruit_fly", severity: "warning", title: "Fruit fly weather", message: "Air 29.4 °C and humidity 76 %, and the fruit is not bagged yet.", metrics: [] },
      { id: "bag_now", severity: "critical", title: "Bag the fruit now", message: "Fruit is 34 mm. Bag at 30-40 mm: foam net.", metrics: [] },
    ])], []);
    expect(list.map((p) => p.problem)).toEqual(["Bag the fruit now", "Fruit fly weather"]);
    expect(list[0]).toMatchObject({ evidence: null, evidenceText: "Fruit is 34 mm", action: "Bag the fruit today" });
  });
});
