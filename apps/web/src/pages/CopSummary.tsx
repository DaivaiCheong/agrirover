import { Link } from "react-router-dom";
import { Empty, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { num, usd } from "../lib/format";
import { useData } from "../lib/useData";

export default function CopSummary() {
  const { data, error } = useData(async () => Promise.all((await api.cycles()).map((c) => api.cop(c.id))));
  const rows = data ?? [];

  return (
    <>
      <PageHead crumb="COST OF PRODUCTION" kicker="WHAT ONE KILO REALLY COSTS, FOR EVERY CROP CYCLE" title="COST OF PRODUCTION"
                actions={<a className="btn btn-ghost btn-sm" href={api.copCsvUrl}>Download CSV</a>} />
      <main className="main stack">
        {error && <Notice kind="alert">{error}</Notice>}
        <Panel title="ALL CYCLES" pad={false}>
          {rows.length === 0 ? <Empty>No crop cycles yet. Start one under Crop cycles.</Empty> : (
            <table className="tbl">
              <thead><tr><th>BED</th><th>CROP</th><th>STATUS</th><th className="r">TOTAL COST</th><th className="r">KG TO SELL</th>
                <th className="r">COST PER KG</th><th className="r">PROFIT</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cycle.id}>
                    <td><b>{r.cycle.bedLabel}</b></td><td>{r.cycle.cropName}</td>
                    <td>{r.open ? <Tag kind="ok">OPEN</Tag> : <Tag>CLOSED</Tag>}</td>
                    <td className="r">{usd(r.totalCostUsd)}</td><td className="r">{num(r.kgMarketable, 1)}</td>
                    <td className="r"><b>{r.copPerKg === null ? "no harvest" : usd(r.copPerKg)}</b></td>
                    <td className="r">{r.marginUsd === null ? "—" : usd(r.marginUsd)}</td>
                    <td className="act"><Link className="linkbtn" to={`/cycles/${r.cycle.id}`}>Details</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Notice>Open the details of a cycle to see where the money went and what the number leaves out.</Notice>
      </main>
    </>
  );
}
