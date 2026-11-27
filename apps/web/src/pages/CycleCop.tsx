import { useMemo } from "react";
import { Calculator, ChevronLeft, Wheat } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { SyncBadge } from "../components/SampleNotice";
import { Empty, Metric, PageHead, Panel, Tag } from "../components/ui";
import { api, type Cop } from "../lib/api";
import { num, riel, usd } from "../lib/format";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import { buildAllBlockEconomics, KHR_PER_USD, UNIT_TOTAL_COST_USD } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";

export default function CycleCop() {
  const { id = "" } = useParams();
  const { data: cop, error } = useData(() => api.cop(id), [id]);
  const demo = useMemo(() => buildDemoTomatoFarm(), []);
  const previewMode = Boolean(error && !cop);

  const fallbackCop = useMemo<Cop | null>(() => {
    if (!previewMode) return null;
    const cycle = demo.cycles.find((c) => c.id === id || c.zone === id) ?? demo.cycles[0];
    if (!cycle) return null;
    const { blocks } = buildAllBlockEconomics({
      cycles: demo.cycles,
      zones: demo.zones,
      conditions: demo.conditions,
      roundsByZone: demo.roundsByZone,
    });
    const b = blocks.find((x) => x.zone === cycle.zone);
    if (!b) return null;
    const hs = demo.harvestsByZone.get(cycle.zone) ?? [];
    const ss = demo.salesByZone.get(cycle.zone) ?? [];
    const kgTotal = hs.reduce((s, h) => s + h.kgTotal, 0);
    const kgMarketable = hs.reduce((s, h) => s + h.kgMarketable, 0);
    const kgHome = hs.reduce((s, h) => s + h.kgHome, 0);
    const kgLost = hs.reduce((s, h) => s + h.kgLost, 0);
    const revenueUsd = ss.reduce((s, x) => s + x.amountUsd, 0);
    const lines = [
      { category: "seed", label: "Seedlings, Substrate & Scouting Labor", amountUsd: Number((b.plantCount * 0.41).toFixed(2)), sharePct: 50, estimate: false },
      { category: "fertilizer", label: "Fertilizers & Soil Amendments", amountUsd: Number((b.plantCount * 0.187).toFixed(2)), sharePct: 23, estimate: false },
      { category: "water_energy", label: "Precision Drip Water & Pump Power", amountUsd: Number((b.plantCount * 0.133).toFixed(2)), sharePct: 16, estimate: false },
      { category: "pesticide", label: "Targeted Bio-Treatments", amountUsd: Number((b.plantCount * 0.09).toFixed(2)), sharePct: 11, estimate: false },
    ];
    return {
      cycle,
      currency: "USD",
      khrPerUsd: KHR_PER_USD,
      lines,
      totalCostUsd: b.budgetUsd,
      days: cycle.day ?? 45,
      open: cycle.status === "active",
      kgTotal,
      kgMarketable,
      kgHome,
      kgLost,
      revenueUsd,
      marginUsd: revenueUsd > 0 ? Number((revenueUsd - b.spentToDateUsd).toFixed(2)) : null,
      copPerKg: kgMarketable > 0 ? Number((b.spentToDateUsd / kgMarketable).toFixed(2)) : null,
      breakEvenPricePerKg: b.expectedYieldKg > 0 ? Number((b.budgetUsd / b.expectedYieldKg).toFixed(2)) : null,
      costPerPlant: b.costPerPlantUsd,
      costPerM2: b.areaM2 > 0 ? Number((b.budgetUsd / b.areaM2).toFixed(3)) : null,
      kgPerM3Water: b.waterCycleL > 0 && kgTotal > 0 ? Number((kgTotal / (b.waterCycleL / 1000)).toFixed(1)) : null,
      waterM3: Number((b.waterCycleL / 1000).toFixed(2)),
      costPerKgIfBenchmark: b.expectedYieldKg > 0
        ? { atLowYield: Number((b.budgetUsd / (b.plantCount * 4.2)).toFixed(2)), atHighYield: Number((b.budgetUsd / (b.plantCount * 4.8)).toFixed(2)) }
        : null,
      flags: [],
    };
  }, [previewMode, demo, id]);

  const report = cop ?? fallbackCop;
  const c = report?.cycle;

  return (
    <>
      <PageHead
        icon={Calculator}
        title={c ? c.bedLabel : "Block Cost Report"}
        sub={c ? `${c.cropName}${c.variety ? ` (${c.variety})` : ""} · planted ${c.plantedOn}${c.status === "closed" ? `, closed ${c.endedOn}` : `, day ${c.day}`}` : undefined}
        actions={
          <>
            {previewMode && <SyncBadge />}
            <Link className="btn btn-ghost btn-sm" to="/cop"><ChevronLeft size={16} aria-hidden />Block Breakdown</Link>
            <Link className="btn btn-ghost btn-sm" to="/finance">Unit Cost Optimizer</Link>
          </>
        }
      />
      <main className="main stack">
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
