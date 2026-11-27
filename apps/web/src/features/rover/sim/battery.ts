// The 3S Li-ion pack: open-circuit voltage curve, sag under load, state of charge (truth and the firmware's estimate).
//   V_b = cells · OCV(SoC) − I_b R_pack          SoC_{k+1} = SoC_k − 100 I_b Δt / (3600 Q)

import { OCV_SOC, OCV_V, type RoverProfile } from "./profile";
import type { Rng } from "./rng";

type Pack = RoverProfile["battery"];

/** Rested cell voltage at a state of charge (%), linear between table points. */
export function cellOcv(soc: number): number {
  const s = Math.max(0, Math.min(100, soc));
  for (let i = 1; i < OCV_SOC.length; i++) {
    if (s <= OCV_SOC[i]) {
      const f = (s - OCV_SOC[i - 1]) / (OCV_SOC[i] - OCV_SOC[i - 1]);
      return OCV_V[i - 1] + f * (OCV_V[i] - OCV_V[i - 1]);
    }
  }
  return OCV_V[OCV_V.length - 1];
}

/** State of charge (%) whose rested cell voltage is v. */
export function socFromCellOcv(v: number): number {
  if (v <= OCV_V[0]) return 0;
  for (let i = 1; i < OCV_V.length; i++) {
    if (v <= OCV_V[i]) return OCV_SOC[i - 1] + (10 * (v - OCV_V[i - 1])) / (OCV_V[i] - OCV_V[i - 1]);
  }
  return 100;
}

/** SoC (%) from the terminal voltage under a known current: undo the I·R sag, then read the curve. */
export const socAt = (vTerm: number, current: number, b: Pack) => socFromCellOcv((vTerm + current * b.rPack) / b.cells);

/** Pack energy from empty to full, J: Q ∫ cells · OCV dSoC (trapezoid on the table). */
export function packEnergyJ(b: Pack): number {
  let wh = 0;
  for (let i = 1; i < OCV_SOC.length; i++) wh += ((OCV_V[i] + OCV_V[i - 1]) / 2) * ((OCV_SOC[i] - OCV_SOC[i - 1]) / 100);
  return wh * b.cells * b.capacityAh * 3600;
}

export const terminalV = (soc: number, current: number, b: Pack) => b.cells * cellOcv(soc) - current * b.rPack;

/** The pack in the simulation. `soc` is the truth; `socEst` is what firmware can know (coulomb counting with a
 *  seeded current-sensor gain error, pulled toward the OCV reading after a rest). The UI only ever sees socEst. */
export class Battery {
  soc: number;
  socEst: number;
  current = 0;
  vTerm: number;
  private gain: number;
  private restFor = 0;
  constructor(private b: Pack, socStart: number, rng: Rng) {
    this.soc = socStart;
    this.socEst = socStart;
    this.gain = 1 + rng.gauss(0, b.currentGainSigma);
    this.vTerm = terminalV(socStart, 0, b);
  }
  /** Draw `current` (A, positive out of the pack) for dt seconds. */
  step(current: number, dt: number) {
    this.current = current;
    this.soc = Math.max(0, Math.min(100, this.soc - (100 * current * dt) / (3600 * this.b.capacityAh)));
    this.vTerm = terminalV(this.soc, current, this.b);
    const measured = current * this.gain;
    this.socEst = Math.max(0, Math.min(100, this.socEst - (100 * measured * dt) / (3600 * this.b.capacityAh)));
    this.restFor = Math.abs(current) < this.b.restA ? this.restFor + dt : 0;
    if (this.restFor > this.b.restS) {
      const fromV = socAt(this.vTerm, measured, this.b);
      this.socEst += (fromV - this.socEst) * Math.min(1, dt / 20);     // blend over about 20 s
    }
  }
}
