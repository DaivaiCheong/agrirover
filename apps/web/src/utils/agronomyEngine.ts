import { buildBlockSoilRows, defaultBlockSoilProfile, targetsFromConditions, type PlantSoilRow, type SoilTargets } from "../lib/soil";
import type { TomatoConditionId } from "../lib/treatments";
import { calculatePrescription, type PrescriptionResult } from "./prescriptionCalculator";

export type MulderKey = "low_k" | "high_k" | "high_n" | "high_p" | "low_ca" | "low_mg";

export type MulderRule = {
  key: MulderKey;
  shortLabel: string;
  title: string;
  thresholdHint: string;
  applySynergy: string;
  blocksDoNotMix: string;
  tankMixRule: string;
  expectedResult: string;
};

export type FastCareCard = {
  conditionId: TomatoConditionId | "soil_stress";
  guideId: TomatoConditionId;
  title: string;
  doNowSteps: [string, string, string, string];
  doNow: string;
  doNotMixList: string[];
  doNotMix: string;
  expectedResult: string;
  whyLine: string;
  mulderKeys: MulderKey[];
  prescription: PrescriptionResult;
};

export const TANK_MIX_SAFETY_RULE =
  "Never mix Calcium (Ca) with Sulfates or Phosphates in the same concentrate tank (forms insoluble precipitate).";

export const MULDER_RULES: MulderRule[] = [
  {
    key: "low_k",
    shortLabel: "Low K",
    title: "Low Potassium (< 160 mg/kg)",
    thresholdHint: "Soil K < 160 mg/kg",
    applySynergy: "Drip Potassium Sulfate (K2SO4 50% K2O, ((175 - K) * 15)/(0.5 * 1000) g in 0.5 L/plant).",
    blocksDoNotMix: "0 g simultaneous high Ca or Mg with K2SO4 drip — excess Ca/Mg antagonizes K uptake.",
    tankMixRule: "Tank A: Ca(NO3)2 · Tank B: K2SO4 + Phosphates. Never mix Ca with Sulfates in one concentrate.",
    expectedResult: "Boosts sugar transport, leaf turgor & fruit sizing in 48–72 hrs.",
  },
  {
    key: "high_k",
    shortLabel: "High K",
    title: "Excess Potassium (> 230 mg/kg)",
    thresholdHint: "Soil K > 230 mg/kg",
    applySynergy: "Flush gently with 2.0 L clean water + spray chelated Ca & Mg foliar (3.0 mL/L, 140–180 mL/plant).",
    blocksDoNotMix: "0 g extra Potassium or heavy N — excess K (> 230 mg/kg) blocks Calcium (Ca) & Magnesium (Mg).",
    tankMixRule: "Apply chelated Ca & Mg foliar separately from sulfate/phosphate feeds.",
    expectedResult: "Unlocks root Ca/Mg flow & protects fruiting trusses within 3–5 days.",
  },
  {
    key: "high_n",
    shortLabel: "High N",
    title: "Optimal / High Nitrogen (>= 105 mg/kg)",
    thresholdHint: "Soil N >= 105 mg/kg",
    applySynergy: "0 g soil N · Spray 3.0 mL/L liquid seaweed + 1.0 g/L chelated micros (140 mL/plant) before 09:00 AM.",
    blocksDoNotMix: "0 g Urea or high-N fertilizer — excess N blocks Potassium (K) & Boron and softens stems against blight.",
    tankMixRule: TANK_MIX_SAFETY_RULE,
    expectedResult: "Halts leaf aging cleanly in 48–72 hrs · Saves ~$0.05/plant in wasted fertilizer.",
  },
  {
    key: "high_p",
    shortLabel: "High P",
    title: "Excess Phosphorus (> 85 mg/kg)",
    thresholdHint: "Soil P > 85 mg/kg",
    applySynergy: "Spray foliar Zinc (Zn) + Iron (Fe) chelates (2.5 mL/L) + hold pH 6.0–6.8.",
    blocksDoNotMix: "0 g DAP, MAP, or Phosphate boosters — high P (> 85 mg/kg) precipitates Zn, Fe & Calcium.",
    tankMixRule: "Never mix Phosphates with Ca or Mg concentrates (causes insoluble Ca3(PO4)2 sludge).",
    expectedResult: "Prevents Zn/Fe yellowing lockup & keeps drip emitters clog-free.",
  },
  {
    key: "low_ca",
    shortLabel: "Low Ca",
    title: "Low Calcium / Acidic Lockup",
    thresholdHint: "pH < 6.0 or Blossom-end rot",
    applySynergy: "Mix 2.5 g/L Calcium Chloride foliar & spray 140–180 mL/plant onto young fruit before 08:30 AM.",
    blocksDoNotMix: "0 g DAP/MAP Phosphates, NH4+ Urea, or high-K salts alongside Calcium.",
    tankMixRule: "Keep Calcium strictly in Tank A; keep all Sulfates & Phosphates in Tank B.",
    expectedResult: "Stops new blossom-end rot on swelling green fruit within 5–7 days.",
  },
  {
    key: "low_mg",
    shortLabel: "Low Mg",
    title: "Magnesium Shortage (Chlorosis)",
    thresholdHint: "Interveinal yellowing / High K",
    applySynergy: "Spray Epsom salt (MgSO4, 5.0 g/L, 140–180 mL/plant) foliar before 09:00 AM.",
    blocksDoNotMix: "0 g simultaneous Calcium in tank & no extra K feeds if K > 230 mg/kg.",
    tankMixRule: "Never mix Magnesium Sulfate (MgSO4) with Calcium Nitrate in the same concentrate tank.",
    expectedResult: "Restores chlorophyll greening between leaf veins within 4–6 days.",
  },
];

const MULDER_BY_KEY = new Map(MULDER_RULES.map((m) => [m.key, m]));

function detectMulderKeys(plant: PlantSoilRow): MulderKey[] {
  const { n, p, k, ph } = plant.readings;
  const keys: MulderKey[] = [];
  if (k !== null && k < 160) keys.push("low_k");
  if (k !== null && k > 230) keys.push("high_k");
  if (p !== null && p > 85) keys.push("high_p");
  if (n !== null && n >= 105) keys.push("high_n");
  if ((ph !== null && ph < 6.0) || plant.vision.condition.toLowerCase().includes("blossom")) keys.push("low_ca");
  return keys;
}

function buildWhyLine(plant: PlantSoilRow, rx: PrescriptionResult): string {
  const r = plant.readings;
  const parts: string[] = [];
  if (r.n !== null) {
    parts.push(`N: ${Math.round(r.n)} mg/kg${r.n >= 105 ? " (Optimal — NOT N shortage)" : r.n < 80 ? " (Low deficit)" : ""}`);
  }
  if (r.k !== null) parts.push(`K: ${Math.round(r.k)} mg/kg${r.k > 230 ? " (High — blocks Ca/Mg)" : r.k < 160 ? " (Low)" : ""}`);
  if (r.p !== null && r.p > 85) parts.push(`P: ${Math.round(r.p)} mg/kg (High — blocks Zn/Fe/Ca)`);
  if (r.ph !== null) parts.push(`pH: ${r.ph.toFixed(2)}`);
  if (r.moisture !== null) parts.push(`Moist: ${r.moisture.toFixed(1)}%`);
  if (r.ec !== null && (r.ec < 0.8 || r.ec > 2.5)) parts.push(`EC: ${r.ec.toFixed(2)} mS/cm`);
  const probeSummary = parts.join(" · ");
  if (rx.conditionId === "soil_stress") return `${probeSummary} — ${plant.issues.join(" · ")}`;
  return probeSummary;
}

/**
 * Evaluate compact, scannable, formula-calculated treatment guidance using live rover probes,
 * Mulder's Chart antagonism guards, canopy growth stage, and block-level batch math.
 */
export function evaluateAgronomyAction(
  plant: PlantSoilRow,
  targets: SoilTargets,
  options?: { blockPlants?: PlantSoilRow[]; blockLabel?: string },
): FastCareCard | null {
  const rx = calculatePrescription({
    plant,
    targets,
    blockPlants: options?.blockPlants,
    blockLabel: options?.blockLabel,
  });
  if (!rx) return null;

  const mulderKeys = detectMulderKeys(plant);
  const doNow = rx.doNowSteps.map((s, idx) => `${idx + 1}. ${s}`).join(" ");
  const doNotMix = rx.doNotMixList.map((s) => `• ${s}`).join(" ");

  return {
    conditionId: rx.conditionId,
    guideId: rx.guideId,
    title: rx.conditionTitle,
    doNowSteps: rx.doNowSteps,
    doNow,
    doNotMixList: rx.doNotMixList,
    doNotMix,
    expectedResult: rx.expectedResult,
    whyLine: buildWhyLine(plant, rx),
    mulderKeys,
    prescription: rx,
  };
}

function buildReferenceCard(
  disease: string,
  readings: { soil_ph: number; soil_moisture: number; soil_ec: number; soil_temperature: number; nitrogen: number; phosphorus: number; potassium: number },
  stageN = 2,
): FastCareCard {
  const targets = targetsFromConditions(undefined);
  const row = buildBlockSoilRows({
    zone: "g1",
    rows: 1,
    cols: 1,
    cells: [
      {
        row: 0,
        col: 0,
        plant: true,
        flagged: true,
        canopy: 0.44,
        chlorosis: disease === "chlorosis" ? 0.18 : 0.05,
        disease,
        disease_confidence: 0.9,
        readings,
      },
    ],
    stageN,
    profile: defaultBlockSoilProfile("g1"),
  })[0];

  return evaluateAgronomyAction(row, targets, { blockLabel: "Sample Block (1 plant)" })!;
}

/** Reference guide cards generated dynamically from the prescription formula engine (zero hardcoded paragraphs). */
export const FAST_GUIDE_CARDS: Record<TomatoConditionId, FastCareCard> = {
  early_blight: buildReferenceCard("early_blight", {
    soil_ph: 6.35,
    soil_moisture: 63.2,
    soil_ec: 1.45,
    soil_temperature: 23.8,
    nitrogen: 108,
    phosphorus: 75,
    potassium: 185,
  }),
  leaf_curl: buildReferenceCard("leaf_curl", {
    soil_ph: 6.35,
    soil_moisture: 54.2,
    soil_ec: 1.25,
    soil_temperature: 24.4,
    nitrogen: 120,
    phosphorus: 80,
    potassium: 190,
  }),
  yellow_leaves: buildReferenceCard("chlorosis", {
    soil_ph: 6.35,
    soil_moisture: 63.6,
    soil_ec: 1.42,
    soil_temperature: 23.8,
    nitrogen: 109,
    phosphorus: 74,
    potassium: 184,
  }),
  blossom_end_rot: buildReferenceCard(
    "blossom_end_rot",
    {
      soil_ph: 5.75,
      soil_moisture: 67.8,
      soil_ec: 1.75,
      soil_temperature: 24.1,
      nitrogen: 100,
      phosphorus: 90,
      potassium: 220,
    },
    4,
  ),
  pest_damage: buildReferenceCard(
    "pest_damage",
    {
      soil_ph: 6.25,
      soil_moisture: 66.5,
      soil_ec: 1.9,
      soil_temperature: 25.0,
      nitrogen: 95,
      phosphorus: 85,
      potassium: 235,
    },
    4,
  ),
};

export function getMulderRule(key: MulderKey): MulderRule {
  return MULDER_BY_KEY.get(key) ?? MULDER_RULES[0];
}

export function inspectBlockMulder(rows: PlantSoilRow[]): {
  avgN: number | null;
  avgP: number | null;
  avgK: number | null;
  avgPh: number | null;
  activeKey: MulderKey;
  summaryLine: string;
} {
  const active = rows.filter((r) => r.plant);
  const avg = (vals: (number | null)[]) => {
    const nums = vals.filter((v): v is number => v !== null);
    return nums.length ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : null;
  };
  const avgPhNums = active.map((r) => r.readings.ph).filter((v): v is number => v !== null);
  const avgPh = avgPhNums.length ? Number((avgPhNums.reduce((s, v) => s + v, 0) / avgPhNums.length).toFixed(2)) : null;

  const avgN = avg(active.map((r) => r.readings.n));
  const avgP = avg(active.map((r) => r.readings.p));
  const avgK = avg(active.map((r) => r.readings.k));

  const hasLowN = active.some((r) => r.readings.n !== null && r.readings.n < 80);
  const hasLowPhOrRot = active.some((r) => (r.readings.ph !== null && r.readings.ph < 6.0) || r.vision.condition.toLowerCase().includes("blossom"));
  let activeKey: MulderKey = "high_n";
  if (avgK !== null && avgK < 160) activeKey = "low_k";
  else if (avgK !== null && avgK > 230) activeKey = "high_k";
  else if (hasLowPhOrRot) activeKey = "low_ca";
  else if (avgP !== null && avgP > 85) activeKey = "high_p";
  else if (hasLowN && (avgN ?? 100) >= 105) activeKey = "high_n";
  else if (avgN !== null && avgN >= 105) activeKey = "high_n";

  const summaryLine = `Avg N: ${avgN ?? "—"} mg/kg · P: ${avgP ?? "—"} mg/kg · K: ${avgK ?? "—"} mg/kg · pH: ${avgPh ?? "—"}`;
  return { avgN, avgP, avgK, avgPh, activeKey, summaryLine };
}
