import { describe, expect, it } from "vitest";
import { buildDemoTomatoFarm } from "../test/fixtures";
import { createDefaultSpreadsheetInputs } from "./financeSpreadsheet";
import { buildAllBlockEconomics, computeFinanceView, financeBasis, usdToRiel } from "./tomatoFinance";

function economics(workbook = createDefaultSpreadsheetInputs(0), spent = new Map<string, number>()) {
  const farm = buildDemoTomatoFarm();
  const basis = financeBasis(workbook, 4080);
  const { blocks, allRows } = buildAllBlockEconomics({
    cycles: farm.cycles,
    zones: farm.zones,
    conditions: farm.conditions,
    roundsByZone: farm.roundsByZone,
    basis,
    spentByCycle: spent,
  });
  return { farm, basis, blocks, allRows };
}

describe("Farm economics come from the saved workbook and the ledger", () => {
  it("the whole farm's cost is the workbook's ledger scaled to the plants growing", () => {
    const { basis, blocks, allRows } = economics();
    const whole = computeFinanceView({ scale: "farm", selectedZone: null, blocks, allRows, basis });

    expect(whole.plantCount).toBe(69);
    // the default workbook is written for 69 plants, so the farm view is the workbook itself, line by line
    expect(whole.lines.map((l) => [l.id, l.roverUsd, l.traditionalUsd])).toEqual([
      ["water", 4.37, 6.05],
      ["electricity", 4.77, 6.84],
      ["fertilizer", 12.88, 16.68],
      ["protection", 6.24, 10.08],
      ["substrate", 15.18, 15.18],
      ["labor", 13.18, 24.8],
    ]);
    expect(whole.totalCostUsd).toBe(56.62);
    expect(whole.traditionalCostUsd).toBe(79.63);
    expect(whole.totalSavedUsd).toBe(23.01);
    expect(whole.savedPct).toBe(29);
    expect(whole.costPerPlantUsd).toBe(0.82);
    expect(whole.expectedYieldKg).toBe(310.5);
    expect(whole.projectedRevenueUsd).toBe(248.4);
    expect(whole.projectedProfitUsd).toBe(191.78);
    expect(whole.totalCostRiel).toBe(usdToRiel(56.62, 4080));
    // each flagged plant puts one plant's expected crop at stake: 4.5 kg x $0.80
    expect(whole.visionAlertCount).toBe(7);
    expect(whole.preventedLossUsd).toBe(25.2);
  });

  it("one plant and one block scale the same ledger", () => {
    const { basis, blocks, allRows } = economics();
    const one = computeFinanceView({ scale: "plant", selectedZone: null, blocks, allRows, basis });
    expect(one.plantCount).toBe(1);
    expect(one.totalCostUsd).toBeCloseTo(0.82, 1);
    expect(one.alerts).toEqual([]);

    const g2 = computeFinanceView({ scale: "block", selectedZone: "g2", blocks, allRows, basis });
    expect(g2.plantCount).toBe(10);
    expect(g2.totalCostUsd).toBeCloseTo(8.2, 1);
    expect(g2.visionAlertCount).toBe(2);
    expect(g2.preventedLossUsd).toBe(7.2);
  });

  it("editing the workbook changes every block's budget, and spending comes from the ledger", () => {
    const wb = createDefaultSpreadsheetInputs(0);
    const doubled = { ...wb, rows: wb.rows.map((r) => ({ ...r, unitRateUsd: r.unitRateUsd * 2 })) };
    const base = economics(wb).blocks.find((b) => b.zone === "g1")!;
    const dear = economics(doubled, new Map([["demo-cycle-g1", 4.5]])).blocks.find((b) => b.zone === "g1")!;

    expect(base.spentToDateUsd).toBe(0);
    expect(dear.budgetUsd).toBeCloseTo(base.budgetUsd * 2, 1);
    expect(dear.costPerPlantUsd).toBeCloseTo(base.costPerPlantUsd * 2, 1);
    expect(dear.spentToDateUsd).toBe(4.5);
  });

  it("a bed without a crop has no budget, no plants and no cycle", () => {
    const g6 = economics().blocks.find((b) => b.zone === "g6")!;
    expect(g6.cycleId).toBeNull();
    expect(g6.plantCount).toBe(0);
    expect(g6.budgetUsd).toBe(0);
  });
});
