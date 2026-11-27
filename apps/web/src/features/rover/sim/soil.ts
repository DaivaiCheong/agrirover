// Wheel–soil contact and the field's soil grid.
// Traction from slip (a simplified, invertible Janosi–Hanamoto shear curve):
//   F/N = μ (1 − e^{−s/s0})   ⇔   s = −s0 ln(1 − F/(μN))
// When F reaches μN the wheel spins (s → 1) and the rover is stuck.

import { MUD_BLEND, SOIL_SURFACE, SURFACES, type FieldProfile, type SoilKind, type SurfaceCoef } from "./profile";
import type { Rng } from "./rng";

/** Slip ratio of a wheel turning at rim speed vw over ground moving at u (both along the heading): positive when
 *  driving (wheel faster than ground), negative when braking. eps keeps it finite at a standstill. */
export function slipRatio(vw: number, u: number, eps = 0.005): number {
  return (vw - u) / Math.max(Math.abs(vw), Math.abs(u), eps);
}

/** Traction force for a slip ratio, N. */
export const tractionFor = (s: number, N: number, c: SurfaceCoef) => Math.sign(s) * c.mu * N * (1 - Math.exp(-Math.abs(s) / c.s0));

/** Slip needed for a traction force, or Infinity when the soil cannot give it. */
export function slipFor(F: number, N: number, c: SurfaceCoef): number {
  const f = Math.abs(F) / (c.mu * N);
  return f >= 1 ? Infinity : Math.sign(F) * -c.s0 * Math.log(1 - f);
}

/** A surface's coefficients, blended toward mud as the soil gets wetter. */
export function surfaceAt(kind: SoilKind, theta: number): SurfaceCoef {
  const base = SURFACES[SOIL_SURFACE[kind]], mud = SURFACES.mud;
  const f = Math.max(0, Math.min(1, (theta - MUD_BLEND.from) / (MUD_BLEND.to - MUD_BLEND.from)));
  if (f === 0) return base;
  const mix = (a: number, b: number) => a + (b - a) * f;
  return { crr: mix(base.crr, mud.crr), mu: mix(base.mu, mud.mu), muLat: mix(base.muLat, mud.muLat), s0: mix(base.s0, mud.s0) };
}

export const CELL = 0.25;          // m

/** The block's soil on a 0.25 m grid: each cell has a moisture θ and a kind. x runs along the rows (spot 1 at x = 0),
 *  y across them (row 1 at y = 0); the grid reaches past the block by its headland. */
export class SoilGrid {
  readonly x0: number; readonly y0: number; readonly nx: number; readonly ny: number;
  readonly theta: Float32Array;
  readonly kind: SoilKind[];
  /** surface layer that rain wets first, m */
  surfaceDepth = 0.10;

  constructor(readonly field: FieldProfile, rng?: Rng, wobble = 0.01) {
    const pad = field.headland + 0.5;
    this.x0 = -pad; this.y0 = -field.rowM / 2 - pad;
    this.nx = Math.ceil(((field.spots - 1) * field.plantM + 2 * pad) / CELL) + 1;
    this.ny = Math.ceil(((field.rows - 1) * field.rowM + field.rowM + 2 * pad) / CELL) + 1;
    this.theta = new Float32Array(this.nx * this.ny);
    this.kind = new Array(this.nx * this.ny);
    // a smooth seeded field: a few long waves, so some spots dry faster than others
    const waves = Array.from({ length: 3 }, () => ({ kx: rng ? rng.range(0.2, 0.8) : 0, ky: rng ? rng.range(0.2, 0.8) : 0, ph: rng ? rng.range(0, 6.28) : 0 }));
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = this.x0 + (i + 0.5) * CELL, y = this.y0 + (j + 0.5) * CELL;
        const k = j * this.nx + i;
        const nearRow = Math.round(y / field.rowM);
        const inBlock = x >= -field.plantM / 2 && x <= (field.spots - 0.5) * field.plantM && nearRow >= 0 && nearRow < field.rows;
        this.kind[k] = inBlock && Math.abs(y - nearRow * field.rowM) <= field.bedTop / 2 ? field.bedKind : field.laneKind;
        const w = rng ? waves.reduce((s, v) => s + Math.sin(v.kx * x + v.ky * y + v.ph), 0) / 3 : 0;
        this.theta[k] = field.theta + wobble * w;
      }
    }
  }

  index(x: number, y: number): number {
    const i = Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.x0) / CELL)));
    const j = Math.max(0, Math.min(this.ny - 1, Math.floor((y - this.y0) / CELL)));
    return j * this.nx + i;
  }
  thetaAt(x: number, y: number) { return this.theta[this.index(x, y)]; }
  kindAt(x: number, y: number) { return this.kind[this.index(x, y)]; }
  coefAt(x: number, y: number): SurfaceCoef { const k = this.index(x, y); return surfaceAt(this.kind[k], this.theta[k]); }

  /** Set every cell of one kind (or all) to a moisture. */
  fill(theta: number, kind?: SoilKind) {
    for (let k = 0; k < this.theta.length; k++) if (!kind || this.kind[k] === kind) this.theta[k] = theta;
  }
  /** Rain for dt seconds at mmPerH: wets the exposed surface layer within minutes. */
  rain(mmPerH: number, dt: number, saturation = 0.45) {
    const dTheta = (mmPerH * dt) / 3600 / 1000 / this.surfaceDepth;
    for (let k = 0; k < this.theta.length; k++) this.theta[k] = Math.min(saturation, this.theta[k] + dTheta);
  }
}
