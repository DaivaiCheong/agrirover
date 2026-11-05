import { describe, expect, it } from "vitest";
import type { Advice, Cycle, OrchardJob } from "./api";
import { mergeToday } from "./today";

const cycle = (zone: string) => ({ id: `c-${zone}`, zone, bedLabel: zone }) as unknown as Cycle;
const advice = (zone: string, todo: Partial<Advice["todo"][number]>[], paused = false) =>
  ({ zone, label: zone, cycleId: `c-${zone}`, water: { paused }, todo: todo.map((t) => ({ kind: "water", severity: "info", text: "x", detail: null, ...t })) }) as unknown as Advice;
const job = (id: string, state: OrchardJob["state"] = "due", ongoing = false) => ({ id, state, ongoing, title: id }) as unknown as OrchardJob;
const texts = (items: ReturnType<typeof mergeToday>) => items.map((i) => (i.kind === "todo" ? i.t.text : i.j.id));

describe("the day's one list", () => {
  it("says bagging once, on the task, and marks it urgent when the fruit is ready", () => {
    const items = mergeToday([advice("g4", [{ id: "bag_now", kind: "alert", severity: "critical", text: "Bag the fruit now" }])], [{ c: cycle("g4"), jobs: [job("bag")] }]);
    expect(texts(items)).toEqual(["bag"]);
    expect(items[0]).toMatchObject({ kind: "job", urgent: true, rank: 0 });
  });

  it("keeps the bagging alert when no task can carry it", () => {
    const items = mergeToday([advice("g4", [{ id: "bag_now", kind: "alert", severity: "critical", text: "Bag the fruit now" }])], [{ c: cycle("g4"), jobs: [job("bag", "done")] }]);
    expect(texts(items)).toEqual(["Bag the fruit now"]);
  });

  it("says held water once", () => {
    const items = mergeToday([advice("g1", [{ text: "No water: stress on purpose" }], true)], [{ c: cycle("g1"), jobs: [job("hold", "due", true)] }]);
    expect(texts(items)).toEqual(["No water: stress on purpose"]);
  });

  it("leaves out tasks that are not due", () => {
    expect(mergeToday([], [{ c: cycle("g2"), jobs: [job("a", "later"), job("b", "done"), job("c", "past")] }])).toEqual([]);
  });

  it("puts what is urgent first and routine last", () => {
    const items = mergeToday(
      [advice("g3", [{ text: "Water 10 of 10 trees" }, { severity: "warn", text: "Look at 1 tree" }, { severity: "critical", text: "Bloom floor" }])],
      [{ c: cycle("g3"), jobs: [job("pinch"), job("zn_b", "overdue")] }],
    );
    expect(texts(items)).toEqual(["Bloom floor", "zn_b", "Look at 1 tree", "pinch", "Water 10 of 10 trees"]);
  });
});
