// The TT gear motor, from five bench numbers (never hard-coded constants):
//   R = V/I_stall   K_e = K_t = (V − I_nl R)/ω_nl   τ_f = K I_nl   η_g = τ_stall / (G K (I_stall − I_nl))
//   τ_wheel = G η_g (K I − τ_f)   ω_wheel = ω_m / G   V_m = I R + K ω_m

import type { MotorBench } from "./profile";

export interface Motor {
  R: number; K: number; tauF: number; etaG: number; G: number;
  omegaNl: number;            // motor shaft, rad/s, at vTest
  iStall: number; vTest: number;
}

export function motorConstants(b: MotorBench, scale = { speed: 1, resistance: 1 }): Motor {
  const omegaNl = (b.rpmNoLoad * b.gear * 2 * Math.PI) / 60 * scale.speed;
  const R = (b.vTest / b.iStall) * scale.resistance;
  const K = (b.vTest - b.iNoLoad * R) / omegaNl;
  const tauF = K * b.iNoLoad;
  const etaG = b.tauStall / (b.gear * K * (b.iStall - b.iNoLoad));
  return { R, K, tauF, etaG, G: b.gear, omegaNl, iStall: b.vTest / R, vTest: b.vTest };
}

/** Torque at the wheel for a motor current, with the wheel turning at omegaW (rad/s). Driving: G η (K I − τf).
 *  Back-driven by the wheel (power flowing into the motor, as when coasting): G (K I − τf), the gearbox friction
 *  reflected without the efficiency, which is what makes a TT gearbox hard to back-drive. */
export function wheelTorque(m: Motor, I: number, omegaW: number): number {
  const drive = m.K * I;
  const net = Math.abs(omegaW) > 1e-9 ? drive - m.tauF * Math.sign(omegaW)
    : Math.abs(drive) <= m.tauF ? 0 : drive - m.tauF * Math.sign(drive);
  return net * omegaW >= 0 ? m.G * m.etaG * net : m.G * net;
}

/** Current that gives a wheel torque while driving forward (τ ≥ 0). */
export const currentFor = (m: Motor, tauWheel: number) => (tauWheel / (m.G * m.etaG) + m.tauF) / m.K;

/** Motor terminal voltage for a current and a wheel speed. */
export const motorVoltage = (m: Motor, I: number, omegaW: number) => I * m.R + m.K * omegaW * m.G;

/** Traction force a wheel can push with at stall. */
export const stallForce = (m: Motor, r: number) => (m.G * m.etaG * (m.K * m.iStall - m.tauF)) / r;
