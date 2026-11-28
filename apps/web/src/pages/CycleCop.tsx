import { Calculator, ChevronLeft, Download, ReceiptText, Sprout, Wheat } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Empty, ErrorNotice, Kpis, PageHead, PageSkeleton, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { num, riel, usd } from "../lib/format";
import { errorText, useCop } from "../lib/queries";

/** One crop's cost of production: what the records say, beside the budget the Finance workbook set for it. */
export default function CycleCop() {
  const { id = "" } = useParams();
  const cop = useCop(id);
  const r = cop.data;
  const c = r?.cycle;

  if (cop.isPending) return <PageSkeleton rows={2} />;

  const budgetPct = r?.budgetUsd ? Math.round((r.totalCostUsd / r.budgetUsd) * 100) : null;
  return (
    <>
      <PageHead
        icon={Calculator}
        title={c ? `${c.bedLabel} · cost report` : "Cost report"}
        sub={c ? `${c.cropName}${c.variety ? ` (${c.variety})` : ""} · planted ${c.plantedOn}${c.status === "closed" ? `, closed ${c.endedOn} (final)` : `, day ${c.day} (costs so far)`}` : undefined}
        actions={
          <>
            <Link className="btn btn-ghost btn-sm" to="/cop"><ChevronLeft size={16} aria-hidden />By block</Link>
            {c && <Link className="btn btn-ghost btn-sm" to={`/cycles/${c.id}/tomato`}><Sprout size={15} aria-hidden />Crop</Link>}
            <Link className="btn btn-ghost btn-sm" to="/costs"><ReceiptText size={15} aria-hidden />Add a cost</Link>
            <a className="btn btn-ghost btn-sm" href={api.copCsvUrl}><Download size={15} aria-hidden />All crops CSV</a>
          </>
        }
      />
      <main className="main stack">
        {cop.error && <ErrorNotice error={errorText(cop.error)} onRetry={() => cop.refetch()} />}
        {r && c && (
          <>
            <Kpis
              items={[
                { k: "Cost so far", v: usd(r.totalCostUsd), tone: budgetPct !== null && budgetPct > 100 ? "warn" : undefined,
                  d: `${riel(r.totalCostUsd, r.khrPerUsd)} · ${usd(r.loggedUsd)} recorded, ${usd(r.allocatedUsd)} equipment & land${r.estimateUsd ? `, ${usd(r.estimateUsd)} estimated` : ""}` },
                { k: "Budget (workbook)", v: r.budgetUsd !== null ? usd(r.budgetUsd) : "—",
                  d: budgetPct !== null ? `${budgetPct}% used · ${usd(r.budgetPerPlantUsd, 3)} a plant` : "No plant count" },
                { k: "Harvested", icon: Wheat, v: `${num(r.kgMarketable, 1)} kg`,
                  d: r.expectedKg ? `marketable, of ${num(r.expectedKg, 1)} kg expected` : `${num(r.kgTotal, 1)} kg picked` },
                { k: r.copPerKg !== null ? "Cost per kg" : "Break-even price", tone: "info",
                  v: r.copPerKg !== null ? usd(r.copPerKg, 3) : r.breakEvenPricePerKg !== null ? usd(r.breakEvenPricePerKg, 3) : "—",
                  d: r.copPerKg !== null ? `per marketable kg harvested` : r.expectedKg ? `if it yields ${num(r.expectedKg, 0)} kg` : "" },
              ]}
            />

            <div className="grid g32">
              <Panel title="Costs by category" pad={false} right={<Link className="linkbtn small" to="/costs">Cost ledger →</Link>}>
                {r.lines.length === 0 ? (
                  <Empty>No cost recorded for this crop yet. <Link to="/costs">Add one</Link>, or use stock on it in Farm › Stock.</Empty>
                ) : (
                  <table className="tbl">
                    <thead><tr><th>Category</th><th className="r">USD</th><th>Share</th></tr></thead>
                    <tbody>
                      {r.lines.map((l) => (
                        <tr key={l.category}>
                          <td>{l.label}{l.estimate && <> <Tag>Estimate</Tag></>}</td>
                          <td className="r"><b className={l.estimate ? "est" : undefined}>{usd(l.amountUsd)}</b></td>
                          <td>
                            <div className="share">
                              <div className="bar"><i style={{ width: `${Math.min(100, l.sharePct)}%` }} /></div>
                              <span className="mono-sm">{num(l.sharePct, 0)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr><td><b>Total</b></td><td className="r"><b>{usd(r.totalCostUsd)}</b></td><td /></tr>
                    </tbody>
                  </table>
                )}
              </Panel>

              <Panel title="Per unit" pad={false}>
                <table className="tbl">
                  <tbody>
                    <tr><td>Cost per plant</td><td className="r"><b>{usd(r.costPerPlant, 3)}</b><div className="small muted">budget {usd(r.budgetPerPlantUsd, 3)} · standard farming {usd(r.standardPerPlantUsd, 3)}</div></td></tr>
                    <tr><td>Cost per m²</td><td className="r"><b>{usd(r.costPerM2, 3)}</b></td></tr>
                    <tr><td>Revenue</td><td className="r"><b>{usd(r.revenueUsd)}</b></td></tr>
                    <tr><td>Profit so far</td><td className="r"><b>{r.marginUsd === null ? "—" : usd(r.marginUsd)}</b>{r.marginUsd === null && <div className="small muted">no sale yet</div>}</td></tr>
                    <tr><td>Water (plan)</td><td className="r"><b>{r.waterM3 === null ? "—" : `${num(r.waterM3, 2)} m³`}</b>{r.kgPerM3Water !== null && <div className="small muted">{num(r.kgPerM3Water, 1)} kg a m³</div>}</td></tr>
                    {r.costPerKgIfBenchmark && (
                      <tr><td>Cost per kg at the benchmark yield</td><td className="r"><b>{usd(r.costPerKgIfBenchmark.atHighYield, 3)} – {usd(r.costPerKgIfBenchmark.atLowYield, 3)}</b></td></tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            </div>

            {c.forecast && (
              <Panel title="Expected harvest" icon={Wheat} pad={false} right={<span className="small muted">{c.setupLabel} · {c.forecast.basis}</span>}>
                <div className="tablewrap">
                  <table className="tbl">
                    <thead><tr><th /><th className="r">Expected</th><th className="r">{r.open ? "So far" : "Final"}</th></tr></thead>
                    <tbody>
                      <tr><td>Harvest</td><td className="r"><b>{num(c.forecast.kgLow, 0)}–{num(c.forecast.kgHigh, 0)} kg</b></td><td className="r"><b>{num(r.kgTotal, 1)} kg</b></td></tr>
                      <tr>
                        <td>Revenue at {usd(c.forecast.pricePerKgUsd)}/kg</td>
                        <td className="r">{c.forecast.revenueLowUsd === null || c.forecast.revenueHighUsd === null ? "—" : <b>{usd(c.forecast.revenueLowUsd, 0)}–{usd(c.forecast.revenueHighUsd, 0)}</b>}</td>
                        <td className="r"><b>{usd(r.revenueUsd)}</b></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {r.flags.length > 0 && (
              <Panel title="Read this with the numbers">
                <ul className="flaglist">{r.flags.map((f) => <li key={f}>{f.charAt(0).toUpperCase() + f.slice(1)}.</li>)}</ul>
              </Panel>
            )}
          </>
        )}
      </main>
    </>
  );
}
