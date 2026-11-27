export type LedgerRowId =
  | "water"
  | "electricity"
  | "fertilizer"
  | "protection"
  | "substrate"
  | "labor";

export type LedgerInputRow = {
  id: LedgerRowId;
  rowNum: 2 | 3 | 4 | 5 | 6 | 7;
  label: string;
  unit: string;
  roverQty: number;
  stdQty: number;
  unitRateUsd: number;
  qtyDecimals: number;
  rateDecimals: number;
  customRoverQty?: boolean;
  customStdQty?: boolean;
  note: string;
};

export type SpreadsheetInputs = {
  plants: number;
  cycleDays: number;
  exchangeRate: number;
  yieldKgPerPlant: number;
  sellingPricePerKg: number;
  riskProtectedUsd: number;
  rows: LedgerInputRow[];
};

export type ComputedLedgerRow = LedgerInputRow & {
  roverCostUsd: number;
  roverCostRiel: number;
  stdCostUsd: number;
  stdCostRiel: number;
  savedUsd: number;
  savedRiel: number;
  savedPct: number;
};

export type ComputedSpreadsheet = {
  rows: ComputedLedgerRow[];
  totalRoverCostUsd: number;
  totalRoverCostRiel: number;
  totalStdCostUsd: number;
  totalStdCostRiel: number;
  totalSavedUsd: number;
  totalSavedRiel: number;
  totalSavedPct: number;
  costPerPlantRoverUsd: number;
  costPerPlantRoverRiel: number;
  costPerPlantStdUsd: number;
  costPerPlantStdRiel: number;
  savedPerPlantUsd: number;
  savedPerPlantRiel: number;
  totalHarvestKg: number;
  grossRevenueUsd: number;
  grossRevenueRiel: number;
  netProfitUsd: number;
  netProfitRiel: number;
  netMarginPct: number;
  breakEvenPricePerKg: number;
  breakEvenPriceRielPerKg: number;
  breakEvenYieldKg: number;
  breakEvenYieldPctOfExpected: number;
  totalEconomicAdvantageUsd: number;
  totalEconomicAdvantageRiel: number;
};

export const PLANT_PRESETS = [
  { plants: 69, label: "69 Plants · Current Farm" },
  { plants: 100, label: "100 Plants" },
  { plants: 500, label: "500 Plants" },
  { plants: 1000, label: "1,000 Plants" },
] as const;

export const DEFAULT_BENCHMARK_PLANTS = 69;
export const DEFAULT_EXCHANGE_RATE = 4080;

const BASE_ROWS_69: LedgerInputRow[] = [
  {
    id: "water",
    rowNum: 2,
    label: "Irrigation Water (m³)",
    unit: "m³",
    roverQty: 7.94,
    stdQty: 11.0,
    unitRateUsd: 0.55,
    qtyDecimals: 2,
    rateDecimals: 2,
    note: "58–72% moisture-threshold precision drip (115 L/plant)",
  },
  {
    id: "electricity",
    rowNum: 3,
    label: "Electricity — Drip Pump & Rover (kWh)",
    unit: "kWh",
    roverQty: 26.5,
    stdQty: 38.0,
    unitRateUsd: 0.18,
    qtyDecimals: 1,
    rateDecimals: 2,
    note: "Shorter targeted drip pump runs & smart sensor sleep cycles",
  },
  {
    id: "fertilizer",
    rowNum: 4,
    label: "Fertilizers & Soil Amendments (kg)",
    unit: "kg",
    roverQty: 11.2,
    stdQty: 14.5,
    unitRateUsd: 1.15,
    qtyDecimals: 1,
    rateDecimals: 2,
    note: "Mulder's balance skips heavy N where probe N >= 80 mg/kg",
  },
  {
    id: "protection",
    rowNum: 5,
    label: "Crop Protection & Bio-Treatments (L)",
    unit: "L",
    roverQty: 2.6,
    stdQty: 4.2,
    unitRateUsd: 2.4,
    qtyDecimals: 1,
    rateDecimals: 2,
    note: "Spot-treats Health vision alerts rather than blanket spraying",
  },
  {
    id: "substrate",
    rowNum: 6,
    label: "Seedlings, Coco-Peat & Twine (plants)",
    unit: "plants",
    roverQty: 69,
    stdQty: 69,
    unitRateUsd: 0.22,
    qtyDecimals: 0,
    rateDecimals: 2,
    note: "Direct seedling & substrate establishment cost",
  },
  {
    id: "labor",
    rowNum: 7,
    label: "Field Scouting & Labor (hours)",
    unit: "hrs",
    roverQty: 8.5,
    stdQty: 16.0,
    unitRateUsd: 1.55,
    qtyDecimals: 1,
    rateDecimals: 2,
    note: "Autonomous morning rover rounds replace manual daily walks",
  },
];

function roundTo(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((val + 1e-9) * factor) / factor;
}

export function round2(val: number): number {
  return roundTo(val, 2);
}

/** Convert USD into Riel using current exchange rate, rounded sensibly by scale. */
export function convertToRiel(usd: number, exchangeRate: number): number {
  const raw = usd * Math.max(0, exchangeRate);
  if (Math.abs(usd) >= 5) return Math.round(raw / 100) * 100;
  if (Math.abs(usd) >= 1) return Math.round(raw / 10) * 10;
  return Math.round(raw);
}

export function createDefaultSpreadsheetInputs(riskProtectedUsd = 25.2): SpreadsheetInputs {
  return {
    plants: DEFAULT_BENCHMARK_PLANTS,
    cycleDays: 110,
    exchangeRate: DEFAULT_EXCHANGE_RATE,
    yieldKgPerPlant: 4.5,
    sellingPricePerKg: 0.8,
    riskProtectedUsd: round2(riskProtectedUsd),
    rows: BASE_ROWS_69.map((r) => ({ ...r })),
  };
}

/**
 * Re-scale cell quantities when plant count (cell B1) changes,
 * without overwriting edited unit rates.
 */
export function rescaleSpreadsheetByPlants(
  prev: SpreadsheetInputs,
  nextPlantsRaw: number,
): SpreadsheetInputs {
  const nextPlants = Math.max(1, Math.round(Number.isFinite(nextPlantsRaw) ? nextPlantsRaw : 1));
  const prevPlants = Math.max(1, prev.plants);
  const ratioFromPrev = nextPlants / prevPlants;

  const baseById = new Map(BASE_ROWS_69.map((r) => [r.id, r]));

  const nextRows = prev.rows.map((r) => {
    const base = baseById.get(r.id);
    if (r.id === "substrate") {
      return {
        ...r,
        roverQty: nextPlants,
        stdQty: nextPlants,
        customRoverQty: false,
        customStdQty: false,
      };
    }

    const roverQty =
      !r.customRoverQty && base
        ? roundTo(base.roverQty * (nextPlants / DEFAULT_BENCHMARK_PLANTS), r.qtyDecimals)
        : roundTo(r.roverQty * ratioFromPrev, r.qtyDecimals);

    const stdQty =
      !r.customStdQty && base
        ? roundTo(base.stdQty * (nextPlants / DEFAULT_BENCHMARK_PLANTS), r.qtyDecimals)
        : roundTo(r.stdQty * ratioFromPrev, r.qtyDecimals);

    return {
      ...r,
      roverQty,
      stdQty,
    };
  });

  return {
    ...prev,
    plants: nextPlants,
    rows: nextRows,
  };
}

/** Pure Excel formula evaluator over sheet inputs. */
export function evaluateSpreadsheet(inputs: SpreadsheetInputs): ComputedSpreadsheet {
  const plants = Math.max(1, inputs.plants);
  const rate = Math.max(1, inputs.exchangeRate);

  const rows: ComputedLedgerRow[] = inputs.rows.map((r) => {
    const roverQty = Math.max(0, r.roverQty);
    const stdQty = Math.max(0, r.stdQty);
    const unitRate = Math.max(0, r.unitRateUsd);

    const roverCostUsd = round2(roverQty * unitRate);
    const stdCostUsd = round2(stdQty * unitRate);
    const savedUsd = round2(stdCostUsd - roverCostUsd);
    const savedPct = stdCostUsd > 0 ? Math.round((savedUsd / stdCostUsd) * 100) : 0;

    return {
      ...r,
      roverQty,
      stdQty,
      unitRateUsd: unitRate,
      roverCostUsd,
      roverCostRiel: convertToRiel(roverCostUsd, rate),
      stdCostUsd,
      stdCostRiel: convertToRiel(stdCostUsd, rate),
      savedUsd,
      savedRiel: convertToRiel(savedUsd, rate),
      savedPct,
    };
  });

  const totalRoverCostUsd = round2(rows.reduce((s, r) => s + r.roverCostUsd, 0));
  const totalStdCostUsd = round2(rows.reduce((s, r) => s + r.stdCostUsd, 0));
  const totalSavedUsd = round2(totalStdCostUsd - totalRoverCostUsd);
  const totalSavedPct = totalStdCostUsd > 0 ? Math.round((totalSavedUsd / totalStdCostUsd) * 100) : 0;

  const totalRoverCostRiel = convertToRiel(totalRoverCostUsd, rate);
  const totalStdCostRiel = convertToRiel(totalStdCostUsd, rate);
  const totalSavedRiel = convertToRiel(totalSavedUsd, rate);

  const costPerPlantRoverUsd = round2(totalRoverCostUsd / plants);
  const costPerPlantStdUsd = round2(totalStdCostUsd / plants);
  const savedPerPlantUsd = round2(costPerPlantStdUsd - costPerPlantRoverUsd);

  const costPerPlantRoverRiel = Math.round((costPerPlantRoverUsd * rate) / 10) * 10;
  const costPerPlantStdRiel = Math.round((costPerPlantStdUsd * rate) / 10) * 10;
  const savedPerPlantRiel = Math.max(0, costPerPlantStdRiel - costPerPlantRoverRiel);

  const yieldKg = Math.max(0, inputs.yieldKgPerPlant);
  const pricePerKg = Math.max(0, inputs.sellingPricePerKg);
  const riskUsd = Math.max(0, inputs.riskProtectedUsd);

  const totalHarvestKg = roundTo(plants * yieldKg, 1);
  const grossRevenueUsd = round2(totalHarvestKg * pricePerKg);
  const grossRevenueRiel = convertToRiel(grossRevenueUsd, rate);

  const netProfitUsd = round2(grossRevenueUsd - totalRoverCostUsd);
  const netProfitRiel = convertToRiel(netProfitUsd, rate);
  const netMarginPct = grossRevenueUsd > 0 ? roundTo((netProfitUsd / grossRevenueUsd) * 100, 1) : 0;

  const breakEvenPricePerKg = totalHarvestKg > 0 ? round2(totalRoverCostUsd / totalHarvestKg) : 0;
  const breakEvenPriceRielPerKg = Math.round(breakEvenPricePerKg * rate);

  const breakEvenYieldKg = pricePerKg > 0 ? roundTo(totalRoverCostUsd / pricePerKg, 1) : 0;
  const breakEvenYieldPctOfExpected =
    totalHarvestKg > 0 ? roundTo((breakEvenYieldKg / totalHarvestKg) * 100, 1) : 0;

  const totalEconomicAdvantageUsd = round2(totalSavedUsd + riskUsd);
  const totalEconomicAdvantageRiel = convertToRiel(totalEconomicAdvantageUsd, rate);

  return {
    rows,
    totalRoverCostUsd,
    totalRoverCostRiel,
    totalStdCostUsd,
    totalStdCostRiel,
    totalSavedUsd,
    totalSavedRiel,
    totalSavedPct,
    costPerPlantRoverUsd,
    costPerPlantRoverRiel,
    costPerPlantStdUsd,
    costPerPlantStdRiel,
    savedPerPlantUsd,
    savedPerPlantRiel,
    totalHarvestKg,
    grossRevenueUsd,
    grossRevenueRiel,
    netProfitUsd,
    netProfitRiel,
    netMarginPct,
    breakEvenPricePerKg,
    breakEvenPriceRielPerKg,
    breakEvenYieldKg,
    breakEvenYieldPctOfExpected,
    totalEconomicAdvantageUsd,
    totalEconomicAdvantageRiel,
  };
}
