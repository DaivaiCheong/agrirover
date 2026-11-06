import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Empty, Kpis, Notice, Panel, Toolbar } from "../components/ui";
import { api, loadProblem } from "../lib/api";
import { num, usd } from "../lib/format";
import { useData } from "../lib/useData";

const range = (low: number, high: number) => `${usd(low, 0)} – ${usd(high, 0)}`;

/** The farm's money at a glance, block by block: what was spent and earned, set against what the setup could earn. */
export default function Finance() {
  const report = useData(async () => {
    const cycles = (await api.cycles()).filter((c) => c.status === "active");
    return { reports: await Promise.all(cycles.map((c) => api.cop(c.id))), stock: await api.stockItems(), assets: await api.assets() };
  });
  const rows = report.data?.reports ?? [];
  // each block's total already holds its share of whole-farm costs and equipment wear, so these are not added again
  const spent = rows.reduce((s, r) => s + r.totalCostUsd, 0);
  const sales = rows.reduce((s, r) => s + r.revenueUsd, 0);
  const low = rows.reduce((s, r) => s + (r.cycle.forecast?.revenueLowUsd ?? 0), 0);
  const high = rows.reduce((s, r) => s + (r.cycle.forecast?.revenueHighUsd ?? 0), 0);
  const stock = (report.data?.stock ?? []).reduce((s, i) => s + i.valueUsd, 0);
  const equipment = (report.data?.assets ?? []).filter((a) => a.status === "in_service").reduce((s, a) => s + a.costUsd, 0);

  const kinds = new Map<string, number>();
  rows.forEach((r) => r.lines.forEach((l) => kinds.set(l.label, (kinds.get(l.label) ?? 0) + l.amountUsd)));
  const byKind = [...kinds.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  // $0.00 and "Nothing is growing" before the figures arrive read as an empty farm, so wait visibly
  const waiting = report.data === null ? (report.error ? "Could not be loaded just now." : "Loading…") : undefined;
  const money = (v: number) => (waiting ? "—" : usd(v));

  return (
    <>
      <Toolbar>
        <a className="btn btn-ghost btn-sm" href={api.copCsvUrl}>Download CSV</a>
        <Link className="btn btn-ghost btn-sm" to="/harvest">Record harvest or sale</Link>
        <Link className="btn btn-sm" to="/costs"><Plus size={16} aria-hidden />Add cost</Link>
      </Toolbar>
      <main className="main stack">
        {report.error && <Notice kind="alert">{loadProblem(report.error)}</Notice>}
        <Kpis items={[
          { k: "Spent this cycle", v: money(spent) },
          { k: "Sales this cycle", v: money(sales) },
          { k: "Balance", v: money(sales - spent) },
          { k: "Possible sales a year", v: rows.length ? range(low, high) : "—" },
          ...(stock + equipment > 0 ? [{ k: "Stock and equipment", v: usd(stock + equipment) }] : []),
        ]} />

        <Panel title="By block" pad={false} right={<span className="small muted">Possible sales: the guava document's yields and prices, not checked</span>}>
          {waiting ? <p className="panel-pad muted">{waiting}</p> : rows.length === 0 ? <Empty>Nothing is growing yet.</Empty> : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>Block</th><th className="r">Day</th><th className="r">Spent</th><th className="r">Harvested</th><th className="r">Sales</th><th className="r">Balance</th><th className="r">Possible sales a year</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.cycle.id}>
                      <td><Link to={`/cycles/${r.cycle.id}`}><b>{r.cycle.bedLabel}</b></Link><div className="small muted">{r.cycle.variety ?? r.cycle.cropName} · {r.cycle.plantCount} trees</div></td>
                      <td data-label="Day" className="r">{r.cycle.day}</td>
                      <td data-label="Spent" className="r">{usd(r.totalCostUsd)}</td>
                      <td data-label="Harvested" className="r nowrap">{num(r.kgTotal, 1)} kg</td>
                      <td data-label="Sales" className="r">{usd(r.revenueUsd)}</td>
                      <td data-label="Balance" className="r">{usd(r.revenueUsd - r.totalCostUsd)}</td>
                      <td data-label="Possible sales a year" className="r nowrap">{r.cycle.forecast?.revenueLowUsd != null && r.cycle.forecast.revenueHighUsd != null ? range(r.cycle.forecast.revenueLowUsd, r.cycle.forecast.revenueHighUsd) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Costs by kind" pad={false}>
          {waiting ? <p className="panel-pad muted">{waiting}</p> : byKind.length === 0 ? <Empty>No costs recorded yet.</Empty> : (
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Kind</th><th className="r">Amount</th><th className="r">Share</th></tr></thead>
                <tbody>
                  {byKind.map(([label, amount]) => <tr key={label}><td>{label}</td><td className="r">{usd(amount)}</td><td className="r">{spent ? Math.round((amount / spent) * 100) : 0} %</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
    </>
  );
}
