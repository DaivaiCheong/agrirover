import { describe, expect, it } from "vitest";
import { ROVER, REAL_ROVER, SURFACES, T1, patch } from "../profile";
import { Battery, cellOcv, packEnergyJ, socFromCellOcv } from "../battery";
import { Rng, stream } from "../rng";
import { Debounce, SafetyMonitor, lowEnergy, type SafetyInputs } from "../safety";
import { STRATEGIES, budgetRun, homeFrom, lanesFor, makePlan, plantCount, summary } from "../planner";
import { SoilGrid, slipFor, surfaceAt, tractionFor } from "../soil";
import { cruisePoint, turnMargin } from "../vehicle";
import { hotelPower } from "../driver";
import { forceNeeded, liftLimit } from "../probe";
import { rainAdjusted, rainCancelsMm, refillLitres, waterNowTheta, tooWetTheta } from "../agronomy";

describe("random streams", () => {
  it("repeat for the same seed and name, and differ between subsystems", () => {
    const a = stream(42, "battery"), b = stream(42, "battery"), c = stream(42, "motors");
    const xs = [a.next(), a.gauss()], ys = [b.next(), b.gauss()];
    expect(xs).toEqual(ys);
    expect(c.next()).not.toBe(xs[0]);
  });
  it("draws normal numbers with the right spread", () => {
    const r = new Rng(1), n = 20000;
    let s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const x = r.gauss(); s += x; s2 += x * x; }
    expect(Math.abs(s / n)).toBeLessThan(0.03);
    expect(Math.sqrt(s2 / n)).toBeCloseTo(1, 1);
  });
});

describe("battery", () => {
  it("reads the OCV curve both ways", () => {
    expect(cellOcv(50)).toBeCloseTo(3.74, 5);
    expect(socFromCellOcv(cellOcv(63))).toBeCloseTo(63, 5);
  });
  it("counts charge: 1 A for an hour takes 40 % of a 2.5 Ah pack", () => {
    const b = new Battery({ ...ROVER.battery, currentGainSigma: 0 }, 80, new Rng(1));
    for (let i = 0; i < 3600; i++) b.step(1, 1);
    expect(b.soc).toBeCloseTo(40, 5);
    expect(b.socEst).toBeCloseTo(40, 5);
  });
  it("lets the estimate drift with the sensor's gain error, then pulls it back after a rest", () => {
    const b = new Battery({ ...ROVER.battery, currentGainSigma: 0.03 }, 90, stream(3, "battery"));
    for (let i = 0; i < 3600; i++) b.step(1, 1);
    const drift = Math.abs(b.socEst - b.soc);
    for (let i = 0; i < 300; i++) b.step(0.1, 1);
    expect(Math.abs(b.socEst - b.soc)).toBeLessThan(Math.max(0.5, drift / 2));
  });
  it("shows voltage sag under load, never a voltage as a percentage", () => {
    const b = new Battery(ROVER.battery, 50, new Rng(1));
    b.step(2.5, 0.005);
    expect(b.vTerm).toBeCloseTo(3 * 3.74 - 0.5, 3);
  });
  it("holds about 28 Wh", () => expect(packEnergyJ(ROVER.battery) / 3600).toBeCloseTo(28.1, 1));
});

describe("soil", () => {
  it("inverts the shear curve", () => {
    const c = SURFACES.packed, N = 3;
    expect(tractionFor(slipFor(1.2, N, c), N, c)).toBeCloseTo(1.2, 9);
    expect(slipFor(c.mu * N, N, c)).toBe(Infinity);
  });
  it("turns to mud as it gets wetter", () => {
    expect(surfaceAt("lane", 0.24)).toEqual(SURFACES.packed);
    expect(surfaceAt("lane", 0.42)).toEqual(SURFACES.mud);
    expect(surfaceAt("lane", 0.36).mu).toBeCloseTo((0.6 + 0.35) / 2, 6);
  });
  it("lays lanes between the beds of T1, and rain wets them", () => {
    const g = new SoilGrid(T1);
    expect(g.kindAt(1.0, 0)).toBe("bed");
    expect(g.kindAt(1.0, 0.5)).toBe("lane");
    g.rain(10, 600);
    expect(g.thetaAt(1, 0.5)).toBeCloseTo(T1.theta + 10 / 6 / 1000 / 0.1, 4);
  });
});

describe("profile and driver", () => {
  it("costs 2.2 W of electronics; the L298N's linear regulator costs far more", () => {
    expect(hotelPower(ROVER, 11.7)).toBeCloseTo(2.2, 1);
    const linear = patch(ROVER, { rail5v: { source: "linear" } });
    expect(hotelPower(linear, 11.7)).toBeGreaterThan(3.5);
  });
  it("draws less on the real rover's wiring: one channel a motor drops less voltage", () => {
    expect(cruisePoint(REAL_ROVER, SURFACES.loose).motorPowerW).toBeLessThan(cruisePoint(ROVER, SURFACES.loose).motorPowerW);
  });
  it("can pivot on packed lanes only", () => {
    expect(turnMargin(ROVER, SURFACES.packed)).toBeGreaterThan(0);
    expect(turnMargin(ROVER, SURFACES.loose)).toBeLessThan(0);
  });
});

describe("probe", () => {
  it("cannot push the blade into a walked-on lane: it needs far more than the rover weighs", () => {
    expect(forceNeeded("blade", "lane", 0.24, 0.06)).toBeCloseTo(51, 0);
    expect(forceNeeded("blade", "lane", 0.45, 0.06)).toBeGreaterThan(liftLimit(ROVER));
  });
  it("gets twin rods into a wet lane", () => expect(forceNeeded("twinRod", "lane", 0.30, 0.06)).toBeCloseTo(8.3, 1));
});

describe("agronomy thresholds", () => {
  it("water now below 0.1425, too wet above 0.30", () => {
    expect(waterNowTheta()).toBeCloseTo(0.1425, 6);
    expect(tooWetTheta()).toBeCloseTo(0.30, 6);
    expect(refillLitres(0.14, 0.5)).toBeCloseTo(8.67, 2);
    expect(refillLitres(0.22, 0.5)).toBe(0);
  });
  it("credits likely rain against a refill", () => {
    const v = refillLitres(0.19, 0.5);
    expect(rainAdjusted(v, 12, 0.7, 0.5).litres).toBeCloseTo(3.89, 2);
    expect(rainAdjusted(v, 12, 0.5, 0.5).litres).toBeCloseTo(v, 6);
    expect(rainAdjusted(v, 45, 0.7, 0.5).hold).toBe(true);
    expect(rainCancelsMm(v, 0.5)).toBeCloseTo(44.4, 1);
  });
});

describe("planner", () => {
  it("knows T1: 97 plants, 5 lanes or 3 shared ones", () => {
    expect(plantCount(T1)).toBe(97);
    expect(lanesFor(T1, "every").length).toBe(5);
    expect(lanesFor(T1, "shared").map((l) => l.rows)).toEqual([[0, 1], [2, 3], [4]]);
  });
  it("stops at plants only: 97 stops in plan A, 60 (30 probed) in plan C", () => {
    const a = summary(makePlan(T1, STRATEGIES.A, ROVER), ROVER), c = summary(makePlan(T1, STRATEGIES.C, ROVER), ROVER);
    expect([a.stops, a.probes]).toEqual([97, 97]);
    expect([c.stops, c.probes]).toEqual([60, 30]);
  });
  it("finds the cheaper way home and needs none from the start pose", () => {
    const plan = makePlan(T1, STRATEGIES.A, ROVER);
    expect(homeFrom(plan, { lane: 0, x: 0, heading: 1 }, ROVER, plan.surface)).toEqual([]);
    const mid = homeFrom(plan, { lane: 1, x: 4.5, heading: -1 }, ROVER, plan.surface);
    expect(mid.filter((a) => a.kind === "pivot").length).toBe(2);
  });
  it("says a turn-to-look plan cannot pivot on loose soil", () => {
    const loose = { ...T1, laneKind: "tilled" as const };
    expect(makePlan(loose, STRATEGIES.A, ROVER).canPivot).toBe(false);
  });
  it("completes plan A from a full pack without going home early", () => {
    const r = budgetRun(makePlan(T1, STRATEGIES.A, ROVER), ROVER, 100);
    expect([r.stopsDone, r.wentHome]).toEqual([97, false]);
  });
});

describe("safety", () => {
  const ok: SafetyInputs = {
    estop: false, bumper: false, heartbeatAge: 0.1, cmdAge: 0.02, rainWet: false, rainForecast: false,
    eAvailJ: 50000, eNextJ: 300, eHomeJ: 600, vTerm: 11.7, packA: 0.5, driving: true, maxSlip: 0.02,
    motorA: [0.3, 0.3, 0.3, 0.3], channelA: [0.6, 0.6], rollDeg: 1, pitchDeg: 1, probing: false, probePitchRiseDeg: 0, outsideBy: 0,
  };
  const tick = (m: SafetyMonitor, i: Partial<SafetyInputs>, seconds: number) => {
    let out: string[] = [];
    for (let k = 0; k < Math.round(seconds / 0.1); k++) out = m.update({ ...ok, ...i });
    return out;
  };
  it("is quiet on a normal round", () => expect(tick(new SafetyMonitor(ROVER), {}, 5)).toEqual([]));
  it("debounces", () => {
    const d = new Debounce(1);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => d.update(true, 0.1)).some(Boolean)).toBe(false);
    expect(d.update(true, 0.1)).toBe(true);
  });
  it("ignores one pivot's sag but stops on a pack that stays low", () => {
    const m = new SafetyMonitor(ROVER);
    expect(tick(m, { vTerm: 9.4, packA: 2.6 }, 0.5)).not.toContain("criticalVoltage");
    expect(tick(m, {}, 2)).not.toContain("criticalVoltage");
    expect(tick(m, { vTerm: 9.6, packA: 0.4 }, 2.1)).toContain("criticalVoltage");
  });
  it("calls stuck only after 3 s of spinning while driving", () => {
    const m = new SafetyMonitor(ROVER);
    expect(tick(m, { maxSlip: 0.9 }, 2.5)).not.toContain("stuck");
    expect(tick(m, { maxSlip: 0.9 }, 0.6)).toContain("stuck");
  });
  it("goes home when the next stop would eat the reserve", () => {
    expect(lowEnergy(1190, 300, 600)).toBe(true);           // 890 left after the next stop < 1.5 × 600
    expect(lowEnergy(1200, 300, 600)).toBe(false);          // exactly the reserve is still enough
    expect(lowEnergy(1300, 300, 600)).toBe(false);
  });
  it("calls rain after 10 s on the sensor, lost link after 3 s, and tilt after 0.5 s", () => {
    expect(tick(new SafetyMonitor(ROVER), { rainWet: true }, 9.5)).not.toContain("rain");
    expect(tick(new SafetyMonitor(ROVER), { rainWet: true }, 10)).toContain("rain");
    expect(tick(new SafetyMonitor(ROVER), { heartbeatAge: 3.2 }, 0.1)).toContain("linkLost");
    expect(tick(new SafetyMonitor(ROVER), { rollDeg: 27 }, 0.5)).toContain("tilt");
  });
  it("retracts the probe when the soil needs more than the rover's weight", () => {
    expect(tick(new SafetyMonitor(ROVER), { probing: true, probeNeedN: 51, probeLiftN: 10.6 }, 0.1)).toContain("probeLift");
  });
});
