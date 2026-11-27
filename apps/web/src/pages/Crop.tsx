import { useEffect, useMemo, useState } from "react";
import { BookOpen, Camera, Eye, EyeOff } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import PlantSoilModal from "../components/PlantSoilModal";
import { FastFocusBlocks, MulderQuickCheck } from "../components/FastFocusCard";
import RoverVisionPhoto from "../components/RoverVisionPhoto";
import { Empty, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import {
  buildBlockSoilRows,
  getBlockSoilProfile,
  setRoverContext,
  targetsFromConditions,
  type PlantSoilRow,
  type SoilTargets,
} from "../lib/soil";
import { TOMATO_TREATMENTS } from "../lib/treatments";
import { useData } from "../lib/useData";
import { ago } from "../lib/usePoll";
import { evaluateAgronomyAction, FAST_GUIDE_CARDS } from "../utils/agronomyEngine";

type GalleryItem = {
  blockLabel: string;
  plant: PlantSoilRow;
};

export default function Crop({ initialTab = "gallery" }: { initialTab?: "gallery" | "guide" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const activeTab: "gallery" | "guide" =
    location.pathname === "/guide" || params.get("tab") === "guide" ? "guide" : initialTab;
  const highlightedId = location.hash.replace(/^#/, "");
  const contextZone = params.get("zone");
  const contextPlant = params.get("plant");

  useEffect(() => {
    if (activeTab !== "guide" || !highlightedId) return;
    const el = document.getElementById(highlightedId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeTab, highlightedId]);

  const zones = useData(api.zones);
  const conditions = useData(api.conditions);
  const advice = useData(api.advice);
  const surveys = useData(api.surveys);
  const photos = useData(() => api.photos("all"));

  const previewMode = Boolean(zones.error && zones.data === null);
  const demo = useMemo(() => buildDemoTomatoFarm(), []);

  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "alerts" | "healthy">("all");
  const [showBoxes, setShowBoxes] = useState(true);
  const [inspected, setInspected] = useState<GalleryItem | null>(null);

  const beds = previewMode ? demo.zones : (zones.data ?? []);
  const condList = previewMode ? demo.conditions : (conditions.data ?? []);
  const adviceList = previewMode ? demo.advice : (advice.data ?? []);
  const surveyList = previewMode ? demo.surveys : (surveys.data ?? []);
  const savedPhotos = previewMode ? [] : (photos.data?.photos ?? []);

  // Build unified gallery of all rover-captured tomato plants across blocks
  const latestSurveyByZone = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of surveyList) {
      if ((s.status === "completed" || s.status === "aborted") && !map.has(s.zone)) {
        map.set(s.zone, s.id);
      }
    }
    return map;
  }, [surveyList]);

  const liveRoundIdsKey = [...latestSurveyByZone.values()].join(",");
  const fetchedRounds = useData(async () => {
    if (previewMode || !liveRoundIdsKey) return new Map();
    const entries = await Promise.all(
      [...latestSurveyByZone.entries()].map(async ([z, id]) => [z, await api.survey(id)] as const),
    );
    return new Map(entries);
  }, [previewMode, liveRoundIdsKey]);

  const allItems = useMemo<GalleryItem[]>(() => {
    const out: GalleryItem[] = [];
    for (const b of beds) {
      const roundId = latestSurveyByZone.get(b.zone);
      if (!roundId) continue;
      const round = previewMode
        ? demo.roundsById.get(roundId)
        : fetchedRounds.data?.get(b.zone);
      if (!round?.rows || !round?.cols) continue;
      const cond = condList.find((c) => c.zone === b.zone);
      const adv = adviceList.find((a) => a.zone === b.zone);
      const rows = buildBlockSoilRows({
        zone: b.zone,
        rows: round.rows,
        cols: round.cols,
        cells: round.cells,
        conditions: cond,
        advice: adv,
        photos: savedPhotos,
        profile: getBlockSoilProfile(b.zone),
        capturedAt: round.finishedAt ?? round.startedAt,
      });
      for (const p of rows) {
        if (!p.reached || !p.plant) continue;
        out.push({ blockLabel: b.label ?? b.zone, plant: p });
      }
    }
    // Sort vision alerts first so farmers immediately see plants needing care
    return out.sort((a, b) => Number(b.plant.vision.status === "alert") - Number(a.plant.vision.status === "alert"));
  }, [beds, latestSurveyByZone, previewMode, demo.roundsById, fetchedRounds.data, condList, adviceList, savedPhotos]);

  const zoneItems = useMemo(
    () => (zoneFilter === "all" ? allItems : allItems.filter((item) => item.plant.zone === zoneFilter)),
    [allItems, zoneFilter],
  );

  const counts = useMemo(() => {
    let alerts = 0;
    let healthy = 0;
    for (const item of zoneItems) {
      if (item.plant.vision.status === "alert") alerts++;
      else if (item.plant.vision.status === "healthy") healthy++;
    }
    return { all: zoneItems.length, alerts, healthy };
  }, [zoneItems]);

  const visibleItems = useMemo(() => {
    return zoneItems.filter((item) => {
      if (statusFilter === "alerts") return item.plant.vision.status === "alert";
      if (statusFilter === "healthy") return item.plant.vision.status === "healthy";
      return true;
    });
  }, [zoneItems, statusFilter]);

  const newestAt = surveyList[0]?.finishedAt ?? surveyList[0]?.startedAt ?? null;

  const routeState = (location.state ?? null) as {
    plant?: PlantSoilRow;
    blockLabel?: string;
    targets?: SoilTargets;
  } | null;

  const rowsByZone = useMemo(() => {
    const map = new Map<string, PlantSoilRow[]>();
    for (const item of allItems) {
      const list = map.get(item.plant.zone);
      if (list) list.push(item.plant);
      else map.set(item.plant.zone, [item.plant]);
    }
    return map;
  }, [allItems]);

  const mulderBlocks = useMemo(
    () => beds.filter((b) => (rowsByZone.get(b.zone)?.length ?? 0) > 0).map((b) => ({ zone: b.zone, label: b.label ?? b.zone })),
    [beds, rowsByZone],
  );

  const contextMatch = useMemo(() => {
    if (!contextZone || !contextPlant) return null;
    if (routeState?.plant?.zone === contextZone && routeState.plant.name === contextPlant) {
      const zoneRows = rowsByZone.get(contextZone);
      const card = evaluateAgronomyAction(
        routeState.plant,
        routeState.targets ?? targetsFromConditions(undefined),
        { blockPlants: zoneRows, blockLabel: routeState.blockLabel ?? contextZone },
      );
      if (card) {
        return {
          item: { blockLabel: routeState.blockLabel ?? contextZone, plant: routeState.plant },
          card,
        };
      }
    }
    const found = allItems.find((i) => i.plant.zone === contextZone && i.plant.name === contextPlant);
    if (!found) return null;
    const card = evaluateAgronomyAction(
      found.plant,
      targetsFromConditions(condList.find((c) => c.zone === found.plant.zone)),
      { blockPlants: rowsByZone.get(found.plant.zone), blockLabel: found.blockLabel },
    );
    return card ? { item: found, card } : null;
  }, [allItems, condList, contextZone, contextPlant, routeState, rowsByZone]);

  function handleViewHistory(plant: PlantSoilRow) {
    setInspected(null);
    setRoverContext({ zone: plant.zone, plant: plant.name });
    navigate(`/rover/history?zone=${encodeURIComponent(plant.zone)}&plant=${encodeURIComponent(plant.name)}`);
  }

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {activeTab === "gallery" ? (
        <>
          <Panel
            title="Rover Vision Gallery"
            icon={Camera}
            pad={false}
            right={
              <div className="rv-right">
                {previewMode && <Tag>Sample data · Synced with AgriRover</Tag>}
                <span className="small muted">
                  Monitored automatically by AgriRover{newestAt ? ` · Last updated ${ago(newestAt)}` : ""}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-pressed={showBoxes}
                  onClick={() => setShowBoxes((v) => !v)}
                >
                  {showBoxes ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  {showBoxes ? "Hide AI boxes" : "Show AI boxes"}
                </button>
              </div>
            }
          >
            <div className="rv-blocks" role="group" aria-label="Filter by block">
              <button
                type="button"
                className={`f3-chip${zoneFilter === "all" ? " on" : ""}`}
                onClick={() => setZoneFilter("all")}
              >
                All blocks
              </button>
              {beds.map((b) => (
                <button
                  key={b.zone}
                  type="button"
                  className={`f3-chip${zoneFilter === b.zone ? " on" : ""}`}
                  onClick={() => setZoneFilter(b.zone)}
                >
                  {b.label ?? b.zone}
                </button>
              ))}
            </div>

            <div className="rv-action-bar">
              <div className="seg" role="group" aria-label="Filter by vision status">
                <button
                  type="button"
                  className={statusFilter === "all" ? "on" : ""}
                  onClick={() => setStatusFilter("all")}
                >
                  All plants <span className="rv-filter-count">{counts.all}</span>
                </button>
                <button
                  type="button"
                  className={statusFilter === "alerts" ? "on" : ""}
                  onClick={() => setStatusFilter("alerts")}
                >
                  Vision alerts <span className={`rv-filter-count${counts.alerts > 0 ? " rv-count-warn" : ""}`}>{counts.alerts}</span>
                </button>
                <button
                  type="button"
                  className={statusFilter === "healthy" ? "on" : ""}
                  onClick={() => setStatusFilter("healthy")}
                >
                  Healthy <span className="rv-filter-count">{counts.healthy}</span>
                </button>
              </div>
              <span className="small muted">Click any tomato plant photo to open full AI analysis &amp; recommended care</span>
            </div>

            {visibleItems.length === 0 ? (
              <Empty>No captured tomato plant photos match this filter.</Empty>
            ) : (
              <div className="rv-gallery-grid">
                {visibleItems.map(({ blockLabel, plant }) => {
                  const v = plant.vision;
                  const r = plant.readings;
                  const cardRx =
                    v.status === "alert"
                      ? evaluateAgronomyAction(
                          plant,
                          targetsFromConditions(condList.find((c) => c.zone === plant.zone)),
                          { blockPlants: rowsByZone.get(plant.zone), blockLabel },
                        )
                      : null;
                  return (
                    <button
                      key={`${plant.zone}-${plant.name}`}
                      type="button"
                      className={`rv-gallery-card${v.status === "alert" ? " rv-gallery-alert" : ""}`}
                      onClick={() => setInspected({ blockLabel, plant })}
                    >
                      <div className="rv-gallery-head">
                        <b>{blockLabel} · {plant.name}</b>
                        <Tag kind={v.status === "healthy" ? "ok" : v.status === "alert" ? "warn" : undefined}>
                          {v.badgeLabel}
                        </Tag>
                      </div>
                      <RoverVisionPhoto
                        plantName={plant.name}
                        vision={v}
                        canopy={plant.canopy}
                        chlorosis={plant.chlorosis}
                        soilMoisture={r.moisture}
                        showBoxes={showBoxes}
                        compact
                      />
                      <div className="rv-gallery-meta small muted">
                        <span>{v.growthStage ?? "Tomato"}</span>
                        <span>
                          Moisture {r.moisture !== null ? `${r.moisture.toFixed(1)}%` : "—"} · pH{" "}
                          {r.ph !== null ? r.ph.toFixed(2) : "—"}
                        </span>
                      </div>
                      {v.linkedNote && <div className="rv-gallery-note small">{v.linkedNote}</div>}
                      {cardRx && (
                        <div className="rv-gallery-rx">
                          <b>Rx:</b> {cardRx.prescription.recipeSummaryLine}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
          <MulderQuickCheck blocks={mulderBlocks} rowsByZone={rowsByZone} />
        </>
      ) : (
        <>
          <MulderQuickCheck blocks={mulderBlocks} rowsByZone={rowsByZone} />
          <Panel
            title="Tomato Disease & Treatment Guide"
            icon={BookOpen}
            pad={false}
            right={
              <div className="rv-right">
                {previewMode && <Tag>Sample data · Synced with AgriRover</Tag>}
                <span className="small muted">Fast-Focus Action · Mulder Antagonism · Expected Result</span>
              </div>
            }
          >
            <div className="rv-guide-list">
              {TOMATO_TREATMENTS.map((t) => {
                const isFocused = highlightedId === t.id;
                const liveMatch = contextMatch?.card.guideId === t.id ? contextMatch : null;
                const cardToShow = liveMatch ? liveMatch.card : FAST_GUIDE_CARDS[t.id];
                return (
                  <article key={t.id} id={t.id} className={`rv-guide-card${isFocused ? " rv-guide-card-focus" : ""}`}>
                    <div className="rv-guide-head">
                      <div>
                        <h3>{t.title}</h3>
                        <span className="small muted">{t.severityHint}</span>
                      </div>
                      <Tag kind={isFocused ? "ok" : "warn"}>
                        {liveMatch ? `Selected for ${liveMatch.item.plant.name}` : isFocused ? "Highlighted condition" : "Tomato care"}
                      </Tag>
                    </div>
                    {liveMatch && (
                      <div className="small muted">
                        Tailored to live probe on <b>{liveMatch.item.blockLabel} · {liveMatch.item.plant.name}</b>
                      </div>
                    )}
                    <div className="rv-guide-grid">
                      <div>
                        <span className="ts-k">Symptoms</span>
                        <p className="small">{t.symptoms}</p>
                      </div>
                      <div>
                        <span className="ts-k">Common causes</span>
                        <p className="small">{t.causes}</p>
                      </div>
                    </div>
                    <FastFocusBlocks card={cardToShow} />
                    <div className="rv-guide-prev small">
                      <b>Prevention:</b> {t.prevention}
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>
        </>
      )}

      {inspected && (
        <PlantSoilModal
          plant={inspected.plant}
          blockLabel={inspected.blockLabel}
          blockPlants={rowsByZone.get(inspected.plant.zone)}
          targets={targetsFromConditions(condList.find((c) => c.zone === inspected.plant.zone))}
          onClose={() => setInspected(null)}
          onViewHistory={handleViewHistory}
        />
      )}
    </main>
  );
}
