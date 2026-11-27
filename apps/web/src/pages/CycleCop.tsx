import { Calculator, ChevronLeft, Wheat } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Empty, Metric, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem } from "../lib/api";
import { num, riel, usd } from "../lib/format";
import { UNIT_TOTAL_COST_USD } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";

export default function CycleCop() {
  const { id = "" } = useParams();
  const { data: report, error } = useData(() => api.cop(id), [id]);
  const c = report?.cycle;

  return (
    <>
      <PageHead
        icon={Calculator}
        title={c ? c.bedLabel : "Block Cost Report"}
        sub={c ? `${c.cropName}${c.variety ? ` (${c.variety})` : ""} · planted ${c.plantedOn}${c.status === "closed" ? `, closed ${c.endedOn}` : `, day ${c.day}`}` : undefined}
        actions={
          <>
            <Link className="btn btn-ghost btn-sm" to="/cop"><ChevronLeft size={16} aria-hidden />Block Breakdown</Link>
            <Link className="btn btn-ghost btn-sm" to="/finance">Unit Cost Optimizer</Link>
          </>
        }
      />
      <main className="main stack">
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}
        {report && (
          <>
            <div className="grid g4">
              <div className="panel panel-pad metric">
                <div className="lbl">Break-even / kg</div>
                <div className="v" style={{ marginTop: 10 }}>
                  {report.breakEvenPricePerKg !== null ? usd(report.breakEvenPricePerKg) : report.copPerKg !== null ? usd(report.copPerKg) : "—"}
                </div>
                <div className="d">
                  {report.breakEvenPricePerKg !== null
                    ? `${riel(report.breakEvenPricePerKg, report.khrPerUsd)} · target @ 4.5 kg/plant`
                    : "Precision cycle budget"}
                </div>
              </div>
              <Metric label="Cycle Budget Cost" value={usd(report.totalCostUsd)} note={`${riel(report.totalCostUsd, report.khrPerUsd)} · ${c?.plantCount ?? 0} plants`} />
              <Metric label="Expected / Logged Harvest" value={num(c?.forecast?.kgMid ?? report.kgMarketable, 1)} unit="kg"
                note={`${num(report.kgTotal, 1)} kg picked so far`} />
              <Metric label="Cost per tomato plant" value={report.costPerPlant === null ? "—" : usd(report.costPerPlant, 2)}
                note={`${riel(report.costPerPlant ?? UNIT_TOTAL_COST_USD, report.khrPerUsd)} per plant`} />
            </div>

            {c?.forecast && (
              <Panel
                title="Expected Tomato Harvest & Benchmark"
                icon={Wheat}
                pad={false}
                right={<span className="small muted">{c.setupLabel} · {c.forecast.plants.toLocaleString()} tomato plants</span>}
              >
                <div className="tablewrap">
                  <table className="tbl">
                    <thead>
                      <tr><th /><th className="r">Tomato Benchmark</th><th className="r">{report.open ? "Logged So Far" : "Final"}</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Harvest</td>
                        <td className="r"><b>{num(c.forecast.kgLow, 0)}–{num(c.forecast.kgHigh, 0)} kg</b></td>
                        <td className="r"><b>{num(report.kgTotal, 1)} kg</b></td>
                      </tr>
                      <tr>
                        <td>Revenue (@ $0.80/kg)</td>
                        <td className="r">
                          {c.forecast.revenueLowUsd === null || c.forecast.revenueHighUsd === null
                            ? <span className="muted">—</span>
                            : <b>{usd(c.forecast.revenueLowUsd, 0)}–{usd(c.forecast.revenueHighUsd, 0)}</b>}
                        </td>
                        <td className="r"><b>{usd(report.revenueUsd)}</b></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            <div className="grid g32">
              <Panel title="Costs by Category" pad={false}>
                {report.lines.length === 0 ? (
                  <Empty>No costs recorded for this cycle yet.</Empty>
                ) : (
                  <table className="tbl">
                    <thead><tr><th>Category</th><th className="r">USD</th><th>Share</th></tr></thead>
                    <tbody>
                      {report.lines.map((l) => (
                        <tr key={l.category}>
                          <td>{l.label}{l.estimate && <> <Tag>Estimate</Tag></>}</td>
                          <td className="r"><b>{usd(l.amountUsd)}</b></td>
                          <td>
                            <div className="share">
                              <div className="bar"><i style={{ width: `${Math.min(100, l.sharePct)}%` }} /></div>
                              <span className="mono-sm">{num(l.sharePct, 0)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr><td><b>Total Cycle Budget</b></td><td className="r"><b>{usd(report.totalCostUsd)}</b></td><td /></tr>
                    </tbody>
                  </table>
                )}
              </Panel>

              <Panel title="Per Unit Metrics" pad={false}>
                <table className="tbl">
                  <tbody>
                    <tr><td>Cost per tomato plant</td><td className="r"><b>{report.costPerPlant === null ? "—" : usd(report.costPerPlant, 2)}</b></td></tr>
                    <tr><td>Cost per m²</td><td className="r"><b>{report.costPerM2 === null ? "—" : usd(report.costPerM2, 3)}</b></td></tr>
                    <tr><td>Cycle drip budget</td><td className="r"><b>{report.waterM3 === null ? "—" : `${num(report.waterM3, 2)} m³`}</b></td></tr>
                  </tbody>
                </table>
              </Panel>
            </div>
          </>
        )}
      </main>
    </>
  );
}
