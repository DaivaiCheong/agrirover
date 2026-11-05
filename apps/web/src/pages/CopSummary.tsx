import { Link } from "react-router-dom";
import { Empty, Notice, Panel, Toolbar } from "../components/ui";
import { api } from "../lib/api";
import { num, usd } from "../lib/format";
import { useData } from "../lib/useData";

export default function CopSummary() {
  const { data, error } = useData(async () => Promise.all((await api.cycles()).map((c) => api.cop(c.id))));
  const rows = data ?? [];

  return (
    <>
      <Toolbar><a className="btn btn-ghost btn-sm" href={api.copCsvUrl}>Download CSV</a></Toolbar>
      <main className="main stack">
        {error && <Notice kind="alert">{error}</Notice>}
        <Panel title="All cycles" pad={false}>
          {rows.length === 0 ? <Empty>No crops yet.</Empty> : (
            <div className="tablewrap"><table className="tbl">
              <thead><tr><th>Bed</th><th>Crop</th><th>Status</th><th className="r">Total cost</th><th className="r">Kg to sell</th>
                <th className="r">Cost per kg</th><th className="r">Profit</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cycle.id}>
                    <td><b>{r.cycle.bedLabel}</b></td><td>{r.cycle.cropName}</td>
                    <td>{r.open ? "Open" : <span className="muted">Closed</span>}</td>
                    <td className="r">{usd(r.totalCostUsd)}</td><td className="r">{num(r.kgMarketable, 1)}</td>
                    <td className="r"><b>{r.copPerKg === null ? "no harvest" : usd(r.copPerKg)}</b></td>
                    <td className="r">{r.marginUsd === null ? "—" : usd(r.marginUsd)}</td>
                    <td className="act"><Link className="linkbtn" to={`/cycles/${r.cycle.id}`}>Details</Link></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Panel>
      </main>
    </>
  );
}
