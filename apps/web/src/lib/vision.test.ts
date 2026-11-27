import { describe, expect, it } from "vitest";
import type { RoverCell, SavedPhoto } from "./api";
import { buildBlockSoilRows, defaultBlockSoilProfile, targetsFromConditions } from "./soil";
import { buildPlantCarePlan, matchTreatmentForCondition, TOMATO_TREATMENTS } from "./treatments";
import { evaluatePlantVision } from "./vision";

const baseCell = (over: Partial<RoverCell> = {}): RoverCell => ({
  row: 0,
  col: 0,
  plant: true,
  flagged: false,
  canopy: 0.42,
  chlorosis: 0,
  readings: { soil_moisture: 64, soil_ph: 6.4, soil_ec: 1.4 },
  ...over,
});

describe("Tomato AI vision & treatment matching", () => {
  it("labels healthy tomato plants with canopy, green tomato, and flower cluster boxes", () => {
    const res = evaluatePlantVision({
      row: 0,
      col: 0,
      reached: true,
      plant: true,
      cell: baseCell(),
      stageN: 2,
      capturedAt: "2026-11-27T07:15:00Z",
    });

    expect(res.status).toBe("healthy");
    expect(res.badgeLabel).toBe("Healthy · 97%");
    expect(res.boxes.some((b) => b.kind === "foliage" && b.label.includes("Tomato canopy"))).toBe(true);
    expect(res.boxes.some((b) => b.kind === "fruit" && b.label.includes("Green tomato"))).toBe(true);
    expect(res.boxes.some((b) => b.kind === "flower" && b.label.includes("Flower cluster"))).toBe(true);
    expect(res.boxes.some((b) => b.kind === "issue")).toBe(false);
  });

  it("detects Leaf curl linked to low soil moisture and Yellow leaves with Tomato fruit boxes", () => {
    const curl = evaluatePlantVision({
      row: 0,
      col: 4,
      reached: true,
      plant: true,
      cell: baseCell({
        flagged: true,
        disease: "leaf_curl",
        disease_confidence: 0.88,
        readings: { soil_moisture: 54.2, soil_ph: 6.3, soil_ec: 1.2 },
      }),
      stageN: 2,
    });

    expect(curl.status).toBe("alert");
    expect(curl.badgeLabel).toBe("Leaf curl · 88%");
    expect(curl.linkedNote).toBe("Linked to low soil moisture (54.2%)");
    expect(curl.boxes.some((b) => b.kind === "issue" && b.label.includes("Curled upper leaf 88%"))).toBe(true);

    const yellow = evaluatePlantVision({
      row: 1,
      col: 1,
      reached: true,
      plant: true,
      cell: baseCell({ flagged: true, disease: "chlorosis", disease_confidence: 0.91, chlorosis: 0.19 }),
      stageN: 2,
    });

    expect(yellow.status).toBe("alert");
    expect(yellow.badgeLabel).toBe("Yellow leaves (N deficiency) · 91%");
    expect(yellow.boxes.some((b) => b.kind === "issue" && b.label.includes("Yellowing lower leaf 91%"))).toBe(true);
    expect(yellow.boxes.some((b) => b.kind === "fruit" && b.label.includes("Tomato fruit (2)"))).toBe(true);
  });

  it("matches all five tomato conditions with 4-step care procedures and live soil adaptation", () => {
    expect(TOMATO_TREATMENTS).toHaveLength(5);
    for (const t of TOMATO_TREATMENTS) {
      expect(t.steps).toHaveLength(4);
    }
    expect(matchTreatmentForCondition("Early blight")?.id).toBe("early_blight");
    expect(matchTreatmentForCondition("Leaf curl")?.id).toBe("leaf_curl");
    expect(matchTreatmentForCondition("Yellow leaves (N deficiency)")?.id).toBe("yellow_leaves");
    expect(matchTreatmentForCondition("Blossom-end rot")?.id).toBe("blossom_end_rot");
    expect(matchTreatmentForCondition("Pest damage — Leafminer / Whitefly")?.id).toBe("pest_damage");

    const targets = targetsFromConditions(undefined);
    const makeRow = (cell: RoverCell) =>
      buildBlockSoilRows({
        zone: "g1",
        rows: 1,
        cols: 1,
        cells: [cell],
        profile: defaultBlockSoilProfile("g1"),
      })[0];

    // Adequate N (109 mg/kg), optimal pH (6.35) & Moisture (63.6%) -> avoid heavy N, lower-canopy aging note
    const adequateNPlant = makeRow(
      baseCell({
        flagged: true,
        disease: "chlorosis",
        disease_confidence: 0.91,
        chlorosis: 0.19,
        readings: { soil_moisture: 63.6, soil_ph: 6.35, soil_ec: 1.42, soil_temperature: 23.8, nitrogen: 109 },
      }),
    );
    const adequatePlan = buildPlantCarePlan(adequateNPlant, targets);
    expect(adequatePlan?.diagnosisNote).toContain("109 mg/kg");
    expect(adequatePlan?.diagnosisNote).toContain("Avoid over-applying heavy nitrogen");
    expect(adequatePlan?.steps).toHaveLength(4);

    // True N deficiency (< 80 mg/kg) -> targeted N feed
    const lowNPlant = makeRow(
      baseCell({
        flagged: true,
        disease: "chlorosis",
        disease_confidence: 0.91,
        chlorosis: 0.19,
        readings: { soil_moisture: 64.0, soil_ph: 6.35, soil_ec: 1.3, soil_temperature: 24.0, nitrogen: 64 },
      }),
    );
    const lowNPlan = buildPlantCarePlan(lowNPlant, targets);
    expect(lowNPlan?.diagnosisNote).toContain("64 mg/kg");
    expect(lowNPlan?.steps[2].action).toContain("fish emulsion");

    // High moisture (> 75%) -> restricted root oxygen cited
    const wetPlant = makeRow(
      baseCell({
        flagged: true,
        disease: "chlorosis",
        disease_confidence: 0.9,
        readings: { soil_moisture: 78.0, soil_ph: 6.4, soil_ec: 1.2, soil_temperature: 23.5, nitrogen: 105 },
      }),
    );
    expect(buildPlantCarePlan(wetPlant, targets)?.diagnosisNote).toContain("78.0%");

    // Low moisture Leaf curl -> cites 54.2%
    const curlPlant = makeRow(
      baseCell({
        flagged: true,
        disease: "leaf_curl",
        disease_confidence: 0.88,
        readings: { soil_moisture: 54.2, soil_ph: 6.35, soil_ec: 1.25, soil_temperature: 24.4 },
      }),
    );
    expect(buildPlantCarePlan(curlPlant, targets)?.steps[1].action).toContain("54.2%");

    // Acidic Blossom-end rot -> cites 5.75
    const rotPlant = makeRow(
      baseCell({
        flagged: true,
        disease: "blossom_end_rot",
        disease_confidence: 0.89,
        readings: { soil_moisture: 66.0, soil_ph: 5.75, soil_ec: 1.65, soil_temperature: 24.1 },
      }),
    );
    expect(buildPlantCarePlan(rotPlant, targets)?.diagnosisNote).toContain("5.75");
  });

  it("handles unrecorded plots and saved photo records cleanly", () => {
    expect(evaluatePlantVision({ row: 3, col: 3, reached: true, plant: false }).badgeLabel).toBe("No plant detected");
    const saved = evaluatePlantVision({
      row: 0,
      col: 1,
      reached: true,
      plant: true,
      cell: baseCell(),
      photo: { id: "p1", takenAt: "2026-11-27T08:00:00Z", modelLabel: "problem", expertLabel: "early_blight" } as SavedPhoto,
    });
    expect(saved.status).toBe("alert");
    expect(saved.condition).toBe("Early blight");
  });
});
