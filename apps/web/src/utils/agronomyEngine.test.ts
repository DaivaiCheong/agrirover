import { describe, expect, it } from "vitest";
import type { RoverCell } from "../lib/api";
import { buildBlockSoilRows, defaultBlockSoilProfile, targetsFromConditions } from "../lib/soil";
import { evaluateAgronomyAction, FAST_GUIDE_CARDS, inspectBlockMulder, MULDER_RULES, TANK_MIX_SAFETY_RULE } from "./agronomyEngine";

const makePlant = (over: Partial<RoverCell>, stageN = 2) =>
  buildBlockSoilRows({
    zone: "g1",
    rows: 1,
    cols: 1,
    cells: [
      {
        row: 0,
        col: 0,
        plant: true,
        flagged: true,
        canopy: 0.42,
        chlorosis: 0.19,
        readings: { soil_ph: 6.35, soil_moisture: 63.6, soil_ec: 1.42, soil_temperature: 23.8, nitrogen: 109, phosphorus: 74, potassium: 184 },
        ...over,
      },
    ],
    stageN,
    profile: defaultBlockSoilProfile("g1"),
  })[0];

describe("Mulder's Chart + Calculated Prescription agronomyEngine", () => {
  const targets = targetsFromConditions(undefined);

  it("handles Yellow leaves when Soil N >= 105 mg/kg with exact 4-step foliar recipe and 0 g Urea guard", () => {
    const card = evaluateAgronomyAction(makePlant({ disease: "chlorosis", disease_confidence: 0.91 }), targets)!;
    expect(card.doNowSteps).toHaveLength(4);
    expect(card.doNowSteps[0]).toContain("Prune 2 yellow bottom leaves");
    expect(card.doNowSteps[1]).toContain("Mix 3.0 mL Liquid seaweed + 1.0 g chelated micronutrients per 1 L clean water");
    expect(card.doNowSteps[2]).toContain("Spray 140 mL/plant");
    expect(card.doNotMix).toContain("109 mg/kg");
    expect(card.doNotMix).toContain("0 g Urea/N");
    expect(card.expectedResult).toContain("48–72 hrs");
    expect(card.whyLine).toContain("NOT N shortage");
  });

  it("applies Mulder rules & calculated doses for Low K (< 160), High K (> 230), High P (> 85), and Ca tank-mix safety", () => {
    const lowK = evaluateAgronomyAction(
      makePlant({
        disease: "chlorosis",
        readings: { soil_ph: 6.4, soil_moisture: 64, soil_ec: 1.3, soil_temperature: 24, nitrogen: 95, phosphorus: 70, potassium: 145 },
      }),
      targets,
    )!;
    expect(lowK.doNow).toContain("Potassium Sulfate (50% K2O)");
    expect(lowK.prescription.productPerPlantAmount).toBe(0.9);
    expect(lowK.doNotMix).toContain("Calcium");

    const highK = evaluateAgronomyAction(
      makePlant(
        {
          disease: "pest_damage",
          readings: { soil_ph: 6.25, soil_moisture: 66.5, soil_ec: 1.9, soil_temperature: 25, nitrogen: 95, phosphorus: 85, potassium: 235 },
        },
        4,
      ),
      targets,
    )!;
    expect(highK.doNotMix).toContain("235 mg/kg");
    expect(highK.doNotMix).toContain("blocks Ca/Mg");

    const highP = evaluateAgronomyAction(
      makePlant(
        {
          disease: "blossom_end_rot",
          readings: { soil_ph: 5.75, soil_moisture: 67.8, soil_ec: 1.75, soil_temperature: 24.1, nitrogen: 100, phosphorus: 90, potassium: 220 },
        },
        4,
      ),
      targets,
    )!;
    expect(highP.doNotMix).toContain("DAP/MAP/Phosphates");
    expect(highP.doNotMix).toContain("90 mg/kg");
    expect(highP.doNotMix).toContain("Never mix Calcium (Ca) with Sulfates or Phosphates");

    expect(MULDER_RULES).toHaveLength(6);
    expect(TANK_MIX_SAFETY_RULE).toContain("Calcium");
    expect(FAST_GUIDE_CARDS.early_blight.prescription.mixRateValue).toBe(5.0);
  });

  it("summarizes block-level Mulder metrics cleanly", () => {
    const rows = [makePlant({ disease: "chlorosis" })];
    const summary = inspectBlockMulder(rows);
    expect(summary.activeKey).toBe("high_n");
    expect(summary.avgN).toBe(109);
  });
});
