import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Notice } from "./ui";
import { api, type CondParam } from "../lib/api";
import { fmtValue, rangeText, trim, unitText } from "../lib/conditions";
import { useData } from "../lib/useData";

/** The nine readings, in the order of the ribbon. */
export const TREND_METRICS = ["soil_moisture", "soil_ph", "soil_ec", "soil_temperature", "nitrogen", "phosphorus",
  "potassium", "air_temperature", "air_humidity"];

export const RANGES = [{ hours: 24, label: "24 hours" }, { hours: 72, label: "3 days" }, { hours: 168, label: "7 days" }] as const;

const LINE = "#2563A8";          // the data blue, as on the Plan page's water chart
const BAND = "#2E7D4F";          // the target band is "good": the status green

type Pt = { t: number; v: number | null };

/** One metric as chart points. The line breaks only where the sensor was silent for a while (more than three
 *  buckets and at least 30 minutes), so a single empty bucket does not turn the line into dashes, and a real
 *  outage still shows as a gap instead of a straight line drawn across it. */
export function withGaps(points: { t: string; v: number }[], bucketSeconds: number): Pt[] {
  const gap = Math.max(3 * bucketSeconds, 1800) * 1000;
  const out: Pt[] = [];
  let prev: number | null = null;
  for (const p of points) {
    const t = new Date(p.t).getTime();
    if (prev !== null && t - prev > gap) out.push({ t: prev + (t - prev) / 2, v: null });
    out.push({ t, v: p.v });
    prev = t;
  }
  return out;
}

/** A domain that starts and ends on round numbers, with about `target` steps between: 50, 60, 70, 80, not 51.6, 66.6, 83.0. */
export function niceScale(min: number, max: number, target = 3): { domain: [number, number]; ticks: number[] } {
  const span = max - min || Math.abs(max) * 0.1 || 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;      // round up, so there are never more than about four steps
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { domain: [Number(lo.toFixed(10)), Number(hi.toFixed(10))], ticks };
}

const clock = (t: number, hours: number) =>
  new Date(t).toLocaleString("en-GB", hours <= 36 ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });
const stamp = (t: number) =>
  new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Tip({ active, payload, p }: { active?: boolean; payload?: { payload: Pt }[]; p: CondParam }) {
  const pt = active && payload?.length ? payload[0].payload : null;
  if (!pt || pt.v === null) return null;
  const u = unitText(p.unit);
  return (
    <div className="chart-tip">
      <b>{fmtValue({ value: pt.v, decimals: p.decimals })}{u ? ` ${u}` : ""}</b>
      <i />{p.label} · {stamp(pt.t)}
    </div>
  );
}

function Trend({ p, pts, hours, from, to }: { p: CondParam; pts: Pt[]; hours: number; from: number; to: number }) {
  const vals = pts.flatMap((x) => (x.v === null ? [] : [x.v]));
  const last = [...pts].reverse().find((x) => x.v !== null);
  const [lo, hi] = p.target ?? [undefined, undefined];
  const u = unitText(p.unit);

  let scale = niceScale(0, 1);
  if (vals.length) {
    const min = Math.min(...vals, ...(lo === undefined ? [] : [lo]));
    const max = Math.max(...vals, ...(hi === undefined ? [] : [hi]));
    const pad = (max - min || Math.abs(max) * 0.1 || 1) * 0.06;
    scale = niceScale(min - pad, max + pad);
  }

  return (
    <div className="trend">
      <div className="trend-head">
        <span className="trend-title">{p.label}</span>
        <span className="trend-now">{last ? fmtValue({ value: last.v, decimals: p.decimals }) : "—"}{u && <small>{u}</small>}</span>
      </div>
      {vals.length < 2 ? (
        <div className="trend-empty">Not enough readings in this period</div>
      ) : (
        <div style={{ height: 124 }} role="img"
             aria-label={`${p.label} over the last ${hours} hours, now ${fmtValue({ value: last?.v ?? null, decimals: p.decimals })} ${u}`}>
          <ResponsiveContainer>
            <LineChart data={pts} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              {lo !== undefined && hi !== undefined && <ReferenceArea y1={lo} y2={hi} fill={BAND} fillOpacity={0.1} />}
              <XAxis dataKey="t" type="number" scale="time" domain={[from, to]} minTickGap={36} padding={{ left: 12, right: 12 }}
                     tickFormatter={(t: number) => clock(t, hours)} tickLine={false} axisLine={{ stroke: "var(--line)" }}
                     tick={{ fontSize: 11, fill: "var(--ink-muted)" }} />
              <YAxis domain={scale.domain} ticks={scale.ticks} width={38} tickFormatter={trim} tickLine={false} axisLine={false}
                     tick={{ fontSize: 11, fill: "var(--ink-muted)" }} />
              <Tooltip content={<Tip p={p} />} cursor={{ stroke: "var(--line-strong)" }} isAnimationActive={false} />
              <Line type="monotone" dataKey="v" stroke={LINE} strokeWidth={2} dot={false} connectNulls={false}
                    activeDot={{ r: 4, fill: LINE, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
              {last && last.v !== null && <ReferenceDot x={last.t} y={last.v} r={4} fill={LINE} stroke="#fff" strokeWidth={2} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {rangeText(p) && <div className="trend-note">Shaded: today's target {rangeText(p)}{u ? ` ${u}` : ""}</div>}
    </div>
  );
}

/** Every reading of one bed over time: nine small charts that share one time window, with the same numbers as a table. */
export default function BedTrends({ zone, params, hours }: { zone: string; params: CondParam[]; hours: number }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const { data, error, loading } = useData(() => api.telemetry(zone, TREND_METRICS, hours), [zone, hours]);
  const byMetric = new Map(params.map((p) => [p.metric, p]));

  const from = data ? new Date(data.from).getTime() : 0;
  const to = data ? new Date(data.to).getTime() : 0;
  const pointsOf = (m: string) => (data ? withGaps(data.series[m] ?? [], data.bucketSeconds) : []);
  // the table: newest first, only the times where something arrived
  const times = data
    ? [...new Set(TREND_METRICS.flatMap((m) => (data.series[m] ?? []).map((p) => new Date(p.t).getTime())))].sort((a, b) => b - a)
    : [];
  const lookup = Object.fromEntries(TREND_METRICS.map((m) => [m, new Map((data?.series[m] ?? []).map((p) => [new Date(p.t).getTime(), p.v]))]));
  const bucket = data ? (data.bucketSeconds >= 3600 ? `${Math.round(data.bucketSeconds / 360) / 10} h` : `${Math.round(data.bucketSeconds / 60)} min`) : "";
  const head = (m: string) => {
    const p = byMetric.get(m);
    const u = p ? unitText(p.unit) : "";
    return p ? `${p.short}${u && !p.short.includes(u) ? ` (${u})` : ""}` : m;
  };

  return (
    <div className="trend-wrap">
      <div className="trend-bar">
        <span className="small muted">{data ? `Each point is the average of ${bucket}` : "Loading"}</span>
        <div className="seg" role="group" aria-label="Chart or table">
          <button type="button" className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>Chart</button>
          <button type="button" className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Table</button>
        </div>
      </div>
      {error && <Notice kind="alert">Cannot load the history ({error}).</Notice>}
      <div className={loading && data ? "is-loading" : ""}>
        {data && view === "chart" && (
          <div className="trend-grid">
            {TREND_METRICS.map((m) => {
              const p = byMetric.get(m);
              return p ? <Trend key={m} p={p} pts={pointsOf(m)} hours={hours} from={from} to={to} /> : null;
            })}
          </div>
        )}
        {data && view === "table" && (
          <div className="trend-table">
            {times.length === 0 ? <p className="trend-empty">No readings in this period</p> : (
              <table className="tbl">
                <thead>
                  <tr><th>Time</th>{TREND_METRICS.map((m) => <th key={m} className="r">{head(m)}</th>)}</tr>
                </thead>
                <tbody>
                  {times.map((t) => (
                    <tr key={t}>
                      <td className="nowrap">{stamp(t)}</td>
                      {TREND_METRICS.map((m) => {
                        const v = lookup[m].get(t);
                        const p = byMetric.get(m);
                        return <td key={m} className="r">{v === undefined || !p ? "—" : fmtValue({ value: v, decimals: p.decimals })}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
