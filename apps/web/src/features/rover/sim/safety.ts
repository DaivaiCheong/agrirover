// Safety triggers: every stop reason is a physical condition with a threshold and a debounce, checked at 10 Hz.
// Never act on a single sample: one pivot sags the pack by about half a volt.

import { SAFETY, type RoverProfile } from "./profile";
import { motorConstants } from "./motor";

export type Trigger = "estop" | "bumper" | "linkLost" | "rain" | "lowEnergy" | "criticalVoltage" | "stuck"
  | "motorStall" | "driverOverload" | "tilt" | "probeLift" | "watchdog" | "geofence";
export type SafetyAction = "safeStop" | "goHome" | "stopAction" | "halveSpeed" | "retractProbe" | "motorsOff";

/** What each trigger makes the rover do (the mission adds the detail: back off after the bumper, reverse once when stuck). */
export const RESPONSE: Record<Trigger, SafetyAction> = {
  estop: "safeStop", bumper: "safeStop", linkLost: "safeStop", rain: "goHome", lowEnergy: "goHome",
  criticalVoltage: "safeStop", stuck: "safeStop", motorStall: "stopAction", driverOverload: "halveSpeed",
  tilt: "safeStop", probeLift: "retractProbe", watchdog: "motorsOff", geofence: "safeStop",
};

/** True once a condition has held for `seconds`. */
export class Debounce {
  private held = 0;
  constructor(readonly seconds: number) {}
  update(cond: boolean, dt: number): boolean {
    this.held = cond ? this.held + dt : 0;
    return this.held >= this.seconds - 1e-9;
  }
  reset() { this.held = 0; }
}

/** Moving average over a fixed time window. */
export class WindowAverage {
  private buf: number[] = [];
  constructor(readonly seconds: number, readonly dt: number) {}
  push(x: number) { this.buf.push(x); if (this.buf.length > Math.round(this.seconds / this.dt)) this.buf.shift(); }
  get full() { return this.buf.length >= Math.round(this.seconds / this.dt); }
  get value() { return this.buf.reduce((s, x) => s + x, 0) / Math.max(1, this.buf.length); }
}

export interface SafetyInputs {
  estop: boolean; bumper: boolean; heartbeatAge: number; cmdAge: number;
  rainWet: boolean; rainForecast: boolean;
  eAvailJ: number; eNextJ: number; eHomeJ: number;
  vTerm: number; packA: number;
  driving: boolean; maxSlip: number;
  motorA: number[]; channelA: number[];
  rollDeg: number; pitchDeg: number;
  probing: boolean; probePitchRiseDeg: number; probeNeedN?: number; probeLiftN?: number;
  /** metres outside the block's geofence (0 inside) */ outsideBy: number;
}

export const lowEnergy = (eAvailJ: number, eNextJ: number, eHomeJ: number) => eAvailJ - eNextJ < SAFETY.reserveFactor * eHomeJ;

/** Evaluates every trigger at the mission rate; returns the ones firing now. */
export class SafetyMonitor {
  private rain = new Debounce(SAFETY.rainWetS);
  private stuck = new Debounce(SAFETY.stuckS);
  private stall = new Debounce(SAFETY.stallS);
  private overload = new Debounce(SAFETY.overloadS);
  private tilt = new Debounce(SAFETY.tiltS);
  private volts: WindowAverage;
  private iStall: number;
  constructor(readonly p: RoverProfile, readonly dt = 0.1) {
    this.volts = new WindowAverage(SAFETY.critAvgS, dt);
    this.iStall = motorConstants(p.motor).iStall;
  }
  update(i: SafetyInputs): Trigger[] {
    const dt = this.dt, out: Trigger[] = [];
    if (i.estop) out.push("estop");
    if (i.bumper) out.push("bumper");
    if (i.heartbeatAge > SAFETY.heartbeatS) out.push("linkLost");
    if (i.cmdAge > SAFETY.watchdogS) out.push("watchdog");
    if (this.rain.update(i.rainWet, dt) || i.rainForecast) out.push("rain");
    if (lowEnergy(i.eAvailJ, i.eNextJ, i.eHomeJ)) out.push("lowEnergy");
    this.volts.push(i.vTerm + i.packA * this.p.battery.rPack);
    if (this.volts.full && this.volts.value < this.p.battery.cells * this.p.battery.criticalCellV) out.push("criticalVoltage");
    if (this.stuck.update(i.driving && i.maxSlip > SAFETY.stuckSlip, dt)) out.push("stuck");
    if (this.stall.update(i.motorA.some((a) => Math.abs(a) > SAFETY.stallFrac * this.iStall), dt)) out.push("motorStall");
    if (this.overload.update(i.channelA.some((a) => Math.abs(a) > this.p.driver.channelLimitA), dt)) out.push("driverOverload");
    if (this.tilt.update(Math.abs(i.rollDeg) > SAFETY.tiltDeg || Math.abs(i.pitchDeg) > SAFETY.tiltDeg, dt)) out.push("tilt");
    if (i.probing && (i.probePitchRiseDeg > SAFETY.liftPitchDeg || (i.probeNeedN ?? 0) > (i.probeLiftN ?? Infinity))) out.push("probeLift");
    if (i.outsideBy > SAFETY.geofenceM) out.push("geofence");
    return out;
  }
}
