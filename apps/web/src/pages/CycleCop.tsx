import { Calculator, ChevronLeft, Wheat } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import SampleNotice from "../components/SampleNotice";
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
                sub={c ? `${c.cropName} · ${c.perennial ? "cycle started" : "planted"} ${c.plantedOn}${c.status === "closed" ? `, closed ${c.endedOn}` : `, day ${c.day}`}` : undefined}
                actions={<>
                  <Link className="btn btn-ghost btn-sm" to="/cop"><ChevronLeft size={16} aria-hidden />All blocks</Link>
                  <Link className="btn btn-ghost btn-sm" to="/costs">Add a cost</Link>
                  <Link className="btn btn-ghost btn-sm" to="/harvest">Add harvest or sale</Link>
                </>} />
      <main className="main stack">
        {error && <Notice kind="alert">{error}</Notice>}
        <SampleNotice inMain />
        {cop && (
          <>
            <div className="grid g4">
              <div className="panel panel-pad metric">
                <div className="lbl">Cost per kg</div>
                <div className="v" style={{ marginTop: 10 }}>{cop.copPerKg === null ? "—" : usd(cop.copPerKg)}</div>
                <div className="d">
                  {cop.copPerKg === null ? "No harvest yet" : `${riel(cop.copPerKg, cop.khrPerUsd)} · break-even`}
                </div>
              </div>
              <Metric label="Total cost" value={usd(cop.totalCostUsd)} note={`${cop.days} days${cop.open ? " so far" : ""}`} />
              <Metric label="Marketable" value={num(cop.kgMarketable, 1)} unit="kg"
                      note={`${num(cop.kgLost, 1)} kg lost · ${num(cop.kgHome, 1)} kg at home`} />
              <Metric label="Profit" value={cop.marginUsd === null ? "—" : usd(cop.marginUsd)}
                      note={cop.marginUsd === null ? "No sales yet" : `${usd(cop.revenueUsd)} sold`} />
            </div>

            {c?.forecast && (
              <Panel title="Expected harvest" icon={Wheat} pad={false}
                     right={<span className="small muted">{c.setupLabel} · {c.forecast.plants.toLocaleString()} {c.perennial ? "trees" : "plants"}{c.perennial ? " · per year" : ""}</span>}>
                <div className="tablewrap">
                  <table className="tbl">
                    <thead>
                      <tr><th /><th className="r">Setup benchmark</th><th className="r">{cop.open ? "So far" : "Final"}</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Harvest</td>
                        <td className="r"><b>{num(c.forecast.kgLow, 0)}–{num(c.forecast.kgHigh, 0)} kg</b></td>
                        <td className="r">
                          <b>{num(cop.kgTotal, 1)} kg</b>
                          {c.forecast.kgLow > 0 && <div className="mono-sm muted">{num((100 * cop.kgTotal) / c.forecast.kgLow, 0)}% of the low end</div>}
                        </td>
                      </tr>
                      <tr>
                        <td>Revenue</td>
                        <td className="r">
                          {c.forecast.revenueLowUsd === null || c.forecast.revenueHighUsd === null
                            ? <span className="muted">No price set</span>
                            : <b>{usd(c.forecast.revenueLowUsd, 0)}–{usd(c.forecast.revenueHighUsd, 0)}</b>}
                          {c.forecast.pricePerKgUsd !== null && <div className="mono-sm muted">at {usd(c.forecast.pricePerKgUsd)} a kg</div>}
                        </td>
                        <td className="r"><b>{usd(cop.revenueUsd)}</b></td>
                      </tr>
                      <tr>
                        <td>Cost per kg</td>
                        <td className="r">
                          {cop.costPerKgIfBenchmark
                            ? <><b>{usd(cop.costPerKgIfBenchmark.atHighYield)}–{usd(cop.costPerKgIfBenchmark.atLowYield)}</b>
                                <div className="mono-sm muted">at the benchmark, costs so far</div></>
                            : <span className="muted">Needs a recorded cost</span>}
                        </td>
                        <td className="r"><b>{cop.copPerKg === null ? "—" : usd(cop.copPerKg)}</b></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            <div className="grid g32">
              <Panel title="Costs by kind" pad={false}>
                {cop.lines.length === 0 ? <Empty>No costs recorded for this cycle yet.</Empty> : (
                  <table className="tbl">
                    <thead><tr><th>Cost</th><th className="r">USD</th><th>Share</th></tr></thead>
                    <tbody>
                      {cop.lines.map((l) => (
                        <tr key={l.category}>
                          <td>{l.label}{l.estimate && <> <Tag>Estimate</Tag></>}</td>
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
                <Panel title="Per unit" pad={false}>
                  <table className="tbl"><tbody>
                    <tr><td>Cost per {c?.perennial ? "tree" : "plant"}</td><td className="r"><b>{cop.costPerPlant === null ? "—" : usd(cop.costPerPlant, 3)}</b></td></tr>
                    {c?.perennial && (
                      <tr><td>Labour share of cost</td><td className="r"><b>{num(cop.lines.filter((l) => l.category.startsWith("labour")).reduce((s, l) => s + l.sharePct, 0), 0)} %</b></td></tr>
                    )}
                    <tr><td>Cost per m²</td><td className="r"><b>{cop.costPerM2 === null ? "—" : usd(cop.costPerM2, 3)}</b></td></tr>
                    <tr><td>Water used (planner estimate)</td><td className="r"><b>{cop.waterM3 === null ? "—" : `${num(cop.waterM3, 2)} m³`}</b></td></tr>
                    <tr><td>Kg per m³ of water</td><td className="r"><b>{cop.kgPerM3Water === null ? "—" : num(cop.kgPerM3Water, 1)}</b></td></tr>
                  </tbody></table>
                </Panel>
                {cop.flags.length > 0 && (
                  <Panel title="Not counted in this number">
                    <ul className="flaglist">
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
