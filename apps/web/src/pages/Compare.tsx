import { useEffect, useState } from "react";
import { Empty, Field, Notice, Panel } from "../components/ui";
import { api, type Cop } from "../lib/api";
import { cycleLabel, num, usd } from "../lib/format";
import { useData } from "../lib/useData";

type Row = { label: string; get: (c: Cop) => number | null; fmt: (v: number | null) => string };

const ROWS: Row[] = [
  { label: "Total cost", get: (c) => c.totalCostUsd, fmt: (v) => usd(v) },
  { label: "Marketable kg", get: (c) => c.kgMarketable, fmt: (v) => num(v, 1) },
  { label: "Cost per kg", get: (c) => c.copPerKg, fmt: (v) => usd(v, 3) },
  { label: "Cost per plant", get: (c) => c.costPerPlant, fmt: (v) => usd(v, 3) },
  { label: "Cost per m²", get: (c) => c.costPerM2, fmt: (v) => usd(v, 3) },
  { label: "Water used (planner estimate, m³)", get: (c) => c.waterM3, fmt: (v) => num(v, 2) },
  { label: "Revenue", get: (c) => c.revenueUsd, fmt: (v) => usd(v) },
  { label: "Profit", get: (c) => c.marginUsd, fmt: (v) => usd(v) },
];

export default function Compare() {
  const cycles = useData(api.cycles);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  // start with a guided bed against a usual bed, when the farm has them
  useEffect(() => {
    const cs = cycles.data;
    if (!cs || a || b) return;
    const guided = cs.find((c) => c.trialArm === "guided");
    const usual = cs.find((c) => c.trialArm === "usual");
    setA(guided?.id ?? cs[0]?.id ?? "");
    setB(usual?.id ?? cs[1]?.id ?? "");
  }, [cycles.data, a, b]);

  const both = a && b && a !== b;
  const cmp = useData(() => (both ? api.compare(a, b) : Promise.resolve(null)), [a, b]);
  const r = cmp.data;

  return (
    <>
      <main className="main stack" style={{ paddingTop: 12 }}>
        {(cycles.data ?? []).length < 2 ? <Empty>Needs at least two crops.</Empty> : (
          <>
            <div className="row2">
              <Field label="First"><select value={a} onChange={(e) => setA(e.target.value)}>
                {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}{c.trialArm ? ` · ${c.trialArm}` : ""}</option>)}</select></Field>
              <Field label="Second"><select value={b} onChange={(e) => setB(e.target.value)}>
                {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}{c.trialArm ? ` · ${c.trialArm}` : ""}</option>)}</select></Field>
            </div>
            {!both && <Notice>Choose two different crops.</Notice>}
            {cmp.error && <Notice kind="alert">{cmp.error}</Notice>}
            {r && (
              <Panel title="Result" pad={false} right={<span className="small muted">Records, not causes</span>}>
                <table className="tbl">
                  <thead><tr><th /><th className="r">{r.a.cycle.bedLabel}</th><th className="r">{r.b.cycle.bedLabel}</th><th className="r">First − second</th></tr></thead>
                  <tbody>
                    {ROWS.map((row) => {
                      const x = row.get(r.a), y = row.get(r.b);
                      return (
                        <tr key={row.label}>
                          <td>{row.label}</td><td className="r">{row.fmt(x)}</td><td className="r">{row.fmt(y)}</td>
                          <td className="r">{x === null || y === null ? "—" : row.fmt(x - y)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            )}
            {r && [r.a, r.b].some((c) => c.flags.length > 0) && (
              <Panel title="Not counted">
                {[r.a, r.b].map((c) => (
                  <div key={c.cycle.id} style={{ marginBottom: 10 }}>
                    <b>{c.cycle.bedLabel}</b>
                    <ul className="flaglist">{c.flags.map((f) => <li key={f}>{f}</li>)}</ul>
                  </div>
                ))}
              </Panel>
            )}
          </>
        )}
      </main>
    </>
  );
}
