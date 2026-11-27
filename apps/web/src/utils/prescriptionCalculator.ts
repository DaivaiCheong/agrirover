import type { PlantSoilRow, SoilTargets } from "../lib/soil";
import { matchTreatmentForCondition, type TomatoConditionId } from "../lib/treatments";

export const ROOT_ZONE_SOIL_KG = 15;
export const DRIP_CARRIER_LITRES = 0.5;
export const MOISTURE_RESTORE_TARGET_PCT = 64;
export const SOIL_N_TARGET_MG_KG = 95;
export const SOIL_N_OPTIMAL_MIN_MG_KG = 80;
export const SOIL_N_HIGH_GUARD_MG_KG = 105;
export const SOIL_P_TARGET_MG_KG = 65;
export const SOIL_P_HIGH_GUARD_MG_KG = 85;
export const SOIL_K_TARGET_MG_KG = 175;
export const SOIL_K_LOW_MG_KG = 160;
export const SOIL_K_HIGH_GUARD_MG_KG = 230;
export const SPRAY_BUFFER_MULTIPLIER = 1.1;

export type GrowthSprayTier = {
  tierLabel: string;
  sprayMlPerPlant: 100 | 140 | 180;
};

export type NutrientCorrectionItem = {
  nutrient: "N" | "P" | "K" | "Ca";
  liveMgKg: number | null;
  targetMgKg: number;
  productName: string;
  purityFraction: number;
  doseGramsPerPlant: number;
  carrierLitresPerPlant: number;
  concentrationGPerL: number;
  blockedByMulder: boolean;
  reason: string;
};

export type PrescriptionResult = {
  conditionId: TomatoConditionId | "soil_stress";
  guideId: TomatoConditionId;
  conditionTitle: string;
  growthStage: GrowthSprayTier;
  productName: string;
  deliveryMethod: "foliar" | "drip";
  mixRateValue: number;
  mixRateUnit: "g/L" | "mL/L";
  secondaryMixText?: string;
  volumePerPlantMl: number;
  productPerPlantAmount: number;
  productPerPlantUnit: "g" | "mL";
  secondaryPerPlantText?: string;
  applicationWindow: string;
  repeatSchedule: string;
  waterPulseLitres: number;
  waterStatusNote: string;
  ureaDoseGrams: number;
  ureaGuardNote: string;
  nutrientCorrections: NutrientCorrectionItem[];
  flaggedCountInBlock: number;
  blockLabel: string;
  totalTankLitres: number;
  totalProductAmount: number;
  totalSecondaryProductText?: string;
  recipeSummaryLine: string;
  batchTankLine: string;
  formulaMathLine: string;
  doNowSteps: [string, string, string, string];
  doNotMixList: string[];
  expectedResult: string;
};

function round1(v: number): number {
  return Math.round((v + 1e-9) * 10) / 10;
}

function round2(v: number): number {
  return Math.round((v + 1e-9) * 100) / 100;
}

/**
 * Compute per-plant nutrient amendment dose in grams using:
 * doseGramsPerPlant = ((targetMgKg - liveMgKg) * rootZoneSoilKg) / (fertilizerPurity * 1000)
 */
export function computeSoilCorrectionGrams(
  liveMgKg: number,
  targetMgKg: number,
  fertilizerPurity: number,
  rootZoneSoilKg = ROOT_ZONE_SOIL_KG,
): number {
  if (!Number.isFinite(liveMgKg) || liveMgKg >= targetMgKg || fertilizerPurity <= 0) return 0;
  return round2(((targetMgKg - liveMgKg) * rootZoneSoilKg) / (fertilizerPurity * 1000));
}

/**
 * Compute precision drip pulse in L/plant when live moisture < 58%:
 * waterPulseLitres = round((64 - liveMoisture) * 0.25, 1)
 */
export function computeWaterDeficitPulse(liveMoisture: number | null, targets?: SoilTargets): {
  waterPulseLitres: number;
  waterStatusNote: string;
} {
  const minMoist = targets?.moisture[0] ?? 58;
  const maxMoist = targets?.moisture[1] ?? 72;
  if (liveMoisture === null || !Number.isFinite(liveMoisture)) {
    return { waterPulseLitres: 0, waterStatusNote: "Moisture sensor pending -> +0.0 L pulse" };
  }
  if (liveMoisture < minMoist) {
    const pulse = round1(Math.max(0, (MOISTURE_RESTORE_TARGET_PCT - liveMoisture) * 0.25));
    return {
      waterPulseLitres: pulse,
      waterStatusNote: `Moisture ${liveMoisture.toFixed(1)}% (< ${minMoist}% -> +${pulse.toFixed(1)} L pulse to ${MOISTURE_RESTORE_TARGET_PCT}%)`,
    };
  }
  if (liveMoisture > maxMoist) {
    return {
      waterPulseLitres: 0,
      waterStatusNote: `Moisture ${liveMoisture.toFixed(1)}% (> ${maxMoist}% wet -> 0.0 L, pause drip 24–48 h)`,
    };
  }
  return {
    waterPulseLitres: 0,
    waterStatusNote: `Moisture ${liveMoisture.toFixed(1)}% (OK -> +0.0 L pulse)`,
  };
}

/** Map tomato growth stage string to calibrated spray volume per plant. */
export function getGrowthSprayTier(growthStage?: string | null): GrowthSprayTier {
  const s = (growthStage ?? "").toLowerCase();
  if (s.includes("ripening") || s.includes("sizing") || s.includes("bulking") || s.includes("fruiting")) {
    return { tierLabel: "Fruiting canopy", sprayMlPerPlant: 180 };
  }
  if (s.includes("flowering") || s.includes("early set") || s.includes("early fruit")) {
    return { tierLabel: "Flowering canopy", sprayMlPerPlant: 140 };
  }
  if (s.includes("seedling") || s.includes("vegetative")) {
    return { tierLabel: "Vegetative canopy", sprayMlPerPlant: 100 };
  }
  return { tierLabel: "Flowering canopy", sprayMlPerPlant: 140 };
}

/** Evaluate soil NPK corrections & Mulder's Chart antagonisms dynamically from probe values. */
export function evaluateNutrientCorrections(plant: PlantSoilRow, guideId: TomatoConditionId): {
  ureaDoseGrams: number;
  ureaGuardNote: string;
  corrections: NutrientCorrectionItem[];
} {
  const { n, p, k, ph } = plant.readings;
  const corrections: NutrientCorrectionItem[] = [];

  let ureaDoseGrams = 0;
  let ureaGuardNote = "N reading pending";
  if (n !== null) {
    if (n >= SOIL_N_HIGH_GUARD_MG_KG) {
      ureaDoseGrams = 0;
      ureaGuardNote = `N ${Math.round(n)} mg/kg (OK -> 0 g Urea)`;
    } else if (n >= SOIL_N_OPTIMAL_MIN_MG_KG) {
      ureaDoseGrams = 0;
      ureaGuardNote = `N ${Math.round(n)} mg/kg (Adequate -> 0 g Urea)`;
    } else {
      const caNitrateG = computeSoilCorrectionGrams(n, SOIL_N_TARGET_MG_KG, 0.155);
      ureaDoseGrams = 0; // Prefer Calcium Nitrate 15.5% over Urea to avoid ammonium root-zone burn & Ca antagonism
      ureaGuardNote = `N ${Math.round(n)} mg/kg (< 80 -> ${caNitrateG.toFixed(2)} g Ca(NO3)2/plant; 0 g Urea)`;
      corrections.push({
        nutrient: "N",
        liveMgKg: n,
        targetMgKg: SOIL_N_TARGET_MG_KG,
        productName: "Calcium Nitrate (15.5% N)",
        purityFraction: 0.155,
        doseGramsPerPlant: caNitrateG,
        carrierLitresPerPlant: DRIP_CARRIER_LITRES,
        concentrationGPerL: round1(caNitrateG / DRIP_CARRIER_LITRES),
        blockedByMulder: false,
        reason: `Soil N ${Math.round(n)} mg/kg below 80 mg/kg minimum (target ${SOIL_N_TARGET_MG_KG} mg/kg)`,
      });
    }
  }

  if (k !== null) {
    if (k < SOIL_K_TARGET_MG_KG && k < SOIL_K_LOW_MG_KG) {
      const kDose = computeSoilCorrectionGrams(k, SOIL_K_TARGET_MG_KG, 0.5);
      corrections.push({
        nutrient: "K",
        liveMgKg: k,
        targetMgKg: SOIL_K_TARGET_MG_KG,
        productName: "Potassium Sulfate (50% K2O)",
        purityFraction: 0.5,
        doseGramsPerPlant: kDose,
        carrierLitresPerPlant: DRIP_CARRIER_LITRES,
        concentrationGPerL: round1(kDose / DRIP_CARRIER_LITRES),
        blockedByMulder: false,
        reason: `Soil K ${Math.round(k)} mg/kg (< 160 mg/kg) requires K2SO4 drip feed`,
      });
    } else if (k > SOIL_K_HIGH_GUARD_MG_KG) {
      corrections.push({
        nutrient: "Ca",
        liveMgKg: k,
        targetMgKg: SOIL_K_TARGET_MG_KG,
        productName: "Chelated Ca + Mg foliar",
        purityFraction: 1,
        doseGramsPerPlant: 0,
        carrierLitresPerPlant: 1,
        concentrationGPerL: 3.0,
        blockedByMulder: true,
        reason: `Excess K (${Math.round(k)} > ${SOIL_K_HIGH_GUARD_MG_KG} mg/kg) blocks Ca & Mg uptake — 0 g extra K`,
      });
    }
  }

  if (p !== null && p < SOIL_P_TARGET_MG_KG && guideId !== "blossom_end_rot" && (ph ?? 6.4) >= 6.0) {
    const pDose = computeSoilCorrectionGrams(p, SOIL_P_TARGET_MG_KG, 0.52);
    corrections.push({
      nutrient: "P",
      liveMgKg: p,
      targetMgKg: SOIL_P_TARGET_MG_KG,
      productName: "MAP (52% P2O5)",
      purityFraction: 0.52,
      doseGramsPerPlant: pDose,
      carrierLitresPerPlant: DRIP_CARRIER_LITRES,
      concentrationGPerL: round1(pDose / DRIP_CARRIER_LITRES),
      blockedByMulder: false,
      reason: `Soil P ${Math.round(p)} mg/kg below 65 mg/kg target`,
    });
  }

  return { ureaDoseGrams, ureaGuardNote, corrections };
}

function formatBlockDisplay(zone: string, explicitLabel?: string): string {
  if (explicitLabel) return explicitLabel;
  return zone.toUpperCase();
}

/**
 * Full dynamic prescription + block batch tank-mix calculator driven strictly
 * by live probe readings, canopy growth stage, and block-level alert counts.
 */
export function calculatePrescription(input: {
  plant: PlantSoilRow;
  targets: SoilTargets;
  blockPlants?: PlantSoilRow[];
  blockLabel?: string;
}): PrescriptionResult | null {
  const { plant, targets, blockPlants = [plant], blockLabel } = input;
  const v = plant.vision;
  if (v.status === "none" || v.status === "unrecorded") return null;

  const matched = v.status === "alert" ? matchTreatmentForCondition(v.condition || v.shortLabel) : null;
  if (!matched && plant.status !== "attention") return null;

  const r = plant.readings;
  const growthStage = getGrowthSprayTier(v.growthStage);
  const { waterPulseLitres, waterStatusNote } = computeWaterDeficitPulse(r.moisture, targets);

  const guideId: TomatoConditionId = matched
    ? matched.id
    : plant.states.ph === "low" || plant.states.ph === "high" || plant.states.ec === "high"
      ? "blossom_end_rot"
      : "leaf_curl";

  const conditionId: TomatoConditionId | "soil_stress" = matched ? matched.id : "soil_stress";
  const conditionTitle = matched ? matched.title : "Preventive Soil & Moisture Care";

  const { ureaDoseGrams, ureaGuardNote, corrections } = evaluateNutrientCorrections(plant, guideId);

  const sameConditionInBlock = blockPlants.filter((bp) => {
    if (!bp.plant) return false;
    if (matched) {
      return bp.vision.status === "alert" && matchTreatmentForCondition(bp.vision.condition || bp.vision.shortLabel)?.id === matched.id;
    }
    return bp.status === "attention";
  });
  const flaggedCountInBlock = Math.max(1, sameConditionInBlock.length);
  const resolvedBlockLabel = formatBlockDisplay(plant.zone, blockLabel);

  const nLowDrip = corrections.find((c) => c.nutrient === "N");
  const kLowDrip = corrections.find((c) => c.nutrient === "K");

  let deliveryMethod: "foliar" | "drip" = "foliar";
  let productName = "Liquid seaweed";
  let mixRateValue = 3.0;
  let mixRateUnit: "g/L" | "mL/L" = "mL/L";
  let secondaryMixRateGPerL = 0;
  let secondaryLabel = "";
  let volumePerPlantMl: number = growthStage.sprayMlPerPlant;
  let applicationWindow = "before 08:30 AM";
  let repeatSchedule = "Every 5 days × 2 sprays · 0-day pre-harvest wait";
  let physicalStep = "";
  let expectedResult = "Stops visible stress within 48–72 hrs.";

  if (conditionId === "soil_stress") {
    if (kLowDrip) {
      deliveryMethod = "drip";
      productName = kLowDrip.productName;
      mixRateValue = kLowDrip.concentrationGPerL;
      mixRateUnit = "g/L";
      volumePerPlantMl = 500;
      applicationWindow = "with morning drip";
      repeatSchedule = "Every 5 days × 2 doses until Soil K reaches 175 mg/kg · 0-day wait";
      physicalStep =
        waterPulseLitres > 0
          ? `Trigger ${waterPulseLitres.toFixed(1)} L drip pulse first to raise Moisture from ${r.moisture?.toFixed(1)}% -> ${MOISTURE_RESTORE_TARGET_PCT}%.`
          : `Inspect emitter flow & keep Moisture in ${targets.moisture[0]}–${targets.moisture[1]}% (${r.moisture?.toFixed(1) ?? "—"}% OK).`;
      expectedResult = `Lifts root-zone Potassium from ${Math.round(r.k!)} toward ${SOIL_K_TARGET_MG_KG} mg/kg within 4–6 days.`;
    } else if (waterPulseLitres > 0) {
      deliveryMethod = "drip";
      productName = "Clean irrigation water (drip pulse)";
      mixRateValue = 0;
      mixRateUnit = "mL/L";
      volumePerPlantMl = Math.round(waterPulseLitres * 1000);
      applicationWindow = "immediately";
      repeatSchedule = "Re-check rover moisture probe in 24 hrs";
      physicalStep = `Check drip emitter clog & clear salt crust around stem base.`;
      expectedResult = `Restores root-zone Moisture from ${r.moisture?.toFixed(1)}% to ${MOISTURE_RESTORE_TARGET_PCT}.0% within 12–24 hrs.`;
    } else {
      deliveryMethod = "foliar";
      productName = "Liquid seaweed";
      mixRateValue = 3.0;
      mixRateUnit = "mL/L";
      secondaryMixRateGPerL = 1.0;
      secondaryLabel = "chelated micronutrients";
      applicationWindow = "before 09:00 AM";
      repeatSchedule = "Once after 7 days · 0-day wait";
      physicalStep =
        r.ph !== null && r.ph < targets.ph[0]
          ? `Work 50 g/m² agricultural lime into root zone to lift pH from ${r.ph.toFixed(2)} -> 6.4.`
          : `Flush bed gently with 2.0 L clean pH-6.4 water to stabilize EC & pH.`;
      expectedResult = `Stabilizes root uptake before foliar curl or blossom-end rot develops.`;
    }
  } else {
    switch (matched!.id) {
      case "early_blight":
        productName = "Bacillus subtilis WP";
        mixRateValue = 5.0;
        mixRateUnit = "g/L";
        applicationWindow = "before 08:30 AM";
        repeatSchedule = "Every 5 days × 2 sprays · 0-day pre-harvest wait";
        physicalStep = "Cut all spotted lower leaves below 25 cm from soil, lay 5 cm dry mulch, and remove clippings.";
        expectedResult = "Halts target-spot spread up stem in 48–72 hrs · Preserves ~$3.60 tomato yield.";
        break;

      case "leaf_curl":
        productName = "Cold-pressed Neem oil";
        mixRateValue = 3.0;
        mixRateUnit = "mL/L";
        secondaryMixRateGPerL = 1.0;
        secondaryLabel = "mild soap emulsifier";
        applicationWindow = "at 05:00 PM";
        repeatSchedule = "Every 5 days × 3 sprays; hang 1 yellow sticky trap per 5 plants · 1-day harvest wait";
        physicalStep =
          waterPulseLitres > 0
            ? `Trigger ${waterPulseLitres.toFixed(1)} L drip pulse immediately to lift Moisture from ${r.moisture?.toFixed(1)}% -> ${MOISTURE_RESTORE_TARGET_PCT}%.`
            : `Inspect shoot undersides for whiteflies & add 4 cm mulch (Moisture ${r.moisture?.toFixed(1) ?? "—"}% OK -> +0.0 L pulse).`;
        expectedResult =
          waterPulseLitres > 0
            ? `Rehydrates soil (+${waterPulseLitres.toFixed(1)} L) & uncurls upper shoots in 24–48 hrs.`
            : "Interrupts whitefly TYLCV transmission & cools upper canopy in 48 hrs.";
        break;

      case "blossom_end_rot":
        productName = "Calcium Chloride (foliar)";
        mixRateValue = 2.5;
        mixRateUnit = "g/L";
        applicationWindow = "before 08:30 AM";
        repeatSchedule = "Every 5 days × 2 sprays · 0-day pre-harvest wait";
        physicalStep =
          r.ph !== null && r.ph < targets.ph[0]
            ? `Remove blackened fruit; stabilize drip at 2.2 L/day & apply 50 g/m² lime to lift pH ${r.ph.toFixed(2)} -> 6.4.`
            : `Remove blackened fruit immediately; hold steady drip (2 × 1.1 L/day, Moisture ${r.moisture?.toFixed(1) ?? "—"}%).`;
        expectedResult = "Restores Calcium flow to young green fruit trusses within 5–7 days.";
        break;

      case "pest_damage":
        productName = "Cold-pressed Neem oil";
        mixRateValue = 3.0;
        mixRateUnit = "mL/L";
        secondaryMixRateGPerL = 1.0;
        secondaryLabel = "mild soap emulsifier";
        applicationWindow = "at 05:00 PM";
        repeatSchedule = "Every 7 days × 2 sprays · 1-day pre-harvest wait";
        physicalStep =
          r.k !== null && r.k > SOIL_K_HIGH_GUARD_MG_KG
            ? `Pinch leaves with >30% pale leafminer tunnels; add chelated Ca+Mg foliar (excess K ${Math.round(r.k)} blocks Ca/Mg).`
            : "Pinch leaves with >30% pale leafminer tunnels and bag away from bed.";
        expectedResult = "Stops new pale leafminer tunnels & whitefly feeding within 48–72 hrs.";
        break;

      case "yellow_leaves": {
        const moistHigh = r.moisture !== null && r.moisture > targets.moisture[1];
        const phLow = r.ph !== null && r.ph < targets.ph[0];
        if (moistHigh) {
          productName = "Liquid seaweed";
          mixRateValue = 3.0;
          mixRateUnit = "mL/L";
          secondaryMixRateGPerL = 1.0;
          secondaryLabel = "chelated micronutrients";
          applicationWindow = "before 09:00 AM";
          repeatSchedule = "Repeat once after 7 days · Re-check moisture in 48 hrs";
          physicalStep = `Prune 2 yellow bottom leaves & pause drip 24–48 hrs to drain Moisture from ${r.moisture?.toFixed(1)}% below ${targets.moisture[1]}%.`;
          expectedResult = "Restores root oxygen & clears waterlogged leaf yellowing in 48–72 hrs.";
        } else if (kLowDrip) {
          deliveryMethod = "drip";
          productName = kLowDrip.productName;
          mixRateValue = kLowDrip.concentrationGPerL;
          mixRateUnit = "g/L";
          volumePerPlantMl = 500;
          applicationWindow = "before 09:00 AM";
          repeatSchedule = "Every 4 days × 2 doses until probe K reaches 175 mg/kg · 0-day wait";
          physicalStep = `Prune 2 yellow lower leaves (Soil K is ${Math.round(r.k!)} mg/kg < 160 mg/kg; root uptake deficit).`;
          expectedResult = `Lifts root-zone Potassium toward ${SOIL_K_TARGET_MG_KG} mg/kg & halts edge yellowing in 48–72 hrs.`;
        } else if (nLowDrip) {
          deliveryMethod = "drip";
          productName = nLowDrip.productName;
          mixRateValue = nLowDrip.concentrationGPerL;
          mixRateUnit = "g/L";
          volumePerPlantMl = 500;
          applicationWindow = "before 09:00 AM";
          repeatSchedule = `Every 4 days × 2 doses until probe N reaches ${SOIL_N_TARGET_MG_KG}–110 mg/kg · 0-day wait`;
          physicalStep = `Prune 2 yellow lower leaves; Soil N is ${Math.round(r.n!)} mg/kg (< 80 mg/kg true deficit).`;
          expectedResult = `Raises Soil N by +${Math.round(SOIL_N_TARGET_MG_KG - r.n!)} mg/kg & greens new canopy in 3–5 days.`;
        } else {
          productName = "Liquid seaweed";
          mixRateValue = 3.0;
          mixRateUnit = "mL/L";
          secondaryMixRateGPerL = 1.0;
          secondaryLabel = "chelated micronutrients";
          applicationWindow = "before 09:00 AM";
          repeatSchedule = "Repeat once after 7 days · 0-day pre-harvest wait";
          physicalStep = phLow
            ? `Prune 2 yellow bottom leaves & apply 50 g/m² agricultural lime (pH ${r.ph?.toFixed(2)} -> 6.4).`
            : `Prune 2 yellow bottom leaves; keep drip steady (${waterStatusNote}).`;
          expectedResult = "Halts lower-canopy senescence in 48–72 hrs · 0 g soil Urea needed.";
        }
        break;
      }
    }
  }

  const productUnit: "g" | "mL" = mixRateUnit === "g/L" ? "g" : "mL";
  const productPerPlantAmount =
    deliveryMethod === "drip" && nLowDrip && productName === nLowDrip.productName
      ? nLowDrip.doseGramsPerPlant
      : deliveryMethod === "drip" && kLowDrip && productName === kLowDrip.productName
        ? kLowDrip.doseGramsPerPlant
        : round2((volumePerPlantMl / 1000) * mixRateValue);

  const rawTankLitres = (flaggedCountInBlock * volumePerPlantMl * SPRAY_BUFFER_MULTIPLIER) / 1000;
  const totalTankLitres = round2(rawTankLitres);
  const totalProductAmount = mixRateValue > 0 ? round1(rawTankLitres * mixRateValue) : 0;

  const secondaryUnit: "g" | "mL" = secondaryLabel.includes("micro") ? "g" : "mL";
  const secondaryPerPlantAmount = secondaryMixRateGPerL > 0 ? round2((volumePerPlantMl / 1000) * secondaryMixRateGPerL) : 0;
  const secondaryMixText =
    secondaryMixRateGPerL > 0 ? `+ ${secondaryMixRateGPerL.toFixed(1)} ${secondaryUnit}/L ${secondaryLabel}` : undefined;
  const secondaryStepMixText =
    secondaryMixRateGPerL > 0 ? `+ ${secondaryMixRateGPerL.toFixed(1)} ${secondaryUnit} ${secondaryLabel}` : undefined;
  const secondaryPerPlantText =
    secondaryPerPlantAmount > 0 ? `+ ${secondaryPerPlantAmount.toFixed(2)} ${secondaryUnit} ${secondaryLabel}` : undefined;
  const totalSecondaryAmount = secondaryMixRateGPerL > 0 ? round1(rawTankLitres * secondaryMixRateGPerL) : 0;
  const totalSecondaryProductText =
    totalSecondaryAmount > 0 ? `+ ${totalSecondaryAmount.toFixed(1)} ${secondaryUnit} ${secondaryLabel}` : undefined;

  const mixLine =
    mixRateValue === 0
      ? `Flush emitter line with ${waterPulseLitres.toFixed(1)} L clean pH-6.4 water.`
      : `Mix ${mixRateValue.toFixed(1)} ${productUnit} ${productName}${secondaryStepMixText ? ` ${secondaryStepMixText}` : ""} per 1 L clean water.`;

  const volLabel = deliveryMethod === "drip" ? "Drip" : "Spray";
  const doseDetail =
    mixRateValue === 0
      ? `${productPerPlantAmount === 0 ? `${waterPulseLitres.toFixed(1)} L` : `${volumePerPlantMl} mL`}/plant`
      : `${volumePerPlantMl} mL/plant (${productPerPlantAmount.toFixed(2)} ${productUnit}${secondaryPerPlantText ? ` ${secondaryPerPlantText}` : ""}/plant${deliveryMethod === "foliar" ? ", coat both leaf sides" : " at root zone"})`;

  const applyLine = `${volLabel} ${doseDetail} ${applicationWindow}.`;

  const doNowSteps: [string, string, string, string] = [
    physicalStep,
    mixLine,
    applyLine,
    `${repeatSchedule}.`,
  ];

  const recipeSummaryLine =
    mixRateValue === 0
      ? `Pulse ${waterPulseLitres.toFixed(1)} L clean water ${applicationWindow} · ${repeatSchedule}`
      : `Mix ${mixRateValue.toFixed(1)} ${mixRateUnit} ${productName}${secondaryMixText ? ` ${secondaryMixText}` : ""} → ${volLabel} ${volumePerPlantMl} mL/plant (${productPerPlantAmount.toFixed(2)} ${productUnit}/plant) ${applicationWindow} · ${repeatSchedule}`;

  const batchTankLine =
    mixRateValue === 0
      ? `Deliver ${(flaggedCountInBlock * waterPulseLitres).toFixed(1)} L total pulse across ${flaggedCountInBlock} flagged plant${flaggedCountInBlock === 1 ? "" : "s"} in ${resolvedBlockLabel}`
      : `Prepare ${totalTankLitres.toFixed(2)} L tank: ${totalProductAmount.toFixed(1)} ${productUnit} ${productName}${totalSecondaryProductText ? ` ${totalSecondaryProductText}` : ""} + ${totalTankLitres.toFixed(2)} L clean water (${flaggedCountInBlock} plant${flaggedCountInBlock === 1 ? "" : "s"} × ${volumePerPlantMl} mL × 1.1 buffer)`;

  const doseEquation =
    deliveryMethod === "drip" && (nLowDrip || kLowDrip)
      ? (() => {
          const item = nLowDrip && productName === nLowDrip.productName ? nLowDrip : kLowDrip!;
          return `((${item.targetMgKg} - ${Math.round(item.liveMgKg!)}) × 15 kg) / (${item.purityFraction} × 1000) = ${item.doseGramsPerPlant.toFixed(2)} g in 0.5 L (${item.concentrationGPerL.toFixed(1)} g/L)`;
        })()
      : mixRateValue === 0
        ? `(64 - ${r.moisture?.toFixed(1) ?? "54"}) × 0.25 = ${waterPulseLitres.toFixed(1)} L/plant`
        : `${volumePerPlantMl} mL (${growthStage.tierLabel}) × ${mixRateValue.toFixed(1)} ${mixRateUnit} = ${productPerPlantAmount.toFixed(2)} ${productUnit}/plant`;

  const formulaMathLine = `${doseEquation} · ${waterStatusNote} · ${ureaGuardNote}`;

  // Concrete Do Not Mix / Avoid bullets with live probe numbers
  const doNotMixList: string[] = [];
  if (r.n !== null && r.n >= SOIL_N_HIGH_GUARD_MG_KG) {
    doNotMixList.push(
      `0 g Urea/N (Probe N is already ${Math.round(r.n)} mg/kg >= 105 — excess N blocks Potassium & Ca and softens tissue against blight).`,
    );
  } else if (r.n !== null && r.n >= SOIL_N_OPTIMAL_MIN_MG_KG && matched?.id === "yellow_leaves") {
    doNotMixList.push(
      `0 g soil Urea (Probe N is ${Math.round(r.n)} mg/kg optimal — lower-canopy aging, NOT N shortage).`,
    );
  } else {
    doNotMixList.push("0 g extra Urea above 15 g/plant (excess ammonium blocks K & Ca and attracts pests).");
  }

  if (r.k !== null && r.k > SOIL_K_HIGH_GUARD_MG_KG) {
    doNotMixList.push(`0 g extra Potassium/K2SO4 (Probe K is ${Math.round(r.k)} mg/kg > 230 — excess K blocks Ca/Mg absorption).`);
  } else if (r.k !== null && r.k < SOIL_K_LOW_MG_KG) {
    doNotMixList.push("0 g simultaneous Calcium/Mg with K2SO4 drip (Ca/Mg antagonize Potassium uptake in low-K root zones).");
  }

  if (r.p !== null && r.p > SOIL_P_HIGH_GUARD_MG_KG) {
    doNotMixList.push(`0 g DAP/MAP/Phosphates (Probe P is ${Math.round(r.p)} mg/kg > 85 — high P blocks Zn, Fe & Calcium uptake).`);
  }

  if (r.moisture !== null && r.moisture > targets.moisture[1]) {
    doNotMixList.push(`0 L extra irrigation today (Moisture ${r.moisture.toFixed(1)}% > ${targets.moisture[1]}% restricts root O2).`);
  }

  if (matched?.id === "early_blight") {
    doNotMixList.push("No overhead foliage watering (wetting lower canopy spreads Alternaria spores).");
  }

  doNotMixList.push("Never mix Calcium (Ca) with Sulfates or Phosphates in the same concentrate tank (insoluble sludge).");

  return {
    conditionId,
    guideId,
    conditionTitle,
    growthStage,
    productName,
    deliveryMethod,
    mixRateValue,
    mixRateUnit,
    secondaryMixText,
    volumePerPlantMl,
    productPerPlantAmount,
    productPerPlantUnit: productUnit,
    secondaryPerPlantText,
    applicationWindow,
    repeatSchedule,
    waterPulseLitres,
    waterStatusNote,
    ureaDoseGrams,
    ureaGuardNote,
    nutrientCorrections: corrections,
    flaggedCountInBlock,
    blockLabel: resolvedBlockLabel,
    totalTankLitres,
    totalProductAmount,
    totalSecondaryProductText,
    recipeSummaryLine,
    batchTankLine,
    formulaMathLine,
    doNowSteps,
    doNotMixList,
    expectedResult,
  };
}
