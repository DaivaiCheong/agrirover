import { buildBlockSoilRows, getBlockSoilProfile, targetsFromConditions, type PlantSoilRow } from "./soil";
import type { BedConditions, Cycle, RoverCell, SavedPhoto, SurveySummary } from "./api";

export type RoundDetail = SurveySummary & { cells: RoverCell[] };

export type FinanceScale = "plant" | "block" | "farm";

export type CostCategoryId = "water" | "electricity" | "fertilizer" | "protection" | "substrate" | "labor";

export type CostCategoryLine = {
  id: CostCategoryId;
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

export type OptimizationLeverItem = {
  id: string;
  lever: string;
  action: string;
  impactUsd: number;
  impactRiel: number;
  impactNote: string;
};

export type RiskProtectionRow = {
  id: string;
  riskFactor: string;
  statusText: string;
  alertCount: number;
  protectedUsd: number;
  protectedRiel: number;
  route: string;
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
  levers: OptimizationLeverItem[];
  riskLedger: RiskProtectionRow[];
};

export const KHR_PER_USD = 4085;
export const BENCHMARK_FARM_PLANTS = 69;
export const EXPECTED_KG_PER_PLANT = 4.5;
export const PRICE_USD_PER_KG = 0.8;
export const LITRES_PER_PLANT_CYCLE = 115;

export const UNIT_REVENUE_USD = 3.6;
export const UNIT_REVENUE_RIEL = 14700;
export const UNIT_TOTAL_COST_USD = 0.82;
export const UNIT_TOTAL_COST_RIEL = 3350;
export const UNIT_TRAD_COST_USD = 1.15;
export const UNIT_TRAD_COST_RIEL = 4700;
export const UNIT_SAVED_USD = 0.33;
export const UNIT_SAVED_RIEL = 1350;
export const UNIT_PROFIT_USD = 2.78;
export const UNIT_PROFIT_RIEL = 11350;

type LedgerTemplate = {
  id: CostCategoryId;
  label: string;
  unitLabel: string;
  unitRateLabel: string;
  stdQtyBase: number;
  roverQtyBase: number;
  qtyDecimals: number;
  stdUsdBase: number;
  roverUsdBase: number;
  savedPct: number;
  isFixed?: boolean;
  note: string;
};

// 69-plant Tomato Cycle Accounting Ledger (sum Standard = $79.63, AgriRover = $56.58 / $0.82 per plant, Saved = $23.05)
const FARM_LEDGER_TEMPLATES: LedgerTemplate[] = [
  {
    id: "water",
    label: "Irrigation Water (m³)",
    unitLabel: "m³",
    unitRateLabel: "$0.55 / m³",
    stdQtyBase: 11.0,
    roverQtyBase: 7.94,
    qtyDecimals: 2,
    stdUsdBase: 6.05,
    roverUsdBase: 4.37,
    savedPct: 28,
    note: "58–72% moisture-threshold precision drip (115 L/plant)",
  },
  {
    id: "electricity",
    label: "Electricity (Pump, Sensors & Rover)",
    unitLabel: "kWh",
    unitRateLabel: "$0.18 / kWh",
    stdQtyBase: 38.0,
    roverQtyBase: 26.5,
    qtyDecimals: 1,
    stdUsdBase: 6.84,
    roverUsdBase: 4.77,
    savedPct: 30,
    note: "Shorter targeted drip pump runs & smart sensor sleep cycles",
  },
  {
    id: "fertilizer",
    label: "Fertilizers & Soil Amendments",
    unitLabel: "kg",
    unitRateLabel: "$1.15 / kg",
    stdQtyBase: 14.5,
    roverQtyBase: 11.2,
    qtyDecimals: 1,
    stdUsdBase: 16.68,
    roverUsdBase: 12.88,
    savedPct: 23,
    note: "Mulder's balance skips heavy N where soil N ≥ 80 mg/kg",
  },
  {
    id: "protection",
    label: "Crop Protection & Bio-Treatments",
    unitLabel: "L",
    unitRateLabel: "$2.40 / L",
    stdQtyBase: 4.2,
    roverQtyBase: 2.6,
    qtyDecimals: 1,
    stdUsdBase: 10.08,
    roverUsdBase: 6.24,
    savedPct: 38,
    note: "Spot-treats Health vision alerts rather than blanket spraying",
  },
  {
    id: "substrate",
    label: "Seedlings, Coco-Peat & Trellis Twine",
    unitLabel: "plants",
    unitRateLabel: "$0.22 / plant",
    stdQtyBase: 69,
    roverQtyBase: 69,
    qtyDecimals: 0,
    stdUsdBase: 15.18,
    roverUsdBase: 15.18,
    savedPct: 0,
    isFixed: true,
    note: "Fixed direct establishment input per transplanted tomato seedling",
  },
  {
    id: "labor",
    label: "Field Scouting & Application Labor",
    unitLabel: "hrs",
    unitRateLabel: "$1.55 / hr",
    stdQtyBase: 16.0,
    roverQtyBase: 8.5,
    qtyDecimals: 1,
    stdUsdBase: 24.8,
    roverUsdBase: 13.14,
    savedPct: 47,
    note: "Autonomous 07:00 AM rover rounds replace daily manual bed walks",
  },
];

/** Format USD alongside approximate Cambodian Riel (~X ៛). */
export function usdAndRiel(usdVal: number, rielVal: number, digits = 2): string {
  return `$${usdVal.toFixed(digits)} (~${Math.round(rielVal).toLocaleString()} ៛)`;
}

export function usdToRiel(usdVal: number): number {
  return Math.round((usdVal * 4080) / 100) * 100;
}

/** Each caught alert preserves ~1 fruiting tomato plant's harvest value ($3.60 / ~14,700 ៛ -> 7 alerts = $25.20 / ~102,900 ៛). */
const PREVENTED_USD_PER_ALERT = UNIT_REVENUE_USD;
const PREVENTED_RIEL_PER_ALERT = UNIT_REVENUE_RIEL;

function formatQty(val: number, unit: string, decimals: number): string {
  if (unit === "m³") {
    const litres = Math.round(val * 1000).toLocaleString();
    return `${val.toFixed(decimals)} m³ (${litres} L)`;
  }
  if (unit === "plants") {
    const n = val === 1 ? "1 plant" : `${Math.round(val)} plants`;
    return n;
  }
  return `${val.toFixed(decimals)} ${unit}`;
}

export function buildAllBlockEconomics(input: {
  cycles: Cycle[];
  zones: { zone: string; label: string | null; areaM2?: number | null }[];
  conditions: BedConditions[];
  roundsByZone: Map<string, RoundDetail | undefined>;
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
    const traditionalTotalUsd = Number(((activePlants / BENCHMARK_FARM_PLANTS) * 79.63).toFixed(2));
    const savedTotalUsd = Number(Math.max(0, traditionalTotalUsd - budgetUsd).toFixed(2));
    const savedTotalRiel = usdToRiel(savedTotalUsd);
    const traditionalTotalRiel = budgetRiel + savedTotalRiel;
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

function buildScaledLedgerLines(plantCount: number, targetRoverTotal: number, targetStdTotal: number): CostCategoryLine[] {
  const ratio = plantCount / BENCHMARK_FARM_PLANTS;
  const raw = FARM_LEDGER_TEMPLATES.map((tpl) => {
    const roverUsd = Number((tpl.roverUsdBase * ratio).toFixed(2));
    const traditionalUsd = tpl.isFixed ? roverUsd : Number((tpl.stdUsdBase * ratio).toFixed(2));
    const stdQty = tpl.stdQtyBase * ratio;
    const roverQty = tpl.roverQtyBase * ratio;
    return { tpl, roverUsd, traditionalUsd, stdQty, roverQty };
  });

  // Reconcile any 1-cent scaling residual on labor so column sums match COGS footer to the cent
  const roverSum = Number(raw.reduce((s, x) => s + x.roverUsd, 0).toFixed(2));
  const stdSum = Number(raw.reduce((s, x) => s + x.traditionalUsd, 0).toFixed(2));
  const last = raw[raw.length - 1];
  if (last && plantCount > 0) {
    last.roverUsd = Number((last.roverUsd + (targetRoverTotal - roverSum)).toFixed(2));
    last.traditionalUsd = Number((last.traditionalUsd + (targetStdTotal - stdSum)).toFixed(2));
  }

  return raw.map(({ tpl, roverUsd, traditionalUsd, stdQty, roverQty }) => {
    const savedUsd = Number(Math.max(0, traditionalUsd - roverUsd).toFixed(2));
    const perPlantUsd = plantCount > 0 ? Number((roverUsd / plantCount).toFixed(3)) : Number((tpl.roverUsdBase / BENCHMARK_FARM_PLANTS).toFixed(3));
    const roverRiel = plantCount === 1 ? Math.round((roverUsd * KHR_PER_USD) / 5) * 5 : usdToRiel(roverUsd);
    const traditionalRiel =
      plantCount === 1 ? Math.round((traditionalUsd * KHR_PER_USD) / 5) * 5 : usdToRiel(traditionalUsd);
    const savedRiel = Math.max(0, traditionalRiel - roverRiel);
    const qtyDec = plantCount === 1 && tpl.qtyDecimals > 0 ? Math.min(3, tpl.qtyDecimals + 1) : tpl.qtyDecimals;

    const estQtyLabel =
      tpl.id === "water"
        ? `${roverQty.toFixed(qtyDec)} m³ (${Math.round(plantCount * LITRES_PER_PLANT_CYCLE).toLocaleString()} L)`
        : formatQty(roverQty, tpl.unitLabel, qtyDec);

    return {
      id: tpl.id,
      label: tpl.label,
      unitLabel: tpl.unitLabel,
      estQtyLabel,
      stdQtyLabel: tpl.isFixed ? "Fixed direct input" : `Std: ${formatQty(stdQty, tpl.unitLabel, qtyDec)}`,
      unitRateLabel: tpl.unitRateLabel,
      roverUsd,
      roverRiel,
      perPlantUsd,
      traditionalUsd,
      traditionalRiel,
      savedUsd,
      savedRiel,
      savedPct: tpl.savedPct,
      isFixed: tpl.isFixed,
      note: tpl.note,
    };
  });
}

function buildRiskProtectionLedger(scale: FinanceScale, alerts: AlertRiskItem[]): RiskProtectionRow[] {
  if (scale === "plant") {
    return [
      {
        id: "plant-early-care",
        riskFactor: "Early Stress Detection Value",
        statusText: "Protecting 1 fruiting tomato plant (~4.5 kg cycle yield)",
        alertCount: 1,
        protectedUsd: UNIT_REVENUE_USD,
        protectedRiel: UNIT_REVENUE_RIEL,
        route: "/crop",
      },
    ];
  }

  if (alerts.length === 0) {
    return [
      {
        id: "healthy-block",
        riskFactor: "Canopy & Root Health Status",
        statusText: "0 active alerts — automated rover rounds monitoring daily",
        alertCount: 0,
        protectedUsd: 0,
        protectedRiel: 0,
        route: "/crop",
      },
    ];
  }

  const blight = alerts.filter((a) => /blight/i.test(a.condition));
  const curl = alerts.filter((a) => /curl/i.test(a.condition));
  const nutritionAndPest = alerts.filter((a) => !/blight|curl/i.test(a.condition));

  const formatLocs = (items: AlertRiskItem[]) =>
    items.map((i) => `${i.zone.toUpperCase()} ${i.plantName}`).join(", ");

  const rows: RiskProtectionRow[] = [];
  if (blight.length > 0) {
    rows.push({
      id: "early-blight",
      riskFactor: "Early Blight (fungal risk)",
      statusText: `${blight.length} plant${blight.length === 1 ? "" : "s"} flagged early (${formatLocs(blight)})`,
      alertCount: blight.length,
      protectedUsd: Number((blight.length * PREVENTED_USD_PER_ALERT).toFixed(2)),
      protectedRiel: blight.length * PREVENTED_RIEL_PER_ALERT,
      route: "/crop?tab=guide#early-blight",
    });
  }
  if (nutritionAndPest.length > 0) {
    rows.push({
      id: "nutrition-pest",
      riskFactor: "Nutrient, Calcium & Pest Stress",
      statusText: `${nutritionAndPest.length} plant${nutritionAndPest.length === 1 ? "" : "s"} caught (${formatLocs(nutritionAndPest)})`,
      alertCount: nutritionAndPest.length,
      protectedUsd: Number((nutritionAndPest.length * PREVENTED_USD_PER_ALERT).toFixed(2)),
      protectedRiel: nutritionAndPest.length * PREVENTED_RIEL_PER_ALERT,
      route: "/crop?tab=guide#yellow-leaves",
    });
  }
  if (curl.length > 0) {
    rows.push({
      id: "leaf-curl",
      riskFactor: "Leaf Curl / Moisture Stress",
      statusText: `${curl.length} plant${curl.length === 1 ? "" : "s"} mitigated (${formatLocs(curl)})`,
      alertCount: curl.length,
      protectedUsd: Number((curl.length * PREVENTED_USD_PER_ALERT).toFixed(2)),
      protectedRiel: curl.length * PREVENTED_RIEL_PER_ALERT,
      route: "/crop?tab=guide#leaf-curl",
    });
  }
  return rows;
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
      ? "1 Tomato Plant (Precision Unit Baseline)"
      : scale === "block"
        ? `${chosenBlock?.label ?? selectedZone} (${plantCount} active plants)`
        : `Whole Farm · G1–G6 (${plantCount} active tomato plants)`;

  const scopedAlerts =
    scale === "block"
      ? allRows.filter((r) => r.zone === chosenBlock?.zone && r.vision.status === "alert")
      : allRows.filter((r) => r.vision.status === "alert");

  const blockNameMap = new Map(blocks.map((b) => [b.zone, b.label]));
  const alerts: AlertRiskItem[] = scopedAlerts.map((r) => ({
    zone: r.zone,
    blockLabel: blockNameMap.get(r.zone) ?? r.zone.toUpperCase(),
    plantName: r.name,
    condition: r.vision.condition,
    severity: r.vision.severity ?? "Moderate",
    preventedUsd: UNIT_REVENUE_USD,
    preventedRiel: UNIT_REVENUE_RIEL,
  }));

  const visionAlertCount = alerts.length;
  const totalCostUsd = Number((UNIT_TOTAL_COST_USD * plantCount).toFixed(2));
  const traditionalCostUsd =
    plantCount === 1
      ? UNIT_TRAD_COST_USD
      : plantCount === BENCHMARK_FARM_PLANTS
        ? 79.63
        : Number(((plantCount / BENCHMARK_FARM_PLANTS) * 79.63).toFixed(2));
  const totalSavedUsd = Number(Math.max(0, traditionalCostUsd - totalCostUsd).toFixed(2));
  const savedPct = traditionalCostUsd > 0 ? Math.round((totalSavedUsd / traditionalCostUsd) * 100) : 0;

  const lines = buildScaledLedgerLines(plantCount, totalCostUsd, traditionalCostUsd);

  const expectedYieldKg = Number((EXPECTED_KG_PER_PLANT * plantCount).toFixed(1));
  const projectedRevenueUsd = Number((UNIT_REVENUE_USD * plantCount).toFixed(2));
  const projectedProfitUsd = Number((projectedRevenueUsd - totalCostUsd).toFixed(2));
  const netMarginPct = projectedRevenueUsd > 0 ? Number(((projectedProfitUsd / projectedRevenueUsd) * 100).toFixed(1)) : 0;

  const projectedRevenueRiel = scale === "plant" ? UNIT_REVENUE_RIEL : usdToRiel(projectedRevenueUsd);
  const projectedProfitRiel = scale === "plant" ? UNIT_PROFIT_RIEL : usdToRiel(projectedProfitUsd);
  const totalCostRiel = scale === "plant" ? UNIT_TOTAL_COST_RIEL : Math.max(0, projectedRevenueRiel - projectedProfitRiel);
  const totalSavedRiel = scale === "plant" ? UNIT_SAVED_RIEL : usdToRiel(totalSavedUsd);
  const traditionalCostRiel = scale === "plant" ? UNIT_TRAD_COST_RIEL : totalCostRiel + totalSavedRiel;

  const costPerPlantUsd = plantCount > 0 ? Number((totalCostUsd / plantCount).toFixed(2)) : UNIT_TOTAL_COST_USD;
  const costPerPlantRiel = UNIT_TOTAL_COST_RIEL;
  const tradPerPlantUsd = UNIT_TRAD_COST_USD;
  const marginGainPerPlantUsd = UNIT_SAVED_USD;

  const waterTodayL =
    scale === "plant"
      ? 2.2
      : scale === "block"
        ? chosenBlock?.waterTodayL ?? 0
        : activeBlocks.reduce((s, b) => s + b.waterTodayL, 0);

  const waterCycleL = LITRES_PER_PLANT_CYCLE * plantCount;

  const preventedLossUsd =
    scale === "plant" ? UNIT_REVENUE_USD : Number((visionAlertCount * PREVENTED_USD_PER_ALERT).toFixed(2));
  const preventedLossRiel =
    scale === "plant" ? UNIT_REVENUE_RIEL : visionAlertCount * PREVENTED_RIEL_PER_ALERT;

  // Optimization lever financial impacts tie out cleanly to Water+Electricity, Fertilizer, and Crop Protection+Labor savings
  const waterLine = lines.find((l) => l.id === "water");
  const elecLine = lines.find((l) => l.id === "electricity");
  const fertLine = lines.find((l) => l.id === "fertilizer");
  const protLine = lines.find((l) => l.id === "protection");
  const laborLine = lines.find((l) => l.id === "labor");

  const irrSavedUsd = Number(((waterLine?.savedUsd ?? 0) + (elecLine?.savedUsd ?? 0)).toFixed(2));
  const irrSavedRiel = (waterLine?.savedRiel ?? 0) + (elecLine?.savedRiel ?? 0);
  const fertSavedUsd = Number((fertLine?.savedUsd ?? 0).toFixed(2));
  const fertSavedRiel = fertLine?.savedRiel ?? 0;
  const spotSavedUsd = Number(((protLine?.savedUsd ?? 0) + (laborLine?.savedUsd ?? 0)).toFixed(2));
  const spotSavedRiel = (protLine?.savedRiel ?? 0) + (laborLine?.savedRiel ?? 0);

  const highNRows = (scale === "block" ? allRows.filter((r) => r.zone === chosenBlock?.zone) : allRows).filter(
    (r) => r.readings.n !== null && r.readings.n >= 80,
  ).length;

  const levers: OptimizationLeverItem[] = [
    {
      id: "precision-irrigation",
      lever: "Precision Irrigation",
      action:
        plantCount === 0
          ? "Ready for drip schedule once transplanted"
          : `Delivers ~${LITRES_PER_PLANT_CYCLE} L/plant via 58–72% moisture probes`,
      impactUsd: irrSavedUsd,
      impactRiel: irrSavedRiel,
      impactNote: `Water $${(waterLine?.savedUsd ?? 0).toFixed(2)} + pump $${(elecLine?.savedUsd ?? 0).toFixed(2)}`,
    },
    {
      id: "mulder-guard",
      lever: "Mulder Lockout Guard",
      action:
        highNRows > 0
          ? `Skips Urea on ${highNRows} high-N reads; protects Ca/K uptake`
          : "Balances N-K-Ca feed using live soil probe readings",
      impactUsd: fertSavedUsd,
      impactRiel: fertSavedRiel,
      impactNote: `+8% marketable yield protected`,
    },
    {
      id: "vision-spot-care",
      lever: "Vision Spot-Care",
      action:
        scale === "plant"
          ? "Treats stress only when AI vision flags early lesions"
          : `Spot-treats ${visionAlertCount} flagged plant${visionAlertCount === 1 ? "" : "s"} vs. blanket spray`,
      impactUsd: spotSavedUsd,
      impactRiel: spotSavedRiel,
      impactNote: `Inputs $${(protLine?.savedUsd ?? 0).toFixed(2)} + labor $${(laborLine?.savedUsd ?? 0).toFixed(2)}`,
    },
  ];

  const riskLedger = buildRiskProtectionLedger(scale, alerts);

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
    costPerPlantUsd,
    costPerPlantRiel,
    traditionalCostUsd,
    traditionalCostRiel,
    tradPerPlantUsd,
    totalSavedUsd,
    totalSavedRiel,
    savedPct,
    expectedYieldKg,
    projectedRevenueUsd,
    projectedRevenueRiel,
    projectedProfitUsd,
    projectedProfitRiel,
    netMarginPct,
    marginGainPerPlantUsd,
    visionAlertCount,
    preventedLossUsd,
    preventedLossRiel,
    alerts,
    levers,
    riskLedger,
  };
}
