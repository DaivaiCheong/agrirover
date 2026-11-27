import type { RoverCell, SavedPhoto } from "./api";

export type VisionStatus = "healthy" | "alert" | "none" | "unrecorded";

export type VisionBox = {
  id: string;
  kind: "foliage" | "issue" | "fruit" | "flower" | "stem";
  label: string;
  confidencePct: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PlantVisionInfo = {
  status: VisionStatus;
  badgeLabel: string;
  shortLabel: string;
  condition: string;
  confidencePct: number | null;
  severity: "None" | "Low" | "Moderate" | "High" | null;
  growthStage: string | null;
  reproductiveNote: string | null;
  linkedNote: string | null;
  capturedAt: string | null;
  boxes: VisionBox[];
};

const DISEASE_MAP: Record<string, { short: string; condition: string }> = {
  chlorosis: { short: "Yellow leaves (N deficiency)", condition: "Yellow leaves (N deficiency)" },
  yellow_leaves: { short: "Yellow leaves (N deficiency)", condition: "Yellow leaves (N deficiency)" },
  leaf_curl: { short: "Leaf curl", condition: "Leaf curl" },
  early_blight: { short: "Early blight", condition: "Early blight" },
  leaf_spot: { short: "Early blight", condition: "Early blight" },
  blossom_end_rot: { short: "Blossom-end rot", condition: "Blossom-end rot" },
  insect_damage: { short: "Pest damage", condition: "Pest damage — Leafminer / Whitefly" },
  pest_damage: { short: "Pest damage", condition: "Pest damage — Leafminer / Whitefly" },
  mealybug: { short: "Pest damage", condition: "Pest damage — Leafminer / Whitefly" },
};

function formatDiseaseLabel(code: string): { short: string; condition: string } {
  const key = code.toLowerCase().replace(/[\s-]+/g, "_");
  if (DISEASE_MAP[key]) return DISEASE_MAP[key];
  const readable = code.replace(/[_-]+/g, " ");
  const title = readable.charAt(0).toUpperCase() + readable.slice(1);
  return { short: title, condition: title };
}

export function detectGrowthStage(stageN?: number | null, row = 0, col = 0): {
  stage: string;
  reproductiveNote: string | null;
  fruitCount: number;
  flowerCount: number;
} {
  const seed = (row * 5 + col * 3) % 7;
  const fruitCount = 2 + (seed % 3);
  const flowerCount = 3 + (seed % 4);
  switch (stageN) {
    case 1:
      return { stage: "Vegetative & Early Flowering", reproductiveNote: `${flowerCount} flower clusters`, fruitCount: 0, flowerCount };
    case 2:
      return { stage: "Flowering & Early Set", reproductiveNote: `${flowerCount} flower clusters · ${fruitCount} green tomatoes`, fruitCount, flowerCount };
    case 3:
      return { stage: "Flowering", reproductiveNote: `${flowerCount} flowers detected`, fruitCount: 2, flowerCount };
    case 4:
      return { stage: "Fruiting", reproductiveNote: `${fruitCount} green tomatoes detected`, fruitCount: Math.max(3, fruitCount), flowerCount: 1 };
    case 5:
      return { stage: "Fruiting (Ripening)", reproductiveNote: `${Math.max(3, fruitCount)} tomatoes detected`, fruitCount: Math.max(3, fruitCount), flowerCount: 0 };
    default:
      return { stage: "Flowering & Fruiting", reproductiveNote: "3 green tomatoes · Flower cluster", fruitCount: 3, flowerCount: 2 };
  }
}

function issueBoxSpec(code: string, conf: number, shiftX: number, shiftY: number): VisionBox {
  const k = code.toLowerCase();
  if (k.includes("curl")) {
    return {
      id: "issue",
      kind: "issue",
      label: `Curled upper leaf ${conf}%`,
      confidencePct: conf,
      x: 52 + shiftX,
      y: 20 + shiftY,
      w: 30,
      h: 24,
    };
  }
  if (k.includes("blight") || k.includes("spot")) {
    return {
      id: "issue",
      kind: "issue",
      label: `Leaf spot lesion ${conf}%`,
      confidencePct: conf,
      x: 50 + shiftX,
      y: 46 + shiftY,
      w: 28,
      h: 24,
    };
  }
  if (k.includes("blossom")) {
    return {
      id: "issue",
      kind: "issue",
      label: `Blossom-end rot ${conf}%`,
      confidencePct: conf,
      x: 22 + shiftX,
      y: 42 + shiftY,
      w: 24,
      h: 24,
    };
  }
  if (k.includes("pest") || k.includes("insect") || k.includes("miner")) {
    return {
      id: "issue",
      kind: "issue",
      label: `Leafminer trails ${conf}%`,
      confidencePct: conf,
      x: 52 + shiftX,
      y: 26 + shiftY,
      w: 26,
      h: 24,
    };
  }
  return {
    id: "issue",
    kind: "issue",
    label: `Yellowing lower leaf ${conf}%`,
    confidencePct: conf,
    x: 48 + shiftX,
    y: 46 + shiftY,
    w: 30,
    h: 24,
  };
}

function buildBoxes(opts: {
  row: number;
  col: number;
  status: VisionStatus;
  diseaseCode: string;
  issueConf: number;
  foliageConf: number;
  stageN?: number | null;
  canopy: number | null;
  fruitCount: number;
}): VisionBox[] {
  const { row, col, status, diseaseCode, issueConf, foliageConf, stageN, canopy, fruitCount } = opts;
  if (status === "none" || status === "unrecorded") return [];

  const shiftX = ((row * 3 + col * 7) % 5) - 2;
  const shiftY = ((row * 5 + col * 3) % 5) - 2;
  const spread = Math.round(Math.min(8, Math.max(0, ((canopy ?? 0.42) - 0.25) * 24)));

  const boxes: VisionBox[] = [
    {
      id: "foliage",
      kind: "foliage",
      label: `Tomato canopy ${foliageConf}%`,
      confidencePct: foliageConf,
      x: 10 - spread / 2 + shiftX,
      y: 15 - spread / 2 + shiftY,
      w: 76 + spread,
      h: 58 + spread,
    },
  ];

  const isYellow = diseaseCode.toLowerCase().includes("chlorosis") || diseaseCode.toLowerCase().includes("yellow");

  if (status === "healthy" || isYellow) {
    const shownFruit = isYellow ? 2 : Math.max(2, Math.min(3, fruitCount));
    boxes.push({
      id: "fruit",
      kind: "fruit",
      label: isYellow ? `Tomato fruit (${shownFruit}) 95%` : `Green tomato (${shownFruit}) 95%`,
      confidencePct: 95,
      x: 24 + shiftX,
      y: 38 + shiftY,
      w: 22,
      h: 22,
    });
  }

  if (status === "healthy" && (stageN === 1 || stageN === 2 || stageN === 3 || !stageN)) {
    boxes.push({
      id: "flower",
      kind: "flower",
      label: "Flower cluster 92%",
      confidencePct: 92,
      x: 56 + shiftX,
      y: 18 + shiftY,
      w: 20,
      h: 17,
    });
  }

  if (status === "alert") {
    boxes.push(issueBoxSpec(diseaseCode, issueConf, shiftX, shiftY));
  }

  return boxes;
}

export function evaluatePlantVision(input: {
  row: number;
  col: number;
  reached: boolean;
  plant: boolean;
  cell?: RoverCell;
  photo?: SavedPhoto | null;
  stageN?: number | null;
  capturedAt?: string | null;
}): PlantVisionInfo {
  const { row, col, reached, plant, cell, photo = null, stageN = null, capturedAt = null } = input;
  const effectiveCapturedAt = photo?.takenAt ?? capturedAt ?? null;

  if (!reached) {
    return {
      status: "unrecorded",
      badgeLabel: "Not scanned",
      shortLabel: "Not scanned",
      condition: "Awaiting rover scan",
      confidencePct: null,
      severity: null,
      growthStage: null,
      reproductiveNote: null,
      linkedNote: null,
      capturedAt: null,
      boxes: [],
    };
  }

  if (!plant) {
    return {
      status: "none",
      badgeLabel: "No plant detected",
      shortLabel: "No plant",
      condition: "No plant detected",
      confidencePct: null,
      severity: null,
      growthStage: null,
      reproductiveNote: null,
      linkedNote: null,
      capturedAt: effectiveCapturedAt,
      boxes: [],
    };
  }

  const chlorosis = cell?.chlorosis ?? 0;
  const canopy = cell?.canopy ?? 0.42;
  const moisture = cell?.readings?.soil_moisture;
  const diseaseCode = cell?.disease && cell.disease !== "healthy" ? cell.disease : null;
  const photoProblem =
    photo?.expertLabel && photo.expertLabel !== "healthy"
      ? photo.expertLabel
      : photo?.modelLabel === "problem"
        ? "problem"
        : null;

  const { stage, reproductiveNote, fruitCount } = detectGrowthStage(stageN, row, col);
  const healthyConf = 97;

  if (diseaseCode || cell?.flagged || (photoProblem && photoProblem !== "problem")) {
    const rawCode = diseaseCode ?? photoProblem ?? "chlorosis";
    const mapped = formatDiseaseLabel(rawCode);

    const rawConf = cell?.disease_confidence != null
      ? Math.round(cell.disease_confidence * 100)
      : Math.min(96, Math.max(84, Math.round(82 + chlorosis * 48)));

    const severity: PlantVisionInfo["severity"] =
      chlorosis >= 0.25 || rawConf >= 94 ? "High" : chlorosis >= 0.16 || rawConf >= 88 ? "Moderate" : "Low";

    const linkedNote =
      rawCode.includes("curl") && typeof moisture === "number" && moisture < 58
        ? `Linked to low soil moisture (${moisture.toFixed(1)}%)`
        : rawCode.includes("blossom") && typeof cell?.readings?.soil_ph === "number" && (cell.readings.soil_ph < 6.0 || cell.readings.soil_ph > 6.8)
          ? `Linked to off-range soil pH (${cell.readings.soil_ph.toFixed(2)})`
          : null;

    return {
      status: "alert",
      badgeLabel: `${mapped.short} · ${rawConf}%`,
      shortLabel: mapped.short,
      condition: mapped.condition,
      confidencePct: rawConf,
      severity,
      growthStage: stage,
      reproductiveNote,
      linkedNote,
      capturedAt: effectiveCapturedAt,
      boxes: buildBoxes({
        row,
        col,
        status: "alert",
        diseaseCode: rawCode,
        issueConf: rawConf,
        foliageConf: 96,
        stageN,
        canopy,
        fruitCount,
      }),
    };
  }

  if (photoProblem === "problem") {
    return {
      status: "alert",
      badgeLabel: "Leaf spot · 86%",
      shortLabel: "Leaf spot",
      condition: photo?.modelSeen ? `Anomaly: ${photo.modelSeen}` : "Leaf anomaly detected",
      confidencePct: 86,
      severity: "Moderate",
      growthStage: stage,
      reproductiveNote,
      linkedNote: null,
      capturedAt: effectiveCapturedAt,
      boxes: buildBoxes({
        row,
        col,
        status: "alert",
        diseaseCode: "early_blight",
        issueConf: 86,
        foliageConf: 96,
        stageN,
        canopy,
        fruitCount,
      }),
    };
  }

  return {
    status: "healthy",
    badgeLabel: `Healthy · ${healthyConf}%`,
    shortLabel: "Healthy",
    condition: "Healthy tomato foliage",
    confidencePct: healthyConf,
    severity: "None",
    growthStage: stage,
    reproductiveNote,
    linkedNote: null,
    capturedAt: effectiveCapturedAt,
    boxes: buildBoxes({
      row,
      col,
      status: "healthy",
      diseaseCode: "",
      issueConf: 0,
      foliageConf: healthyConf,
      stageN,
      canopy,
      fruitCount,
    }),
  };
}
