import { buildBlockSoilRows, getBlockSoilProfile, targetsFromConditions, type PlantSoilRow } from "./soil";
import type { BedConditions, Cycle, SavedPhoto } from "./api";
import type { DemoRoundDetail } from "./roverDemo";

export type FinanceScale = "plant" | "block" | "farm";

export type CostCategoryLine = {
  id: "water" | "nutrients" | "treatment" | "labor";
  label: string;
  roverUsd: number;
  roverRiel: number;
  traditionalUsd: number;
  traditionalRiel: number;
  savedUsd: number;
  savedRiel: number;
  savedPct: number;
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
  cycleId: string;
  label: string;
  variety: string;
  day: number;
  stageTitle: string;
  plantCount: number;
  areaM2: number;
  visionAlertCount: number;
  soilAttentionCount: number;
  waterTodayL: number;
  waterCycleL: number;
  waterFullCycleL: number;
  waterSavedPct: number;
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
  waterCycleL: number;
  waterTodayL: number;
  lines: CostCategoryLine[];
  totalCostUsd: number;
  totalCostRiel: number;
  traditionalCostUsd: number;
  traditionalCostRiel: number;
  totalSavedUsd: number;
  totalSavedRiel: number;
  savedPct: number;
  expectedYieldKg: number;
  projectedRevenueUsd: number;
  projectedRevenueRiel: number;
  projectedProfitUsd: number;
  projectedProfitRiel: number;
  visionAlertCount: number;
  preventedLossUsd: number;
  preventedLossRiel: number;
  alerts: AlertRiskItem[];
};

export const KHR_PER_USD = 4085;
export const EXPECTED_KG_PER_PLANT = 4.5;
export const PRICE_USD_PER_KG = 0.8;
export const LITRES_PER_PLANT_CYCLE = 115;

// Exact unit baseline figures per tomato plant matching AgriRover telemetry benchmarks
const UNIT_LINES: Omit<CostCategoryLine, "roverRiel" | "traditionalRiel" | "savedUsd" | "savedRiel">[] = [
  {
    id: "water",
    label: "Water (Precision Drip via Rover)",
    roverUsd: 0.06,
    traditionalUsd: 0.083,
    savedPct: 28,
    note: "~115 L / cycle per plant · Irrigates only below 72% threshold instead of blanket flooding.",
  },
  {
    id: "nutrients",
    label: "Nutrients & Soil Amendments (NPK + Calcium)",
    roverUsd: 0.18,
    traditionalUsd: 0.23,
    savedPct: 22,
    note: "Skips nitrogen where probe NPK >= 80 mg/kg and targets calcium only where pH/EC warrants.",
  },
  {
    id: "treatment",
    label: "Targeted Disease & Pest Treatment",
    roverUsd: 0.09,
    traditionalUsd: 0.14,
    savedPct: 35,
    note: "Spot-treats only plants flagged by AI Vision instead of whole-field chemical spraying.",
  },
  {
    id: "labor",
    label: "Seedling, Substrate & Labor",
    roverUsd: 0.42,
    traditionalUsd: 0.567,
    savedPct: 26,
    note: "Autonomous rover scouting replaces daily manual row-by-row inspection.",
  },
];

const UNIT_RIEL_MAP = {
  water: { rover: 245, trad: 340 },
  nutrients: { rover: 735, trad: 940 },
  treatment: { rover: 370, trad: 570 },
  labor: { rover: 1715, trad: 2315 },
} as const;

export const UNIT_REVENUE_USD = 3.6;
export const UNIT_REVENUE_RIEL = 14700;
export const UNIT_TOTAL_COST_USD = 0.75;
export const UNIT_TOTAL_COST_RIEL = 3065;
export const UNIT_TRAD_COST_USD = 1.02;
export const UNIT_TRAD_COST_RIEL = 4165;
export const UNIT_SAVED_USD = 0.27;
export const UNIT_SAVED_RIEL = 1100;
export const UNIT_PROFIT_USD = 2.85;
export const UNIT_PROFIT_RIEL = 11635;

/** Format USD alongside approximate Cambodian Riel (~X ៛). */
export function usdAndRiel(usdVal: number, rielVal: number, digits = 2): string {
  return `$${usdVal.toFixed(digits)} (~${Math.round(rielVal).toLocaleString()} ៛)`;
}

export function usdToRiel(usdVal: number): number {
  return Math.round((usdVal * KHR_PER_USD) / 100) * 100;
}

/** Catching an early disease/pest cluster prevents yield spread loss (~3 adjacent fruiting plants at $3.60 each = $10.80 / alert). */
const PREVENTED_USD_PER_ALERT = 10.8;
const PREVENTED_RIEL_PER_ALERT = 44100;

export function buildAllBlockEconomics(input: {
  cycles: Cycle[];
  zones: { zone: string; label: string | null; areaM2?: number | null }[];
  conditions: BedConditions[];
  roundsByZone: Map<string, DemoRoundDetail | undefined>;
  savedPhotos?: SavedPhoto[];
}): { blocks: BlockFinanceSummary[]; allRows: PlantSoilRow[] } {
  const { cycles, zones, conditions, roundsByZone, savedPhotos = [] } = input;
  const cycleByZone = new Map(cycles.filter((c) => c.status === "active").map((c) => [c.zone, c]));
  const condByZone = new Map(conditions.map((c) => [c.zone, c]));

  const blocks: BlockFinanceSummary[] = [];
  const allRows: PlantSoilRow[] = [];

  for (const z of zones) {
    const cycle = cycleByZone.get(z.zone);
    const round = roundsByZone.get(z.zone);
    const cond = condByZone.get(z.zone);
    const rows =
      round?.rows && round?.cols
        ? buildBlockSoilRows({
            zone: z.zone,
            rows: round.rows,
            cols: round.cols,
            cells: round.cells,
            conditions: cond,
            photos: savedPhotos,
            profile: getBlockSoilProfile(z.zone),
            capturedAt: round.finishedAt ?? round.startedAt,
          })
        : [];
    allRows.push(...rows);

    const activePlants = rows.length > 0 ? rows.filter((r) => r.plant).length : (cycle?.plantCount ?? 0);
    const visionAlerts = rows.filter((r) => r.vision.status === "alert").length;
    const soilAttention = rows.filter((r) => r.status === "attention").length;
    const waterTodayL = Math.round(rows.reduce((s, r) => s + (r.waterLitres ?? 0), 0));

    const waterCycleL = activePlants * LITRES_PER_PLANT_CYCLE;
    const waterFullCycleL = Math.round(waterCycleL / 0.72);
    const budgetUsd = Number((activePlants * UNIT_TOTAL_COST_USD).toFixed(2));
    const budgetRiel = activePlants * UNIT_TOTAL_COST_RIEL;
    const progress = cycle?.day ? Math.min(1, Math.max(0.35, cycle.day / 110)) : 0;
    const spentToDateUsd = Number((budgetUsd * progress).toFixed(2));
    const spentToDateRiel = Math.round((budgetRiel * progress) / 100) * 100;
    const traditionalTotalUsd = Number((activePlants * UNIT_TRAD_COST_USD).toFixed(2));
    const traditionalTotalRiel = activePlants * UNIT_TRAD_COST_RIEL;
    const savedTotalUsd = Number((traditionalTotalUsd - budgetUsd).toFixed(2));
    const savedTotalRiel = traditionalTotalRiel - budgetRiel;
    const expectedYieldKg = Number((activePlants * EXPECTED_KG_PER_PLANT).toFixed(1));
    const projectedRevenueUsd = Number((activePlants * UNIT_REVENUE_USD).toFixed(2));
    const projectedRevenueRiel = activePlants * UNIT_REVENUE_RIEL;
    const projectedProfitUsd = Number((projectedRevenueUsd - budgetUsd).toFixed(2));
    const projectedProfitRiel = projectedRevenueRiel - budgetRiel;
    const preventedLossUsd = Number((visionAlerts * PREVENTED_USD_PER_ALERT).toFixed(2));
    const preventedLossRiel = visionAlerts * PREVENTED_RIEL_PER_ALERT;

    blocks.push({
      zone: z.zone,
      cycleId: cycle?.id ?? `demo-cycle-${z.zone}`,
      label: z.label ?? cycle?.bedLabel ?? z.zone.toUpperCase(),
      variety: cycle?.variety ?? "Tomato (ready)",
      day: cycle?.day ?? 0,
      stageTitle: cycle?.stageTitle ?? "Prepared / Awaiting planting",
      plantCount: activePlants,
      areaM2: z.areaM2 ?? cycle?.areaM2 ?? 0,
      visionAlertCount: visionAlerts,
      soilAttentionCount: soilAttention,
      waterTodayL,
      waterCycleL,
      waterFullCycleL,
      waterSavedPct: 28,
      costPerPlantUsd: UNIT_TOTAL_COST_USD,
      costPerPlantRiel: UNIT_TOTAL_COST_RIEL,
      spentToDateUsd,
      spentToDateRiel,
      budgetUsd,
      budgetRiel,
      traditionalTotalUsd,
      traditionalTotalRiel,
      savedTotalUsd,
      savedTotalRiel,
      expectedYieldKg,
      projectedRevenueUsd,
      projectedRevenueRiel,
      projectedProfitUsd,
      projectedProfitRiel,
      preventedLossUsd,
      preventedLossRiel,
    });
  }

  return { blocks, allRows };
}

export function computeFinanceView(input: {
  scale: FinanceScale;
  selectedZone: string;
  blocks: BlockFinanceSummary[];
  allRows: PlantSoilRow[];
}): FinanceScaleReport {
  const { scale, selectedZone, blocks, allRows } = input;
  const activeBlocks = blocks.filter((b) => b.plantCount > 0);
  const chosenBlock = blocks.find((b) => b.zone === selectedZone) ?? activeBlocks[0] ?? blocks[0];

  const plantCount =
    scale === "plant"
      ? 1
      : scale === "block"
        ? chosenBlock?.plantCount ?? 0
        : activeBlocks.reduce((s, b) => s + b.plantCount, 0);

  const scopeTitle =
    scale === "plant"
      ? "1 Tomato Plant (Precision Rover Average)"
      : scale === "block"
        ? `${chosenBlock?.label ?? selectedZone} (${plantCount} active plants)`
        : `Whole Farm · G1–G6 (${plantCount} active tomato plants)`;

  const scopedRows =
    scale === "block"
      ? allRows.filter((r) => r.zone === chosenBlock?.zone && r.vision.status === "alert")
      : allRows.filter((r) => r.vision.status === "alert");

  const blockNameMap = new Map(blocks.map((b) => [b.zone, b.label]));
  const alerts: AlertRiskItem[] = scopedRows.map((r) => ({
    zone: r.zone,
    blockLabel: blockNameMap.get(r.zone) ?? r.zone.toUpperCase(),
    plantName: r.name,
    condition: r.vision.condition,
    severity: r.vision.severity ?? "Moderate",
    preventedUsd: scale === "plant" ? UNIT_REVENUE_USD : PREVENTED_USD_PER_ALERT,
    preventedRiel: scale === "plant" ? UNIT_REVENUE_RIEL : PREVENTED_RIEL_PER_ALERT,
  }));

  const visionAlertCount = alerts.length;
  const lines: CostCategoryLine[] = UNIT_LINES.map((u) => {
    const roverUsd = Number((u.roverUsd * plantCount).toFixed(2));
    const traditionalUsd = Number((u.traditionalUsd * plantCount).toFixed(2));
    const savedUsd = Number(Math.max(0, traditionalUsd - roverUsd).toFixed(2));
    const rielUnit = UNIT_RIEL_MAP[u.id];
    const roverRiel = rielUnit.rover * plantCount;
    const traditionalRiel = rielUnit.trad * plantCount;
    const savedRiel = Math.max(0, traditionalRiel - roverRiel);
    return {
      id: u.id,
      label: u.label,
      roverUsd,
      roverRiel,
      traditionalUsd,
      traditionalRiel,
      savedUsd,
      savedRiel,
      savedPct: u.savedPct,
      note: u.note,
    };
  });

  const totalCostUsd = Number((UNIT_TOTAL_COST_USD * plantCount).toFixed(2));
  const totalCostRiel = UNIT_TOTAL_COST_RIEL * plantCount;
  const traditionalCostUsd = Number((UNIT_TRAD_COST_USD * plantCount).toFixed(2));
  const traditionalCostRiel = UNIT_TRAD_COST_RIEL * plantCount;
  const totalSavedUsd = Number((traditionalCostUsd - totalCostUsd).toFixed(2));
  const totalSavedRiel = traditionalCostRiel - totalCostRiel;
  const savedPct = traditionalCostUsd > 0 ? Math.round((totalSavedUsd / traditionalCostUsd) * 100) : 0;

  const expectedYieldKg = Number((EXPECTED_KG_PER_PLANT * plantCount).toFixed(1));
  const projectedRevenueUsd = Number((UNIT_REVENUE_USD * plantCount).toFixed(2));
  const projectedRevenueRiel = UNIT_REVENUE_RIEL * plantCount;
  const projectedProfitUsd = Number((projectedRevenueUsd - totalCostUsd).toFixed(2));
  const projectedProfitRiel = projectedRevenueRiel - totalCostRiel;

  const waterTodayL =
    scale === "plant"
      ? 2.2
      : scale === "block"
        ? chosenBlock?.waterTodayL ?? 0
        : activeBlocks.reduce((s, b) => s + b.waterTodayL, 0);

  const waterCycleL = LITRES_PER_PLANT_CYCLE * plantCount;

  const preventedLossUsd =
    scale === "plant"
      ? UNIT_REVENUE_USD
      : Number((visionAlertCount * PREVENTED_USD_PER_ALERT).toFixed(2));
  const preventedLossRiel =
    scale === "plant" ? UNIT_REVENUE_RIEL : visionAlertCount * PREVENTED_RIEL_PER_ALERT;

  // Keep targets helper tree-shaken cleanly if needed elsewhere
  void targetsFromConditions;

  return {
    scale,
    scopeTitle,
    plantCount,
    waterCycleL,
    waterTodayL,
    lines,
    totalCostUsd,
    totalCostRiel,
    traditionalCostUsd,
    traditionalCostRiel,
    totalSavedUsd,
    totalSavedRiel,
    savedPct,
    expectedYieldKg,
    projectedRevenueUsd,
    projectedRevenueRiel,
    projectedProfitUsd,
    projectedProfitRiel,
    visionAlertCount,
    preventedLossUsd,
    preventedLossRiel,
    alerts,
  };
}
