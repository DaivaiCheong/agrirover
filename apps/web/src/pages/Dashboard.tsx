import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Bot, Plus, Sprout, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import EnvRibbon from "../components/EnvRibbon";
import { DoneNote, JobRow, JobsHead, StageStrip, type LastDone } from "../components/Orchard";
import { Empty, Kpis, More, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem, type Advice, type BedConditions, type Cycle, type OrchardCycle } from "../lib/api";
import { litres, longToday, todayIso } from "../lib/format";
import { roundPlan } from "../lib/rover";
import { mergeToday } from "../lib/today";
import { problems, type Problem } from "../lib/problems";
import { useData } from "../lib/useData";
import { usePoll } from "../lib/usePoll";

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

const BlockLink = ({ id, label }: { id: string; label: string }) => <Link to={`/cycles/${id}/orchard`}><b>{label}</b></Link>;

/** What the rover's round says to do, as a row of the day's list. The sentence behind it opens from it. */
function TodoRow({ a, t }: { a: Advice; t: Advice["todo"][number] }) {
  const mark = t.severity === "critical" ? "alert" : t.severity === "warn" ? "warn" : undefined;
  return (
    <tr className="jr">
      <td className="nowrap jr-bed"><BlockLink id={a.cycleId} label={a.label} /></td>
      <td className="jr-job">{t.detail ? <More label={t.text}>{t.detail}</More> : t.text}</td>
      <td className="jr-when" />
      <td className="nowrap jr-state">{mark && <Tag kind={mark}>{t.severity === "critical" ? "Now" : "Check"}</Tag>}</td>
      <td className="act jr-act">{t.kind === "look" && <Link className="btn btn-sm btn-ghost job-btn" to={`/crop?zone=${a.zone}`}>Check a photo</Link>}</td>
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

/** One problem: what is wrong, the reading that shows it against its target, and the one thing to do. */
function ProblemCard({ p }: { p: Problem }) {
  return (
    <article className={`pc${p.severity === "critical" ? " pc-crit" : ""}`}>
      <div className="pc-top">
        <span className={`pc-sev${p.severity === "critical" ? " pc-sev-crit" : ""}`}>{p.severity === "critical" ? "Now" : "Check"}</span>
        <span className="pc-block">{p.label}</span>
      </div>
      <h3 className="pc-problem">{p.problem}</h3>
      <div className="pc-ev">
        {p.evidence ? (
          <>
            <span className="pc-val">{p.evidence.value}
              {p.evidence.direction === "low" && <ArrowDown size={18} aria-label="below target" />}
              {p.evidence.direction === "high" && <ArrowUp size={18} aria-label="above target" />}
            </span>
            <span className="pc-tgt">{p.evidence.label}{p.evidence.target ? ` · target ${p.evidence.target}` : ""}</span>
          </>
        ) : <span className="pc-txt">{p.evidenceText}</span>}
      </div>
      <div className="pc-act"><ArrowRight size={16} aria-hidden /><span>{p.action}</span></div>
      {p.link && <Link className="pc-link" to={p.link.to}>{p.link.text}</Link>}
    </article>
  );
}

const CARDS = 6;

export default function Dashboard() {
  const [view, setView] = useState<"problems" | "list">("problems");
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

  const [lastDone, setLastDone] = useState<LastDone | null>(null);
  async function jobDone(c: Cycle, job: string, title: string) {
    await api.orchardJobDone(c.id, job);
    setLastDone({ cycleId: c.id, job, title: `${title}, ${c.bedLabel}` });
    load.reload();
  }
  async function undoDone() {
    if (!lastDone) return;
    await api.orchardJobUndo(lastDone.cycleId, lastDone.job);
    setLastDone(null);
    load.reload();
  }
  async function fruit(c: Cycle, mm: number) { await api.orchardFruitSize(c.id, mm); load.reload(); }

  const today = mergeToday(all, active.map((c) => ({ c, jobs: load.data?.get(c.id)?.jobs ?? [] })));
  const beds = active.map((c) => load.data?.get(c.id)?.conditions ?? condOf.get(c.zone)).filter((b): b is BedConditions => Boolean(b));
  const alerts = beds.flatMap((b) => b.alerts);
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const water = all.reduce((s, a) => s + a.water.litres, 0);
  const full = all.reduce((s, a) => s + a.water.fullLitres, 0);
  // blocks the rover has been round today, not the age of its newest round: one fresh block must not make five look fresh
  const slots = roundPlan(active, "07:00", all, todayIso());
  const roundsToday = slots.filter((s) => s.doneAt).length;
  const missing = all.filter((a) => !a.surveyed);
  const simulated = all.some((a) => a.simulated);
  const found = problems(beds, all);
  const urgent = found.filter((p) => p.severity === "critical").length;
  const treesRead = all.reduce((s, a) => s + a.treesSeen, 0);
  const feedBlocks = all.filter((a) => a.feed.action === "feed").length;
  const tasks = today.filter((i) => i.kind === "job").length;

  return (
    <>
      <PageHead icon={Sun} title="Today" sub={longToday()}
                actions={<>
                  <span className="seg" role="group" aria-label="View">
                    <button type="button" className={view === "problems" ? "on" : ""} aria-pressed={view === "problems"} onClick={() => setView("problems")}>Problems</button>
                    <button type="button" className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>Full list</button>
                  </span>
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

        {active.length > 0 && view === "problems" && (
          <>
            <div className="steps3">
              <div className="st"><span className="st-n">1</span><div><b>Read</b><span>{advice.data === null ? "…" : `${treesRead} trees · ${roundsToday} of ${slots.length} blocks today`}</span></div></div>
              <div className="st"><span className="st-n">2</span><div><b>Find</b><span>{found.length} {found.length === 1 ? "problem" : "problems"}{urgent ? ` · ${urgent} urgent` : ""}</span></div></div>
              <div className="st"><span className="st-n">3</span><div><b>Act</b><span>Water {litres(water)}{feedBlocks ? ` · feed ${feedBlocks} ${feedBlocks === 1 ? "block" : "blocks"}` : ""}</span></div></div>
            </div>
            {advice.data === null || conditions.data === null ? <p className="muted">Loading…</p> : found.length === 0
              ? <Panel><Empty icon={Sprout}>No problems in this morning's readings.</Empty></Panel>
              : <div className="pgrid">{found.slice(0, CARDS).map((p) => <ProblemCard key={p.key} p={p} />)}</div>}
            <p className="small muted today-foot">
              {found.length > CARDS && <>{found.length - CARDS} more, and </>}{tasks} stage {tasks === 1 ? "task" : "tasks"} in the{" "}
              <button type="button" className="linkbtn" onClick={() => setView("list")}>full list</button>.
              {simulated && " From simulated rover rounds; starting rules, not field results. Nothing here opens a valve."}
            </p>
          </>
        )}

        {active.length > 0 && view === "list" && (
          <>
            <Kpis items={[
              { k: "Rover today", v: advice.data === null ? "—" : `${roundsToday} of ${slots.length} ${slots.length === 1 ? "block" : "blocks"}` },
              { k: "Water today", v: `${litres(water)} of ${litres(full)}` },
              { k: "Feed today", v: ((n) => `${n} ${n === 1 ? "block" : "blocks"}`)(all.filter((a) => a.feed.action === "feed").length) },
              { k: "Alerts", v: alerts.length === 0 ? "None" : `${alerts.length}${critical ? ` (${critical} critical)` : ""}` },
            ]} />
            {simulated && <p className="small muted">From simulated rover rounds. Starting rules, not field results. Nothing here opens a valve.</p>}
            {missing.length > 0 && <Notice kind="warn">No fresh round for {missing.map((a) => a.label).join(", ")}. <Link to="/rover">Run a round</Link> before acting on these.</Notice>}

            {lastDone && <DoneNote title={lastDone.title} onUndo={undoDone} />}
            {today.length > 0 && (
              <Panel title="What to do today" pad={false}>
                <div className="tablewrap">
                  <table className="tbl jobs-t">
                    <JobsHead bed />
                    <tbody>
                      {today.map((item) => item.kind === "todo"
                        ? <TodoRow key={item.key} a={item.a} t={item.t} />
                        : <JobRow key={item.key} j={item.j} urgent={item.urgent} bed={<BlockLink id={item.c.id} label={item.c.bedLabel} />}
                                  fruitMm={load.data?.get(item.c.id)?.fruitMm ?? null} onDone={(id) => jobDone(item.c, id, item.j.title)} onFruit={(mm) => fruit(item.c, mm)} />)}
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
