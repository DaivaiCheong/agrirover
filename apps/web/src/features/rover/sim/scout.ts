// A round's findings from the plants' hidden truth, through the camera and probe models: what the rover would report.
// This is the fast, headless path (no driving physics); the full engine produces the same RoundData from a driven round.
// RoundData carries only what the rover could know. `truth` is for the Lab and is never read by the advice engine.

import { PROBE_SOIL, type FieldProfile, type RoverProfile } from "./profile";
import { stream } from "./rng";
import { coverage, lensToStem, pxPerMm, verticalSpan } from "./camera";
import { forceNeeded, liftLimit } from "./probe";
import { makePlan, hasPlant, type Strategy } from "./planner";
import { DETECT, SIGN_LOOK, SIGN_OF, type Condition, type Sign } from "./crop";

export type PlantId = string;
export const plantId = (row: number, spot: number) => `R${row + 1}-P${String(spot + 1).padStart(2, "0")}`;
export function parsePlantId(id: PlantId): [number, number] {
  const m = /^R(\d+)-P(\d+)$/.exec(id);
  return m ? [Number(m[1]) - 1, Number(m[2]) - 1] : [-1, -1];
}

export interface PlantTruth { row: number; spot: number; theta: number; condition: Condition }

export type SoilSource = "measured" | "laneProxy" | "interpolated" | "none";
export type Confidence = "high" | "medium" | "low";
export type ProbeResult = "ok" | "tooHard" | "skipped";

export interface SoilObs {
  theta: number | null; source: SoilSource; confidence: Confidence | null;
  probe?: ProbeResult; needN?: number; liftN?: number; laneTheta?: number;
}
export interface SignObs { sign: Sign; p: number; px: number; visible: number }
export interface PlantObs {
  id: PlantId; row: number; spot: number; stop: number;
  reached: boolean;
  /** fraction of the plant's height in the photo; 0 when not photographed */ seen: number;
  signs: SignObs[]; soil: SoilObs;
}
export interface Forecast { rainMm: number; prob: number }

export interface RoundData {
  id: string; block: string; label: string; crop: string; at: string; seed: number; scenario?: string;
  rows: number; spots: number; rowM: number; plantM: number; plantCount: number;
  plants: PlantObs[];
  outcome: "complete" | "partial"; outcomeWhy?: string;
  probes: { tried: number; ok: number; tooHard: number };
  view: { lo: number; hi: number };                  // m above the plant's base, at the stem
  forecast?: Forecast;
  truth?: {
    condition: Record<PlantId, Condition>; theta: Record<PlantId, number>;
    missed: { id: PlantId; condition: Condition; why: "out of view" | "not detected" }[];
    falseAlarms: PlantId[]; hardwareHints: string[];
  };
}

export interface ScoutInput {
  field: FieldProfile; profile: RoverProfile; strategy: Strategy;
  /** plants that differ from healthy at the field's θ */ truths?: PlantTruth[];
  seed: number;
  /** "probe": readings from the rover's probe in the lane; "given": the bed measured directly (a hand meter, a bed sensor) */
  soil: "probe" | "given";
  laneTheta?: number;
  laneK?: number;
  at?: string; id?: string; scenario?: string; forecast?: Forecast;
}

const sigma = (x: number) => 1 / (1 + Math.exp(-x));

export function scout(i: ScoutInput): RoundData {
  const { field: f, profile: p } = i;
  const plan = makePlan(f, i.strategy, p);
  const camRng = stream(i.seed, "camera"), fpRng = stream(i.seed, "falsePositive"), probeRng = stream(i.seed, "probe");
  const bias = probeRng.gauss(0, 0.01);                              // this round's calibration bias
  const k = i.laneK ?? PROBE_SOIL.laneToBed.bare;
  const truthOf = new Map((i.truths ?? []).map((t) => [plantId(t.row, t.spot), t]));
  const truth = (row: number, spot: number): PlantTruth => truthOf.get(plantId(row, spot)) ?? { row, spot, theta: f.theta, condition: "healthy" };
  const base = f.bed === "raised" ? f.bedHeight : 0;
  const canAim = i.strategy.camera !== "turn" || plan.canPivot;
  const lift = liftLimit(p);
  const obs = new Map<PlantId, PlantObs>();
  const probes = { tried: 0, ok: 0, tooHard: 0 };
  const missed: NonNullable<RoundData["truth"]>["missed"] = [], falseAlarms: PlantId[] = [];
  let anyOutOfView = false;

  for (const st of plan.stops) {
    // probe first in the books, so its result can be given to the stop's plants
    let soilHere: SoilObs | null = null;
    if (i.soil === "probe" && st.probe) {
      probes.tried++;
      const laneTheta = i.laneTheta ?? k * (st.plants.reduce((s, [r, c]) => s + truth(r, c).theta, 0) / st.plants.length);
      const need = forceNeeded(p.probe.kind, f.laneKind, laneTheta, p.probe.strokeM);
      if (need > lift) {
        probes.tooHard++;
        soilHere = { theta: null, source: "none", confidence: null, probe: "tooHard", needN: need, liftN: lift, laneTheta };
      } else {
        probes.ok++;
        const reading = laneTheta + bias + probeRng.gauss(0, PROBE_SOIL.noiseSd);
        soilHere = { theta: reading / k, source: "laneProxy", confidence: "medium", probe: "ok", needN: need, liftN: lift, laneTheta };
      }
    }
    for (const [row, spot] of st.plants) {
      const t = truth(row, spot), id = plantId(row, spot);
      const d = lensToStem(p, Math.abs(st.y - row * f.rowM));
      const seen = canAim ? coverage(p.camera, d, f.plantHeight, base) : 0;
      const signs: SignObs[] = [];
      const sign = SIGN_OF[t.condition];
      if (sign && canAim) {
        const look = SIGN_LOOK[sign], span = verticalSpan(p.camera, d);
        const lo = base + look.from * f.plantHeight, hi = base + look.to * f.plantHeight;
        const visible = Math.max(0, Math.min(hi, span.hi) - Math.max(lo, span.lo)) / (hi - lo);
        const px = look.sizeMm * pxPerMm(p.camera, d);
        const P = visible > 0 ? sigma(DETECT.a * Math.log(px) + DETECT.b * visible + DETECT.k) : 0;
        if (camRng.next() < P) signs.push({ sign, p: Math.min(0.99, Math.max(0.5, P)), px, visible });
        else missed.push({ id, condition: t.condition, why: visible > 0 ? "not detected" : "out of view" });
        if (visible === 0) anyOutOfView = true;
      } else if (sign) missed.push({ id, condition: t.condition, why: "out of view" });
      if (canAim && fpRng.next() < DETECT.falsePositive) {
        const pool: Sign[] = ["yellowLower", "ringSpots", "smallSpots"];
        const fp = pool[Math.floor(fpRng.next() * pool.length)];
        if (!signs.some((s) => s.sign === fp)) {
          signs.push({ sign: fp, p: fpRng.range(DETECT.fpScore[0], DETECT.fpScore[1]), px: 0, visible: 1 });
          if (!sign || sign !== fp) falseAlarms.push(id);
        }
      }
      const soil: SoilObs = i.soil === "given" ? { theta: t.theta, source: "measured", confidence: "high" }
        : soilHere ? { ...soilHere } : { theta: null, source: "none", confidence: null, probe: "skipped" };
      obs.set(id, { id, row, spot, stop: st.index, reached: true, seen, signs, soil });
    }
  }

  // stops without a reading: inverse-distance from readings within 1.5 m, low confidence
  const read = [...obs.values()].filter((o) => o.soil.theta !== null && o.soil.source !== "interpolated");
  for (const o of obs.values()) {
    if (o.soil.theta !== null) continue;
    let wsum = 0, vsum = 0;
    for (const r of read) {
      const dx = (r.spot - o.spot) * f.plantM, dy = (r.row - o.row) * f.rowM, dist = Math.hypot(dx, dy);
      if (dist > 1.5 || dist === 0) continue;
      wsum += 1 / dist ** 2; vsum += r.soil.theta! / dist ** 2;
    }
    if (wsum > 0) o.soil = { ...o.soil, theta: vsum / wsum, source: "interpolated", confidence: "low" };
  }

  const plants = [...obs.values()].sort((a, b) => a.row - b.row || a.spot - b.spot);
  const cond: Record<PlantId, Condition> = {}, theta: Record<PlantId, number> = {};
  for (let r = 0; r < f.rows; r++) for (let s = 0; s < f.spots; s++) {
    if (!hasPlant(f, r, s)) continue;
    const t = truth(r, s);
    cond[plantId(r, s)] = t.condition; theta[plantId(r, s)] = t.theta;
  }
  const span = verticalSpan(p.camera, lensToStem(p, f.rowM / 2));
  const hardwareHints = anyOutOfView
    ? ["Upper leaves are out of view: a taller mast or more upward tilt would see them"] : [];
  return {
    id: i.id ?? `${f.id}-${i.seed}`, block: f.id, label: f.label, crop: f.crop, at: i.at ?? new Date(0).toISOString(),
    seed: i.seed, scenario: i.scenario, rows: f.rows, spots: f.spots, rowM: f.rowM, plantM: f.plantM, plantCount: plants.length,
    plants, outcome: "complete", probes, forecast: i.forecast,
    view: { lo: Math.max(0, span.lo - base), hi: span.hi - base },
    truth: { condition: cond, theta, missed, falseAlarms, hardwareHints },
  };
}
