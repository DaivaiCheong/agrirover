import { useState } from "react";
import { CalendarDays, Droplets, FlaskConical, ListChecks, Bot } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import RoundSchedule from "../components/RoundSchedule";
import { Empty, ErrorNotice, Kpis, More, PageHead, Panel, Tag } from "../components/ui";
import type { ScheduleEvent } from "../lib/api";
import { useFarmFocus } from "../lib/farmContext";
import { dayMonth, litres, todayIso } from "../lib/format";
import { errorText, useAdvice, useCycles, useSchedule, useZones } from "../lib/queries";
import { roundPlan } from "../lib/rover";

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
  const { zone: focusZone, setZone } = useFarmFocus();
  const block = focusZone ?? "";
  const setBlock = (z: string) => setZone(z || null);
  const [kind, setKind] = useState<KindFilter>("");
  const plan = useSchedule(days);
  const cycles = useCycles();
  const advice = useAdvice();
  const zones = useZones();

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
  const scopedAdvice = activeAdvice.filter((a) => !block || a.zone === block);
  const adviceWater = scopedAdvice.reduce((s, a) => s + a.water.litres, 0);
  const adviceFull = scopedAdvice.reduce((s, a) => s + a.water.fullLitres, 0);
  const share = adviceFull > 0 && adviceWater > 0 ? adviceWater / adviceFull : null;
  const feedBlocks = [...new Set((scheduleData?.events ?? []).filter((e) => (!block || e.zone === block) && e.kind === "feed" && inWeek(e)).map((e) => e.label))];
  const holdBlocks = scopedAdvice.filter((a) => a.feed.action === "hold").map((a) => a.label);

  const chartData = dates.slice(0, 7).map((d, i) => {
    const precisionL = Math.round(blocks.reduce((s, b) => s + (b.water[i]?.litres ?? 0), 0) * 10) / 10;
    const blanketL = share ? Math.round(precisionL / share) : 0;
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
        title="Plan"
        sub="The rover's rounds, the drip water, feeds, care tasks and growth stages for the days ahead, from the latest rounds"
        actions={
          <>
            <select
              className="erp-select toolbar-select"
              aria-label="Block"
              value={block}
              onChange={(e) => setBlock(e.target.value)}
            >
              <option value="">All blocks</option>
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
        {pageError && <ErrorNotice error={errorText(pageError)} onRetry={() => plan.refetch()} />}
        <Kpis
          loading={plan.isPending}
          items={[
            {
              k: "Rover", icon: Bot,
              v: `Daily at ${scheduleData?.roundTime ?? "—"} · ${totalBlockCount} ${totalBlockCount === 1 ? "block" : "blocks"}`,
              d: `${slots.filter((s) => s.doneAt).length} of ${slots.length} rounds done today`,
            },
            {
              k: "Water, next 7 days", icon: Droplets, tone: "info",
              v: `~${litres(weekWater)}`,
              d: share ? `${Math.round((1 - share) * 100)}% less than a blanket schedule` : "Needs a rover round",
            },
            {
              k: "Feeds, next 7 days", icon: FlaskConical, tone: feeds ? "warn" : "ok",
              v: feeds > 0 ? `${feeds}` : "None",
              d: feeds > 0 ? feedBlocks.join(", ") : holdBlocks.length ? `Nitrogen is in range: holding on ${holdBlocks.length} block${holdBlocks.length === 1 ? "" : "s"}` : "",
            },
            {
              k: "Care tasks, next 7 days", icon: ListChecks, tone: careTasks ? "warn" : undefined,
              v: `${careTasks}`,
              d: "From the plants the rover flagged",
            },
          ]}
        />

        <RoundSchedule plan={slots} totalBlocks={totalBlockCount} />

        <Panel
          title="Water, litres a day"
          pad={false}
          right={<span className="small muted">Today from the last round; later days follow the crop's stage</span>}
        >
          {blocks.length === 0 ? (
            <Empty>{plan.isPending ? "Loading…" : "No water plan: no growing crop here has a rover round yet."}</Empty>
          ) : (
            <>
              <div className="panel-pad" style={{ paddingBottom: 8 }}>
                <div style={{ width: "100%", height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e7dd" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#5a6b60" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#5a6b60" }} width={42} unit=" L" />
                      <Tooltip formatter={(val: number, name: string) => [`${val} L`, name === "precisionL" ? "Precision drip" : "Blanket schedule"]} />
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
                            ) : c.kind === "hold" ? (
                              <Tag kind="info">Rain</Tag>
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
