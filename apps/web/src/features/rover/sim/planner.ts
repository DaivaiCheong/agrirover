// Route planner: every valid strategy priced in distance, time and energy before the run.
// Rules: the rover drives in the lanes between rows, never on the plant line; a U-turn overruns into the headland,
// pivots, crosses, pivots; a shared lane serves the rows on both sides; the way home is part of every plan.

import { SAFETY, type CameraMode, type FieldProfile, type RoverProfile, type SurfaceCoef } from "./profile";
import { packEnergyJ } from "./battery";
import { hotelPower } from "./driver";
import { panJ, panS, settleS } from "./camera";
import { probeCycle } from "./probe";
import { surfaceAt } from "./soil";
import { driveEnergyPerM, driveTime, pivotEnergy, pivotTime, turnMargin } from "./vehicle";

export type LaneMode = "every" | "shared";
export interface Strategy { id: string; label: string; lanes: LaneMode; camera: CameraMode; probeEvery: number }

export const STRATEGIES: Record<"A" | "B" | "C", Strategy> = {
  A: { id: "A", label: "Every lane, turn to look", lanes: "every", camera: "turn", probeEvery: 1 },
  B: { id: "B", label: "Every lane, pan servo", lanes: "every", camera: "pan", probeEvery: 1 },
  C: { id: "C", label: "Shared lanes", lanes: "shared", camera: "pan", probeEvery: 2 },
};

export interface Lane { y: number; rows: number[] }

/** Lanes and the rows each serves. Every lane: one lane beside each row. Shared: one lane between each pair of rows;
 *  an odd last row gets a lane between it and the row before. */
export function lanesFor(f: FieldProfile, mode: LaneMode): Lane[] {
  if (mode === "every") return Array.from({ length: f.rows }, (_, j) => ({ y: (j - 0.5) * f.rowM, rows: [j] }));
  const out: Lane[] = [];
  for (let j = 0; j + 1 < f.rows; j += 2) out.push({ y: (j + 0.5) * f.rowM, rows: [j, j + 1] });
  if (f.rows % 2 === 1) out.push({ y: (f.rows - 1.5) * f.rowM, rows: [f.rows - 1] });
  return out;
}

export const hasPlant = (f: FieldProfile, row: number, spot: number) => !f.empty.some(([r, s]) => r === row && s === spot);
export const plantCount = (f: FieldProfile) => f.rows * f.spots - f.empty.length;

export type Action =
  | { kind: "drive"; m: number }
  | { kind: "pivot"; deg: number }
  | { kind: "settle" }
  | { kind: "capture" }
  | { kind: "pan"; deg: number; overlap?: boolean }        // overlap: done while driving, costs no time
  | { kind: "probe" };

export interface Stop { index: number; lane: number; spot: number; x: number; y: number; heading: 1 | -1; plants: [number, number][]; probe: boolean }
/** A leg: the moves to a stop, then the work there. */
export interface Leg { stop: Stop; move: Action[]; work: Action[] }
export interface Pose { lane: number; x: number; heading: 1 | -1 }

export interface Plan {
  strategy: Strategy; field: FieldProfile; lanes: Lane[]; stops: Stop[]; legs: Leg[];
  home: Action[]; routeM: number; homeM: number; surface: SurfaceCoef;
  /** a pivot needs a positive turn margin on this soil */ canPivot: boolean;
}

const metres = (a: Action[]) => a.reduce((s, x) => s + (x.kind === "drive" ? x.m : 0), 0);

/** Work at a stop: settle after the stop, aim and capture each side with a plant, then probe if this stop probes. */
function workAt(sides: number, camera: CameraMode, probe: boolean): Action[] {
  const w: Action[] = [{ kind: "settle" }];
  for (let s = 0; s < sides; s++) {
    if (camera === "turn") w.push({ kind: "pivot", deg: 90 }, { kind: "settle" }, { kind: "capture" }, { kind: "pivot", deg: 90 });
    else if (camera === "pan") w.push({ kind: "pan", deg: 90 }, { kind: "settle" }, { kind: "capture" }, { kind: "pan", deg: 90, overlap: true });
    else if (camera === "side" && s === 0) w.push({ kind: "capture" });
    else if (camera === "twoSide" && s === 0) w.push({ kind: "capture" });
  }
  if (probe) w.push({ kind: "probe" });
  return w;
}

/** The way home from a pose in a lane: to the start pose (lane 0, x = 0). Picks the cheaper of turning round in the
 *  lane or carrying on to the far headland. */
export function homeFrom(plan: Pick<Plan, "lanes" | "field">, pose: Pose, p: RoverProfile, surface: SurfaceCoef): Action[] {
  const f = plan.field, end = (f.spots - 1) * f.plantM, dy = Math.abs(plan.lanes[pose.lane].y - plan.lanes[0].y);
  const viaNear = (turnFirst: boolean): Action[] => [
    ...(turnFirst ? [{ kind: "pivot", deg: 180 } as Action] : []),
    ...(dy === 0 ? [{ kind: "drive", m: pose.x } as Action]
      : [{ kind: "drive", m: pose.x + f.overrun }, { kind: "pivot", deg: 90 }, { kind: "drive", m: dy }, { kind: "pivot", deg: 90 }, { kind: "drive", m: f.overrun }] as Action[]),
  ];
  if (pose.heading === -1) return pose.x === 0 && dy === 0 ? [] : viaNear(false);
  const back = viaNear(true);
  if (dy === 0) return pose.x === 0 ? [] : back;
  const ahead: Action[] = [{ kind: "drive", m: end - pose.x + f.overrun }, { kind: "pivot", deg: 90 }, { kind: "drive", m: dy },
    { kind: "pivot", deg: 90 }, { kind: "drive", m: end + f.overrun }];
  return cost(back, p, surface).energyJ <= cost(ahead, p, surface).energyJ ? back : ahead;
}

export function makePlan(f: FieldProfile, s: Strategy, p: RoverProfile): Plan {
  const lanes = lanesFor(f, s.lanes);
  const surface = surfaceAt(f.laneKind, f.theta);
  const end = (f.spots - 1) * f.plantM;
  const stops: Stop[] = [];
  lanes.forEach((lane, li) => {
    const heading: 1 | -1 = li % 2 === 0 ? 1 : -1;
    for (let k = 0; k < f.spots; k++) {
      const spot = heading === 1 ? k : f.spots - 1 - k;
      const plants = lane.rows.filter((r) => hasPlant(f, r, spot)).map((r) => [r, spot] as [number, number]);
      if (plants.length) stops.push({ index: stops.length, lane: li, spot, x: spot * f.plantM, y: lane.y, heading, plants, probe: false });
    }
  });
  stops.forEach((st, i) => { st.probe = i % s.probeEvery === 0; });
  const legs: Leg[] = stops.map((st, i) => {
    const prev = stops[i - 1];
    let move: Action[] = [];
    if (prev && prev.lane === st.lane) move = [{ kind: "drive", m: Math.abs(st.x - prev.x) }];
    else if (prev) {
      const laneEnd = prev.heading === 1 ? end : 0, nextStart = st.heading === 1 ? 0 : end;
      move = [{ kind: "drive", m: Math.abs(laneEnd - prev.x) + f.overrun }, { kind: "pivot", deg: 90 },
        { kind: "drive", m: Math.abs(st.y - prev.y) }, { kind: "pivot", deg: 90 },
        { kind: "drive", m: f.overrun + Math.abs(st.x - nextStart) }];
    }
    return { stop: st, move, work: workAt(st.plants.length, s.camera, st.probe) };
  });
  const last = stops[stops.length - 1];
  const partial = { lanes, field: f };
  const home = last ? homeFrom(partial, { lane: last.lane, x: last.x, heading: last.heading }, p, surface) : [];
  return {
    strategy: s, field: f, lanes, stops, legs, home, surface, canPivot: turnMargin(p, surface) > 0,
    routeM: legs.reduce((sum, l) => sum + metres(l.move), 0), homeM: metres(home),
  };
}

export interface Budget { seconds: number; motorJ: number; hotelJ: number; energyJ: number }

/** Time and energy for a list of actions, at the reference pack voltage. Electronics run all the time. */
export function cost(actions: Action[], p: RoverProfile, surface: SurfaceCoef, vb = p.refPackV): Budget {
  const ePerM = driveEnergyPerM(p, surface, vb), cyc = probeCycle(p, vb), settle = settleS(p.camera);
  let seconds = 0, motorJ = 0;
  for (const a of actions) {
    switch (a.kind) {
      case "drive": seconds += driveTime(p, a.m); motorJ += a.m * ePerM; break;
      case "pivot": seconds += pivotTime(p, a.deg); motorJ += pivotEnergy(p, surface, a.deg, vb); break;
      case "settle": seconds += settle; break;
      case "capture": seconds += p.camera.captureS; break;
      case "pan": seconds += a.overlap ? 0 : panS(p.camera, a.deg); motorJ += panJ(p, a.deg); break;
      case "probe": seconds += cyc.seconds; motorJ += cyc.energyJ; break;
    }
  }
  const hotelJ = hotelPower(p, vb) * seconds;
  return { seconds, motorJ, hotelJ, energyJ: motorJ + hotelJ };
}

const legCost = (l: Leg, p: RoverProfile, s: SurfaceCoef) => cost([...l.move, ...l.work], p, s);

export function summary(plan: Plan, p: RoverProfile) {
  const parts = [...plan.legs.flatMap((l) => [...l.move, ...l.work]), ...plan.home];
  const b = cost(parts, p, plan.surface);
  const home = cost(plan.home, p, plan.surface);
  const pack = packEnergyJ(p.battery);
  return {
    stops: plan.stops.length, probes: plan.stops.filter((s) => s.probe).length,
    routeM: plan.routeM, homeM: plan.homeM, ...b, energyWh: b.energyJ / 3600, homeJ: home.energyJ,
    roundsPerCharge: (0.85 * pack) / b.energyJ,
    /** lowest SoC (%) to start: floor + 100 (round energy + 1.5 E_home) / E_pack */
    lowestStartSoc: p.battery.floorPct + (100 * (b.energyJ + SAFETY.reserveFactor * home.energyJ)) / pack,
  };
}

/** Run the plan stop by stop on its energy budget, from a start SoC: before each leg, go home when the energy left
 *  above the floor, less the next leg, is under 1.5 × the way home from here. */
export function budgetRun(plan: Plan, p: RoverProfile, startSoc: number) {
  const pack = packEnergyJ(p.battery);
  let avail = ((startSoc - p.battery.floorPct) / 100) * pack, done = 0;
  let pose: Pose = { lane: 0, x: 0, heading: 1 };
  let wentHome = false;
  for (const leg of plan.legs) {
    const next = legCost(leg, p, plan.surface).energyJ;
    const home = cost(homeFrom(plan, pose, p, plan.surface), p, plan.surface).energyJ;
    if (avail - next < SAFETY.reserveFactor * home) { wentHome = true; break; }
    avail -= next; done++;
    pose = { lane: leg.stop.lane, x: leg.stop.x, heading: leg.stop.heading };
  }
  avail -= cost(homeFrom(plan, pose, p, plan.surface), p, plan.surface).energyJ;
  return { stopsDone: done, wentHome, socAtHome: p.battery.floorPct + (100 * avail) / pack };
}
