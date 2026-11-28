// Camera geometry: what the rover can see is computed from the lens, not assumed.
//   HFOV = 2 atan(4/5 tan D/2)   VFOV = 2 atan(3/5 tan D/2)   (4:3 sensor, D diagonal)
//   z_lo,hi = h + d tan(β ∓ VFOV/2)   px/mm = N_px / (2000 d tan(HFOV/2))   t_settle = 4 / (ζ 2π f_n)

import type { RoverProfile } from "./profile";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
type Cam = RoverProfile["camera"];

export function fov(c: Cam) {
  const t = Math.tan(rad(c.diagFovDeg) / 2), diag = Math.hypot(c.widthPx, c.heightPx);
  return { hDeg: deg(2 * Math.atan((c.widthPx / diag) * t)), vDeg: deg(2 * Math.atan((c.heightPx / diag) * t)) };
}

/** The frame's size (m) on a plane at distance d. */
export function frameAt(c: Cam, d: number) {
  const f = fov(c);
  return { w: 2 * d * Math.tan(rad(f.hDeg) / 2), h: 2 * d * Math.tan(rad(f.vDeg) / 2) };
}

export const pxPerMm = (c: Cam, d: number) => c.widthPx / (1000 * frameAt(c, d).w);

/** Lowest and highest point seen on a plane at distance d (m above the rover's ground). */
export function verticalSpan(c: Cam, d: number) {
  const half = rad(fov(c).vDeg) / 2, b = rad(c.tiltDeg);
  return { lo: c.mountHeight + d * Math.tan(b - half), hi: c.mountHeight + d * Math.tan(b + half) };
}

/** Fraction of a plant's height in view: the plant stands from `base` to `base + height` (a raised bed lifts the base). */
export function coverage(c: Cam, d: number, height: number, base = 0) {
  const s = verticalSpan(c, d);
  return Math.max(0, Math.min(base + height, s.hi) - Math.max(base, s.lo)) / height;
}

/** Motion blur (px) when shooting while moving at v. */
export const blurPx = (c: Cam, v: number, d: number, exposureS = c.exposureS) => v * exposureS * 1000 * pxPerMm(c, d);

/** Time for the mast to stop shaking after a stop, s. */
export const settleS = (c: Cam) => 4 / (c.mastZeta * 2 * Math.PI * c.mastHz);

/** Servo pan time for an angle, s. */
export const panS = (c: Cam, angleDeg = 90) => (c.servoSPer60Deg * angleDeg) / 60;
/** Servo pan energy, J: the servo's current on the 5 V rail, through the regulator. */
export const panJ = (p: RoverProfile, angleDeg = 90) => (5 * p.camera.servoA * panS(p.camera, angleDeg)) / p.rail5v.buckEff;

/** Distance from the lens to a stem, when the rover stands in the lane beside it. */
export const lensToStem = (p: RoverProfile, lateral: number) => lateral - p.camera.mountForward;
