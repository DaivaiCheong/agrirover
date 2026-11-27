import { useMemo, useState } from "react";
import { ArrowRight, Calculator, Droplets, ShieldCheck, Sprout, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { SyncBadge } from "../components/SampleNotice";
import { Kpis, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { num } from "../lib/format";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import {
  buildAllBlockEconomics,
  computeFinanceView,
  usdAndRiel,
  type FinanceScale,
} from "../lib/tomatoFinance";
import { useData } from "../lib/useData";

export default function Finance() {
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const conditions = useData(api.conditions);
  const surveys = useData(api.surveys);

  const previewMode = Boolean((zones.error && zones.data === null) || (cycles.error && cycles.data === null));
  const demo = useMemo(() => buildDemoTomatoFarm(), []);

  const [scale, setScale] = useState<FinanceScale>("plant");
  const [selectedZone, setSelectedZone] = useState("g1");

  const activeZones = previewMode ? demo.zones : (zones.data ?? demo.zones);
  const activeCycles = previewMode ? demo.cycles : (cycles.data ?? demo.cycles);
  const activeConds = previewMode ? demo.conditions : (conditions.data ?? demo.conditions);
  const surveyList = previewMode ? demo.surveys : (surveys.data ?? []);

  const liveRoundIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of surveyList) {
      if ((s.status === "completed" || s.status === "aborted") && !map.has(s.zone)) {
        map.set(s.zone, s.id);
      }
    }
    return map;
  }, [surveyList]);

  const roundKey = [...liveRoundIds.values()].join(",");
  const fetchedRounds = useData(async () => {
    if (previewMode || !roundKey) return new Map();
    const pairs = await Promise.all([...liveRoundIds.entries()].map(async ([z, id]) => [z, await api.survey(id)] as const));
    return new Map(pairs);
  }, [previewMode, roundKey]);

  const roundsByZone = useMemo(() => {
    if (previewMode) return demo.roundsByZone;
    const map = new Map(demo.roundsByZone);
    fetchedRounds.data?.forEach((v, k) => map.set(k, v));
    return map;
  }, [previewMode, demo.roundsByZone, fetchedRounds.data]);

  const { blocks, allRows } = useMemo(
    () =>
      buildAllBlockEconomics({
        cycles: activeCycles,
        zones: activeZones,
        conditions: activeConds,
        roundsByZone,
      }),
    [activeCycles, activeZones, activeConds, roundsByZone],
  );

  const report = useMemo(
    () => computeFinanceView({ scale, selectedZone, blocks, allRows }),
    [scale, selectedZone, blocks, allRows],
  );

  const marginPct =
    report.projectedRevenueUsd > 0 ? Math.round((report.projectedProfitUsd / report.projectedRevenueUsd) * 100) : 0;

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      <Panel
        title="Cost to Grow Tomato Plants & Savings Optimizer"
        icon={Calculator}
        pad={false}
        right={
          <div className="rv-right">
            <SyncBadge />
            <span className="small muted">USD ($ ) &amp; Cambodian Riel (៛)</span>
          </div>
        }
      >
        <div className="rv-action-bar">
          <div className="seg" role="group" aria-label="View cost scale">
            <button
              type="button"
              className={scale === "plant" ? "on" : ""}
              onClick={() => setScale("plant")}
            >
              1 Tomato Plant
            </button>
            <button
              type="button"
              className={scale === "block" ? "on" : ""}
              onClick={() => setScale("block")}
            >
              Selected Block (G1–G6)
            </button>
            <button
              type="button"
              className={scale === "farm" ? "on" : ""}
              onClick={() => setScale("farm")}
            >
              Whole Farm ({blocks.reduce((s, b) => s + b.plantCount, 0)} Plants)
            </button>
          </div>

          {scale === "block" && (
            <select
              className="erp-select toolbar-select"
              aria-label="Choose tomato block"
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
            >
              {blocks.map((b) => (
                <option key={b.zone} value={b.zone}>
                  {b.label} ({b.plantCount} plants)
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="panel-pad stack">
          <p className="small muted" style={{ margin: 0 }}>
            Showing unit economics for <b>{report.scopeTitle}</b>. Live water usage, soil NPK nutrient holds, and
            spot-treatment savings sync automatically from Rover and Health.
          </p>

          <Kpis
            items={[
              {
                k: scale === "plant" ? "Operation cost / plant" : "Total operation cost",
                v: `$${report.totalCostUsd.toFixed(2)}`,
                d: `~${Math.round(report.totalCostRiel).toLocaleString()} ៛`,
              },
              {
                k: "Traditional farming",
                v: `$${report.traditionalCostUsd.toFixed(2)}`,
                d: `~${Math.round(report.traditionalCostRiel).toLocaleString()} ៛`,
              },
              {
                k: "Cost saved with AgriRover",
                v: `$${report.totalSavedUsd.toFixed(2)} (${report.savedPct}%)`,
                d: `~${Math.round(report.totalSavedRiel).toLocaleString()} ៛ saved`,
              },
              {
                k: scale === "plant" ? "Net profit / plant" : "Projected net profit",
                v: `$${report.projectedProfitUsd.toFixed(2)}`,
                d: `~${Math.round(report.projectedProfitRiel).toLocaleString()} ៛ · ${marginPct}% margin`,
              },
            ]}
          />
        </div>

        <div className="tablewrap">
          <table className="tbl fold">
            <thead>
              <tr>
                <th>Operation Input Category</th>
                <th className="r">AgriRover Precision</th>
                <th className="r">Traditional Method</th>
                <th className="r">Savings</th>
                <th className="r">Reduction</th>
              </tr>
            </thead>
            <tbody>
              {report.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <b>{line.label}</b>
                    <div className="small muted">{line.note}</div>
                  </td>
                  <td data-label="AgriRover" className="r nowrap">
                    <b>{usdAndRiel(line.roverUsd, line.roverRiel)}</b>
                  </td>
                  <td data-label="Traditional" className="r nowrap muted">
                    {usdAndRiel(line.traditionalUsd, line.traditionalRiel)}
                  </td>
                  <td data-label="Savings" className="r nowrap">
                    <b className="rv-save-num">{usdAndRiel(line.savedUsd, line.savedRiel)}</b>
                  </td>
                  <td data-label="Reduction" className="r nowrap">
                    <Tag kind="ok">{line.savedPct}% saved</Tag>
                  </td>
                </tr>
              ))}
              <tr className="rv-total-row">
                <td>
                  <b>Total Operation Cost ({report.plantCount === 1 ? "per Tomato Plant" : `${report.plantCount} Plants`})</b>
                  <div className="small muted">
                    Water budget: ~{num(report.waterCycleL, 0)} L / cycle ({num(report.waterTodayL, 1)} L logged today)
                  </div>
                </td>
                <td className="r nowrap">
                  <b>{usdAndRiel(report.totalCostUsd, report.totalCostRiel)}</b>
                </td>
                <td className="r nowrap muted">
                  {usdAndRiel(report.traditionalCostUsd, report.traditionalCostRiel)}
                </td>
                <td className="r nowrap">
                  <b className="rv-save-num">{usdAndRiel(report.totalSavedUsd, report.totalSavedRiel)}</b>
                </td>
                <td className="r nowrap">
                  <Tag kind="ok">{report.savedPct}% saved</Tag>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid g2">
        <Panel title="Projected Yield & Net Profit" icon={TrendingUp}>
          <div className="stack">
            <div className="ts-grid rv-fin-metrics">
              <div className="ts-item">
                <span className="ts-k">Expected yield</span>
                <span className="ts-v">{num(report.expectedYieldKg, 1)} kg</span>
                <span className="ts-t">~4.5 kg per tomato plant</span>
              </div>
              <div className="ts-item">
                <span className="ts-k">Projected revenue</span>
                <span className="ts-v">${report.projectedRevenueUsd.toFixed(2)}</span>
                <span className="ts-t">~{Math.round(report.projectedRevenueRiel).toLocaleString()} ៛ (@ $0.80/kg)</span>
              </div>
              <div className="ts-item">
                <span className="ts-k">Operation cost</span>
                <span className="ts-v">${report.totalCostUsd.toFixed(2)}</span>
                <span className="ts-t">~{Math.round(report.totalCostRiel).toLocaleString()} ៛ total</span>
              </div>
              <div className="ts-item rv-profit-tile">
                <span className="ts-k">Net profit</span>
                <span className="ts-v">${report.projectedProfitUsd.toFixed(2)}</span>
                <span className="ts-t">~{Math.round(report.projectedProfitRiel).toLocaleString()} ៛ net</span>
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              <Droplets size={13} aria-hidden style={{ verticalAlign: "middle", marginRight: 4 }} />
              Precision drip via Rover delivers ~115 L/plant across the cycle while cutting unnecessary water &amp; fertilizer passes.
            </p>
          </div>
        </Panel>

        <Panel
          title="Risk Reduction & Crop Loss Prevention"
          icon={ShieldCheck}
          right={
            <Link className="linkbtn small rowflex" style={{ gap: 4 }} to="/crop">
              Open Health gallery <ArrowRight size={13} aria-hidden />
            </Link>
          }
        >
          <div className="stack">
            <div className="rv-loss-banner">
              <div>
                <span className="ts-k">Estimated Crop Loss Prevented</span>
                <div className="rv-loss-val">{usdAndRiel(report.preventedLossUsd, report.preventedLossRiel)}</div>
                <span className="small muted">
                  {report.scale === "plant"
                    ? "Catching stress early protects ~4.5 kg harvest value on a plant"
                    : `${report.visionAlertCount} active tomato disease/pest alerts caught early in Health before spreading`}
                </span>
              </div>
              <Tag kind={report.visionAlertCount > 0 ? "warn" : "ok"}>
                {report.visionAlertCount} live alerts tracked
              </Tag>
            </div>

            {report.alerts.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                <Sprout size={14} aria-hidden style={{ verticalAlign: "middle", marginRight: 4 }} />
                Zero active vision disease alerts in this scope — full canopy healthy.
              </p>
            ) : (
              <div className="rv-alert-chips">
                {report.alerts.map((a) => (
                  <Link
                    key={`${a.zone}-${a.plantName}`}
                    to={`/crop`}
                    className="rv-alert-chip"
                  >
                    <b>{a.blockLabel} · {a.plantName}</b>
                    <span>{a.condition}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}
