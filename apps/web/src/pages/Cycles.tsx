import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Bot, Camera, Calculator, Plus, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import AddCropModal from "../components/AddCropModal";
import { SyncBadge } from "../components/SampleNotice";
import { Kpis, PageHead, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { num } from "../lib/format";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import { buildAllBlockEconomics, usdAndRiel } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";

export default function Cycles() {
  const [qs, setQs] = useSearchParams();
  const [showAdd, setShowAdd] = useState(qs.get("add") === "true");
  const cycles = useData(api.cycles);
  const zones = useData(api.zones);
  const conditions = useData(api.conditions);
  const surveys = useData(api.surveys);

  const demo = useMemo(() => buildDemoTomatoFarm(), []);
  const previewMode = Boolean((cycles.error && cycles.data === null) || (zones.error && zones.data === null));

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
          <>
            {previewMode && <SyncBadge />}
            <button className="btn btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={16} aria-hidden />Start a tomato cycle
            </button>
          </>
        }
      />
      <main className="main stack">
        <Kpis
          items={[
            { k: "Active tomato blocks", v: `${growing.length} of ${blocks.length}`, d: `${blocks.length - growing.length} ready for next planting` },
            { k: "Total active tomato plants", v: totalPlants, d: "Scanned daily by AgriRover" },
            { k: "Live AI vision alerts", v: totalAlerts, d: "Synced from Health gallery" },
            { k: "Operation spent / budget", v: `$${totalSpentUsd.toFixed(2)}`, d: `of $${totalBudgetUsd.toFixed(2)} target ($0.75/plant)` },
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
                      <span className="small muted">Standard tomato budget: $0.75 (~3,065 ៛) / plant</span>
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
