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
  UNIT_TRAD_COST_USD,
} from "./tomatoFinance";

describe("Tomato Cycle Accounting Ledger & Scale Economics", () => {
  it("calculates Whole Farm (69 active plants) COGS ($56.58 / ~230,900 ៛), Net Profit ($191.82), Margin (77.2%), and Risk Protected ($25.20)", () => {
    const farm = buildDemoTomatoFarm();
    const { blocks, allRows } = buildAllBlockEconomics({
      cycles: farm.cycles,
      zones: farm.zones,
      conditions: farm.conditions,
      roundsByZone: farm.roundsByZone,
    });

    const whole = computeFinanceView({ scale: "farm", selectedZone: "g1", blocks, allRows });
    expect(whole.plantCount).toBe(69);
    expect(whole.totalCostUsd).toBe(56.58);
    expect(whole.totalCostRiel).toBe(230900);
    expect(whole.traditionalCostUsd).toBe(79.63);
    expect(whole.totalSavedUsd).toBe(23.05);
    expect(whole.totalSavedRiel).toBe(94000);
    expect(whole.savedPct).toBe(29);
    expect(whole.expectedYieldKg).toBe(310.5);
    expect(whole.projectedRevenueUsd).toBe(248.4);
    expect(whole.projectedRevenueRiel).toBe(1013500);
    expect(whole.projectedProfitUsd).toBe(191.82);
    expect(whole.projectedProfitRiel).toBe(782600);
    expect(whole.netMarginPct).toBe(77.2);
    expect(whole.visionAlertCount).toBe(7);
    expect(whole.preventedLossUsd).toBe(25.2);
    expect(whole.preventedLossRiel).toBe(102900);

    // Every COGS ledger line ties out cleanly to the $56.58 / $79.63 / $23.05 totals
    expect(whole.lines.map((l) => [l.id, l.roverUsd, l.traditionalUsd, l.savedUsd])).toEqual([
      ["water", 4.37, 6.05, 1.68],
      ["electricity", 4.77, 6.84, 2.07],
      ["fertilizer", 12.88, 16.68, 3.8],
      ["protection", 6.24, 10.08, 3.84],
      ["substrate", 15.18, 15.18, 0],
      ["labor", 13.14, 24.8, 11.66],
    ]);

    const leverTotalUsd = Number(whole.levers.reduce((s, lv) => s + lv.impactUsd, 0).toFixed(2));
    expect(leverTotalUsd).toBe(23.05);

    const riskTotalUsd = Number(whole.riskLedger.reduce((s, r) => s + r.protectedUsd, 0).toFixed(2));
    expect(riskTotalUsd).toBe(25.2);
  });

  it("scales cleanly to 1 Tomato Plant ($0.82 vs $1.15, +$0.33 margin gain) and Selected Block (G2)", () => {
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
    expect(single.traditionalCostUsd).toBe(UNIT_TRAD_COST_USD);
    expect(single.totalSavedUsd).toBe(UNIT_SAVED_USD);
    expect(single.totalSavedRiel).toBe(UNIT_SAVED_RIEL);
    expect(single.projectedRevenueUsd).toBe(3.6);
    expect(single.projectedProfitUsd).toBe(UNIT_PROFIT_USD);
    expect(single.projectedProfitRiel).toBe(UNIT_PROFIT_RIEL);
    expect(single.netMarginPct).toBe(77.2);
    expect(Number(single.lines.reduce((s, l) => s + l.roverUsd, 0).toFixed(2))).toBe(UNIT_TOTAL_COST_USD);
    expect(Number(single.lines.reduce((s, l) => s + l.traditionalUsd, 0).toFixed(2))).toBe(UNIT_TRAD_COST_USD);

    const g2 = computeFinanceView({ scale: "block", selectedZone: "g2", blocks, allRows });
    expect(g2.plantCount).toBe(10);
    expect(g2.totalCostUsd).toBe(8.2);
    expect(g2.visionAlertCount).toBe(2);
    expect(g2.preventedLossUsd).toBe(7.2);
    expect(Number(g2.lines.reduce((s, l) => s + l.roverUsd, 0).toFixed(2))).toBe(g2.totalCostUsd);
  });
});
