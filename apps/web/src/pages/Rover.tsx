import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import PlantSoilModal from "../components/PlantSoilModal";
import RoverControl from "../components/RoverControl";
import RoverMap, { RoverLegend } from "../components/RoverMap";
import SoilCad3D from "../components/SoilCad3D";
import { ErrorNotice, Notice, Panel, Tag } from "../components/ui";
import type { RoverCell } from "../lib/api";
import { useFarmFocus } from "../lib/farmContext";
import {
  errorText,
  noteRoundState,
  useAdvice,
  useConditions,
  useCycles,
  usePhotos,
  useRoverFrame,
  useRoverLive,
  useSurvey,
  useSurveys,
  useZones,
} from "../lib/queries";
import { cellName, headingAt, serpentine } from "../lib/rover";
import {
  buildBlockSoilRows,
  defaultBlockSoilProfile,
  parsePlantLabel,
  resolveBlockGrid,
  summarizePlantSoil,
  targetsFromConditions,
  type PlantSoilRow,
} from "../lib/soil";
import { ago } from "../lib/usePoll";

function StatusDot({ status }: { status: PlantSoilRow["status"] }) {
  const label = status === "optimal" ? "Optimal" : status === "attention" ? "Needs attention" : "Unrecorded";
  const cls = status === "optimal" ? "soil-dot soil-dot-ok" : status === "attention" ? "soil-dot soil-dot-warn" : "soil-dot soil-dot-gray";
  return <span className={cls} title={label} aria-label={label} />;
}

function VisionConditionBadge({ plant }: { plant: PlantSoilRow }) {
  const v = plant.vision;
  if (v.status === "healthy") return <Tag kind="ok">{v.badgeLabel}</Tag>;
  if (v.status === "alert") return <Tag kind="warn">{v.badgeLabel}</Tag>;
  return <Tag>{v.badgeLabel}</Tag>;
}

export default function Rover() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const focus = useFarmFocus();

  const zones = useZones();
  const cycles = useCycles();
  const conditions = useConditions();
  const adviceNow = useAdvice();
  const savedPhotos = usePhotos("all");
  const history = useSurveys();
  const [fast, setFast] = useState(false);
  const live = useRoverLive(fast);
  const liveData = live.data;

  const [filter, setFilter] = useState<"all" | "attention" | "vision">("all");
  const [view, setView] = useState<"3d" | "map">("3d");
  const [focusSeq, setFocusSeq] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  // the block and plant come from the link first (shared from another page), then from the farm-wide focus
  const qZone = searchParams.get("zone");
  const qPlant = searchParams.get("plant");
  useEffect(() => {
    if (qZone && (qZone !== focus.zone || (qPlant ?? null) !== focus.plant)) focus.setFocus(qZone, qPlant);
  }, [qZone, qPlant]); // eslint-disable-line react-hooks/exhaustive-deps

  const beds = zones.data ?? [];
  const growing = (cycles.data ?? []).filter((c) => c.status === "active");
  const zone = qZone ?? focus.zone;
  const activeZone = (zone && beds.some((b) => b.zone === zone) ? zone : null) ?? growing[0]?.zone ?? beds[0]?.zone ?? "";
  const selected = parsePlantLabel(qZone ? qPlant : focus.plant);
  const activeBed = beds.find((b) => b.zone === activeZone);
  const activeCycle = growing.find((c) => c.zone === activeZone);
  const blockLabel = activeBed?.label ?? activeCycle?.bedLabel ?? activeZone ?? "";
  const blockLabels = useMemo(() => new Map(beds.map((b) => [b.zone, b.label ?? b.zone])), [beds]);

  const liveMission = liveData?.mission ?? null;
  const running = liveMission?.status === "queued" || liveMission?.status === "running";
  useEffect(() => setFast(running), [running]);
  useEffect(() => {
    noteRoundState(qc, liveMission?.missionId, liveMission?.status, blockLabels.get(liveMission?.zoneId ?? ""), liveMission?.reason);
  }, [qc, liveMission?.missionId, liveMission?.status, liveMission?.zoneId, liveMission?.reason, blockLabels]);
  const activeMission = liveMission && running && liveMission.zoneId === activeZone ? liveMission : null;

  const surveyList = history.data ?? [];
  const lastSurvey = activeMission
    ? undefined
    : surveyList.find((s) => s.zone === activeZone && (s.status === "completed" || s.status === "aborted"));
  const lastRound = useSurvey(lastSurvey?.id);

  const adviceList = adviceNow.data ?? [];
  const blockAdvice = adviceList.find((a) => a.zone === activeZone);
  const blockConditions = (conditions.data ?? []).find((c) => c.zone === activeZone);
  const targets = useMemo(() => targetsFromConditions(blockConditions), [blockConditions]);

  const storedCells: RoverCell[] = useMemo(() => {
    if (!lastSurvey || lastRound.data?.id !== lastSurvey.id) return [];
    const adviceByKey = new Map((blockAdvice?.trees ?? []).map((t) => [`${t.row},${t.col}`, t]));
    return lastRound.data.cells.map((c) => ({ ...c, advice: c.advice ?? adviceByKey.get(`${c.row},${c.col}`) ?? null }));
  }, [lastSurvey, lastRound.data, blockAdvice]);

  const cells = activeMission?.cells?.length ? activeMission.cells : storedCells;
  const grid = resolveBlockGrid({
    rows: activeMission?.rows ?? lastSurvey?.rows,
    cols: activeMission?.cols ?? lastSurvey?.cols,
    rowM: activeMission?.rowM ?? activeCycle?.grid?.rowM,
    cellM: activeMission?.cellM ?? lastSurvey?.cellM ?? activeCycle?.grid?.treeM,
    cycle: activeCycle,
    zone: activeBed,
  });

  const blockProfile = activeBed?.soilProfile ?? defaultBlockSoilProfile(activeZone);
  const capturedAt = activeMission
    ? new Date().toISOString()
    : (lastSurvey?.finishedAt ?? lastSurvey?.startedAt ?? null);

  const allPlants = useMemo(() => {
    if (!activeZone) return [];
    return buildBlockSoilRows({
      zone: activeZone,
      rows: grid.rows,
      cols: grid.cols,
      cells,
      conditions: blockConditions,
      advice: blockAdvice,
      photos: savedPhotos.data?.photos ?? [],
      profile: blockProfile,
      capturedAt,
    });
  }, [activeZone, grid.rows, grid.cols, cells, blockConditions, blockAdvice, savedPhotos.data, blockProfile, capturedAt]);

  const summary = useMemo(() => summarizePlantSoil(allPlants), [allPlants]);
  const visiblePlants = useMemo(() => {
    if (filter === "attention") return allPlants.filter((p) => p.status === "attention");
    if (filter === "vision") return allPlants.filter((p) => p.vision.status === "alert");
    return allPlants;
  }, [allPlants, filter]);

  // keep the address bar in step, so the view can be shared or bookmarked
  const selRow = selected?.[0] ?? null;
  const selCol = selected?.[1] ?? null;
  useEffect(() => {
    if (!activeZone) return;
    const plantLabel = selRow !== null && selCol !== null ? cellName(selRow, selCol) : null;
    const next = new URLSearchParams();
    next.set("zone", activeZone);
    if (plantLabel) next.set("plant", plantLabel);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeZone, selRow, selCol]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPlant = useMemo(
    () => (selRow !== null && selCol !== null ? allPlants.find((p) => p.row === selRow && p.col === selCol) ?? null : null),
    [allPlants, selRow, selCol],
  );

  const blockAttentionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of adviceList) {
      const n = a.trees.filter((t) => t.plant && t.notes.length > 0).length;
      if (n > 0) map.set(a.zone, n);
    }
    if (activeZone) map.set(activeZone, summary.attention);
    return map;
  }, [adviceList, activeZone, summary.attention]);

  const liveFrame = useRoverFrame(detailOpen && activeMission ? activeMission.missionId : null, detailOpen ? selected : null);

  const roverPos = useMemo(() => {
    if (!running || !activeMission?.cell || activeMission.zoneId !== activeZone) return null;
    const path = serpentine(grid.rows, grid.cols);
    const step = path.findIndex(([r, c]) => r === activeMission.cell![0] && c === activeMission.cell![1]);
    return {
      row: activeMission.cell[0],
      col: activeMission.cell[1],
      heading: step >= 0 ? headingAt(path, step) : 0,
    };
  }, [running, activeMission?.cell, activeMission?.zoneId, activeZone, grid.rows, grid.cols]);

  const photographedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of savedPhotos.data?.photos ?? []) {
      if (p.zone !== activeZone) continue;
      const rc = parsePlantLabel(p.tree);
      if (rc) set.add(`${rc[0]},${rc[1]}`);
    }
    return set;
  }, [savedPhotos.data, activeZone]);

  const raining = blockAdvice?.water.raining ?? beds.some((b) => b.zone === activeZone && b.rain === true);
  const isSmallScreen = typeof window !== "undefined" && window.innerWidth <= 640;
  const sceneHeight = isSmallScreen ? 340 : 440;
  const pageError = [zones.error, conditions.error, history.error].find(Boolean);

  const setSelected = (rc: [number, number] | null) => focus.setFocus(activeZone, rc ? cellName(rc[0], rc[1]) : null);

  function selectBlock(nextZone: string) {
    focus.setFocus(nextZone, null);
    setSearchParams({ zone: nextZone }, { replace: true });
    setDetailOpen(false);
  }

  function applyFilter(next: "all" | "attention" | "vision") {
    setFilter(next);
    if (next === "attention" && selectedPlant && selectedPlant.status !== "attention") {
      setSelected(null);
      setDetailOpen(false);
    } else if (next === "vision" && selectedPlant && selectedPlant.vision.status !== "alert") {
      setSelected(null);
      setDetailOpen(false);
    }
  }

  function handleSelectFrom3D(row: number, col: number) {
    setSelected([row, col]);
    setDetailOpen(true);
  }

  function handleSelectFromTable(row: number, col: number) {
    setSelected([row, col]);
    setFocusSeq((n) => n + 1);
    viewportRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function handleOpenDetail(row: number, col: number) {
    setSelected([row, col]);
    setDetailOpen(true);
  }

  function handleViewHistory(plant: PlantSoilRow) {
    setDetailOpen(false);
    focus.setFocus(plant.zone, plant.name);
    navigate(`/rover/history?zone=${encodeURIComponent(plant.zone)}&plant=${encodeURIComponent(plant.name)}`);
  }

  const autoStatusText = activeMission
    ? `Round in progress · ${activeMission.cellsScanned ?? 0} of ${activeMission.cellsTotal ?? grid.rows * grid.cols} plants`
    : lastSurvey
      ? `Last round ${ago(lastSurvey.finishedAt ?? lastSurvey.startedAt)}${lastSurvey.simulated ? " (simulated rover)" : ""}`
      : "No round on this block yet";

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {pageError && <ErrorNotice error={errorText(pageError)} onRetry={() => { zones.refetch(); conditions.refetch(); history.refetch(); }} />}
      {raining && !running && <Notice kind="warn">Rain on {blockLabel}: watering is paused, and the rover should stay in.</Notice>}
      {activeZone && (
        <RoverControl zone={activeZone} label={blockLabel} grid={grid} live={liveData} blockLabels={blockLabels} />
      )}

      <div ref={viewportRef}>
        <Panel
          title={blockLabel ? `Block · ${blockLabel}` : "Block"}
          pad={false}
          right={
            <span className="rv-right">
              <span className="small muted">{autoStatusText}</span>
              <span className="seg" role="group" aria-label="Land view mode">
                <button type="button" className={view === "3d" ? "on" : ""} aria-pressed={view === "3d"} onClick={() => setView("3d")}>
                  3D CAD
                </button>
                <button type="button" className={view === "map" ? "on" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}>
                  2D Map
                </button>
              </span>
            </span>
          }
        >
          <div className="rv-blocks" role="group" aria-label="Block">
            {beds.length === 0 ? (
              <span className="small muted">{zones.isPending ? "Loading blocks…" : "No blocks yet. Add one in Farm › Beds."}</span>
            ) : (
              beds.map((b) => {
                const attn = blockAttentionCounts.get(b.zone) ?? 0;
                const isOn = b.zone === activeZone;
                return (
                  <button
                    key={b.zone}
                    type="button"
                    className={`f3-chip${isOn ? " on" : ""}`}
                    aria-pressed={isOn}
                    onClick={() => selectBlock(b.zone)}
                  >
                    {b.label ?? b.zone}
                    {attn > 0 && <span className="rv-chip-warn"> · {attn}</span>}
                  </button>
                );
              })
            )}
          </div>

          <div className="rv-action-bar">
            <div className="seg" role="group" aria-label="Plant condition filter">
              <button
                type="button"
                className={filter === "all" ? "on" : ""}
                aria-pressed={filter === "all"}
                onClick={() => applyFilter("all")}
              >
                All plants <span className="rv-filter-count">{summary.total}</span>
              </button>
              <button
                type="button"
                className={filter === "attention" ? "on" : ""}
                aria-pressed={filter === "attention"}
                onClick={() => applyFilter("attention")}
              >
                Needs attention <span className={`rv-filter-count${summary.attention > 0 ? " rv-count-warn" : ""}`}>{summary.attention}</span>
              </button>
              <button
                type="button"
                className={filter === "vision" ? "on" : ""}
                aria-pressed={filter === "vision"}
                onClick={() => applyFilter("vision")}
              >
                Vision alerts <span className={`rv-filter-count${summary.visionAlerts > 0 ? " rv-count-warn" : ""}`}>{summary.visionAlerts}</span>
              </button>
            </div>
            <span className="small muted">Click a plant in 3D to inspect AI camera analysis &amp; soil status</span>
          </div>

          {zones.isPending ? (
            <div className="cad-loading" style={{ height: sceneHeight }}>Loading land plot…</div>
          ) : !activeZone ? (
            <div className="cad-loading" style={{ height: sceneHeight }}>No land blocks configured yet.</div>
          ) : view === "3d" ? (
            <SoilCad3D
              zone={activeZone}
              blockLabel={blockLabel}
              rows={grid.rows}
              cols={grid.cols}
              rowM={grid.rowM}
              treeM={grid.treeM}
              plants={allPlants}
              filter={filter}
              selected={selected ? { row: selected[0], col: selected[1] } : null}
              focusSeq={focusSeq}
              onSelect={handleSelectFrom3D}
              rover={roverPos}
              soilProfile={blockProfile}
              height={sceneHeight}
            />
          ) : (
            <div className="rv-map" style={{ minHeight: sceneHeight }}>
              <div className="rm-wrap">
                <RoverMap
                  rows={grid.rows}
                  cols={grid.cols}
                  cells={cells}
                  at={activeMission?.cell ?? (lastSurvey ? undefined : [0, 0])}
                  selected={selected}
                  onPick={handleSelectFrom3D}
                  photos={photographedKeys}
                />
              </div>
              <div className="panel-foot rm-foot">
                <RoverLegend />
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title={blockLabel ? `Soil readings · ${blockLabel}` : "Soil readings"}
        pad={false}
        right={
          <span className="small muted">
            {summary.optimal} optimal · {summary.attention} needs attention · {summary.visionAlerts} vision {summary.visionAlerts === 1 ? "alert" : "alerts"} · {blockProfile.texture}, {blockProfile.drainage}, {blockProfile.rootingDepthCm} cm depth
          </span>
        }
      >
        {visiblePlants.length === 0 ? (
          <p className="panel-pad small muted">
            {filter === "vision"
              ? "No AI Vision alerts detected in this block."
              : filter === "attention"
                ? "No plants need attention in this block."
                : "No round has checked this block yet. Start one above."}
          </p>
        ) : (
          <div className="tablewrap">
            <table className="tbl soil-tbl">
              <thead>
                <tr>
                  <th>Plant</th>
                  <th>Plant condition</th>
                  <th className="r">Moisture</th>
                  <th className="r">Soil pH</th>
                  <th>Nutrients (N · P · K mg/kg)</th>
                  <th className="r">EC</th>
                  <th className="act" aria-label="Details" />
                </tr>
              </thead>
              <tbody>
                {visiblePlants.map((p) => {
                  const isPicked = selected?.[0] === p.row && selected?.[1] === p.col;
                  const r = p.readings;
                  const npk =
                    r.n !== null || r.p !== null || r.k !== null
                      ? `N ${r.n !== null ? Math.round(r.n) : "—"} · P ${r.p !== null ? Math.round(r.p) : "—"} · K ${r.k !== null ? Math.round(r.k) : "—"}`
                      : "—";
                  return (
                    <tr
                      key={p.name}
                      className={`pickable${isPicked ? " picked" : ""}`}
                      onClick={() => handleSelectFromTable(p.row, p.col)}
                    >
                      <td className="nowrap">
                        <div className="soil-plant-cell">
                          <StatusDot status={p.status} />
                          <div>
                            <b>{p.name}</b>
                            <div className="small muted">
                              {!p.reached
                                ? "Unrecorded"
                                : !p.plant
                                  ? "No plant detected"
                                  : p.vision.linkedNote
                                    ? p.vision.linkedNote
                                    : p.issues.length > 0
                                      ? p.issues[0]
                                      : "Optimal"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="nowrap">
                        <VisionConditionBadge plant={p} />
                      </td>
                      <td className={`r num${p.states.moisture !== "ok" && p.states.moisture !== "none" ? " soil-val-warn" : ""}`}>
                        {r.moisture !== null ? `${r.moisture.toFixed(1)} %` : "—"}
                      </td>
                      <td className={`r num${p.states.ph !== "ok" && p.states.ph !== "none" ? " soil-val-warn" : ""}`}>
                        {r.ph !== null ? r.ph.toFixed(2) : "—"}
                      </td>
                      <td className="nowrap num small">{npk}</td>
                      <td className={`r num${p.states.ec !== "ok" && p.states.ec !== "none" ? " soil-val-warn" : ""}`}>
                        {r.ec !== null ? `${r.ec.toFixed(2)} mS/cm` : "—"}
                      </td>
                      <td className="act">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(p.row, p.col);
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {detailOpen && selectedPlant && (
        <PlantSoilModal
          plant={selectedPlant}
          blockLabel={blockLabel}
          blockPlants={allPlants}
          targets={targets}
          liveFrame={liveFrame.data?.frame ?? (activeMission?.cell?.[0] === selectedPlant.row && activeMission?.cell?.[1] === selectedPlant.col ? activeMission.frame : null)}
          onClose={() => setDetailOpen(false)}
          onViewHistory={handleViewHistory}
        />
      )}
    </main>
  );
}
