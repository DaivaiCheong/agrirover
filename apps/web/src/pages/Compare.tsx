import { useState } from "react";
import { GitCompare } from "lucide-react";
import { Empty, EF, ErrorNotice, Panel } from "../components/ui";
import type { Cop } from "../lib/api";
import { cycleLabel, num, usd } from "../lib/format";
import { errorText, useCompare, useCycles } from "../lib/queries";

type Row = { label: string; get: (c: Cop) => number | null; fmt: (v: number | null) => string; lowerIsBetter?: boolean };

const ROWS: Row[] = [
  { label: "Total cost", get: (c) => c.totalCostUsd, fmt: (v) => usd(v), lowerIsBetter: true },
  { label: "Budget (workbook)", get: (c) => c.budgetUsd, fmt: (v) => usd(v) },
  { label: "Plants", get: (c) => c.cycle.plantCount, fmt: (v) => num(v, 0) },
  { label: "Marketable kg", get: (c) => c.kgMarketable, fmt: (v) => num(v, 1) },
  { label: "Cost per kg", get: (c) => c.copPerKg, fmt: (v) => usd(v, 3), lowerIsBetter: true },
  { label: "Cost per plant", get: (c) => c.costPerPlant, fmt: (v) => usd(v, 3), lowerIsBetter: true },
  { label: "Cost per m²", get: (c) => c.costPerM2, fmt: (v) => usd(v, 3), lowerIsBetter: true },
  { label: "Water (plan, m³)", get: (c) => c.waterM3, fmt: (v) => num(v, 2) },
  { label: "Revenue", get: (c) => c.revenueUsd, fmt: (v) => usd(v) },
  { label: "Profit", get: (c) => c.marginUsd, fmt: (v) => usd(v) },
];

/** Two crops side by side, from their records. A difference is a record, not a cause. */
export default function Compare() {
  const cycles = useCycles();
  const list = cycles.data ?? [];
  const guided = list.find((c) => c.trialArm === "guided");
  const usual = list.find((c) => c.trialArm === "usual");
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const first = a ?? guided?.id ?? list[0]?.id ?? "";
  const second = b ?? usual?.id ?? list.find((c) => c.id !== first)?.id ?? "";
  const cmp = useCompare(first, second);
  const r = cmp.data;

  return (
    <main className="main stack">
      {list.length < 2 ? (
        <Empty icon={GitCompare}>{cycles.isPending ? "Loading…" : "Comparing needs at least two crops."}</Empty>
      ) : (
        <>
          <section className="panel panel-pad">
            <div className="erp-grid-2">
              <EF label="First crop">
                <select className="erp-select" value={first} onChange={(e) => setA(e.target.value)}>
                  {list.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}{c.trialArm ? ` · ${c.trialArm}` : ""}</option>)}
                </select>
              </EF>
              <EF label="Second crop">
                <select className="erp-select" value={second} onChange={(e) => setB(e.target.value)}>
                  {list.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}{c.trialArm ? ` · ${c.trialArm}` : ""}</option>)}
                </select>
              </EF>
            </div>
          </section>
          {first === second && <Empty>Choose two different crops.</Empty>}
          {cmp.error && <ErrorNotice error={errorText(cmp.error)} onRetry={() => cmp.refetch()} />}
          {r && (
            <Panel title="Side by side" icon={GitCompare} pad={false} right={<span className="small muted">Costs so far for open crops</span>}>
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th /><th className="r">{r.a.cycle.bedLabel}</th><th className="r">{r.b.cycle.bedLabel}</th><th className="r">First − second</th></tr></thead>
                  <tbody>
                    {ROWS.map((row) => {
                      const x = row.get(r.a), y = row.get(r.b);
                      const better = x === null || y === null || x === y || row.lowerIsBetter === undefined ? null
                        : (x < y) === row.lowerIsBetter ? "first" : "second";
                      return (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td className="r">{better === "first" ? <b>{row.fmt(x)}</b> : row.fmt(x)}</td>
                          <td className="r">{better === "second" ? <b>{row.fmt(y)}</b> : row.fmt(y)}</td>
                          <td className="r muted">{x === null || y === null ? "—" : row.fmt(x - y)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {r && [r.a, r.b].some((c) => c.flags.length > 0) && (
            <Panel title="Not counted, or estimated">
              <div className="grid g2">
                {[r.a, r.b].map((c) => (
                  <div key={c.cycle.id}>
                    <b>{c.cycle.bedLabel}</b>
                    <ul className="flaglist">{c.flags.map((f) => <li key={f}>{f}</li>)}</ul>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </main>
  );
}
