import { describe, expect, it } from "vitest";
import { advise } from "../../sim/advice";
import { runScenario, scenario } from "../../sim/scenarios";
import { replayAt, stopTotal, STOPS_PER_SECOND } from "../replay";

const words = (s: string) => `word:${s}`;

describe("round replay", () => {
  const round = runScenario(scenario("dry-row"));
  const advice = advise({ round });

  it("counts the round's stops: every plant once, 97 stops in plan B", () => {
    expect(stopTotal(round)).toBe(97);
  });

  it("shows nothing before the first stop", () => {
    const r = replayAt(round, advice, 0, words);
    expect(r.reached).toBe(0);
    expect(r.visited.size).toBe(0);
    expect(r.current).toEqual([]);
    expect(r.waterL).toBe(0);
    expect(Object.values(r.status).every((s) => s === "unchecked")).toBe(true);
  });

  it("the water so far rises to the round's own total, and not before the plants are checked", () => {
    const r = replayAt(round, advice, 97, words);
    expect(r.waterL).toBeCloseTo(advice.value!.waterL, 6);
    const row3 = replayAt(round, advice, 10, words);
    expect(row3.waterL).toBeLessThan(advice.value!.waterL);
  });

  it("marks the plants of the stop just checked as now", () => {
    const r = replayAt(round, advice, 5, words);
    expect(r.current.length).toBeGreaterThan(0);
    for (const id of r.current) expect(r.visited.has(id)).toBe(true);
  });

  it("never counts more stops than the round has, nor fewer than none", () => {
    expect(replayAt(round, advice, 500, words).reached).toBe(97);
    expect(replayAt(round, advice, -3, words).reached).toBe(0);
  });

  it("counts what the camera saw in words, for plants already checked", () => {
    const sick = runScenario(scenario("yellow-leaves"));
    const a = advise({ round: sick });
    const all = replayAt(sick, a, 97, words);
    expect(all.signs["R2-P07"]).toEqual(["word:yellowLower"]);
    expect(all.looks).toBe(1);
  });

  it("speeds: 60× is faster than 10×, 10× faster than 1×", () => {
    expect(STOPS_PER_SECOND[60]).toBeGreaterThan(STOPS_PER_SECOND[10]);
    expect(STOPS_PER_SECOND[10]).toBeGreaterThan(STOPS_PER_SECOND[1]);
  });
});
