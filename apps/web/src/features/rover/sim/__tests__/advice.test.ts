import { describe, expect, it } from "vitest";
import { AGRONOMY, T1 } from "../profile";
import { rainAdjusted, rainCancelsMm, refillLitres, tooWetTheta, triggerTheta, waterNowTheta, dripHours } from "../agronomy";
import { MAX_CARDS, PRIORITY, advise, duration, placeText, type Advice, type Feedback } from "../advice";
import { SCENARIOS, runScenario, scenario } from "../scenarios";
import type { PlantObs, RoundData } from "../scout";

// "Advice engine values" in docs/rover-redesign.md
describe("advice engine values", () => {
  it("refill point 0.21, water now 0.1425, too wet 0.30 (exact)", () => {
    expect(triggerTheta()).toBeCloseTo(0.21, 12);
    expect(waterNowTheta()).toBeCloseTo(0.1425, 12);
    expect(tooWetTheta()).toBeCloseTo(0.30, 12);
  });
  it("5.33 L a plant at θ 0.19, 8.67 L at 0.14", () => {
    expect(refillLitres(0.19, T1.plantM)).toBeCloseTo(5.33, 2);
    expect(refillLitres(0.14, T1.plantM)).toBeCloseTo(8.67, 2);
  });
  it("six plants at 0.19: 32.0 L, 2 h 40 min at 2 L/h; 517 L for all 97", () => {
    const v = refillLitres(0.19, T1.plantM);
    expect(6 * v).toBeCloseTo(32.0, 1);
    expect(duration(dripHours(v))).toBe("2 h 40 min");
    expect(97 * v).toBeCloseTo(517, 0);
  });
  it("12 mm at 70 % leaves 3.89 L; 44.4 mm cancels watering", () => {
    const v = refillLitres(0.19, T1.plantM);
    expect(rainAdjusted(v, 12, 0.7, T1.plantM).litres).toBeCloseTo(3.89, 2);
    expect(rainCancelsMm(v, T1.plantM)).toBeCloseTo(44.4, 1);
    expect(AGRONOMY.rainProbMin).toBe(0.6);
  });
  it("orders cards Now, Spreading, Water, Too wet, Look at, Re-check, Check by hand, No soil data; at most 5", () => {
    expect(PRIORITY).toEqual(["waterNow", "spreading", "water", "tooWet", "lookAt", "recheck", "handCheck", "noSoil"]);
    const a = advise({ round: busyRound() });
    expect(a.cards.length).toBe(MAX_CARDS);
    const all = [...a.cards, ...a.canWait].map((c) => PRIORITY.indexOf(c.kind));
    expect(all).toEqual([...all].sort((x, y) => x - y));
    expect(a.cards[0].kind).toBe("waterNow");
    expect(a.canWait.length).toBeGreaterThan(0);
  });
});

/** A round with something wrong in every row, from scenario 13's plants. */
function busyRound(): RoundData {
  const r = runScenario(scenario("dry-row"));
  const set = (id: string, f: (o: PlantObs) => void) => f(r.plants.find((o) => o.id === id)!);
  set("R1-P02", (o) => { o.soil.theta = 0.13; });
  set("R2-P03", (o) => { o.soil.theta = 0.18; });
  set("R4-P04", (o) => { o.soil.theta = 0.20; });
  for (const id of ["R5-P01", "R5-P05", "R5-P09"]) set(id, (o) => { o.signs = [{ sign: "yellowLower", p: 0.9, px: 80, visible: 1 }]; });
  set("R2-P19", (o) => { o.seen = 0; });
  return r;
}

const brief = (a: Advice) => [...a.cards, ...a.canWait].map((c) => ({
  kind: c.kind, urgency: c.urgency, action: c.action, where: c.where.text, detail: c.detail, why: c.why, confidence: c.confidence,
  outcome: c.outcome, diagnosis: c.diagnosis && { likely: c.diagnosis.likely, couldAlso: c.diagnosis.couldAlso, ruledOut: c.diagnosis.ruledOut, firstStep: c.diagnosis.firstStep },
}));

describe("advice scenarios (13–18)", () => {
  it("13 Dry row: one card, water 6 plants in row 3, 5.3 L each, 32 L, today; 32 L against 517 L", () => {
    const a = advise({ round: runScenario(scenario("dry-row")) });
    const water = [...a.cards, ...a.canWait].filter((c) => c.kind === "water" || c.kind === "waterNow");
    expect(water.length).toBe(1);
    expect(water[0].action).toBe("Water 6 plants in row 3");
    expect(water[0].where.text).toBe("R3-P05 to R3-P10");
    expect(water[0].amount!.eachL[0]).toBeCloseTo(5.33, 2);
    expect(water[0].amount!.totalL).toBeCloseTo(32.0, 1);
    expect(water[0].urgency).toBe("today");
    expect(water[0].confidence).toBe("high");
    expect(a.value!.waterL).toBeCloseTo(32.0, 1);
    expect(a.value!.allL).toBeCloseTo(517, 0);
    expect(brief(a)).toMatchSnapshot();
  });
  it("14 Rain coming: 3.9 L each, marked rain expected; with 45 mm, hold watering", () => {
    const a = advise({ round: runScenario(scenario("rain-coming")) });
    const w = a.cards.find((c) => c.kind === "water")!;
    expect(w.amount!.eachL[0]).toBeCloseTo(3.89, 2);
    expect(w.detail).toContain("rain expected");
    const heavy = advise({ round: runScenario(scenario("rain-heavy")) });
    const h = heavy.cards.find((c) => c.kind === "water")!;
    expect(h.action).toBe("Hold watering in row 3");
    expect(heavy.value).toBeNull();
    expect([brief(a), brief(heavy)]).toMatchSnapshot();
  });
  it("15 Yellow leaves: look at R2-P07, likely low nitrogen, too much water ruled out", () => {
    const a = advise({ round: runScenario(scenario("yellow-leaves")) });
    const c = a.cards.find((x) => x.kind === "lookAt" && x.where.plants[0] === "R2-P07")!;
    expect(c.diagnosis!.likely).toBe("Likely low nitrogen");
    expect(c.diagnosis!.ruledOut).toMatch(/too much water ruled out/i);
    expect(brief(a)).toMatchSnapshot();
  });
  it("16 Spreading blight: ranked first, cultural steps, an agronomist, no chemical", () => {
    const a = advise({ round: runScenario(scenario("spreading")) });
    expect(a.cards[0].kind).toBe("spreading");
    expect(a.cards[0].action).toBe("Spreading in row 2");
    expect(a.cards[0].diagnosis!.firstStep).toMatch(/remove affected lower leaves.*agronomist/i);
    expect(a.cards[0].diagnosis!.products).toBeUndefined();
    expect(JSON.stringify(a)).not.toMatch(/fungicide|pesticide|spray|\d+\s*(ml|g)\s*\/|dose/i);
    expect(brief(a)).toMatchSnapshot();
  });
  it("16 with the farmer's own product: shown with its label rate only", () => {
    const products = [{ name: "My copper product", labelRate: "as on the label", for: ["ringSpots" as const] }];
    const a = advise({ round: runScenario(scenario("spreading")), products });
    expect(a.cards[0].diagnosis!.products).toEqual(products);
  });
  it("17 Follow-up: watered row 3 recovered on the next round", () => {
    const r1 = runScenario(scenario("dry-row"), 42, undefined, "r1");
    const w = advise({ round: r1 }).cards.find((c) => c.kind === "water")!;
    const fb: Feedback[] = [{ cardId: w.id, roundId: "r1", kind: "water", plants: w.where.plants, response: "done", at: "" }];
    const a = advise({ round: runScenario(scenario("follow-up"), 43, undefined, "r2"), previous: r1, feedback: fb });
    const re = [...a.cards, ...a.canWait].find((c) => c.kind === "recheck")!;
    expect(re.action).toBe("Recovered: 6 plants in row 3");
    expect(re.outcome).toBe("recovered");
    expect(brief(a)).toMatchSnapshot();
  });
  it("17 Still dry when the next round finds the same soil", () => {
    const r1 = runScenario(scenario("dry-row"), 42, undefined, "r1");
    const w = advise({ round: r1 }).cards.find((c) => c.kind === "water")!;
    const fb: Feedback[] = [{ cardId: w.id, roundId: "r1", kind: "water", plants: w.where.plants, response: "done", at: "" }];
    const a = advise({ round: runScenario(scenario("dry-row"), 43, undefined, "r2"), previous: r1, feedback: fb });
    expect([...a.cards, ...a.canWait].find((c) => c.kind === "recheck")!.outcome).toBe("stillDry");
    expect(a.cards.find((c) => c.kind === "water")!.why).toMatch(/two rounds in a row/);
  });
  it("18 Upper-leaf virus: the rover misses it, the Lab counts it, the hardware hint says why", () => {
    const r = runScenario(scenario("upper-virus"));
    const a = advise({ round: r });
    expect([...a.cards, ...a.canWait].some((c) => c.where.plants.includes("R4-P12"))).toBe(false);
    expect(r.truth!.missed).toEqual([{ id: "R4-P12", condition: "leafCurl", why: "out of view" }]);
    expect(r.truth!.hardwareHints[0]).toMatch(/taller mast|tilt/);
    expect(brief(a)).toMatchSnapshot();
  });
  it("1 Today's rover: every probe too hard, one No soil readings card, complete with no soil data", () => {
    const r = runScenario(scenario("today"));
    const a = advise({ round: r });
    expect(r.probes.ok).toBe(0);
    expect(r.probes.tooHard).toBe(97);
    expect([...a.cards, ...a.canWait].filter((c) => c.kind === "noSoil").length).toBe(1);
    expect([...a.cards, ...a.canWait].some((c) => c.kind === "water")).toBe(false);
    expect(a.outcome).toBe("Complete, no soil data");
    expect(r.plants.find((o) => o.soil.needN !== undefined)!.soil.needN).toBeCloseTo(51, 0);
  });
});

describe("advice is deterministic", () => {
  it("gives the same cards for the same seed, every scenario", () => {
    for (const s of SCENARIOS) expect(advise({ round: runScenario(s, 42) })).toEqual(advise({ round: runScenario(s, 42) }));
  });
  it("another seed changes only the noise", () => {
    const a = advise({ round: runScenario(scenario("dry-row"), 1) }), b = advise({ round: runScenario(scenario("dry-row"), 2) });
    expect(a.cards.find((c) => c.kind === "water")!.action).toBe(b.cards.find((c) => c.kind === "water")!.action);
  });
});

describe("card words", () => {
  it("groups plants into runs", () => expect(placeText(["R3-P05", "R3-P06", "R3-P07", "R3-P10", "R1-P02"])).toBe("R1-P02, R3-P05 to R3-P07, R3-P10"));
  it("keeps every action to 6 words, verb first", () => {
    for (const s of SCENARIOS) for (const c of [...advise({ round: runScenario(s) }).cards]) expect(c.action.split(/\s+/).length).toBeLessThanOrEqual(6);
  });
});
