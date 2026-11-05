import { ArrowRight, Bot, Plus, Sprout, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import EnvRibbon from "../components/EnvRibbon";
import { JobRow, JobsHead, StageStrip } from "../components/Orchard";
import { Empty, Kpis, More, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem, type Advice, type BedConditions, type Cycle, type OrchardCycle } from "../lib/api";
import { litres, longToday } from "../lib/format";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";

const FEED_WORD: Record<string, [string | undefined, string]> = {
  feed: ["info", "Feed today"], hold: ["warn", "Hold the feed"], flush: ["alert", "Flush, no feed"], wait: [undefined, "Not due"], none: [undefined, "No feed"],
};

function waterText(a: Advice) {
  if (!a.surveyed) return <span className="muted">No round yet</span>;
  if (a.water.paused) return <Tag>Paused for stress</Tag>;
  if (a.water.raining) return <Tag>Raining: none</Tag>;
  if (a.water.litres === 0) return <span className="muted">None today</span>;
  return <><b>{litres(a.water.litres)}</b> <span className="muted">{a.treesWatered} of {a.treesSeen} trees</span></>;
}

/** The day's instructions, one row per thing to do. The sentence behind each opens from it. */
function TodoRow({ a, t }: { a: Advice; t: Advice["todo"][number] }) {
  const mark = t.severity === "critical" ? "alert" : t.severity === "warn" ? "warn" : undefined;
  return (
    <tr>
      <td className="nowrap"><Link to={`/cycles/${a.cycleId}/orchard`}><b>{a.label}</b></Link></td>
      <td>{mark && <><Tag kind={mark}>{t.severity === "critical" ? "Now" : "Check"}</Tag> </>}{t.detail ? <More label={t.text}>{t.detail}</More> : t.text}</td>
    </tr>
  );
}

function Card({ c, cond, orchard, advice }: { c: Cycle; cond?: BedConditions; orchard?: OrchardCycle; advice?: Advice }) {
  return (
    <section className="panel cropcard">
      <div className="cc-top">
        <div style={{ minWidth: 0 }}>
          <span className="cc-title">{c.bedLabel}</span>
          <span className="small muted"> {c.variety ?? "Guava"}{c.plantCount ? ` · ${c.plantCount.toLocaleString()} trees` : ""}</span>
        </div>
        <Link className="linkbtn cc-open" to={`/cycles/${c.id}/orchard`} aria-label={`Open ${c.bedLabel}`}>Open <ArrowRight size={14} aria-hidden /></Link>
      </div>
      {orchard && <StageStrip stages={orchard.stages} day={orchard.day} />}
      {(orchard?.conditions ?? cond) && <EnvRibbon bed={(orchard?.conditions ?? cond)!} />}
      {advice && (
        <div className="cc-water">
          <span>Water</span>{waterText(advice)}
          <span className="cc-sep" />
          <span>Feed</span><Tag kind={FEED_WORD[advice.feed.action][0]}>{FEED_WORD[advice.feed.action][1]}</Tag>
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const cycles = useData(api.cycles);
  const advice = usePoll(api.advice, 30000);
  const conditions = usePoll(api.conditions, 30000);
  const active = (cycles.data ?? []).filter((c) => c.status === "active");
  const key = active.map((c) => c.id).join();
  const load = useData(async () => new Map(await Promise.all(active.map(async (c) => [c.id, await api.orchardCycle(c.id)] as const))), [key]);
  const error = cycles.error ?? advice.error ?? conditions.error ?? load.error;

  const adviceOf = new Map((advice.data ?? []).map((a) => [a.zone, a]));
  const condOf = new Map((conditions.data ?? []).map((b) => [b.zone, b]));
  const all = advice.data ?? [];

  async function jobDone(c: Cycle, job: string) { await api.orchardJobDone(c.id, job); load.reload(); advice.data; }
  async function fruit(c: Cycle, mm: number) { await api.orchardFruitSize(c.id, mm); load.reload(); }

  const work = active.flatMap((c) => (load.data?.get(c.id)?.jobs ?? []).filter((j) => j.state === "due" || j.state === "overdue").map((j) => ({ c, j })));
  const todo = all.flatMap((a) => a.todo.map((t) => ({ a, t })));
  const order = { critical: 0, warn: 1, info: 2 } as const;
  todo.sort((x, y) => order[x.t.severity] - order[y.t.severity]);
  const beds = active.map((c) => load.data?.get(c.id)?.conditions ?? condOf.get(c.zone)).filter((b): b is BedConditions => Boolean(b));
  const alerts = beds.flatMap((b) => b.alerts);
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const water = all.reduce((s, a) => s + a.water.litres, 0);
  const full = all.reduce((s, a) => s + a.water.fullLitres, 0);
  const newest = all.map((a) => a.surveyedAt).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const missing = all.filter((a) => !a.surveyed);
  const simulated = all.some((a) => a.simulated);

  return (
    <>
      <PageHead icon={Sun} title="Today" sub={longToday()}
                actions={<>
                  <Link className="btn btn-sm btn-ghost" to="/rover"><Bot size={16} aria-hidden />Run a round</Link>
                  <Link className="btn btn-sm" to="/cycles?add=true"><Plus size={16} aria-hidden />Start a cycle</Link>
                </>} />
      <main className="main stack">
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}

        {cycles.data !== null && active.length === 0 && (
          <Panel><Empty icon={Sprout}>
            Nothing is growing yet.
            <Link className="btn btn-sm" to="/cycles?add=true"><Plus size={16} aria-hidden />Start a guava cycle</Link>
          </Empty></Panel>
        )}

        {active.length > 0 && (
          <>
            <Kpis items={[
              { k: "Last rover round", v: newest ? ago(newest) : "None" },
              { k: "Water today", v: `${litres(water)} of ${litres(full)}` },
              { k: "Feed today", v: all.filter((a) => a.feed.action === "feed").length + " blocks" },
              { k: "Alerts", v: alerts.length === 0 ? "None" : `${alerts.length}${critical ? ` (${critical} critical)` : ""}` },
            ]} />
            {simulated && <p className="small muted">From simulated rover rounds. Starting rules, not field results. Nothing here opens a valve.</p>}
            {missing.length > 0 && <Notice kind="warn">No fresh round for {missing.map((a) => a.label).join(", ")}. <Link to="/rover">Run a round</Link> before acting on these.</Notice>}

            {todo.length > 0 && (
              <Panel title="What to do today" pad={false}>
                <div className="tablewrap">
                  <table className="tbl todo-t"><tbody>{todo.map(({ a, t }, i) => <TodoRow key={`${a.zone}-${i}`} a={a} t={t} />)}</tbody></table>
                </div>
              </Panel>
            )}

            {work.length > 0 && (
              <Panel title="Today's tasks" pad={false}>
                <div className="tablewrap">
                  <table className="tbl jobs-t">
                    <JobsHead bed />
                    <tbody>
                      {work.map(({ c, j }) => (
                        <JobRow key={`${c.id}-${j.id}`} j={j} bed={c.bedLabel} fruitMm={load.data?.get(c.id)?.fruitMm ?? null}
                                onDone={(id) => jobDone(c, id)} onFruit={(mm) => fruit(c, mm)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            <div className="grid g2">{active.map((c) => (
              <Card key={c.id} c={c} cond={condOf.get(c.zone)} orchard={load.data?.get(c.id)} advice={adviceOf.get(c.zone)} />
            ))}</div>
          </>
        )}
      </main>
    </>
  );
}
