// The reference numbers of docs/rover-redesign.md ("Reference numbers and tests"), each next to what the engine's own
// modules compute with the default profile. The Vitest suite asserts every row; scripts/sanity.ts prints the table.
// If a row fails, the physics is wrong, not the table.

import { ROVER, SAFETY, SURFACES, T1, type RoverProfile } from "./profile";
import { motorConstants, stallForce } from "./motor";
import { hotelPower } from "./driver";
import { packEnergyJ, socAt } from "./battery";
import {
  climbTractionDeg, cruisePoint, driveEnergyPerM, maxSpeed, openLoopDrift, pivotEnergy, pivotPoint, pivotSideForce, pivotTime,
  rowEndError, stoppingDistance, turnMargin,
} from "./vehicle";
import { blurPx, coverage, fov, frameAt, lensToStem, panJ, pxPerMm, settleS } from "./camera";
import { forceNeeded, liftLimit, minThetaToEnter, probeCycle, stallThrust } from "./probe";
import { cropUseLitres, raw, refillLitres, taw, triggerTheta } from "./agronomy";
import { breakpoint, rssi } from "./link";
import { STRATEGIES, budgetRun, makePlan, summary } from "./planner";

export interface RefRow {
  group: string; name: string; unit: string;
  expected: number; actual: number;
  /** relative (fraction) or absolute tolerance */ rel?: number; abs?: number;
  note?: string;
}

export const within = (r: RefRow) =>
  r.abs !== undefined ? Math.abs(r.actual - r.expected) <= r.abs + 1e-12 : Math.abs(r.actual - r.expected) <= (r.rel ?? 0) * Math.abs(r.expected) + 1e-12;

export function referenceRows(p: RoverProfile = ROVER): RefRow[] {
  const m = motorConstants(p.motor);
  const vb = p.refPackV;
  const packed = cruisePoint(p, SURFACES.packed), loose = cruisePoint(p, SURFACES.loose), mud = cruisePoint(p, SURFACES.mud);
  const piv = pivotPoint(p, SURFACES.packed);
  const hotel = hotelPower(p, vb);
  const cyc = probeCycle(p);
  const d = lensToStem(p, T1.rowM / 2);                  // lens to stem after a 90° pivot in the lane: 0.40 m
  const plan = (id: "A" | "B" | "C") => summary(makePlan(T1, STRATEGIES[id], p), p);
  const A = plan("A"), B = plan("B"), C = plan("C");
  const low = budgetRun(makePlan(T1, STRATEGIES.A, p), p, 20);
  const drift = openLoopDrift(p);
  const rows: RefRow[] = [];
  const row = (group: string, name: string, unit: string, expected: number, actual: number, tol: { rel?: number; abs?: number }, note?: string) =>
    rows.push({ group, name, unit, expected, actual, ...tol, note });

  row("Motor", "Resistance R", "Ω", 4.00, m.R, { rel: 0.01 });
  row("Motor", "Back-EMF constant K", "mV·s/rad", 4.265, m.K * 1000, { rel: 0.01 });
  row("Motor", "Gearbox efficiency η_g", "", 0.286, m.etaG, { rel: 0.01 });
  row("Motor", "Stall force per wheel", "N", 2.41, stallForce(m, p.wheelRadius), { rel: 0.01 });
  row("Power", "Electronics power", "W", 2.20, hotel, { rel: 0.02 });

  row("Cruise", "Packed: slip", "%", 1.3, packed.slip * 100, { rel: 0.05 });
  row("Cruise", "Packed: motor current", "A", 0.26, packed.current, { rel: 0.05 });
  row("Cruise", "Packed: duty", "%", 20, packed.duty * 100, { rel: 0.05 });
  row("Cruise", "Loose: slip", "%", 5.7, loose.slip * 100, { rel: 0.05 });
  row("Cruise", "Loose: motor current", "A", 0.41, loose.current, { rel: 0.05 });
  row("Cruise", "Loose: duty", "%", 28, loose.duty * 100, { rel: 0.05 });
  row("Cruise", "Mud: slip", "%", 31, mud.slip * 100, { rel: 0.05 });

  row("Energy", "Electronics, always on", "W", 2.2, hotel, { rel: 0.05 });
  row("Energy", "Drive, packed (motors)", "J/m", 16.5, driveEnergyPerM(p, SURFACES.packed), { rel: 0.05 });
  row("Energy", "Drive, packed (with electronics)", "J/m", 31, driveEnergyPerM(p, SURFACES.packed) + hotel / p.control.cruise, { rel: 0.05 });
  row("Energy", "Drive, loose (motors)", "J/m", 35, driveEnergyPerM(p, SURFACES.loose), { rel: 0.05 });
  row("Energy", "Drive, mud (motors)", "J/m", 72, driveEnergyPerM(p, SURFACES.mud), { rel: 0.05 });
  row("Energy", "Pivot 90°, packed", "J", 65, pivotEnergy(p, SURFACES.packed), { rel: 0.05 });
  row("Energy", "Pivot 90°, packed: power", "W", 28.8, piv.motorPowerW, { rel: 0.05 });
  row("Energy", "Pivot 90°: time", "s", 2.25, pivotTime(p, 90), { rel: 0.05 });
  row("Energy", "Probe cycle", "J", 62, cyc.energyJ, { rel: 0.05 }, "loaded at the lift limit, motor only");
  row("Energy", "Probe cycle: time", "s", 29, cyc.seconds, { rel: 0.05 });
  row("Energy", "Camera pan 90° (servo)", "J", 0.2, panJ(p, 90), { rel: 0.05 });

  row("Pivot", "Side force, packed", "N", 3.02, pivotSideForce(p, SURFACES.packed), { rel: 0.05 });
  row("Pivot", "Motor current, packed", "A", 1.00, piv.current, { rel: 0.05 });
  row("Pivot", "Slip, packed", "%", 23, piv.slip * 100, { rel: 0.05 });
  row("Turn", "Turn margin, packed", "", 0.087, turnMargin(p, SURFACES.packed), { abs: 0.005 });
  row("Turn", "Turn margin, loose", "", -0.012, turnMargin(p, SURFACES.loose), { abs: 0.005 });
  row("Turn", "Turn margin, mud", "", -0.188, turnMargin(p, SURFACES.mud), { abs: 0.005 });
  row("Limits", "Top speed under the 6 V cap, loose", "m/s", 0.66, maxSpeed(p, SURFACES.loose), { rel: 0.03 });
  row("Limits", "Climb, traction-limited, packed", "°", 28, climbTractionDeg(SURFACES.packed), { abs: 0.5 });

  const f = fov(p.camera), fr = frameAt(p.camera, d);
  row("Camera", "HFOV", "°", 54.0, f.hDeg, { abs: 0.1 });
  row("Camera", "VFOV", "°", 41.8, f.vDeg, { abs: 0.1 });
  row("Camera", "Frame width at 0.40 m", "m", 0.41, fr.w, { rel: 0.01 });
  row("Camera", "Frame height at 0.40 m", "m", 0.306, fr.h, { rel: 0.01 }, "the prompt's table rounds this to 0.31");
  row("Camera", "Resolution at 0.40 m", "px/mm", 1.96, pxPerMm(p.camera, d), { rel: 0.01 });
  row("Camera", "Coverage of a 1 m plant, flat", "%", 31, 100 * coverage(p.camera, d, 1.0), { abs: 1 });
  row("Camera", "Coverage, 15 cm bed", "%", 17, 100 * coverage(p.camera, d, 1.0, 0.15), { abs: 1 });
  row("Camera", "Coverage, 25° tilt", "%", 38, 100 * coverage({ ...p.camera, tiltDeg: 25 }, d, 1.0), { abs: 1 });
  row("Camera", "Blur at 1/60 s, 0.15 m/s", "px", 4.9, blurPx(p.camera, p.control.cruise, d), { rel: 0.02 });
  row("Camera", "Mast settle time", "s", 0.88, settleS(p.camera), { rel: 0.02 });

  row("Probe", "Lift limit, between the axles", "N", 10.6, liftLimit(p), { rel: 0.02 });
  row("Probe", "Lift limit, front (0.12 m ahead)", "N", 4.3, liftLimit(p, 0.12), { rel: 0.02 });
  row("Probe", "Blade force at θ 0.25, bed", "N", 12.4, forceNeeded("blade", "bed", 0.25, p.probe.strokeM), { rel: 0.03 });
  row("Probe", "Blade force at θ 0.25, lane", "N", 47.4, forceNeeded("blade", "lane", 0.25, p.probe.strokeM), { rel: 0.03 });
  row("Probe", "Driest θ for the blade in the bed", "θ", 0.279, minThetaToEnter(p, "blade", "bed"), { abs: 0.005 });
  row("Probe", "Driest θ for twin rods in the lane", "θ", 0.261, minThetaToEnter(p, "twinRod", "lane"), { abs: 0.005 });
  row("Probe", "Stroke speed", "mm/s", 4.5, cyc.speed * 1000, { rel: 0.05 });
  row("Probe", "Full cycle", "s", 29.4, cyc.seconds, { rel: 0.05 });
  row("Probe", "Screw thrust at stall", "N", 79, stallThrust(p), { rel: 0.02 });

  row("Battery", "SoC at 11.10 V, rested", "%", 37.5, socAt(11.1, 0, p.battery), { abs: 1 });
  row("Battery", "SoC at 11.10 V under 1.5 A", "%", 64, socAt(11.1, 1.5, p.battery), { abs: 1 });
  row("Battery", "Pack energy, 2.5 Ah 3S", "Wh", 28.1, packEnergyJ(p.battery) / 3600, { rel: 0.01 });
  row("Battery", "Sag during a pivot", "V", 0.53, (piv.packA + hotel / vb) * p.battery.rPack, { rel: 0.05 });

  row("Plans", "Plan A: time", "min", 68.5, A.seconds / 60, { rel: 0.03 });
  row("Plans", "Plan B: time", "min", 61.2, B.seconds / 60, { rel: 0.03 });
  row("Plans", "Plan C: time", "min", 25.0, C.seconds / 60, { rel: 0.03 });
  row("Plans", "Plan A: energy", "Wh", 8.16, A.energyWh, { rel: 0.05 });
  row("Plans", "Plan B: energy", "Wh", 4.41, B.energyWh, { rel: 0.05 });
  row("Plans", "Plan C: energy", "Wh", 1.77, C.energyWh, { rel: 0.05 });
  row("Plans", "Plan A: route + way home", "m", 54.3 + 14.2, A.routeM + A.homeM, { rel: 0.01 });
  row("Plans", "Plan C: route + way home", "m", 32.9 + 13.2, C.routeM + C.homeM, { rel: 0.01 });
  row("Plans", "Lowest start SoC, plan A", "%", 39.9, A.lowestStartSoc, { abs: 2 });
  row("Plans", "Lowest start SoC, plan C", "%", 17.1, C.lowestStartSoc, { abs: 2 });
  row("Plans", "Low battery from 20 % (A): stops before home", "stops", 31, low.stopsDone, { abs: 3 });
  row("Plans", "Low battery from 20 % (A): SoC at home", "%", 10.5, low.socAtHome, { abs: 1 });

  row("Position", "Open-loop drift: yaw rate", "°/s", 1.58, drift.yawRateDeg, { rel: 0.05 });
  row("Position", "Open-loop drift: distance to leave the lane", "m", 1.04, drift.distance, { rel: 0.05 });
  const rowM = (T1.spots - 1) * T1.plantM;
  row("Position", "Row-end error, by time", "m", 0.95, rowEndError(p, rowM), { rel: 0.05 });
  row("Position", "Row-end error, encoders, packed", "m", 0.12, rowEndError(p, rowM, SURFACES.packed), { rel: 0.05 });
  row("Position", "Row-end error, encoders, loose", "m", 0.54, rowEndError(p, rowM, SURFACES.loose), { rel: 0.05 });

  row("Wi-Fi", "Breakpoint", "m", 13.0, breakpoint(p), { abs: 0.5 });
  row("Wi-Fi", "RSSI at 50 m", "dBm", -77.6, rssi(p, 50), { abs: 0.5 });

  row("Agronomy", "TAW", "mm", 60, taw(), { rel: 0.01 });
  row("Agronomy", "RAW", "mm", 24, raw(), { rel: 0.01 });
  row("Agronomy", "Refill point θ", "θ", 0.21, triggerTheta(), { rel: 0.01 });
  row("Agronomy", "Refill at θ 0.19", "L", 5.33, refillLitres(0.19, T1.plantM), { rel: 0.01 });
  row("Agronomy", "Crop water use per plant", "L/day", 2.59, cropUseLitres(T1.rowM, T1.plantM), { rel: 0.01 });

  const sOn = stoppingDistance(p, SURFACES.packed, p.control.cruise, SAFETY.latencyOnboardS);
  const sWifi = stoppingDistance(p, SURFACES.packed, p.control.cruise, SAFETY.latencyWifiS);
  row("Stopping", "Onboard trigger", "mm", 7.3, sOn.distance * 1000, { rel: 0.10 });
  row("Stopping", "E-stop over Wi-Fi", "mm", 40, sWifi.distance * 1000, { rel: 0.10 });
  return rows;
}
