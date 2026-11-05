import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty, Kpis, Notice, Panel, Tag, Toolbar } from "../components/ui";
import { api } from "../lib/api";
import { cellName } from "../lib/rover";
import { useData } from "../lib/useData";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Trend({ data, name, unit }: { data: { t: string; v: number }[]; name: string; unit: string }) {
  const last = data[data.length - 1];
  return (
    <Panel title={name} pad={false} right={last ? <span className="small"><b>{last.v.toFixed(0)}{unit}</b> now</span> : undefined}>
      <div className="growth-chart" role="img" aria-label={`${name} over ${data.length} rounds, now ${last?.v.toFixed(0)}${unit}`}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 11 }} tickLine={false} minTickGap={40} axisLine={{ stroke: "var(--line)" }} />
            <YAxis tick={{ fontSize: 11 }} width={34} tickLine={false} axisLine={false} domain={[0, "auto"]} />
            <Tooltip formatter={(v: number) => [`${v.toFixed(1)}${unit}`, name]} />
            <Line type="linear" dataKey="v" stroke="var(--water)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/** Is each block doing what its stage should? Leaf cover and yellow leaves, round by round. */
export default function RoverGrowth() {
  const cycles = useData(api.cycles);
  const growing = (cycles.data ?? []).filter((c) => c.status === "active");
  const [picked, setPicked] = useState("");
  const zone = picked || growing[0]?.zone || "";
  const g = useData(() => (zone ? api.growth(zone) : Promise.resolve(null)), [zone]);
  const data = g.data;
  const s = data?.summary;
  const canopy = (data?.rounds ?? []).map((r) => ({ t: day(r.at), v: r.canopy * 100 }));
  const yellow = (data?.rounds ?? []).map((r) => ({ t: day(r.at), v: r.yellow * 100 }));

  return (
    <>
      <Toolbar>
        <select className="erp-select toolbar-select" aria-label="Block" value={zone} onChange={(e) => setPicked(e.target.value)}>
          {growing.map((c) => <option key={c.id} value={c.zone}>{c.bedLabel}</option>)}
        </select>
      </Toolbar>
      <main className="main stack">
        {g.error && <Notice kind="alert">{g.error}</Notice>}
        {data && (data.rounds.length === 0 ? <Panel><Empty>No completed rounds in the last 30 days.</Empty></Panel> : (
          <>
            <Kpis items={[
              { k: "Stage", v: data.stage },
              { k: "Verdict", v: s ? <Tag kind={s.verdict === "wip" ? undefined : s.verdict}>{s.word}</Tag> : "—" },
              { k: `Change over ${s?.overDays ?? 0} days`, v: s ? `${s.changePoints > 0 ? "+" : ""}${s.changePoints} points of leaf cover` : "—" },
              { k: "Rounds", v: data.rounds.length },
            ]} />
            {data.rounds.some((r) => r.simulated) && <p className="small muted">These rounds are simulated. Leaf cover here is a stand-in for what the side camera will measure.</p>}
            <div className="grid g2">
              <Trend data={canopy} name="Leaf cover" unit=" %" />
              <Trend data={yellow} name="Trees with yellow leaves" unit=" %" />
            </div>
            <Panel title="Trees that changed most" pad={false}>
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th>Tree</th><th className="r">First round %</th><th className="r">Now %</th><th className="r">Change</th></tr></thead>
                  <tbody>{data.trees.map((t) => (
                    <tr key={`${t.row}-${t.col}`}><td><b>{cellName(t.row, t.col)}</b></td><td className="r">{Math.round(t.first * 100)}</td><td className="r">{Math.round(t.now * 100)}</td><td className="r">{Math.round((t.now - t.first) * 100)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Every round" pad={false}>
              <div className="tablewrap rc-list">
                <table className="tbl">
                  <thead><tr><th>Date</th><th className="r">Leaf cover %</th><th className="r">Trees with yellow leaves %</th></tr></thead>
                  <tbody>{[...data.rounds].reverse().map((r) => (
                    <tr key={r.at}><td>{day(r.at)}</td><td className="r">{(r.canopy * 100).toFixed(1)}</td><td className="r">{(r.yellow * 100).toFixed(0)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Panel>
          </>
        ))}
      </main>
    </>
  );
}
