import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Bot, Camera, Calculator, Plus, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import AddCropModal from "../components/AddCropModal";
import { Kpis, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem } from "../lib/api";
import { num } from "../lib/format";
import { buildAllBlockEconomics, UNIT_TOTAL_COST_RIEL, UNIT_TOTAL_COST_USD, usdAndRiel } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";
import { useLatestRoundsByZone } from "../lib/useLatestRounds";

export default function Cycles() {
  const [qs, setQs] = useSearchParams();
  const [showAdd, setShowAdd] = useState(qs.get("add") === "true");
  const cycles = useData(api.cycles);
  const zones = useData(api.zones);
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

  const pageError = cycles.error ?? zones.error ?? conditions.error;
  const growing = blocks.filter((b) => b.plantCount > 0);
  const totalPlants = growing.reduce((s, b) => s + b.plantCount, 0);
  const totalAlerts = growing.reduce((s, b) => s + b.visionAlertCount, 0);
  const totalSpentUsd = growing.reduce((s, b) => s + b.spentToDateUsd, 0);
  const totalBudgetUsd = growing.reduce((s, b) => s + b.budgetUsd, 0);

  return (
    <>
      <PageHead
        icon={Sprout}
        title="Tomato Crop Cycles"
        sub="Active tomato plantings synced with Rover soil probes, Health vision alerts & cycle budgets"
        actions={
          <button className="btn btn-sm" onClick={() => setShowAdd(true)}>
            <Plus size={16} aria-hidden />Start a tomato cycle
          </button>
        }
      />
      <main className="main stack">
        {pageError && <Notice kind="alert">{loadProblem(pageError)}</Notice>}
        <Kpis
          items={[
            { k: "Active tomato blocks", v: `${growing.length} of ${blocks.length}`, d: `${blocks.length - growing.length} ready for next planting` },
            { k: "Total active tomato plants", v: totalPlants, d: "Scanned daily by AgriRover" },
            { k: "Live AI vision alerts", v: totalAlerts, d: "Synced from Health gallery" },
            { k: "Operation spent / budget", v: `$${totalSpentUsd.toFixed(2)}`, d: `of $${totalBudgetUsd.toFixed(2)} target ($${UNIT_TOTAL_COST_USD.toFixed(2)}/plant)` },
          ]}
        />

        <div className="grid g2">
          {blocks.map((b) => {
            const pct = b.budgetUsd > 0 ? Math.min(100, Math.round((b.spentToDateUsd / b.budgetUsd) * 100)) : 0;
            const hasAlerts = b.visionAlertCount > 0 || b.soilAttentionCount > 0;
            return (
              <Panel
                key={b.zone}
                title={b.label}
                right={
                  b.plantCount === 0 ? (
                    <Tag>Ready · 0 plants</Tag>
                  ) : hasAlerts ? (
                    <Tag kind="warn">
                      {b.visionAlertCount} vision alert{b.visionAlertCount === 1 ? "" : "s"}
                      {b.soilAttentionCount > b.visionAlertCount ? ` · ${b.soilAttentionCount - b.visionAlertCount} soil` : ""}
                    </Tag>
                  ) : (
                    <Tag kind="ok">Optimal health</Tag>
                  )
                }
              >
                <div className="stack">
                  <div className="rv-cycle-meta">
                    <div>
                      <b>{b.variety}</b>
                      <div className="small muted">
                        {b.plantCount > 0
                          ? `Day ${b.day} · ${b.stageTitle}`
                          : "Bed cleared & soil rested · Ready for transplanting"}
                      </div>
                    </div>
                    <div className="r">
                      <b>{b.plantCount} tomato plants</b>
                      <div className="small muted">{num(b.areaM2, 0)} m² bed</div>
                    </div>
                  </div>

                  {b.plantCount > 0 ? (
                    <>
                      <div className="rv-budget-box">
                        <div className="rv-budget-head small">
                          <span>Operation cost spent vs. budget</span>
                          <b>
                            {usdAndRiel(b.spentToDateUsd, b.spentToDateRiel)} / ${b.budgetUsd.toFixed(2)}
                          </b>
                        </div>
                        <div className="bar" aria-label={`${pct}% of cycle budget spent`}>
                          <i style={{ width: `${pct}%` }} />
                        </div>
                        <div className="rv-budget-foot small muted">
                          <span>Saved {usdAndRiel(b.savedTotalUsd, b.savedTotalRiel)} vs. traditional</span>
                          <span>Expected yield: {num(b.expectedYieldKg, 1)} kg</span>
                        </div>
                      </div>

                      <div className="rv-cycle-actions">
                        <Link className="btn btn-sm btn-ghost" to="/rover">
                          <Bot size={14} aria-hidden />Rover 3D
                        </Link>
                        <Link className="btn btn-sm btn-ghost" to="/crop">
                          <Camera size={14} aria-hidden />Health Vision
                        </Link>
                        <Link className="linkbtn small rowflex" style={{ gap: 4, marginLeft: "auto" }} to={`/cycles/${b.cycleId}`}>
                          <Calculator size={13} aria-hidden />Cost report <ArrowRight size={13} aria-hidden />
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="rv-cycle-actions">
                      <span className="small muted">Standard tomato budget: {usdAndRiel(UNIT_TOTAL_COST_USD, UNIT_TOTAL_COST_RIEL)} / plant</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ marginLeft: "auto" }}
                        onClick={() => setShowAdd(true)}
                      >
                        <Plus size={14} aria-hidden />Plant tomato block
                      </button>
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      </main>
      <AddCropModal
        isOpen={showAdd}
        onClose={() => {
          setShowAdd(false);
          setQs({}, { replace: true });
        }}
        onAdded={() => cycles.reload()}
      />
    </>
  );
}
