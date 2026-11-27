import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PlantSoilModal from "../components/PlantSoilModal";
import RoverMap, { RoverLegend } from "../components/RoverMap";
import SoilCad3D from "../components/SoilCad3D";
import { Notice, Panel, Tag } from "../components/ui";
import { api, loadProblem, type RoverCell } from "../lib/api";
import { cellName, headingAt, serpentine } from "../lib/rover";
import {
  buildBlockSoilRows,
  getBlockSoilProfile,
  getRoverContext,
  parsePlantLabel,
  resolveBlockGrid,
  setRoverContext,
  summarizePlantSoil,
  targetsFromConditions,
  type PlantSoilRow,
} from "../lib/soil";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCtx = useMemo(() => {
    const qZone = searchParams.get("zone");
    const qPlant = searchParams.get("plant");
    if (qZone) return { zone: qZone, plant: qPlant };
    return getRoverContext();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const zones = useData(api.zones);
  const { data: liveData, error: liveError } = usePoll(api.roverLive, 2500);
  const cycles = useData(api.cycles);
  const conditions = usePoll(api.conditions, 30000);
  const adviceNow = usePoll(api.advice, 30000);
  const savedPhotos = useData(() => api.photos("all"));

  const [zone, setZone] = useState<string>(initialCtx?.zone ?? "");
  const [filter, setFilter] = useState<"all" | "attention" | "vision">("all");
  const [view, setView] = useState<"3d" | "map">("3d");
  const [selected, setSelected] = useState<[number, number] | null>(() => parsePlantLabel(initialCtx?.plant));
  const [focusSeq, setFocusSeq] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);

  const beds = zones.data ?? [];
  const growing = (cycles.data ?? []).filter((c) => c.status === "active");
  const activeZone = zone || growing[0]?.zone || beds[0]?.zone || "";
  const activeBed = beds.find((b) => b.zone === activeZone);
  const activeCycle = growing.find((c) => c.zone === activeZone);
  const blockLabel = activeBed?.label ?? activeCycle?.bedLabel ?? activeZone ?? "";

  const liveMission = liveData?.mission ?? null;
  const activeMission =
    liveMission && (liveMission.status === "queued" || liveMission.status === "running" || liveMission.zoneId === activeZone)
      ? liveMission
      : null;

  const history = useData(api.surveys, [liveMission?.missionId, liveMission?.status]);
  const surveyList = history.data ?? [];
  const lastSurvey = activeMission
    ? undefined
    : surveyList.find((s) => s.zone === activeZone && (s.status === "completed" || s.status === "aborted"));
  const lastRound = useData(
    () => (!lastSurvey ? Promise.resolve(null) : api.survey(lastSurvey.id)),
    [lastSurvey?.id],
  );

  const adviceList = adviceNow.data ?? [];
  const blockAdvice = adviceList.find((a) => a.zone === activeZone);
  const blockConditions = (conditions.data ?? []).find((c) => c.zone === activeZone);
  const targets = useMemo(() => targetsFromConditions(blockConditions), [blockConditions]);

  const storedCells: RoverCell[] = useMemo(() => {
    if (!lastSurvey) return [];
    const roundDetail = lastRound.data?.id === lastSurvey.id ? lastRound.data : null;
    if (!roundDetail) return [];
    const adviceByKey = new Map((blockAdvice?.trees ?? []).map((t) => [`${t.row},${t.col}`, t]));
    return roundDetail.cells.map((c) => ({ ...c, advice: c.advice ?? adviceByKey.get(`${c.row},${c.col}`) ?? null }));
  }, [lastSurvey, lastRound.data, blockAdvice]);

  const cells = activeMission?.cells ?? storedCells;
  const grid = resolveBlockGrid({
    rows: activeMission?.rows ?? lastSurvey?.rows,
    cols: activeMission?.cols ?? lastSurvey?.cols,
    rowM: activeMission?.rowM ?? activeCycle?.grid?.rowM,
    cellM: activeMission?.cellM ?? lastSurvey?.cellM ?? activeCycle?.grid?.treeM,
    cycle: activeCycle,
    zone: activeBed,
  });

  const blockProfile = activeBed?.soilProfile ?? getBlockSoilProfile(activeZone);
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

  useEffect(() => {
    if (!activeZone) return;
    const plantLabel = selected ? cellName(selected[0], selected[1]) : null;
    setRoverContext({ zone: activeZone, plant: plantLabel });
    const next = new URLSearchParams();
    next.set("zone", activeZone);
    if (plantLabel) next.set("plant", plantLabel);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [activeZone, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPlant = useMemo(
    () => (selected ? allPlants.find((p) => p.row === selected[0] && p.col === selected[1]) ?? null : null),
    [allPlants, selected],
  );

  const blockAttentionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of adviceList) {
      const n = a.trees.filter(
        (t) =>
          t.plant &&
          t.notes.some(
            (note) =>
              note !== "Yellow leaves: expected" &&
              note !== "No probe reading" &&
              note !== "No tree seen" &&
              note !== "No plant seen",
          ),
      ).length;
      if (n > 0) map.set(a.zone, n);
    }
    if (activeZone) map.set(activeZone, summary.attention);
    return map;
  }, [adviceList, activeZone, summary.attention]);

  const liveFrame = useData(
    () => (detailOpen && selected && activeMission ? api.roverFrame(selected[0], selected[1]) : Promise.resolve(null)),
    [detailOpen, selected?.[0], selected?.[1], activeMission?.missionId],
  );

  const running = activeMission?.status === "queued" || activeMission?.status === "running";
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

  const raining = beds.some((b) => b.rain === true);
  const isSmallScreen = typeof window !== "undefined" && window.innerWidth <= 640;
  const sceneHeight = isSmallScreen ? 340 : 440;
  const pageError = liveError ?? zones.error ?? conditions.error;

  function selectBlock(nextZone: string) {
    setZone(nextZone);
    setSelected(null);
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
    setRoverContext({ zone: plant.zone, plant: plant.name });
    navigate(`/rover/history?zone=${encodeURIComponent(plant.zone)}&plant=${encodeURIComponent(plant.name)}`);
  }

  const autoStatusText = running
    ? `AgriRover scanning automatically · ${activeMission?.cellsScanned ?? 0} of ${activeMission?.cellsTotal ?? grid.rows * grid.cols} plants`
    : lastSurvey
      ? `Monitored automatically by AgriRover · Last updated ${ago(lastSurvey.finishedAt ?? lastSurvey.startedAt)}`
      : "Monitored automatically by AgriRover";

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {pageError && <Notice kind="alert">{loadProblem(pageError)}</Notice>}
      {raining && !running && <Notice kind="warn">Rain detected in the tomato plots. Watering and rover rounds are paused today.</Notice>}

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
              <span className="small muted">{zones.data === null && !zones.error ? "Loading blocks…" : "No blocks available."}</span>
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

          {zones.data === null ? (
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
                : "No soil survey readings recorded for this block yet."}
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
