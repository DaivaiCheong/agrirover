// Soil probe mechanics. The probe can push only as hard as the rover is heavy.
//   F_screw = 2π η_s τ_out / ℓ                         (never the limit)
//   F_lift  = m g |x_cg − x_a| / |x_p − x_a|           (tips about the axle on the far side of the CG from the probe)
//   F_need(z) = k_shape CI(θ) A_tip + (c_a + μ_s K0 γ z/2) P z,   CI(θ) = CI_ref (θ/0.25)^−2

import { G0, PROBES, PROBE_SOIL, type ProbeKind, type RoverProfile, type SoilKind } from "./profile";
import { currentFor, motorConstants } from "./motor";
import { driverDrop, dutyFor } from "./driver";

export const screwThrust = (p: RoverProfile, tauOut: number) => (2 * Math.PI * p.probe.screwEff * tauOut) / p.probe.leadM;

/** Force (N) the rover can push down before a wheel lifts, for a probe at x (m ahead of the body centre; a sideways
 *  arm uses its distance past the centre line with `across`). Capped to keep 10 % of the weight on the wheels. */
export function liftLimit(p: RoverProfile, x = p.probe.x, across = false): number {
  const mg = p.mass * G0;
  const half = across ? p.track / 2 : p.wheelbase / 2;
  const cg = across ? 0 : p.cgX;
  const axle = x >= cg ? -half : half;                 // the far axle from the probe
  const byTip = (mg * Math.abs(cg - axle)) / Math.max(1e-9, Math.abs(x - axle));
  return Math.min(byTip, (1 - PROBE_SOIL.liftKeep) * mg);
}

export const coneIndex = (kind: SoilKind, theta: number) => PROBE_SOIL.ciRef[kind] * (theta / PROBE_SOIL.thetaRef) ** PROBE_SOIL.ciExponent;

/** Force needed to hold the probe at depth z in soil of a kind and moisture. */
export function forceNeeded(kind: ProbeKind, soil: SoilKind, theta: number, z: number): number {
  const pr = PROBES[kind], s = PROBE_SOIL;
  return pr.kShape * coneIndex(soil, theta) * pr.tipArea + (s.adhesion + (s.muSoil * s.k0 * s.gamma * z) / 2) * pr.perimeter * z;
}

/** Driest soil (θ) the probe enters to full depth with the rover's weight behind it. */
export function minThetaToEnter(p: RoverProfile, kind: ProbeKind, soil: SoilKind, x = p.probe.x): number {
  const pr = PROBES[kind], s = PROBE_SOIL, z = p.probe.strokeM;
  const side = (s.adhesion + (s.muSoil * s.k0 * s.gamma * z) / 2) * pr.perimeter * z;
  const room = liftLimit(p, x) - side;
  if (room <= 0) return Infinity;
  return s.thetaRef * ((pr.kShape * s.ciRef[soil] * pr.tipArea) / room) ** (1 / -s.ciExponent);
}

/** The lead-screw drive under a steady thrust: stroke speed and the probe motor's draw (its own driver channel,
 *  under the same voltage cap as the wheels). */
export function strokeAt(p: RoverProfile, thrust: number, vb = p.refPackV) {
  const m = motorConstants(p.motor);
  const tauOut = (thrust * p.probe.leadM) / (2 * Math.PI * p.probe.screwEff);
  const I = currentFor(m, tauOut);
  const vm = Math.min(p.motorCapOn ? p.motorCapV : Infinity, vb - driverDrop(p, I));
  const omegaOut = (vm - I * m.R) / (m.K * m.G);
  const speed = (omegaOut / (2 * Math.PI)) * p.probe.leadM;
  const duty = Math.min(1, dutyFor(p, vm, vb, I));
  return { speed, current: I, packW: duty * vb * I };
}

/** One full cycle (down, read, up) loaded at the lift limit, the most the rover lets it push. Motor energy only. */
export function probeCycle(p: RoverProfile, vb = p.refPackV) {
  const s = strokeAt(p, liftLimit(p), vb);
  const travel = (2 * p.probe.strokeM) / s.speed;
  return { speed: s.speed, seconds: travel + p.probe.readS, energyJ: s.packW * travel };
}

/** Screw thrust with the motor stalled. */
export const stallThrust = (p: RoverProfile) => {
  const m = motorConstants(p.motor);
  return screwThrust(p, m.G * m.etaG * (m.K * m.iStall - m.tauF));
};
