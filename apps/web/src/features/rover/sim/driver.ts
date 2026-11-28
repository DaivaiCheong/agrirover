// The L298N and the 5 V rail.
//   V_drop = 1.4 + 1.15 I_ch     V_m = d (V_b − V_drop)     I_b = Σ d_ch I_ch + P_hotel / V_b
// PWM draws from the battery only during on-time, so a channel takes d · I_ch from the pack.

import type { RoverProfile } from "./profile";

/** How the four motors share driver channels. */
export function channels(p: RoverProfile) {
  return p.driver.wiring === "perSide"
    ? { count: 2, motorsPer: 2, boards: 1 }
    : { count: 4, motorsPer: 1, boards: 2 };
}

/** Voltage lost across the driver's two saturated transistors, for the channel's total current. */
export const driverDrop = (p: RoverProfile, iCh: number) => p.driver.dropV0 + p.driver.dropPerA * Math.abs(iCh);

/** The highest duty the firmware allows: the motor's average voltage stays under the cap. */
export function maxDuty(p: RoverProfile, vb: number, iCh: number): number {
  const avail = vb - driverDrop(p, iCh);
  if (avail <= 0) return 0;
  return p.motorCapOn ? Math.min(1, p.motorCapV / avail) : 1;
}

/** Duty for a motor voltage at a channel current, before the cap. */
export const dutyFor = (p: RoverProfile, vm: number, vb: number, iCh: number) => vm / Math.max(1e-6, vb - driverDrop(p, iCh));

/** Current on the 5 V rail. */
export function rail5vA(p: RoverProfile, extraA = 0): number {
  const r = p.rail5v;
  return r.cameraA + r.controllerA + r.sensorsA + p.driver.logic5vA * channels(p).boards
    + (p.camera.mode === "twoSide" ? p.camera.secondCameraW / 5 : 0) + extraA;
}

/** Electronics power drawn from the pack, W ("hotel" power): the 5 V rail through its regulator, plus the L298N's
 *  quiescent current from the motor supply. With the L298N board's linear regulator the rail costs V_b · I_5V. */
export function hotelPower(p: RoverProfile, vb: number, extra5vA = 0): number {
  const i5 = rail5vA(p, extra5vA);
  const rail = p.rail5v.source === "buck" ? (5 * i5) / p.rail5v.buckEff : vb * i5;
  return rail + p.driver.quiescentA * channels(p).boards * vb;
}

/** Heat in the linear regulator, W: (V_b − 5) I_5V. Zero with a buck converter. */
export const regulatorHeatW = (p: RoverProfile, vb: number) => (p.rail5v.source === "linear" ? (vb - 5) * rail5vA(p) : 0);
