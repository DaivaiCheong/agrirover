import { describe, expect, it } from "vitest";
import type { RoverCell } from "../lib/api";
import { buildDemoTomatoFarm } from "../test/fixtures";
import { buildBlockSoilRows, defaultBlockSoilProfile, targetsFromConditions } from "../lib/soil";
import {
  calculatePrescription,
  computeSoilCorrectionGrams,
  computeWaterDeficitPulse,
  getGrowthSprayTier,
} from "./prescriptionCalculator";

const makePlant = (over: Partial<RoverCell>, stageN = 2, zone = "g1") =>
  buildBlockSoilRows({
    zone,
    rows: 1,
    cols: 1,
    cells: [
      {
        row: 0,
        col: 0,
        plant: true,
        flagged: true,
        canopy: 0.42,
        chlorosis: 0.12,
        readings: {
          soil_ph: 6.35,
          soil_moisture: 63.2,
          soil_ec: 1.42,
          soil_temperature: 23.8,
          nitrogen: 108,
          phosphorus: 74,
          potassium: 184,
        },
        ...over,
      },
    ],
    stageN,
    profile: defaultBlockSoilProfile(zone),
  })[0];

describe("Mathematical Prescription & Tank-Mix Formula Engine", () => {
  const targets = targetsFromConditions(undefined);

  it("computes exact soil nutrient amendment grams and water deficit pulse from formulas", () => {
    // Low Soil N = 64 mg/kg -> ((95 - 64) * 15) / (0.155 * 1000) = 3.00 g Calcium Nitrate / plant
    expect(computeSoilCorrectionGrams(64, 95, 0.155)).toBe(3.0);
    // Low Soil K = 145 mg/kg -> ((175 - 145) * 15) / (0.50 * 1000) = 0.90 g Potassium Sulfate / plant
    expect(computeSoilCorrectionGrams(145, 175, 0.5)).toBe(0.9);

    // Dry Leaf curl at 54.2% moisture -> (64 - 54.2) * 0.25 = 2.5 L/plant
    expect(computeWaterDeficitPulse(54.2, targets).waterPulseLitres).toBe(2.5);
    // Optimal moisture 63.6% -> 0 L extra pulse
    expect(computeWaterDeficitPulse(63.6, targets).waterPulseLitres).toBe(0);
  });

  it("scales spray volume by growth stage and computes 1-plant & batch tank mixes with 10% line buffer", () => {
    expect(getGrowthSprayTier("Vegetative").sprayMlPerPlant).toBe(100);
    expect(getGrowthSprayTier("Flowering & Early Set").sprayMlPerPlant).toBe(140);
    expect(getGrowthSprayTier("Fruit sizing & bulking").sprayMlPerPlant).toBe(180);

    // Early blight on Flowering stage (140 mL/plant * 5 g/L = 0.70 g/plant) with 2 flagged plants -> 0.31 L tank, 1.5 g
    const g1TwoBlight = buildBlockSoilRows({
      zone: "g1",
      rows: 1,
      cols: 2,
      cells: [
        {
          row: 0,
          col: 0,
          plant: true,
          flagged: true,
          canopy: 0.42,
          disease: "early_blight",
          disease_confidence: 0.85,
          readings: { soil_ph: 6.35, soil_moisture: 63.2, soil_ec: 1.45, soil_temperature: 23.8, nitrogen: 108, phosphorus: 74, potassium: 184 },
        },
        {
          row: 0,
          col: 1,
          plant: true,
          flagged: true,
          canopy: 0.44,
          disease: "early_blight",
          disease_confidence: 0.84,
          readings: { soil_ph: 6.35, soil_moisture: 63.4, soil_ec: 1.45, soil_temperature: 23.8, nitrogen: 108, phosphorus: 74, potassium: 184 },
        },
      ],
      stageN: 2,
      profile: defaultBlockSoilProfile("g1"),
    });
    const blightPlant = g1TwoBlight[0];

    const rx = calculatePrescription({
      plant: blightPlant,
      targets,
      blockPlants: g1TwoBlight,
      blockLabel: "G1 Greenhouse North",
    })!;

    expect(rx.volumePerPlantMl).toBe(140);
    expect(rx.mixRateValue).toBe(5.0);
    expect(rx.productPerPlantAmount).toBe(0.7);
    expect(rx.flaggedCountInBlock).toBe(2);
    expect(rx.totalTankLitres).toBe(0.31);
    expect(rx.totalProductAmount).toBe(1.5);
    expect(rx.formulaMathLine).toContain("140 mL (Flowering canopy) × 5.0 g/L = 0.70 g/plant");
    expect(rx.formulaMathLine).toContain("N 108 mg/kg (OK -> 0 g Urea)");
    expect(rx.doNowSteps).toHaveLength(4);
    expect(rx.doNowSteps[1]).toContain("5.0 g Bacillus subtilis WP per 1 L clean water");
    expect(rx.doNowSteps[2]).toContain("140 mL/plant (0.70 g");
    expect(rx.recipeSummaryLine).toContain("Mix 5.0 g/L Bacillus subtilis WP");
  });

  it("enforces Mulder's Chart antagonism guards and computes Calcium Nitrate drip on true N deficit (G2 R2 T2)", () => {
    const farm = buildDemoTomatoFarm();
    const g2Round = farm.roundsByZone.get("g2")!;
    const g2Cond = farm.conditions.find((c) => c.zone === "g2");
    const g2Rows = buildBlockSoilRows({
      zone: "g2",
      rows: g2Round.rows!,
      cols: g2Round.cols!,
      cells: g2Round.cells,
      conditions: g2Cond,
      profile: defaultBlockSoilProfile("g2"),
    });

    // G2 R1 T5 (Leaf curl, 54.2% moisture) -> 2.5 L pulse + Neem 3 mL/L + 1 mL/L soap
    const curlPlant = g2Rows.find((r) => r.name === "R1 T5")!;
    const curlRx = calculatePrescription({
      plant: curlPlant,
      targets: targetsFromConditions(g2Cond),
      blockPlants: g2Rows,
      blockLabel: "G2 Commercial Bed A",
    })!;
    expect(curlRx.waterPulseLitres).toBe(2.5);
    expect(curlRx.doNowSteps[0]).toContain("2.5 L drip pulse");
    expect(curlRx.doNowSteps[1]).toContain("3.0 mL Cold-pressed Neem oil");
    expect(curlRx.doNowSteps[2]).toContain("140 mL/plant");

    // G2 R2 T2 (Yellow leaves, N = 64 mg/kg) -> 3.00 g Calcium Nitrate in 0.5 L (6.0 g/L)
    const lowNPlant = g2Rows.find((r) => r.name === "R2 T2")!;
    const lowNRx = calculatePrescription({
      plant: lowNPlant,
      targets: targetsFromConditions(g2Cond),
      blockPlants: g2Rows,
      blockLabel: "G2 Commercial Bed A",
    })!;
    expect(lowNRx.deliveryMethod).toBe("drip");
    expect(lowNRx.productPerPlantAmount).toBe(3.0);
    expect(lowNRx.mixRateValue).toBe(6.0);
    expect(lowNRx.volumePerPlantMl).toBe(500);
    expect(lowNRx.formulaMathLine).toContain("= 3.00 g in 0.5 L (6.0 g/L)");

    // G4 High K (> 230) -> blocks extra K in Do Not Mix
    const highKPlant = makePlant(
      {
        disease: "pest_damage",
        readings: { soil_ph: 6.25, soil_moisture: 66.5, soil_ec: 1.9, soil_temperature: 25, nitrogen: 95, phosphorus: 85, potassium: 235 },
      },
      4,
      "g4",
    );
    const highKRx = calculatePrescription({ plant: highKPlant, targets, blockLabel: "G4 Drip Plot C" })!;
    expect(highKRx.volumePerPlantMl).toBe(180); // Fruiting stage = 180 mL/plant
    expect(highKRx.doNotMixList.some((line) => line.includes("235 mg/kg") && line.includes("blocks Ca/Mg"))).toBe(true);
  });
});
