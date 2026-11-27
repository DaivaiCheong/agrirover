import type { Advice, BedConditions, CondParam, Cycle, RoverCell, SavedPhoto, ZoneNow } from "./api";
import { cellName } from "./rover";
import { evaluatePlantVision, type PlantVisionInfo } from "./vision";

export type SoilHealthStatus = "optimal" | "attention" | "unrecorded";
export type MetricRating = "ok" | "low" | "high" | "none";

export type BlockSoilProfile = {
  texture: string;
  rootingDepthCm: number;
  drainage: string;
  organicMatterPct: number;
  updatedAt?: string;
};

export const TEXTURE_OPTIONS = [
  "Sandy loam",
  "Loam",
  "Clay loam",
  "Silty loam",
  "Sandy clay loam",
  "Clay",
] as const;

export const DRAINAGE_OPTIONS = [
  "Well drained",
  "Moderately well drained",
  "Imperfectly drained",
  "Poorly drained",
] as const;

const DEFAULT_PROFILES: Record<string, BlockSoilProfile> = {
  g1: { texture: "Sandy loam", rootingDepthCm: 65, drainage: "Well drained", organicMatterPct: 2.8 },
  g2: { texture: "Loam", rootingDepthCm: 55, drainage: "Well drained", organicMatterPct: 3.1 },
  g3: { texture: "Clay loam", rootingDepthCm: 50, drainage: "Moderately well drained", organicMatterPct: 3.4 },
  g4: { texture: "Sandy loam", rootingDepthCm: 45, drainage: "Well drained", organicMatterPct: 2.6 },
  g5: { texture: "Loam", rootingDepthCm: 60, drainage: "Well drained", organicMatterPct: 3.0 },
  g6: { texture: "Sandy loam", rootingDepthCm: 55, drainage: "Well drained", organicMatterPct: 2.5 },
};

const FALLBACK_PROFILE: BlockSoilProfile = {
  texture: "Sandy loam",
  rootingDepthCm: 55,
  drainage: "Well drained",
  organicMatterPct: 2.6,
};

const SOIL_STORAGE_KEY = "agrirover_block_soil_v1";
const ROVER_CONTEXT_KEY = "agrirover_rover_ctx_v1";

export function defaultBlockSoilProfile(zone: string): BlockSoilProfile {
  return { ...(DEFAULT_PROFILES[zone] ?? FALLBACK_PROFILE) };
}

export function loadBlockSoilProfiles(): Record<string, BlockSoilProfile> {
  try {
    const raw = localStorage.getItem(SOIL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, BlockSoilProfile>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getBlockSoilProfile(zone: string, overrides?: Record<string, BlockSoilProfile>): BlockSoilProfile {
  const map = overrides ?? loadBlockSoilProfiles();
  const saved = map[zone];
  if (!saved) return defaultBlockSoilProfile(zone);
  return {
    texture: saved.texture || defaultBlockSoilProfile(zone).texture,
    rootingDepthCm: Number.isFinite(saved.rootingDepthCm) && saved.rootingDepthCm > 0 ? saved.rootingDepthCm : defaultBlockSoilProfile(zone).rootingDepthCm,
    drainage: saved.drainage || defaultBlockSoilProfile(zone).drainage,
    organicMatterPct: Number.isFinite(saved.organicMatterPct) && saved.organicMatterPct >= 0 ? saved.organicMatterPct : defaultBlockSoilProfile(zone).organicMatterPct,
    updatedAt: saved.updatedAt,
  };
}

export function saveBlockSoilProfile(zone: string, profile: BlockSoilProfile): Record<string, BlockSoilProfile> {
  const next = {
    ...loadBlockSoilProfiles(),
    [zone]: { ...profile, updatedAt: new Date().toISOString() },
  };
  try {
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore blocked storage */
  }
  return next;
}

export function resetBlockSoilProfile(zone: string): Record<string, BlockSoilProfile> {
  const next = { ...loadBlockSoilProfiles() };
  delete next[zone];
  try {
    localStorage.setItem(SOIL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore blocked storage */
  }
  return next;
}

export type RoverSelectionContext = { zone: string; plant: string | null };

export function getRoverContext(): RoverSelectionContext | null {
  try {
    const raw = sessionStorage.getItem(ROVER_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoverSelectionContext;
    return parsed?.zone ? { zone: parsed.zone, plant: parsed.plant ?? null } : null;
  } catch {
    return null;
  }
}

export function setRoverContext(ctx: RoverSelectionContext): void {
  try {
    sessionStorage.setItem(ROVER_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore blocked storage */
  }
}

export function parsePlantLabel(name: string | null | undefined): [number, number] | null {
  const m = name?.trim().match(/^R(\d+)\s+T(\d+)$/i);
  if (!m) return null;
  const row = Number(m[1]) - 1;
  const col = Number(m[2]) - 1;
  return row >= 0 && col >= 0 ? [row, col] : null;
}

export type SoilTargets = {
  ph: [number, number];
  moisture: [number, number];
  ec: [number, number];
  soilTemp: [number, number];
};

const DEFAULT_TARGETS: SoilTargets = {
  ph: [6.0, 6.8],
  moisture: [58, 72],
  ec: [0.8, 2.5],
  soilTemp: [18, 29],
};

export function targetsFromConditions(conditions?: BedConditions): SoilTargets {
  const byMetric = new Map<string, CondParam>((conditions?.params ?? []).map((p) => [p.metric, p]));
  return {
    ph: byMetric.get("soil_ph")?.target ?? DEFAULT_TARGETS.ph,
    moisture: byMetric.get("soil_moisture")?.target ?? (conditions?.stage?.moisture as [number, number] | undefined) ?? DEFAULT_TARGETS.moisture,
    ec: byMetric.get("soil_ec")?.target ?? (conditions?.stage?.ec as [number, number] | undefined) ?? DEFAULT_TARGETS.ec,
    soilTemp: byMetric.get("soil_temperature")?.target ?? DEFAULT_TARGETS.soilTemp,
  };
}

function rateMetric(value: number | null, band: [number, number]): MetricRating {
  if (value === null || !Number.isFinite(value)) return "none";
  if (value < band[0]) return "low";
  if (value > band[1]) return "high";
  return "ok";
}

export type PlantSoilReadings = {
  ph: number | null;
  moisture: number | null;
  ec: number | null;
  soilTemp: number | null;
  n: number | null;
  p: number | null;
  k: number | null;
  airTemp: number | null;
  airHumidity: number | null;
};

export type PlantCameraInfo = {
  photoSaved: boolean;
  latestPhoto: SavedPhoto | null;
  leafCoverPct: number | null;
  chlorosisPct: number | null;
  flagged: boolean;
  statusLabel: string;
};

export type PlantSoilRow = {
  zone: string;
  row: number;
  col: number;
  name: string;
  rowLabel: string;
  reached: boolean;
  plant: boolean;
  status: SoilHealthStatus;
  issues: string[];
  notes: string[];
  readings: PlantSoilReadings;
  states: {
    ph: MetricRating;
    moisture: MetricRating;
    ec: MetricRating;
    soilTemp: MetricRating;
  };
  canopy: number | null;
  chlorosis: number | null;
  flagged: boolean;
  waterLitres: number | null;
  fullLitres: number | null;
  texture: string;
  rootingDepthCm: number;
  drainage: string;
  rootingSummary: string;
  organicMatterPct: number;
  camera: PlantCameraInfo;
  vision: PlantVisionInfo;
};

function numOrNull(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function evaluatePlantSoilRow(input: {
  zone: string;
  row: number;
  col: number;
  cell?: RoverCell;
  targets: SoilTargets;
  profile: BlockSoilProfile;
  photo?: SavedPhoto | null;
  stageN?: number | null;
  capturedAt?: string | null;
}): PlantSoilRow {
  const { zone, row, col, cell, targets, profile, photo = null, stageN = null, capturedAt = null } = input;
  const name = cellName(row, col);
  const rowLabel = `R${row + 1}`;
  const reached = Boolean(cell);
  const plant = cell ? cell.plant : true;
  const raw = cell?.readings ?? {};

  const readings: PlantSoilReadings = {
    ph: numOrNull(raw.soil_ph),
    moisture: numOrNull(raw.soil_moisture),
    ec: numOrNull(raw.soil_ec),
    soilTemp: numOrNull(raw.soil_temperature),
    n: numOrNull(raw.nitrogen),
    p: numOrNull(raw.phosphorus),
    k: numOrNull(raw.potassium),
    airTemp: numOrNull(raw.air_temperature),
    airHumidity: numOrNull(raw.air_humidity),
  };

  const states = {
    ph: rateMetric(readings.ph, targets.ph),
    moisture: rateMetric(readings.moisture, targets.moisture),
    ec: rateMetric(readings.ec, targets.ec),
    soilTemp: rateMetric(readings.soilTemp, targets.soilTemp),
  };

  const hasAnyReading = [readings.ph, readings.moisture, readings.ec, readings.soilTemp, readings.n, readings.p, readings.k].some(
    (v) => v !== null,
  );
  const adviceNotes = (cell?.advice?.notes ?? []).filter(
    (n) => n !== "No probe reading" && n !== "No tree seen" && n !== "No plant seen",
  );
  const expectedYellow = adviceNotes.some((n) => n === "Yellow leaves: expected");
  const issues: string[] = [];

  if (reached && plant) {
    if (states.ph === "low") issues.push(`Low pH (${readings.ph!.toFixed(2)})`);
    else if (states.ph === "high") issues.push(`High pH (${readings.ph!.toFixed(2)})`);

    if (states.moisture === "low") issues.push(`Dry soil (${readings.moisture!.toFixed(1)}%)`);
    else if (states.moisture === "high") issues.push(`Wet soil (${readings.moisture!.toFixed(1)}%)`);

    if (states.ec === "low") issues.push(`Low EC (${readings.ec!.toFixed(2)})`);
    else if (states.ec === "high") issues.push(`High EC (${readings.ec!.toFixed(2)})`);

    if (states.soilTemp === "high") issues.push(`Hot root zone (${readings.soilTemp!.toFixed(1)} °C)`);
    else if (states.soilTemp === "low") issues.push(`Cool soil (${readings.soilTemp!.toFixed(1)} °C)`);

    if (cell?.flagged && !expectedYellow) {
      issues.push("Yellow leaves");
    }
    if (adviceNotes.some((n) => n.startsWith("Small canopy"))) {
      issues.push("Small canopy");
    }
  }

  const vision = evaluatePlantVision({
    row,
    col,
    reached,
    plant,
    cell,
    photo,
    stageN,
    capturedAt,
  });

  if (reached && plant && vision.status === "alert" && !issues.some((i) => i.includes("Yellow") || i.includes("spot") || i.includes("blight") || i.includes("Pest") || i.includes("Rust"))) {
    if (!cell?.flagged) issues.push(vision.shortLabel);
  }

  let status: SoilHealthStatus = "optimal";
  if (!reached || !plant || !hasAnyReading) {
    status = "unrecorded";
  } else if (issues.length > 0 || vision.status === "alert") {
    status = "attention";
  }

  const leafCoverPct = cell?.canopy !== undefined && cell?.canopy !== null ? Math.round(cell.canopy * 100) : null;
  const chlorosisPct = cell?.chlorosis !== undefined && cell?.chlorosis !== null ? Math.round(cell.chlorosis * 100) : null;
  const flagged = Boolean(cell?.flagged);

  let statusLabel = "Not scanned yet";
  if (reached && !plant) {
    statusLabel = "No plant seen";
  } else if (photo) {
    statusLabel = photo.expertLabel
      ? `Confirmed: ${photo.expertLabel}`
      : photo.modelLabel
        ? `Photo saved (${photo.modelLabel})`
        : "Photo saved";
  } else if (flagged) {
    statusLabel = expectedYellow ? "Expected stress yellowing" : "Flagged · needs photo";
  } else if (reached) {
    statusLabel = "Scanned · healthy canopy";
  }

  return {
    zone,
    row,
    col,
    name,
    rowLabel,
    reached,
    plant,
    status,
    issues,
    notes: adviceNotes,
    readings,
    states,
    canopy: cell?.canopy ?? null,
    chlorosis: cell?.chlorosis ?? null,
    flagged,
    waterLitres: cell?.advice?.litres ?? null,
    fullLitres: cell?.advice?.fullLitres ?? null,
    texture: profile.texture,
    rootingDepthCm: profile.rootingDepthCm,
    drainage: profile.drainage,
    rootingSummary: `${profile.rootingDepthCm} cm · ${profile.drainage}`,
    organicMatterPct: profile.organicMatterPct,
    camera: {
      photoSaved: Boolean(photo),
      latestPhoto: photo,
      leafCoverPct,
      chlorosisPct,
      flagged,
      statusLabel,
    },
    vision,
  };
}

export function resolveBlockGrid(opts: {
  rows?: number | null;
  cols?: number | null;
  rowM?: number | null;
  cellM?: number | null;
  cycle?: Cycle;
  zone?: ZoneNow;
}): { rows: number; cols: number; rowM: number; treeM: number } {
  const { rows, cols, rowM, cellM, cycle, zone } = opts;
  if (rows && cols && rows > 0 && cols > 0) {
    return {
      rows,
      cols,
      rowM: rowM || cycle?.grid?.rowM || 3,
      treeM: cellM || cycle?.grid?.treeM || 3,
    };
  }
  if (cycle?.grid) {
    return { ...cycle.grid };
  }
  const area = zone?.areaM2 ?? 50;
  const estCols = Math.max(2, Math.min(6, Math.round(Math.sqrt(area / 9))));
  const estRows = Math.max(2, Math.min(6, Math.round(area / (estCols * 9))));
  return { rows: estRows, cols: estCols, rowM: 3, treeM: 3 };
}

export function buildBlockSoilRows(input: {
  zone: string;
  rows: number;
  cols: number;
  cells: RoverCell[];
  conditions?: BedConditions;
  advice?: Advice;
  photos?: SavedPhoto[];
  profile: BlockSoilProfile;
  capturedAt?: string | null;
}): PlantSoilRow[] {
  const { zone, rows, cols, cells, conditions, advice, photos = [], profile, capturedAt = null } = input;
  const stageN = conditions?.stage?.n ?? advice?.stage?.n ?? null;
  const effectiveCapturedAt = capturedAt ?? advice?.surveyedAt ?? conditions?.recordedAt ?? null;
  const targets = targetsFromConditions(conditions);
  const adviceByKey = new Map((advice?.trees ?? []).filter(Boolean).map((t) => [`${t.row},${t.col}`, t]));
  const cellByKey = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));
  const photoByKey = new Map<string, SavedPhoto>();
  for (const p of photos) {
    if (p.zone !== zone) continue;
    const rc = parsePlantLabel(p.tree);
    if (!rc) continue;
    const key = `${rc[0]},${rc[1]}`;
    const prev = photoByKey.get(key);
    if (!prev || p.takenAt > prev.takenAt) photoByKey.set(key, p);
  }

  const out: PlantSoilRow[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = `${row},${col}`;
      const rawCell = cellByKey.get(key);
      const cell = rawCell
        ? { ...rawCell, advice: rawCell.advice ?? adviceByKey.get(key) ?? null }
        : undefined;
      out.push(
        evaluatePlantSoilRow({
          zone,
          row,
          col,
          cell,
          targets,
          profile,
          photo: photoByKey.get(key) ?? null,
          stageN,
          capturedAt: effectiveCapturedAt,
        }),
      );
    }
  }
  return out;
}

export function summarizePlantSoil(plants: PlantSoilRow[]) {
  let optimal = 0;
  let attention = 0;
  let unrecorded = 0;
  let visionAlerts = 0;
  for (const p of plants) {
    if (p.status === "optimal") optimal++;
    else if (p.status === "attention") attention++;
    else unrecorded++;
    if (p.vision.status === "alert") visionAlerts++;
  }
  return { total: plants.length, optimal, attention, unrecorded, visionAlerts };
}
