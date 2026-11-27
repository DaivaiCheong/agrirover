// Forces, slip and skid-steer motion. Motion comes from forces and slip, not from the commanded speed.
//   m v̇ = ΣF_x − C_rr m g cos α − m g sin α
//   v = r/2 [ω_R(1−s_R) + ω_L(1−s_L)]        ψ̇ = r[ω_R(1−s_R) − ω_L(1−s_L)] / (χ B)   (Mandow et al. 2007)
//   pivot: M_r = μ_lat m g L/2,  F_side = M_r/B + C_rr m g/2,  turn margin = μ − (μ_lat L/B + C_rr)

import { G0, type RoverProfile, type SurfaceCoef } from "./profile";
import { currentFor, motorConstants, motorVoltage, stallForce, wheelTorque, type Motor } from "./motor";
import { channels, driverDrop, dutyFor, maxDuty } from "./driver";
import { slipFor, slipRatio, tractionFor } from "./soil";
import type { Rng } from "./rng";

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------- quasi-static operating points

export interface OperatingPoint {
  slip: number;          // per wheel
  force: number;         // N per wheel
  current: number;       // A per motor
  omegaW: number;        // rad/s, wheel
  vm: number;            // V, motor average
  iCh: number;           // A, per driver channel
  duty: number;          // 0–1, before the cap
  motorPowerW: number;   // from the pack, all motors (driver losses included)
  packA: number;         // from the pack, motors only
}

function operatingPoint(p: RoverProfile, m: Motor, force: number, omegaW: number, vb: number): OperatingPoint {
  const ch = channels(p);
  const slip = 0;
  const current = currentFor(m, force * p.wheelRadius);
  const vm = motorVoltage(m, current, omegaW);
  const iCh = current * ch.motorsPer;
  const duty = dutyFor(p, vm, vb, iCh);
  const packA = ch.count * duty * iCh;
  return { slip, force, current, omegaW, vm, iCh, duty, packA, motorPowerW: packA * vb };
}

/** Driving straight at a steady speed, on a slope (rad, positive uphill). */
export function cruisePoint(p: RoverProfile, c: SurfaceCoef, v = p.control.cruise, vb = p.refPackV, slope = 0): OperatingPoint {
  const m = motorConstants(p.motor), mg = p.mass * G0;
  const N = (mg * Math.cos(slope)) / 4;
  const force = (c.crr * mg * Math.cos(slope) + mg * Math.sin(slope)) / 4;
  const s = slipFor(force, N, c);
  const omegaW = v / (p.wheelRadius * (1 - Math.min(s, 0.999)));
  return { ...operatingPoint(p, m, force, omegaW, vb), slip: s };
}

/** Side force (N, both wheels of a side) to pivot on the spot. */
export const pivotSideForce = (p: RoverProfile, c: SurfaceCoef) => {
  const mg = p.mass * G0;
  return (c.muLat * mg * p.wheelbase) / 2 / p.track + (c.crr * mg) / 2;
};

/** Pivoting on the spot at a yaw rate (deg/s). */
export function pivotPoint(p: RoverProfile, c: SurfaceCoef, rateDeg = p.control.pivotRateDeg, vb = p.refPackV): OperatingPoint {
  const m = motorConstants(p.motor), mg = p.mass * G0;
  const force = pivotSideForce(p, c) / 2;
  const s = slipFor(force, mg / 4, c);
  const omegaW = (rad(rateDeg) * p.turning.chi * p.track) / (2 * p.wheelRadius * (1 - Math.min(s, 0.999)));
  return { ...operatingPoint(p, m, force, omegaW, vb), slip: s };
}

/** Trapezoidal profile: time to cover a distance (or angle) at a top rate and acceleration. */
export function profileTime(dist: number, rate: number, accel: number): number {
  const d = Math.abs(dist);
  if (d === 0) return 0;
  return d >= (rate * rate) / accel ? d / rate + rate / accel : 2 * Math.sqrt(d / accel);
}
export const driveTime = (p: RoverProfile, d: number) => profileTime(d, p.control.cruise, p.control.accel);
export const pivotTime = (p: RoverProfile, angleDeg = 90) => profileTime(angleDeg, p.control.pivotRateDeg, p.control.pivotAccelDeg);

/** Motor energy (J) for a pivot: its power at the target rate over the whole manoeuvre. */
export const pivotEnergy = (p: RoverProfile, c: SurfaceCoef, angleDeg = 90, vb = p.refPackV) =>
  pivotPoint(p, c, p.control.pivotRateDeg, vb).motorPowerW * pivotTime(p, angleDeg);

/** Motor energy per metre of straight driving, J/m. */
export const driveEnergyPerM = (p: RoverProfile, c: SurfaceCoef, vb = p.refPackV) => cruisePoint(p, c, p.control.cruise, vb).motorPowerW / p.control.cruise;

// ---------------------------------------------------------------- capability limits

export const turnMargin = (p: RoverProfile, c: SurfaceCoef) => c.mu - ((c.muLat * p.wheelbase) / p.track + c.crr);
/** Steepest slope (deg) the soil's traction can climb: tan α = μ − C_rr. */
export const climbTractionDeg = (c: SurfaceCoef) => deg(Math.atan(c.mu - c.crr));
/** Steepest slope (deg) the motors can climb pushing at `frac` of their stall force. */
export function climbMotorDeg(p: RoverProfile, c: SurfaceCoef, frac = 0.5): number {
  const f = (4 * frac * stallForce(motorConstants(p.motor), p.wheelRadius)) / (p.mass * G0);  // = C_rr cos α + sin α
  const h = Math.hypot(1, c.crr), phi = Math.atan(c.crr);
  return f >= h ? 90 : deg(Math.asin(f / h) - phi);
}
export const stepLimit = (p: RoverProfile) => p.wheelRadius / 2;
export const tipAngleDeg = (p: RoverProfile) => deg(Math.atan(p.track / 2 / p.cgHeight));

/** Top speed under the motor-voltage cap, on level ground. */
export function maxSpeed(p: RoverProfile, c: SurfaceCoef, vb = p.refPackV): number {
  const m = motorConstants(p.motor), mg = p.mass * G0;
  const force = (c.crr * mg) / 4;
  const I = currentFor(m, force * p.wheelRadius);
  const iCh = I * channels(p).motorsPer;
  const vm = Math.min(p.motorCapOn ? p.motorCapV : Infinity, vb - driverDrop(p, iCh));
  const omegaW = (vm - I * m.R) / (m.K * m.G);
  return omegaW * p.wheelRadius * (1 - slipFor(force, mg / 4, c));
}

/** Coasting to a stop: the gearbox friction back-driven, plus rolling resistance. d = v t_latency + v²/(2a). */
export function stoppingDistance(p: RoverProfile, c: SurfaceCoef, v: number, latencyS: number) {
  const m = motorConstants(p.motor);
  const a = (4 * m.tauF * m.G) / (p.wheelRadius * p.mass) + c.crr * G0;
  return { decel: a, distance: v * latencyS + (v * v) / (2 * a) };
}

/** Open loop with one side's motors `mismatch` slower: yaw rate (deg/s) and the distance to use up the lane clearance. */
export function openLoopDrift(p: RoverProfile, mismatch = p.motorSpread, v = p.control.cruise) {
  const yawRate = (mismatch * v) / (p.turning.chi * p.track);
  const t = Math.sqrt((2 * p.control.laneClearance) / (v * yawRate));
  return { yawRateDeg: deg(yawRate), seconds: t, distance: v * t };
}

/** Along-row position error at the end of a row: driving by time (speed known to ±timeSpeedErr), or counting wheel
 *  turns with encoders, which then miss the slip. */
export function rowEndError(p: RoverProfile, rowM: number, c?: SurfaceCoef) {
  return c ? rowM * cruisePoint(p, c).slip : rowM * p.control.timeSpeedErr;
}

// ---------------------------------------------------------------- dynamic model, 200 Hz

/** What the rover drives on: the soil's coefficients and the ground height under a point. */
export interface Terrain {
  coefAt(x: number, y: number): SurfaceCoef;
  heightAt(x: number, y: number): number;
}
export const flatTerrain = (c: SurfaceCoef): Terrain => ({ coefAt: () => c, heightAt: () => 0 });

/** Root of a decreasing function: expand a bracket from a guess, then Illinois false position. */
export function rootDecreasing(h: (x: number) => number, guess: number, step: number, tol = 1e-9, xtol = 1e-7): number {
  let a = guess, fa = h(a);
  if (fa === 0) return a;
  let b = a + (fa > 0 ? step : -step), fb = h(b);
  for (let n = 0; fa * fb > 0 && n < 60; n++) { a = b; fa = fb; step *= 2; b = a + (fa > 0 ? step : -step); fb = h(b); }
  if (fa * fb > 0) return b;
  for (let i = 0; i < 80; i++) {
    const c = b - (fb * (b - a)) / (fb - fa);
    const fc = h(c);
    if (fc === 0) return c;
    if (fc * fb < 0) { a = b; fa = fb; } else fa /= 2;
    b = c; fb = fc;
    if (Math.abs(fc) < tol || Math.abs(b - a) < xtol) return c;
  }
  return b;
}

/** Wheels: 0 front-left, 1 rear-left, 2 front-right, 3 rear-right. */
export const WHEEL_SIDE = [0, 0, 1, 1] as const;

export interface PhysicsStep {
  packMotorA: number;            // from the pack, motors only
  driverLossW: number; copperW: number; gearLossW: number; slipLossW: number; groundW: number;
}

const U_EPS = 0.01;              // m/s: rolling resistance fades in below this, so a standstill is not stiff
const W_EPS = 0.002;             // m/s: turning resistance fades in below this lateral speed

export class Vehicle {
  x = 0; y = 0; yaw = 0; v = 0; yawRate = 0; pitch = 0; roll = 0;
  readonly motors: Motor[];
  readonly omega = [0, 0, 0, 0];
  readonly slip = [0, 0, 0, 0];
  readonly force = [0, 0, 0, 0];
  readonly current = [0, 0, 0, 0];
  vm = [0, 0, 0, 0];
  chCurrent: number[];
  duty: [number, number] = [0, 0];
  coasting = true;
  private surf: SurfaceCoef[] = [];

  constructor(readonly p: RoverProfile, readonly terrain: Terrain, rng?: Rng, pose = { x: 0, y: 0, yaw: 0 }) {
    this.motors = [0, 1, 2, 3].map(() => motorConstants(p.motor, rng
      ? { speed: rng.gauss(1, p.motorSpread), resistance: rng.gauss(1, p.motorSpread) } : { speed: 1, resistance: 1 }));
    this.chCurrent = new Array(channels(p).count).fill(0);
    Object.assign(this, pose);
  }

  /** Where a wheel's contact patch is, in the field. */
  wheelAt(i: number): [number, number] {
    const lx = i % 2 === 0 ? this.p.wheelbase / 2 : -this.p.wheelbase / 2, ly = WHEEL_SIDE[i] === 0 ? this.p.track / 2 : -this.p.track / 2;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.x + lx * c - ly * s, this.y + lx * s + ly * c];
  }
  private chOf(i: number) { return channels(this.p).count === 2 ? WHEEL_SIDE[i] : i; }

  /** Wheel speed that balances the motor's torque against the soil's traction, at ground speed u. */
  private solveWheel(i: number, vmI: number, coast: boolean, u: number, N: number): number {
    const m = this.motors[i], r = this.p.wheelRadius, c = this.surf[i];
    const h = (w: number) => {
      const I = coast ? 0 : (vmI - m.K * m.G * w) / m.R;
      return wheelTorque(m, I, w) - r * tractionFor(slipRatio(r * w, u), N, c);
    };
    // static friction: a motor at rest starts only above deadbandFactor × τf
    if (Math.abs(this.omega[i]) < 1e-3 && Math.abs(u) < 1e-3 && (coast || (m.K * Math.abs(vmI)) / m.R <= this.p.deadbandFactor * m.tauF)) return 0;
    return rootDecreasing(h, this.omega[i], 0.5);
  }

  /** One physics step: duty per side in [−1, 1] (0 = coast), the pack's terminal voltage, dt. */
  step(dutyL: number, dutyR: number, vb: number, dt: number): PhysicsStep {
    const p = this.p, r = p.wheelRadius, mg = p.mass * G0, ch = channels(p);
    this.duty = [dutyL, dutyR];
    // ground under the wheels: slope along the heading and across it
    const pts = [0, 1, 2, 3].map((i) => this.wheelAt(i));
    const hz = pts.map(([x, y]) => this.terrain.heightAt(x, y));
    this.pitch = Math.atan2((hz[0] + hz[2] - hz[1] - hz[3]) / 2, p.wheelbase);
    this.roll = Math.atan2((hz[0] + hz[1] - hz[2] - hz[3]) / 2, p.track);
    this.surf = pts.map(([x, y]) => this.terrain.coefAt(x, y));
    const cosA = Math.cos(this.pitch) * Math.cos(this.roll), N = (mg * cosA) / 4;
    const gravity = mg * Math.sin(this.pitch);
    // per channel: the duty after the voltage cap, and the drop at last step's current (one 5 ms step of lag)
    const coast = [dutyL === 0, dutyL === 0, dutyR === 0, dutyR === 0];
    const chDuty: number[] = [], chDrop: number[] = [];
    for (let k = 0; k < ch.count; k++) {
      const d = this.duty[ch.count === 2 ? k : WHEEL_SIDE[k]], iCh = this.chCurrent[k];
      chDuty.push(Math.sign(d) * Math.min(Math.abs(d), maxDuty(p, vb, iCh)));
      chDrop.push(driverDrop(p, iCh));
    }
    const vmw = [0, 1, 2, 3].map((i) => { const k = this.chOf(i); return chDuty[k] * (vb - chDrop[k]); });
    const holding = coast.every(Boolean) && Math.abs(this.v) < 1e-6 && Math.abs(this.yawRate) < 1e-6
      && Math.abs(gravity) < (4 * this.motors[0].tauF * this.motors[0].G) / r + this.surf[0].crr * mg * cosA;
    if (holding) {
      this.omega.fill(0); this.slip.fill(0); this.force.fill(0); this.current.fill(0); this.chCurrent.fill(0);
      this.vm = [0, 0, 0, 0]; this.v = 0; this.yawRate = 0; this.coasting = true;
      return { packMotorA: 0, driverLossW: 0, copperW: 0, gearLossW: 0, slipLossW: 0, groundW: 0 };
    }
    this.coasting = coast.every(Boolean);
    const crrSide = [(this.surf[0].crr + this.surf[1].crr) / 2, (this.surf[2].crr + this.surf[3].crr) / 2];
    const muLat = this.surf.reduce((s, c) => s + c.muLat, 0) / 4;
    const Mr = (muLat * mg * cosA * p.wheelbase) / 2;
    const kB = (p.turning.chi * p.track) / 2;
    const v = this.v;
    const sideForces = (psiDot: number) => {
      const u = [v - psiDot * kB, v + psiDot * kB];
      for (let i = 0; i < 4; i++) {
        const ui = u[WHEEL_SIDE[i]];
        const w = this.solveWheel(i, vmw[i], coast[i], ui, N);
        this.omega[i] = w;
        this.slip[i] = slipRatio(r * w, ui);
        this.force[i] = tractionFor(this.slip[i], N, this.surf[i]);
      }
      const F = [this.force[0] + this.force[1], this.force[2] + this.force[3]];
      const R = [0, 1].map((s) => crrSide[s] * mg * cosA / 2 * Math.tanh(u[s] / U_EPS));
      return { F, R };
    };
    const balance = (psiDot: number) => {
      const { F, R } = sideForces(psiDot);
      // turning resistance by how much of the motion is turning: all of it in a pivot, next to none for a slight
      // drift while driving (so open-loop drift follows the kinematic model)
      const w = Math.abs(psiDot) * kB, rho = w / Math.sqrt(w * w + v * v + W_EPS * W_EPS);
      return ((F[1] - R[1] - (F[0] - R[0])) * p.track) / 2 - Math.sign(psiDot) * Mr * rho * rho;
    };
    this.yawRate = rootDecreasing(balance, this.yawRate, 0.05, 1e-10, 1e-9);
    const { F, R } = sideForces(this.yawRate);
    const vdot = (F[0] + F[1] - R[0] - R[1] - gravity) / p.mass;
    this.v += vdot * dt;
    this.yaw += this.yawRate * dt;
    this.x += this.v * Math.cos(this.yaw) * dt;
    this.y += this.v * Math.sin(this.yaw) * dt;
    // currents, channel totals and the energy books
    let copperW = 0, gearLossW = 0, slipLossW = 0, groundW = 0;
    this.chCurrent.fill(0);
    const u = [v - this.yawRate * kB, v + this.yawRate * kB];
    for (let i = 0; i < 4; i++) {
      const m = this.motors[i], w = this.omega[i];
      const I = coast[i] ? 0 : (vmw[i] - m.K * m.G * w) / m.R;
      this.current[i] = I;
      this.vm[i] = coast[i] ? m.K * m.G * w : vmw[i];
      this.chCurrent[this.chOf(i)] += I;
      const tauW = wheelTorque(m, I, w);
      copperW += I * I * m.R;
      gearLossW += m.K * I * m.G * w - tauW * w;
      slipLossW += this.force[i] * (r * w - u[WHEEL_SIDE[i]]);
      groundW += this.force[i] * u[WHEEL_SIDE[i]];
    }
    // the pack gives d · I_ch per channel: d (V_b − drop) I_ch reaches the motors, d · drop · I_ch heats the driver
    let packMotorA = 0, driverLossW = 0;
    for (let k = 0; k < ch.count; k++) {
      packMotorA += chDuty[k] * this.chCurrent[k];
      driverLossW += chDuty[k] * chDrop[k] * this.chCurrent[k];
    }
    return { packMotorA, driverLossW, copperW, gearLossW, slipLossW, groundW };
  }
}
