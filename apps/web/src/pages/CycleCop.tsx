import { Calculator, ChevronLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Empty, Metric, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { num, riel, usd } from "../lib/format";
import { useData } from "../lib/useData";

export default function CycleCop() {
  const { id = "" } = useParams();
  const { data: cop, error } = useData(() => api.cop(id), [id]);
  const c = cop?.cycle;

  return (
    <>
      <PageHead icon={Calculator} title={c ? c.bedLabel : "Cost report"}
                sub={c ? `${c.cropName} · planted ${c.plantedOn}${c.status === "closed" ? `, closed ${c.endedOn}` : `, day ${c.day}`}` : undefined}
                actions={<>
                  <Link className="btn btn-ghost btn-sm" to="/cop"><ChevronLeft size={16} aria-hidden />All crops</Link>
                  <Link className="btn btn-ghost btn-sm" to="/costs">Add a cost</Link>
                  <Link className="btn btn-ghost btn-sm" to="/harvest">Add harvest or sale</Link>
                </>} />
      <main className="main stack">
        {error && <Notice kind="alert">{error}</Notice>}
        {cop && (
          <>
            <div className="grid g4">
              <div className="panel panel-pad">
                <div className="lbl">Cost of production per kg</div>
                <div className="big" style={{ marginTop: 10 }}>{cop.copPerKg === null ? "—" : usd(cop.copPerKg)}</div>
                <div className="mono-sm" style={{ marginTop: 8, color: "var(--ink-muted)" }}>
                  {cop.copPerKg === null ? "No harvest yet" : `${riel(cop.copPerKg, cop.khrPerUsd)} · also the break-even price`}
                </div>
              </div>
              <Metric label="Total cost" value={usd(cop.totalCostUsd)} note={`${cop.days} days${cop.open ? " so far" : ""}`} />
              <Metric label="Marketable" value={num(cop.kgMarketable, 1)} unit="kg"
                      note={`${num(cop.kgLost, 1)} kg lost · ${num(cop.kgHome, 1)} kg at home`} />
              <Metric label="Profit" value={cop.marginUsd === null ? "—" : usd(cop.marginUsd)}
                      note={cop.marginUsd === null ? "No sales yet" : `${usd(cop.revenueUsd)} sold`} />
            </div>

            <div className="grid g32">
              <Panel title="Where the money went" pad={false}>
                {cop.lines.length === 0 ? <Empty>No costs recorded for this cycle yet.</Empty> : (
                  <table className="tbl">
                    <thead><tr><th>Cost</th><th className="r">USD</th><th>Share</th></tr></thead>
                    <tbody>
                      {cop.lines.map((l) => (
                        <tr key={l.category}>
                          <td>{l.label}{l.estimate && <> <Tag kind="warn">Estimate</Tag></>}</td>
                          <td className="r"><b>{usd(l.amountUsd)}</b></td>
                          <td><div className="share"><div className="bar"><i style={{ width: `${Math.min(100, l.sharePct)}%` }} /></div>
                            <span className="mono-sm">{num(l.sharePct, 0)}%</span></div></td>
                        </tr>
                      ))}
                      <tr><td><b>Total</b></td><td className="r"><b>{usd(cop.totalCostUsd)}</b></td><td /></tr>
                    </tbody>
                  </table>
                )}
              </Panel>

              <div className="stack">
                <Panel title="Per unit">
                  <table className="tbl"><tbody>
                    <tr><td>Cost per plant</td><td className="r"><b>{cop.costPerPlant === null ? "—" : usd(cop.costPerPlant, 3)}</b></td></tr>
                    <tr><td>Cost per m²</td><td className="r"><b>{cop.costPerM2 === null ? "—" : usd(cop.costPerM2, 3)}</b></td></tr>
                    <tr><td>Water used (planner estimate)</td><td className="r"><b>{cop.waterM3 === null ? "—" : `${num(cop.waterM3, 2)} m³`}</b></td></tr>
                    <tr><td>Kg per m³ of water</td><td className="r"><b>{cop.kgPerM3Water === null ? "—" : num(cop.kgPerM3Water, 1)}</b></td></tr>
                  </tbody></table>
                </Panel>
                {cop.flags.length > 0 && (
                  <Panel title="Read this before using the number">
                    <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
                      {cop.flags.map((f) => <li key={f}>{f.charAt(0).toUpperCase() + f.slice(1)}.</li>)}
                    </ul>
                  </Panel>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
