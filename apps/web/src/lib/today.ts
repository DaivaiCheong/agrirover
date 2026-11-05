import type { Advice, Cycle, OrchardJob } from "./api";

export type TodayItem =
  | { kind: "todo"; key: string; rank: number; a: Advice; t: Advice["todo"][number] }
  | { kind: "job"; key: string; rank: number; c: Cycle; j: OrchardJob; urgent: boolean; advice?: Advice };

/** The rover's advice and the cycle's calendar as one list, most urgent first, with nothing said twice.
 *  Held water is said once, by the advice; bagging once, by the task, because that row is where the fruit is measured and ticked off. */
export function mergeToday(advice: Advice[], jobsOf: { c: Cycle; jobs: OrchardJob[] }[]): TodayItem[] {
  const byZone = new Map(advice.map((a) => [a.zone, a]));
  const open = jobsOf.flatMap(({ c, jobs }) => jobs.filter((j) => j.state === "due" || j.state === "overdue").map((j) => ({ c, j })));
  const bagging = new Set(open.filter(({ j }) => j.id === "bag").map(({ c }) => c.zone));
  const bagNow = new Set(advice.filter((a) => a.todo.some((t) => t.id === "bag_now")).map((a) => a.zone));

  const items: TodayItem[] = [];
  for (const a of advice) {
    a.todo.forEach((t, i) => {
      if (t.id === "bag_now" && bagging.has(a.zone)) return;
      items.push({ kind: "todo", key: `${a.zone}-todo-${i}`, rank: t.severity === "critical" ? 0 : t.severity === "warn" ? 1 : 3, a, t });
    });
  }
  for (const { c, j } of open) {
    const a = byZone.get(c.zone);
    if (j.id === "hold" && a?.water.paused) continue;
    const urgent = j.id === "bag" && bagNow.has(c.zone);
    items.push({ kind: "job", key: `${c.id}-job-${j.id}`, rank: urgent || j.state === "overdue" ? 0 : j.ongoing ? 3 : 2, c, j, urgent, advice: a });
  }
  return items.sort((x, y) => x.rank - y.rank);
}
