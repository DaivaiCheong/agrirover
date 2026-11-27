import { describe, expect, it } from "vitest";
import { ROVER, SAFETY, SURFACES, type SurfaceCoef } from "../profile";
import { Vehicle, cruisePoint, flatTerrain, openLoopDrift, pivotPoint, stoppingDistance } from "../vehicle";
import { motorConstants } from "../motor";
import { stream } from "../rng";

const DT = 1 / 200, VB = ROVER.refPackV;
const deg = (r: number) => (r * 180) / Math.PI;

function run(veh: Vehicle, dl: number, dr: number, seconds: number) {
  const books = { pack: 0, losses: 0 };
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const s = veh.step(dl, dr, VB, DT);
    books.pack += s.packMotorA * VB * DT;
    books.losses += (s.driverLossW + s.copperW + s.gearLossW + s.slipLossW + s.groundW) * DT;
  }
  return books;
}
const make = (c: SurfaceCoef) => new Vehicle(ROVER, flatTerrain(c));

describe("the 200 Hz vehicle agrees with the steady-state numbers", () => {
  for (const k of ["packed", "loose", "mud"] as const) {
    it(`cruises at 0.15 m/s on ${k} soil with the predicted slip and current`, () => {
      const c = cruisePoint(ROVER, SURFACES[k]);
      const veh = make(SURFACES[k]);
      run(veh, c.duty, c.duty, 6);
      expect(veh.v).toBeCloseTo(0.15, 3);
      expect(veh.slip[0]).toBeCloseTo(c.slip, 3);
      expect(veh.current[0]).toBeCloseTo(c.current, 3);
      expect(Math.abs(veh.yawRate)).toBeLessThan(1e-6);
    });
  }
  it("pivots at 45°/s on packed soil at the pivot duty, with 23 % slip and 1 A a motor", () => {
    const p = pivotPoint(ROVER, SURFACES.packed);
    const veh = make(SURFACES.packed);
    run(veh, -p.duty, p.duty, 2);
    expect(deg(veh.yawRate)).toBeCloseTo(45, 0);
    expect(veh.slip[2]).toBeCloseTo(0.23, 2);
    expect(veh.current[2]).toBeCloseTo(1.0, 1);
    expect(Math.abs(veh.v)).toBeLessThan(1e-6);
  });
  it("cannot pivot in mud: the wheels spin and the yaw rate collapses", () => {
    const veh = make(SURFACES.mud);
    run(veh, -0.7, 0.7, 2);
    expect(veh.slip[2]).toBeGreaterThan(0.9);
    expect(deg(veh.yawRate)).toBeLessThan(5);
  });
  it("is on the edge on loose soil: the yaw rate collapses", () => {
    const veh = make(SURFACES.loose);
    run(veh, -0.7, 0.7, 2);
    expect(deg(veh.yawRate)).toBeLessThan(15);
  });
});

describe("motors and contact", () => {
  it("stalls visibly at very low duty (deadband)", () => {
    const veh = make(SURFACES.packed);
    run(veh, 0.05, 0.05, 1);
    expect(veh.v).toBe(0);
    expect(veh.omega.every((w) => w === 0)).toBe(true);
  });
  it("coasts to a stop in the distance the gearbox friction predicts", () => {
    const c = cruisePoint(ROVER, SURFACES.packed), veh = make(SURFACES.packed);
    run(veh, c.duty, c.duty, 3);
    const x0 = veh.x;
    for (let i = 0; i < 400 && veh.v > 1e-4; i++) veh.step(0, 0, VB, DT);
    const predicted = stoppingDistance(ROVER, SURFACES.packed, veh.v === 0 ? 0.15 : 0.15, 0).distance;
    expect(veh.x - x0).toBeGreaterThan(predicted * 0.7);
    expect(veh.x - x0).toBeLessThan(predicted * 1.3 + 0.15 * DT);
    expect(SAFETY.latencyOnboardS).toBeGreaterThan(0);
  });
  it("balances its energy books: pack = driver + copper + gearbox + slip + ground work, within 1 %", () => {
    const c = cruisePoint(ROVER, SURFACES.loose), p = pivotPoint(ROVER, SURFACES.packed);
    const veh = make(SURFACES.loose);
    const a = run(veh, c.duty, c.duty, 3), b = run(veh, -p.duty, p.duty, 1.5), d = run(veh, 0, 0, 1);
    const pack = a.pack + b.pack + d.pack, losses = a.losses + b.losses + d.losses;
    expect(Math.abs(pack - losses) / pack).toBeLessThan(0.01);
  });
  it("drifts open loop with a 5 % slower side, close to the kinematic yaw rate", () => {
    const c = cruisePoint(ROVER, SURFACES.packed), veh = make(SURFACES.packed);
    const slow = motorConstants(ROVER.motor, { speed: 0.95, resistance: 1 });
    veh.motors[2] = slow; veh.motors[3] = slow;                 // the right side runs 5 % slower
    run(veh, c.duty, c.duty, 4);
    const kin = openLoopDrift(ROVER, 0.05, veh.v).yawRateDeg;
    expect(deg(-veh.yawRate)).toBeGreaterThan(kin * 0.8);
    expect(deg(-veh.yawRate)).toBeLessThan(kin * 1.2);
  });
});

describe("determinism", () => {
  const drive = (seed: number) => {
    const veh = new Vehicle(ROVER, flatTerrain(SURFACES.packed), stream(seed, "motors"));
    const c = cruisePoint(ROVER, SURFACES.packed);
    run(veh, c.duty, c.duty, 3);
    return [veh.x, veh.y, veh.yaw, veh.v];
  };
  it("gives the same run for the same seed", () => expect(drive(42)).toEqual(drive(42)));
  it("gives a different run for another seed (motor spread makes it curve differently)", () => expect(drive(42)).not.toEqual(drive(7)));
});
