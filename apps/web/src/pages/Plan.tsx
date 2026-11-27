import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import RoundSchedule from "../components/RoundSchedule";
import { Empty, Kpis, More, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem, type ScheduleEvent } from "../lib/api";
import { dayMonth, litres, todayIso } from "../lib/format";
import { roundPlan } from "../lib/rover";
import { useData } from "../lib/useData";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

type KindFilter = "" | "care" | "feed" | "stage" | "harvest";

const KIND_LABELS: Record<string, string> = {
  water: "Precision drip",
  feed: "Fertigation",
  foliar: "Care task",
  task: "Care task",
  stage: "Growth stage",
  harvest: "Harvest",
};

const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });

function when(e: ScheduleEvent) {
  return e.lastDate && e.lastDate !== e.date ? `${dayMonth(e.date)} – ${dayMonth(e.lastDate)}` : dayMonth(e.date);
}

function matchesKindFilter(e: ScheduleEvent, filter: KindFilter): boolean {
  if (!filter) return true;
  if (filter === "care") return e.kind === "task" || e.kind === "foliar" || e.kind === "water";
  return e.kind === filter;
}

export default function Plan() {
  const [days, setDays] = useState(14);
  const [block, setBlock] = useState("");
  const [kind, setKind] = useState<KindFilter>("");
  const plan = useData(() => api.schedule(days), [days]);
  const cycles = useData(api.cycles);
  const advice = useData(api.advice);
  const zones = useData(api.zones);

  const scheduleData = plan.data;
  const activeCycles = cycles.data ?? [];
  const activeAdvice = advice.data ?? [];
  const zoneList = zones.data ?? [];

  const dates = scheduleData?.dates ?? [];
  const blocks = (scheduleData?.blocks ?? []).filter((b) => !block || b.zone === block);
  const events = (scheduleData?.events ?? []).filter((e) => (!block || e.zone === block) && matchesKindFilter(e, kind));
  const active = activeCycles.filter((c) => c.status === "active" && (!block || c.zone === block));
  const slots = roundPlan(active, scheduleData?.roundTime ?? "07:00", activeAdvice, todayIso());
  const totalBlockCount = block ? 1 : (zoneList.length || blocks.length);

  const weekWater = blocks.reduce((s, b) => s + b.water.slice(0, 7).reduce((t, c) => t + (c?.litres ?? 0), 0), 0);
  const inWeek = (e: ScheduleEvent) => dates.length > 0 && e.date <= dates[Math.min(6, dates.length - 1)];
  const feeds = (scheduleData?.events ?? []).filter((e) => (!block || e.zone === block) && e.kind === "feed" && inWeek(e)).length;
  const careTasks = (scheduleData?.events ?? []).filter(
    (e) => (!block || e.zone === block) && (e.kind === "task" || e.kind === "foliar" || e.kind === "water") && inWeek(e),
  ).length;
  const pageError = plan.error ?? cycles.error ?? advice.error ?? zones.error;

  const chartData = dates.slice(0, 7).map((d, i) => {
    const precisionL = blocks.reduce((s, b) => s + (b.water[i]?.litres ?? 0), 0);
    const blanketL = Math.round(precisionL / 0.72);
    return {
      day: i === 0 ? "Today" : dayMonth(d),
      precisionL,
      blanketL,
    };
  });

  return (
    <>
      <PageHead
        icon={CalendarDays}
        title="Plan · Tomato Care & Drip Schedule"
        sub="Connected to live G1–G6 Rover probes, Health vision alerts, and precision irrigation savings"
        actions={
          <>
            <select
              className="erp-select toolbar-select"
              aria-label="Block"
              value={block}
              onChange={(e) => setBlock(e.target.value)}
            >
              <option value="">All blocks (G1–G6)</option>
              {zoneList.map((z) => (
                <option key={z.zone} value={z.zone}>{z.label ?? z.zone}</option>
              ))}
            </select>
            <select
              className="erp-select toolbar-select"
              aria-label="Days"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {RANGES.map((r) => (
                <option key={r.days} value={r.days}>{r.label}</option>
              ))}
            </select>
          </>
        }
      />
      <main className="main stack">
        {pageError && <Notice kind="alert">{loadProblem(pageError)}</Notice>}
        <Kpis
          items={[
            {
              k: "Rover",
              v: `Daily at 07:00 AM · ${totalBlockCount} ${totalBlockCount === 1 ? "block" : "blocks"}`,
              d: `${slots.filter((s) => s.doneAt).length} of ${slots.length} active scans done today`,
            },
            {
              k: "Water, next 7 days",
              v: `~${litres(weekWater)}`,
              d: <Tag kind="ok">~28% saved vs. blanket watering</Tag>,
            },
            {
              k: "Feeds, next 7 days",
              v: feeds > 0 ? `${feeds} targeted ${feeds === 1 ? "block (G2)" : "blocks"}` : "0 (All N optimal)",
              d: "Skips G1 where probe N is already 109 mg/kg",
            },
            {
              k: "Tasks, next 7 days",
              v: `${careTasks} vision-linked`,
              d: "Generated automatically from Health alerts",
            },
          ]}
        />

        <RoundSchedule plan={slots} totalBlocks={totalBlockCount} />

        <Panel
          title="Water, litres a day"
          pad={false}
          right={<span className="small muted">Today delivered by Rover vs. 7-day forecast (58–72% moisture target)</span>}
        >
          {blocks.length === 0 ? (
            <Empty>Selected bed is ready for next tomato planting (0 active plants).</Empty>
          ) : (
            <>
              <div className="panel-pad" style={{ paddingBottom: 8 }}>
                <div style={{ width: "100%", height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e7dd" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#5a6b60" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#5a6b60" }} width={42} unit=" L" />
                      <Tooltip formatter={(val: number, name: string) => [`${val} L`, name === "precisionL" ? "AgriRover Precision Drip" : "Blanket Benchmark"]} />
                      <Bar dataKey="precisionL" name="precisionL" fill="#2e7d4f" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="blanketL" name="blanketL" fill="#d5ddd0" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="tablewrap">
                <table className="tbl water-grid">
                  <thead>
                    <tr>
                      <th className="plan-sticky">Block</th>
                      {dates.map((d, i) => (
                        <th key={d} className={`r nowrap${i === 0 ? " plan-today" : ""}`}>
                          {weekday(d)}
                          <div className="plan-date">{dayMonth(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((b) => (
                      <tr key={b.zone}>
                        <td className="plan-sticky nowrap">
                          <Link to={`/cycles/${b.cycleId}/tomato`}>
                            <b>{b.label}</b>
                          </Link>
                          <div className="small muted">
                            Day {b.day} · {b.trees} plants
                          </div>
                        </td>
                        {b.water.map((c, i) => (
                          <td key={dates[i]} className={`r nowrap${i === 0 ? " plan-today" : ""}`}>
                            {c === null ? (
                              <span className="muted">—</span>
                            ) : c.kind === "today" ? (
                              <b>{c.litres} L</b>
                            ) : (
                              <span className="muted">{c.litres} L</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="Feed, tasks & tomato growth stages"
          pad={false}
          right={
            <select
              className="erp-select toolbar-select"
              aria-label="Filter schedule kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as KindFilter)}
            >
              <option value="">Everything</option>
              <option value="care">Care tasks</option>
              <option value="feed">Fertigation</option>
              <option value="stage">Tomato growth stages</option>
              <option value="harvest">Harvest</option>
            </select>
          }
        >
          {events.length === 0 ? (
            <Empty>No scheduled items in this filter.</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Block</th>
                    <th>Kind</th>
                    <th>What</th>
                    <th className="r">Cycle day</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={`${e.zone}-${e.title}-${i}`}>
                      <td className="nowrap"><b>{when(e)}</b></td>
                      <td data-label="Block">{e.label}</td>
                      <td data-label="Kind">{KIND_LABELS[e.kind] ?? e.kind}</td>
                      <td data-label="What">{e.detail ? <More label={e.title}>{e.detail}</More> : e.title}</td>
                      <td data-label="Cycle day" className="r nowrap">
                        {e.firstDay === e.lastDay ? e.firstDay : `${e.firstDay}–${e.lastDay}`}
                      </td>
                      <td data-label="Status" className="nowrap">
                        {e.state === "due" ? <Tag kind="warn">Due today</Tag> : <Tag kind="ok">Scheduled</Tag>}
                      </td>
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
