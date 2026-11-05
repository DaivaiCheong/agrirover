/** The sample data must say what the guava document says, and flag exactly where the document disagrees with itself. */
import { describe, expect, it } from "vitest";
import {
  CYCLE_DAYS, EVENTS, FERTIGATION, JOBS, SETUPS, STAGES, SYMPTOMS, alertsFor, correlate, jobsFor, litresPerTree, rateBed, readingsFor, recompute,
  stageOf, treesForArea,
} from "./guava";

const ids = (day: number, r = readingsFor(day, false), o = {}) =>
  alertsFor(r, day, { stress: false, recentMinMoisture: 60, fruitMm: null, bagged: false, ...o }).map((a) => a.id);

describe("stages", () => {
  it("cover days 1 to 180 with no gap or overlap", () => {
    const days = STAGES.flatMap((s) => Array.from({ length: s.lastDay - s.firstDay + 1 }, (_, i) => s.firstDay + i));
    expect(days).toEqual(Array.from({ length: CYCLE_DAYS }, (_, i) => i + 1));
  });
  it.each([[45, 1], [46, 2], [75, 2], [76, 3], [105, 3], [106, 4], [145, 4], [146, 5], [180, 5]])("day %i is stage %i", (d, n) => {
    expect(stageOf(d).n).toBe(n);
  });
  it("hold the document's moisture and EC targets", () => {
    expect(STAGES.map((s) => [s.moisture, s.ec])).toEqual([
      [[20, 30], [0.8, 1.2]], [[60, 70], [1.2, 1.8]], [[65, 75], [1.5, 2.2]], [[60, 75], [1.8, 2.5]], [[50, 60], [2.0, 2.7]]]);
  });
});

describe("setups", () => {
  it("are the document's four, with its trees per 50 m2", () => {
    expect(SETUPS.map((s) => treesForArea(s, 50))).toEqual([2, 5, 8, 25]);
  });
  it("spacing gives the document's density at the spacing it names", () => {
    expect(SETUPS.map((s) => Math.round(10000 / ((s.rowCm / 100) * (s.plantCm / 100))))).toEqual([400, 952, 1667, 5000]);
  });
  it("flag a discrepancy for exactly the setups whose tables do not multiply out", () => {
    for (const s of SETUPS) expect([s.id, recompute(s).disagrees]).toEqual([s.id, Boolean(s.orchard!.docIssue)]);
    expect(SETUPS.filter((s) => recompute(s).disagrees).map((s) => s.orchard!.letter)).toEqual(["A", "C"]);
  });
});

describe("stress", () => {
  it("makes dry soil the right answer, and the same reading wrong without it", () => {
    const stress = rateBed({ ...readingsFor(30, true), air_humidity: 70 }, 30, { stress: true, recentMinMoisture: 25, fruitMm: null, bagged: false }, "");
    expect(stress.params[0]).toMatchObject({ metric: "soil_moisture", status: "normal", target: [20, 30] });
    const none = rateBed({ ...readingsFor(30, true), air_humidity: 70 }, 30, { stress: false, recentMinMoisture: 25, fruitMm: null, bagged: false }, "");
    expect(none.params[0]).toMatchObject({ status: "warning", direction: "low", target: [55, 75] });
  });
  it("gives no water, and warns when the air or the soil defeats it", () => {
    expect(litresPerTree(10, 1, 25)).toBe(0);
    const r = { ...readingsFor(30, true), air_humidity: 88, soil_moisture: 35 };
    expect(ids(30, r, { stress: true })).toEqual(["stress_humidity", "stress_leak"]);
    // with no stress under way the same air is a plain fungal alert
    expect(ids(30, { ...readingsFor(30, false), air_humidity: 88 })).toEqual(["fungal"]);
    const humid = rateBed({ ...readingsFor(30, true), air_humidity: 88 }, 30, { stress: true, recentMinMoisture: 25, fruitMm: null, bagged: false }, "");
    expect(humid.status).toBe("warning");
  });
});

describe("alerts fire strictly past the limit", () => {
  const base = readingsFor(60, false);
  it.each([
    ["saturation", 85, 85.1, "soil_moisture"], ["salinity", 3.0, 3.01, "soil_ec"], ["root_heat", 32, 32.1, "soil_temperature"],
    ["sun_scald", 35, 35.1, "air_temperature"], ["fungal", 85, 85.1, "air_humidity"], ["alkaline", 7.5, 7.51, "soil_ph"],
  ])("%s", (id, at, past, metric) => {
    expect(ids(60, { ...base, [metric]: at })).not.toContain(id);
    expect(ids(60, { ...base, [metric]: past })).toContain(id);
  });
  it("bloom floor only at bloom", () => {
    expect(ids(90, { ...readingsFor(90, false), soil_moisture: 55 })).not.toContain("bloom_floor");
    expect(ids(90, { ...readingsFor(90, false), soil_moisture: 54.9 })).toContain("bloom_floor");
    expect(ids(130, { ...readingsFor(130, false), soil_moisture: 50 })).not.toContain("bloom_floor");
  });
  it("cracking needs the dry spell and the jump, not wet soil alone", () => {
    const wet = { ...readingsFor(165, false), soil_moisture: 82 };
    expect(ids(165, wet, { recentMinMoisture: 33 })).toContain("cracking");
    expect(ids(165, wet, { recentMinMoisture: 55 })).not.toContain("cracking");
  });
  it("bagging: due from 30 mm, gone once bagged", () => {
    const r = readingsFor(120, false);
    expect(ids(120, r, { fruitMm: 29 })).not.toContain("bag_now");
    expect(ids(120, r, { fruitMm: 30 })).toContain("bag_now");
    expect(ids(120, r, { fruitMm: 34, bagged: true })).not.toContain("bag_now");
    expect(ids(120, r, { fruitMm: 34, bagged: true })).not.toContain("fruit_fly");
  });
});

describe("the scripted cycle", () => {
  it("is healthy on an ordinary day of every stage, so an alert always means something", () => {
    for (const day of [12, 50, 80, 110, 155]) {
      expect(EVENTS.some((e) => day >= e.from && day <= e.to)).toBe(false);
      const stress = day < 46;
      const rated = rateBed(readingsFor(day, stress), day, { stress, recentMinMoisture: 60, fruitMm: null, bagged: true }, "");
      expect([day, rated.alerts.map((a) => a.id)]).toEqual([day, []]);
      expect([day, rated.params.filter((p) => p.status !== "normal" && p.status !== "unrated").map((p) => p.metric)]).toEqual([day, []]);
    }
  });
  it("has soil N, P and K shown but not rated, because the document gives no soil targets", () => {
    const rated = rateBed(readingsFor(60, false), 60, { stress: false, recentMinMoisture: 60, fruitMm: null, bagged: false }, "");
    expect(rated.params.filter((p) => p.status === "unrated").map((p) => p.short)).toEqual(["N", "P", "K"]);
  });
});

describe("fertigation", () => {
  it("never puts calcium nitrate in a tank with a sulphate or a phosphate", () => {
    for (const f of FERTIGATION) for (const t of f.tanks) {
      if (t.products.some((p) => /calcium nitrate/i.test(p))) {
        expect(t.products.filter((p) => /sulphate|SOP|MAP|19:19:19/i.test(p))).toEqual([]);
      }
    }
  });
  it("has no nitrogen in stress or maturation", () => {
    expect([FERTIGATION[0].nitrogen, FERTIGATION[4].nitrogen]).toEqual(["None", "None"]);
  });
});

describe("jobs", () => {
  it("mark every chemical dose for an agronomist", () => {
    for (const j of JOBS) if (/foliar/i.test(j.title)) expect([j.id, j.confirm]).toEqual([j.id, true]);
  });
  it("hold the water only when the method is withholding", () => {
    expect(jobsFor(10, 10, new Set(), "withhold").map((j) => j.id)).toContain("hold");
    expect(jobsFor(10, 10, new Set(), "bending").map((j) => j.id)).not.toContain("hold");
  });
  it("that last their whole window are never ticked off or overdue", () => {
    const hold = jobsFor(30, 30, new Set(), "withhold").find((j) => j.id === "hold")!;
    expect([hold.ongoing, hold.state]).toEqual([true, "due"]);
    expect(jobsFor(60, 60, new Set(), "withhold").find((j) => j.id === "hold")!.state).toBe("past");
  });
  it("say due, overdue, done and later", () => {
    const of = (id: string, day: number, done = new Set<string>()) => jobsFor(day, day, done, "pruning").find((j) => j.id === id)!.state;
    expect([of("bag", 110), of("bag", 130), of("bag", 100), of("bag", 110, new Set(["bag"]))]).toEqual(["due", "overdue", "later", "done"]);
  });
});

describe("symptoms", () => {
  const r = readingsFor(60, false);
  it("are the document's five", () => {
    expect(SYMPTOMS.map((s) => s.id)).toEqual(["guava_decline", "fruit_fly", "anthracnose", "cracking", "chlorosis"]);
  });
  it("fruit fly needs warmth and humidity together", () => {
    expect(correlate("fruit_fly", { ...r, air_temperature: 28, air_humidity: 60 }, 60, 0).verdict).toBe("not_supported");
    expect(correlate("fruit_fly", { ...r, air_temperature: 28, air_humidity: 75 }, 60, 0).verdict).toBe("supported");
  });
  it("cracking needs the jump or high pH", () => {
    expect(correlate("cracking", { ...r, soil_moisture: 82 }, 60, 0).verdict).toBe("not_supported");
    expect(correlate("cracking", { ...r, soil_moisture: 82 }, 33, 0).verdict).toBe("supported");
    expect(correlate("cracking", { ...r, soil_ph: 7.6 }, 60, 0).verdict).toBe("supported");
  });
  it("say what the sensors cannot see", () => {
    expect(correlate("guava_decline", r, 60, 0).caveat).toContain("nematodes");
  });
});
