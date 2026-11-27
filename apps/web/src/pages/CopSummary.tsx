import { useMemo } from "react";
import { Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { Empty, Kpis, Notice, Panel, Tag } from "../components/ui";
import { api, loadProblem } from "../lib/api";
import { num } from "../lib/format";
import { buildAllBlockEconomics, UNIT_TOTAL_COST_RIEL, UNIT_TOTAL_COST_USD, usdAndRiel } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";
import { useLatestRoundsByZone } from "../lib/useLatestRounds";

export default function CopSummary() {
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const conditions = useData(api.conditions);
  const surveys = useData(api.surveys);

  const activeZones = zones.data ?? [];
  const activeCycles = cycles.data ?? [];
  const activeConds = conditions.data ?? [];
  const { roundsByZone } = useLatestRoundsByZone(surveys.data ?? []);

  const { blocks } = useMemo(
    () =>
      buildAllBlockEconomics({
        cycles: activeCycles,
        zones: activeZones,
        conditions: activeConds,
        roundsByZone,
      }),
    [activeCycles, activeZones, activeConds, roundsByZone],
  );

  const pageError = zones.error ?? cycles.error ?? conditions.error ?? surveys.error;

  const totalPlants = blocks.reduce((s, b) => s + b.plantCount, 0);
  const totalSpentUsd = blocks.reduce((s, b) => s + b.spentToDateUsd, 0);
  const totalSpentRiel = blocks.reduce((s, b) => s + b.spentToDateRiel, 0);
  const totalSavedUsd = blocks.reduce((s, b) => s + b.savedTotalUsd, 0);
  const totalSavedRiel = blocks.reduce((s, b) => s + b.savedTotalRiel, 0);
  const totalPreventedUsd = blocks.reduce((s, b) => s + b.preventedLossUsd, 0);
  const totalPreventedRiel = blocks.reduce((s, b) => s + b.preventedLossRiel, 0);

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {pageError && <Notice kind="alert">{loadProblem(pageError)}</Notice>}
      <Kpis
        items={[
          { k: "Active tomato plants", v: totalPlants, d: `Across ${blocks.filter((b) => b.plantCount > 0).length} growing beds` },
          { k: "Operation spent to date", v: `$${totalSpentUsd.toFixed(2)}`, d: `~${totalSpentRiel.toLocaleString()} ៛` },
          { k: "Cycle cost savings", v: `$${totalSavedUsd.toFixed(2)}`, d: `~${totalSavedRiel.toLocaleString()} ៛ vs. traditional` },
          { k: "Crop loss prevented", v: `$${totalPreventedUsd.toFixed(2)}`, d: `~${totalPreventedRiel.toLocaleString()} ៛` },
        ]}
      />

      <Panel
        title="Block Breakdown (G1–G6)"
        icon={Scale}
        pad={false}
        right={
          <div className="rv-right">
            <span className="small muted">{usdAndRiel(UNIT_TOTAL_COST_USD, UNIT_TOTAL_COST_RIEL)} budget per active tomato plant</span>
          </div>
        }
      >
        {blocks.length === 0 ? (
          <Empty>No tomato blocks found.</Empty>
        ) : (
          <div className="tablewrap">
            <table className="tbl fold fin-sub-tbl">
              <thead>
                <tr>
                  <th>Block &amp; Variety</th>
                  <th className="r">Plants</th>
                  <th>Stage</th>
                  <th>Health Alerts</th>
                  <th className="r">Water Today</th>
                  <th className="r">Spent / Budget</th>
                  <th className="r">Saved vs Trad.</th>
                  <th className="r">Proj. Profit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.zone}>
                    <td className="fin-col-wide">
                      <b>{b.label}</b>
                      <div className="small muted">{b.variety} · {num(b.areaM2, 0)} m²</div>
                    </td>
                    <td data-label="Plants" className="r nowrap">
                      {b.plantCount > 0 ? <b>{b.plantCount}</b> : <span className="muted">0 (ready)</span>}
                    </td>
                    <td data-label="Stage" className="fin-col-stage">
                      {b.day > 0 ? (
                        <><b>Day {b.day}</b><div className="small muted">{b.stageTitle}</div></>
                      ) : (
                        <span className="muted">Prepared bed</span>
                      )}
                    </td>
                    <td data-label="Health Alerts" className="nowrap">
                      {b.plantCount === 0 ? (
                        <Tag>Idle bed</Tag>
                      ) : b.visionAlertCount > 0 ? (
                        <Tag kind="warn">{b.visionAlertCount} vision · {b.soilAttentionCount} total</Tag>
                      ) : (
                        <Tag kind="ok">Optimal</Tag>
                      )}
                    </td>
                    <td data-label="Water Today" className="r nowrap fin-num">
                      {b.plantCount > 0 ? `${num(b.waterTodayL, 0)} L` : "—"}
                    </td>
                    <td data-label="Spent / Budget" className="r nowrap fin-num">
                      {b.plantCount > 0 ? (
                        <>
                          <b>${b.spentToDateUsd.toFixed(2)}</b> / ${b.budgetUsd.toFixed(2)}
                          <div className="small muted">~{b.spentToDateRiel.toLocaleString()} ៛</div>
                        </>
                      ) : (
                        <span className="muted">$0.00</span>
                      )}
                    </td>
                    <td data-label="Saved vs Trad." className="r nowrap fin-num">
                      {b.plantCount > 0 ? (
                        <b className="rv-save-num">{usdAndRiel(b.savedTotalUsd, b.savedTotalRiel)}</b>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Proj. Profit" className="r nowrap fin-num">
                      {b.plantCount > 0 ? (
                        <>
                          <b>${b.projectedProfitUsd.toFixed(2)}</b>
                          <div className="small muted">~{b.projectedProfitRiel.toLocaleString()} ៛</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="act nowrap">
                      {b.plantCount > 0 && (
                        <Link className="linkbtn" to={`/cycles/${b.cycleId}`}>Details</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
