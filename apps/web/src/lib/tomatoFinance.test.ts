import { describe, expect, it } from "vitest";
import { buildDemoTomatoFarm } from "./roverDemo";
import {
  buildAllBlockEconomics,
  computeFinanceView,
  UNIT_PROFIT_RIEL,
  UNIT_PROFIT_USD,
  UNIT_SAVED_RIEL,
  UNIT_SAVED_USD,
  UNIT_TOTAL_COST_RIEL,
  UNIT_TOTAL_COST_USD,
} from "./tomatoFinance";

describe("Tomato Per-Plant Finance & Risk Savings", () => {
  it("calculates exact 1 Tomato Plant unit cost ($0.75 vs $1.02) and savings ($0.27 / 1,100 ៛)", () => {
    const farm = buildDemoTomatoFarm();
    const { blocks, allRows } = buildAllBlockEconomics({
      cycles: farm.cycles,
      zones: farm.zones,
      conditions: farm.conditions,
      roundsByZone: farm.roundsByZone,
    });

    const single = computeFinanceView({ scale: "plant", selectedZone: "g1", blocks, allRows });
    expect(single.plantCount).toBe(1);
    expect(single.totalCostUsd).toBe(UNIT_TOTAL_COST_USD);
    expect(single.totalCostRiel).toBe(UNIT_TOTAL_COST_RIEL);
    expect(single.traditionalCostUsd).toBe(1.02);
    expect(single.traditionalCostRiel).toBe(4165);
    expect(single.totalSavedUsd).toBe(UNIT_SAVED_USD);
    expect(single.totalSavedRiel).toBe(UNIT_SAVED_RIEL);
    expect(single.expectedYieldKg).toBe(4.5);
    expect(single.projectedRevenueUsd).toBe(3.6);
    expect(single.projectedRevenueRiel).toBe(14700);
    expect(single.projectedProfitUsd).toBe(UNIT_PROFIT_USD);
    expect(single.projectedProfitRiel).toBe(UNIT_PROFIT_RIEL);
    expect(single.lines.map((l) => [l.id, l.roverUsd, l.roverRiel, l.savedPct])).toEqual([
      ["water", 0.06, 245, 28],
      ["nutrients", 0.18, 735, 22],
      ["treatment", 0.09, 370, 35],
      ["labor", 0.42, 1715, 26],
    ]);
  });

  it("scales cleanly to whole farm (69 active plants) and pulls live Health alerts for loss prevention", () => {
    const farm = buildDemoTomatoFarm();
    const { blocks, allRows } = buildAllBlockEconomics({
      cycles: farm.cycles,
      zones: farm.zones,
      conditions: farm.conditions,
      roundsByZone: farm.roundsByZone,
    });

    const whole = computeFinanceView({ scale: "farm", selectedZone: "g1", blocks, allRows });
    expect(whole.plantCount).toBe(69);
    expect(whole.visionAlertCount).toBe(7);
    expect(whole.preventedLossUsd).toBe(75.6);
    expect(whole.totalCostUsd).toBe(51.75);
    expect(whole.projectedRevenueUsd).toBe(248.4);

    const g2 = computeFinanceView({ scale: "block", selectedZone: "g2", blocks, allRows });
    expect(g2.plantCount).toBe(10);
    expect(g2.visionAlertCount).toBe(2);
    expect(g2.preventedLossUsd).toBe(21.6);
  });
});
