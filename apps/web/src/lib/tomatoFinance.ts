import { buildBlockSoilRows, defaultBlockSoilProfile, type PlantSoilRow } from "./soil";
import type { Advice, BedConditions, Cycle, RoverCell, SavedPhoto, SurveySummary, ZoneNow } from "./api";
import { evaluateSpreadsheet, type ComputedLedgerRow, type SpreadsheetInputs } from "./financeSpreadsheet";

/**
 * Block and farm economics, from the farm's own records:
 *  - the BUDGET per plant comes from the Finance workbook (saved in MongoDB), never a constant
 *  - SPENT comes from the cost ledger (typed costs and stock used on the crop)
 *  - water comes from today's advice, which comes from the rover's last round
 * Change the workbook in Finance and every page that shows a cost per plant follows.
 */

export type RoundDetail = SurveySummary & { cells: RoverCell[] };

export type FinanceScale = "plant" | "block" | "farm";

export type CostCategoryId = "water" | "electricity" | "fertilizer" | "protection" | "substrate" | "labor";

/** What the workbook says one plant costs and earns, and the rate to show riel with. */
export type FinanceBasis = {
  workbookPlants: number;
  roverPerPlantUsd: number;
  stdPerPlantUsd: number;
  yieldKgPerPlant: number;
  pricePerKg: number;
  khrPerUsd: number;
  rows: ComputedLedgerRow[];
};

export type CostCategoryLine = {
  id: string;
  label: string;
  unitLabel: string;
  estQtyLabel: string;
  stdQtyLabel: string;
  unitRateLabel: string;
  roverUsd: number;
  roverRiel: number;
  perPlantUsd: number;
  traditionalUsd: number;
  traditionalRiel: number;
  savedUsd: number;
  savedRiel: number;
  savedPct: number;
  isFixed?: boolean;
  note: string;
};

export type AlertRiskItem = {
  zone: string;
  blockLabel: string;
  plantName: string;
  condition: string;
  severity: string;
  preventedUsd: number;
  preventedRiel: number;
};

export type BlockFinanceSummary = {
  zone: string;
  cycleId: string | null;
  label: string;
  variety: string | null;
  day: number;
  stageTitle: string | null;
  plantCount: number;
  areaM2: number;
  visionAlertCount: number;
  soilAttentionCount: number;
  waterTodayL: number;
  waterFullTodayL: number;
  waterSavedPct: number | null;
  waterPaused: boolean;
  costPerPlantUsd: number;
  costPerPlantRiel: number;
  spentToDateUsd: number;
  spentToDateRiel: number;
  budgetUsd: number;
  budgetRiel: number;
  traditionalTotalUsd: number;
  traditionalTotalRiel: number;
  savedTotalUsd: number;
  savedTotalRiel: number;
  expectedYieldKg: number;
  pricePerKg: number;
  projectedRevenueUsd: number;
  projectedRevenueRiel: number;
  projectedProfitUsd: number;
  projectedProfitRiel: number;
  preventedLossUsd: number;
  preventedLossRiel: number;
};

export type FinanceScaleReport = {
  scale: FinanceScale;
  scopeTitle: string;
  plantCount: number;
  waterTodayL: number;
  lines: CostCategoryLine[];
  totalCostUsd: number;
  totalCostRiel: number;
  costPerPlantUsd: number;
  costPerPlantRiel: number;
  traditionalCostUsd: number;
  traditionalCostRiel: number;
  tradPerPlantUsd: number;
  totalSavedUsd: number;
  totalSavedRiel: number;
  savedPct: number;
  expectedYieldKg: number;
  projectedRevenueUsd: number;
  projectedRevenueRiel: number;
  projectedProfitUsd: number;
  projectedProfitRiel: number;
  netMarginPct: number;
  marginGainPerPlantUsd: number;
  visionAlertCount: number;
  preventedLossUsd: number;
  preventedLossRiel: number;
  alerts: AlertRiskItem[];
};

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** USD in riel, rounded to 100 riel (to 10 below $5). */
export function usdToRiel(usdVal: number, rate: number): number {
  const raw = usdVal * rate;
  return Math.abs(usdVal) >= 5 ? Math.round(raw / 100) * 100 : Math.round(raw / 10) * 10;
}

/** "$12.34 (~50,300 ៛)". */
export function usdAndRiel(usdVal: number, rate: number, digits = 2): string {
  return `$${usdVal.toFixed(digits)} (~${usdToRiel(usdVal, rate).toLocaleString()} ៛)`;
}

/** The per-plant figures of the saved workbook. The rate is the farm's (Settings) when known. */
export function financeBasis(wb: SpreadsheetInputs, khrPerUsd?: number | null): FinanceBasis {
  const plants = Math.max(1, wb.plants);
  const calc = evaluateSpreadsheet(wb);
  return {
    workbookPlants: plants,
    roverPerPlantUsd: calc.totalRoverCostUsd / plants,
    stdPerPlantUsd: calc.totalStdCostUsd / plants,
    yieldKgPerPlant: wb.yieldKgPerPlant,
    pricePerKg: wb.sellingPricePerKg,
    khrPerUsd: khrPerUsd || wb.exchangeRate,
    rows: calc.rows,
  };
}

export function buildAllBlockEconomics(input: {
  cycles: Cycle[];
  zones: Pick<ZoneNow, "zone" | "label" | "areaM2" | "soilProfile">[];
  conditions: BedConditions[];
  roundsByZone: Map<string, RoundDetail | undefined>;
  basis: FinanceBasis;
  advice?: Advice[];
  savedPhotos?: SavedPhoto[];
  spentByCycle?: Map<string, number>;
}): { blocks: BlockFinanceSummary[]; allRows: PlantSoilRow[] } {
  const { cycles, zones, conditions, roundsByZone, basis, advice = [], savedPhotos = [], spentByCycle } = input;
  const cycleByZone = new Map(cycles.filter((c) => c.status === "active").map((c) => [c.zone, c]));
  const condByZone = new Map(conditions.map((c) => [c.zone, c]));
  const adviceByZone = new Map(advice.map((a) => [a.zone, a]));
  const rate = basis.khrPerUsd;

  const blocks: BlockFinanceSummary[] = [];
  const allRows: PlantSoilRow[] = [];

  for (const z of zones) {
    const cycle = cycleByZone.get(z.zone);
    const round = roundsByZone.get(z.zone);
    const cond = condByZone.get(z.zone);
    const adv = adviceByZone.get(z.zone);
    const rows =
      round?.rows && round?.cols
        ? buildBlockSoilRows({
            zone: z.zone,
            rows: round.rows,
            cols: round.cols,
            cells: round.cells,
            conditions: cond,
            advice: adv,
            photos: savedPhotos,
            profile: z.soilProfile ?? defaultBlockSoilProfile(z.zone),
            capturedAt: round.finishedAt ?? round.startedAt,
          })
        : [];
    allRows.push(...rows);

    const plants = cycle ? cycle.plantCount ?? rows.filter((r) => r.plant).length : 0;
    const visionAlerts = cycle ? rows.filter((r) => r.vision.status === "alert").length : 0;
    const soilAttention = cycle ? rows.filter((r) => r.status === "attention").length : 0;
    const waterTodayL = adv ? adv.water.litres : 0;
    const waterFullTodayL = adv ? adv.water.fullLitres : 0;
    const price = cycle?.expectedPriceUsdPerKg ?? basis.pricePerKg;

    const budgetUsd = r2(plants * basis.roverPerPlantUsd);
    const traditionalTotalUsd = r2(plants * basis.stdPerPlantUsd);
    const savedTotalUsd = r2(Math.max(0, traditionalTotalUsd - budgetUsd));
    const spentToDateUsd = cycle ? r2(spentByCycle?.get(cycle.id) ?? 0) : 0;
    const expectedYieldKg = Number((plants * basis.yieldKgPerPlant).toFixed(1));
    const projectedRevenueUsd = r2(expectedYieldKg * price);
    const projectedProfitUsd = r2(projectedRevenueUsd - budgetUsd);
    const preventedLossUsd = r2(visionAlerts * basis.yieldKgPerPlant * price);

    blocks.push({
      zone: z.zone,
      cycleId: cycle?.id ?? null,
      label: z.label ?? cycle?.bedLabel ?? z.zone.toUpperCase(),
      variety: cycle?.variety ?? null,
      day: cycle?.day ?? 0,
      stageTitle: cycle?.stageTitle ?? null,
      plantCount: plants,
      areaM2: z.areaM2 ?? cycle?.areaM2 ?? 0,
      visionAlertCount: visionAlerts,
      soilAttentionCount: soilAttention,
      waterTodayL,
      waterFullTodayL,
      waterSavedPct: adv && adv.water.fullLitres > 0 ? Math.round((adv.water.savedLitres / adv.water.fullLitres) * 100) : null,
      waterPaused: Boolean(adv?.water.paused),
      costPerPlantUsd: r2(basis.roverPerPlantUsd),
      costPerPlantRiel: usdToRiel(basis.roverPerPlantUsd, rate),
      spentToDateUsd,
      spentToDateRiel: usdToRiel(spentToDateUsd, rate),
      budgetUsd,
      budgetRiel: usdToRiel(budgetUsd, rate),
      traditionalTotalUsd,
      traditionalTotalRiel: usdToRiel(traditionalTotalUsd, rate),
      savedTotalUsd,
      savedTotalRiel: usdToRiel(savedTotalUsd, rate),
      expectedYieldKg,
      pricePerKg: price,
      projectedRevenueUsd,
      projectedRevenueRiel: usdToRiel(projectedRevenueUsd, rate),
      projectedProfitUsd,
      projectedProfitRiel: usdToRiel(projectedProfitUsd, rate),
      preventedLossUsd,
      preventedLossRiel: usdToRiel(preventedLossUsd, rate),
    });
  }

  return { blocks, allRows };
}

function qtyLabel(val: number, unit: string, decimals: number): string {
  if (unit === "plants") return `${Math.round(val)} plant${Math.round(val) === 1 ? "" : "s"}`;
  if (unit === "m³") return `${val.toFixed(decimals)} m³ (${Math.round(val * 1000).toLocaleString()} L)`;
  return `${val.toFixed(decimals)} ${unit}`;
}

/** The workbook's ledger, scaled from its own plant count to `plantCount`. */
function scaledLines(basis: FinanceBasis, plantCount: number): CostCategoryLine[] {
  const ratio = plantCount / basis.workbookPlants;
  const rate = basis.khrPerUsd;
  return basis.rows.map((row) => {
    const roverUsd = r2(row.roverCostUsd * ratio);
    const traditionalUsd = r2(row.stdCostUsd * ratio);
    const savedUsd = r2(Math.max(0, traditionalUsd - roverUsd));
    const dec = plantCount === 1 && row.qtyDecimals > 0 ? Math.min(3, row.qtyDecimals + 1) : row.qtyDecimals;
    const isFixed = row.roverQty === row.stdQty;
    return {
      id: row.id,
      label: row.label,
      unitLabel: row.unit,
      estQtyLabel: qtyLabel(row.roverQty * ratio, row.unit, dec),
      stdQtyLabel: isFixed ? "Same in both" : `Std: ${qtyLabel(row.stdQty * ratio, row.unit, dec)}`,
      unitRateLabel: `$${row.unitRateUsd.toFixed(row.rateDecimals)} / ${row.unit === "plants" ? "plant" : row.unit}`,
      roverUsd,
      roverRiel: usdToRiel(roverUsd, rate),
      perPlantUsd: Number((row.roverCostUsd / basis.workbookPlants).toFixed(3)),
      traditionalUsd,
      traditionalRiel: usdToRiel(traditionalUsd, rate),
      savedUsd,
      savedRiel: usdToRiel(savedUsd, rate),
      savedPct: row.stdCostUsd > 0 ? Math.round(((row.stdCostUsd - row.roverCostUsd) / row.stdCostUsd) * 100) : 0,
      isFixed,
      note: row.note,
    };
  });
}

export function computeFinanceView(input: {
  scale: FinanceScale;
  selectedZone: string | null;
  blocks: BlockFinanceSummary[];
  allRows: PlantSoilRow[];
  basis: FinanceBasis;
}): FinanceScaleReport {
  const { scale, selectedZone, blocks, allRows, basis } = input;
  const rate = basis.khrPerUsd;
  const activeBlocks = blocks.filter((b) => b.plantCount > 0);
  const chosen = blocks.find((b) => b.zone === selectedZone) ?? activeBlocks[0] ?? blocks[0];

  const plantCount =
    scale === "plant" ? 1 : scale === "block" ? chosen?.plantCount ?? 0 : activeBlocks.reduce((s, b) => s + b.plantCount, 0);
  const scopeTitle =
    scale === "plant"
      ? "One tomato plant"
      : scale === "block"
        ? `${chosen?.label ?? selectedZone} (${plantCount} plants)`
        : `Whole farm (${plantCount} plants)`;

  const inScope = (zone: string) => (scale === "block" ? zone === chosen?.zone : activeBlocks.some((b) => b.zone === zone));
  const blockLabel = new Map(blocks.map((b) => [b.zone, b.label]));
  const priceOf = new Map(blocks.map((b) => [b.zone, b.pricePerKg]));
  const alerts: AlertRiskItem[] = scale === "plant"
    ? []
    : allRows
        .filter((r) => r.vision.status === "alert" && inScope(r.zone))
        .map((r) => {
          const usd = r2(basis.yieldKgPerPlant * (priceOf.get(r.zone) ?? basis.pricePerKg));
          return {
            zone: r.zone,
            blockLabel: blockLabel.get(r.zone) ?? r.zone.toUpperCase(),
            plantName: r.name,
            condition: r.vision.condition,
            severity: r.vision.severity ?? "Moderate",
            preventedUsd: usd,
            preventedRiel: usdToRiel(usd, rate),
          };
        });

  const lines = scaledLines(basis, plantCount);
  const totalCostUsd = r2(lines.reduce((s, l) => s + l.roverUsd, 0));
  const traditionalCostUsd = r2(lines.reduce((s, l) => s + l.traditionalUsd, 0));
  const totalSavedUsd = r2(Math.max(0, traditionalCostUsd - totalCostUsd));
  const savedPct = traditionalCostUsd > 0 ? Math.round((totalSavedUsd / traditionalCostUsd) * 100) : 0;

  const expectedYieldKg = Number((basis.yieldKgPerPlant * plantCount).toFixed(1));
  const projectedRevenueUsd = r2(expectedYieldKg * basis.pricePerKg);
  const projectedProfitUsd = r2(projectedRevenueUsd - totalCostUsd);
  const netMarginPct = projectedRevenueUsd > 0 ? Number(((projectedProfitUsd / projectedRevenueUsd) * 100).toFixed(1)) : 0;
  const preventedLossUsd = r2(alerts.reduce((s, a) => s + a.preventedUsd, 0));
  const waterTodayL =
    scale === "plant" ? 0 : scale === "block" ? chosen?.waterTodayL ?? 0 : activeBlocks.reduce((s, b) => s + b.waterTodayL, 0);

  return {
    scale,
    scopeTitle,
    plantCount,
    waterTodayL,
    lines,
    totalCostUsd,
    totalCostRiel: usdToRiel(totalCostUsd, rate),
    costPerPlantUsd: plantCount > 0 ? r2(totalCostUsd / plantCount) : r2(basis.roverPerPlantUsd),
    costPerPlantRiel: usdToRiel(basis.roverPerPlantUsd, rate),
    traditionalCostUsd,
    traditionalCostRiel: usdToRiel(traditionalCostUsd, rate),
    tradPerPlantUsd: r2(basis.stdPerPlantUsd),
    totalSavedUsd,
    totalSavedRiel: usdToRiel(totalSavedUsd, rate),
    savedPct,
    expectedYieldKg,
    projectedRevenueUsd,
    projectedRevenueRiel: usdToRiel(projectedRevenueUsd, rate),
    projectedProfitUsd,
    projectedProfitRiel: usdToRiel(projectedProfitUsd, rate),
    netMarginPct,
    marginGainPerPlantUsd: r2(basis.stdPerPlantUsd - basis.roverPerPlantUsd),
    visionAlertCount: alerts.length,
    preventedLossUsd,
    preventedLossRiel: usdToRiel(preventedLossUsd, rate),
    alerts,
  };
}
