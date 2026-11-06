import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import RoundSchedule from "../components/RoundSchedule";
import { Empty, Kpis, More, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem, type ScheduleEvent } from "../lib/api";
import { dayMonth, litres, todayIso } from "../lib/format";
import { roundPlan } from "../lib/rover";
import { useData } from "../lib/useData";

const RANGES = [{ days: 7, label: "7 days" }, { days: 14, label: "14 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }];
const KINDS: Record<string, string> = { feed: "Feed", foliar: "Foliar spray", water: "Water", test: "Leaf test", fruit: "Fruit", harvest: "Harvest", stage: "Stage", task: "Task" };
const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });

function when(e: ScheduleEvent) {
  return e.lastDate && e.lastDate !== e.date ? `${dayMonth(e.date)} – ${dayMonth(e.lastDate)}` : dayMonth(e.date);
}

export default function Plan() {
  const [days, setDays] = useState(14);
  const [block, setBlock] = useState("");
  const [kind, setKind] = useState("");
  const plan = useData(() => api.schedule(days), [days]);
  const cycles = useData(api.cycles);
  const advice = useData(api.advice);

  const dates = plan.data?.dates ?? [];
  const blocks = (plan.data?.blocks ?? []).filter((b) => !block || b.zone === block);
  const events = (plan.data?.events ?? []).filter((e) => (!block || e.zone === block) && (!kind || e.kind === kind));
  const active = (cycles.data ?? []).filter((c) => c.status === "active" && (!block || c.zone === block));
  const slots = roundPlan(active, plan.data?.roundTime ?? "07:00", advice.data ?? [], todayIso());
  const weekWater = blocks.reduce((s, b) => s + b.water.slice(0, 7).reduce((t, c) => t + (c?.litres ?? 0), 0), 0);
  const inWeek = (e: ScheduleEvent) => dates.length > 0 && e.date <= dates[Math.min(6, dates.length - 1)];
  const feeds = events.filter((e) => e.title.startsWith("Feed:") && inWeek(e)).length;
  const tasks = events.filter((e) => e.kind !== "stage" && !e.title.startsWith("Feed:") && inWeek(e)).length;
  const late = events.filter((e) => e.state === "overdue").length;
  // until the plan, blocks and round are in, say so: an empty table here reads as an empty farm
  const failed = plan.error || cycles.error || advice.error;
  const waiting = plan.data === null || cycles.data === null || advice.data === null
    ? (failed ? "Could not be loaded just now." : "Loading…") : undefined;
  const planWait = plan.data === null ? (plan.error ? "Could not be loaded just now." : "Loading…") : undefined;

  return (
    <>
      <PageHead icon={CalendarDays} title="Plan" sub="Rover, water, feed and tasks by date"
                actions={<>
                  <select className="erp-select toolbar-select" aria-label="Block" value={block} onChange={(e) => setBlock(e.target.value)}>
                    <option value="">All blocks</option>
                    {(plan.data?.blocks ?? []).map((b) => <option key={b.zone} value={b.zone}>{b.label}</option>)}
                  </select>
                  <select className="erp-select toolbar-select" aria-label="Days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
                  </select>
                </>} />
      <main className="main stack">
        {plan.error && <Notice kind="alert">{loadProblem(plan.error)}</Notice>}
        <Kpis items={[
          { k: "Rover", v: waiting ? "—" : `${slots.filter((s) => s.doneAt).length} of ${slots.length} ${slots.length === 1 ? "block" : "blocks"} today` },
          { k: "Water, next 7 days", v: planWait ? "—" : `Up to ${litres(weekWater)}` },
          { k: "Feeds, next 7 days", v: planWait ? "—" : feeds },
          { k: "Tasks, next 7 days", v: planWait ? "—" : late ? `${tasks} (${late} late)` : tasks },
        ]} />
        <p className="small muted">Planned from each block's start date. Nothing here opens a valve. Doses are starting figures: ask an agronomist.</p>

        <RoundSchedule plan={slots} waiting={waiting} />

        <Panel title="Water, litres a day" pad={false} right={<span className="small muted">Today from the round. Later days: the most it could need</span>}>
          {planWait ? <p className="panel-pad muted">{planWait}</p> : blocks.length === 0 ? <Empty>Nothing is growing yet.</Empty> : (
            <div className="tablewrap">
              <table className="tbl water-grid">
                <thead>
                  <tr>
                    <th className="plan-sticky">Block</th>
                    {dates.map((d, i) => <th key={d} className={`r nowrap${i === 0 ? " plan-today" : ""}`}>{weekday(d)}<div className="plan-date">{dayMonth(d)}</div></th>)}
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((b) => (
                    <tr key={b.zone}>
                      <td className="plan-sticky nowrap"><Link to={`/cycles/${b.cycleId}/orchard`}><b>{b.label}</b></Link><div className="small muted">Day {b.day} · {b.stage}</div></td>
                      {b.water.map((c, i) => (
                        <td key={dates[i]} className={`r nowrap${i === 0 ? " plan-today" : ""}`}>
                          {c === null ? <span className="muted">—</span>
                            : c.kind === "hold" ? <span className="muted" title="Held on purpose: stress">Hold</span>
                            : c.kind === "today" ? <b>{c.litres}</b>
                            : c.kind === "priming" ? <span title="Priming irrigation">{c.litres} <Tag>Prime</Tag></span>
                            : <span className="muted">≤ {c.litres}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Feed, tasks and stages" pad={false}
               right={<select className="erp-select toolbar-select" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                 <option value="">Everything</option>
                 {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
               </select>}>
          {planWait ? <p className="panel-pad muted">{planWait}</p> : events.length === 0 ? <Empty>Nothing dated in this range.</Empty> : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>When</th><th>Block</th><th>Kind</th><th>What</th><th className="r">Cycle day</th><th>Status</th></tr></thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={`${e.zone}-${e.title}-${i}`}>
                      <td className="nowrap"><b>{when(e)}</b></td>
                      <td data-label="Block">{e.label}</td>
                      <td data-label="Kind">{KINDS[e.kind] ?? e.kind}</td>
                      <td data-label="What">{e.detail ? <More label={e.title}>{e.detail}</More> : e.title}{e.confirm && <> <Tag>Ask an agronomist</Tag></>}</td>
                      <td data-label="Cycle day" className="r nowrap">{e.firstDay === e.lastDay ? e.firstDay : `${e.firstDay}–${e.lastDay}`}</td>
                      <td data-label="Status" className="nowrap">{e.state === "overdue" ? <Tag kind="alert">Late</Tag> : e.state === "due" ? <Tag kind="info">Due</Tag> : <span className="muted">Planned</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
    </>
  );
}
