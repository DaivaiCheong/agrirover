import { describe, expect, it } from "vitest";
import {
  createDefaultSpreadsheetInputs,
  evaluateSpreadsheet,
  rescaleSpreadsheetByPlants,
  round2,
} from "./financeSpreadsheet";

describe("Excel-Style Finance Spreadsheet Calculator Engine", () => {
  it("evaluates baseline 69-plant COGS, unit cost, revenue, margin, break-even, and economic advantage", () => {
    const inputs = createDefaultSpreadsheetInputs(25.2);
    const out = evaluateSpreadsheet(inputs);

    // Every row satisfies Excel formula: E = round2(B * D), F = round2(C * D), G = round2(F - E)
    for (const r of out.rows) {
      expect(r.roverCostUsd).toBe(round2(r.roverQty * r.unitRateUsd));
      expect(r.stdCostUsd).toBe(round2(r.stdQty * r.unitRateUsd));
      expect(r.savedUsd).toBe(round2(r.stdCostUsd - r.roverCostUsd));
    }

    // Whole farm 69 plants baseline
    expect(out.totalRoverCostUsd).toBe(56.62);
    expect(out.totalStdCostUsd).toBe(79.63);
    expect(out.totalSavedUsd).toBe(23.01);
    expect(out.totalSavedPct).toBe(29);
    expect(out.costPerPlantRoverUsd).toBe(0.82);
    expect(out.costPerPlantStdUsd).toBe(1.15);

    // Sheet 2 harvest & break-even KPIs
    expect(out.totalHarvestKg).toBe(310.5);
    expect(out.grossRevenueUsd).toBe(248.4);
    expect(out.grossRevenueRiel).toBe(1013500);
    expect(out.netProfitUsd).toBe(191.78);
    expect(out.netMarginPct).toBe(77.2);
    expect(out.breakEvenPricePerKg).toBe(0.18);
    expect(out.breakEvenYieldKg).toBe(70.8);
    expect(out.breakEvenYieldPctOfExpected).toBe(22.8);
    expect(out.totalEconomicAdvantageUsd).toBe(48.21);
  });

  it("rescales cleanly via presets (69 -> 500 -> 1,000 -> 69) and recalculates immediately on rate/price edits", () => {
    const start = createDefaultSpreadsheetInputs(25.2);
    const scaled500 = rescaleSpreadsheetByPlants(start, 500);
    expect(scaled500.plants).toBe(500);
    expect(scaled500.rows.find((r) => r.id === "substrate")?.roverQty).toBe(500);

    const out500 = evaluateSpreadsheet(scaled500);
    expect(out500.totalHarvestKg).toBe(2250.0);
    expect(out500.grossRevenueUsd).toBe(1800.0);
    expect(out500.costPerPlantRoverUsd).toBe(0.82);

    // Resetting back to 69 preserves exact benchmark without rounding drift
    const back69 = rescaleSpreadsheetByPlants(scaled500, 69);
    expect(back69.rows.find((r) => r.id === "water")?.roverQty).toBe(7.94);

    // Editing selling price $0.80 -> $1.20 recalculates Gross Revenue, Net Profit, Margin, Break-Even Yield
    const highPrice = evaluateSpreadsheet({ ...start, sellingPricePerKg: 1.2 });
    expect(highPrice.grossRevenueUsd).toBe(372.6);
    expect(highPrice.netProfitUsd).toBe(315.98);
    expect(highPrice.breakEvenYieldKg).toBe(47.2);
  });
});
