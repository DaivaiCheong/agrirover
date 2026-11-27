import { useEffect, useMemo, useState } from "react";
import { Camera, Eye, EyeOff, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import BedTrends, { RANGES } from "../components/BedTrends";
import RoverMap, { RoverLegend } from "../components/RoverMap";
import RoverVisionPhoto from "../components/RoverVisionPhoto";
import { Empty, Kpis, Modal, Notice, Panel, Tag } from "../components/ui";
import { api, loadProblem, type RoverCell, type SurveySummary } from "../lib/api";
import { STATUS_WORD, cellName, stopInfo } from "../lib/rover";
import { buildDemoOrchardData } from "../lib/roverDemo";
import { getRoverContext, parsePlantLabel, setRoverContext, targetsFromConditions } from "../lib/soil";
import { useData } from "../lib/useData";
import { ago } from "../lib/usePoll";
import { evaluatePlantVision, type PlantVisionInfo } from "../lib/vision";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function StatusCell({ s }: { s: SurveySummary }) {
  const [kind, word] = STATUS_WORD[s.status] ?? [undefined, s.status];
  return (
    <>
      <Tag kind={kind}>{word}</Tag>
      {s.abortReason && <span className="small muted"> {stopInfo(s.abortReason)?.label}</span>}
    </>
  );
}

type PlantPoint = {
  id: string;
  at: string;
  label: string;
  moisture: number | null;
  ph: number | null;
  ec: number | null;
  soilTemp: number | null;
  n: number | null;
  p: number | null;
  k: number | null;
  canopy: number | null;
  canopyPct: number | null;
  chlorosis: number | null;
  chlorosisPct: number | null;
  note: string;
  vision: PlantVisionInfo;
};

function PlantMetricChart({
  title,
  unit,
  data,
  dataKey,
  band,
}: {
  title: string;
  unit: string;
  data: PlantPoint[];
  dataKey: "moisture" | "ph" | "ec" | "soilTemp";
  band?: [number, number];
}) {
  const valid = data.filter((d) => d[dataKey] !== null);
  const latest = valid[valid.length - 1]?.[dataKey];

  return (
    <div className="trend">
      <div className="trend-head">
        <span className="trend-title">{title}</span>
        <span className="trend-now">
          {latest !== null && latest !== undefined ? latest.toFixed(dataKey === "moisture" || dataKey === "soilTemp" ? 1 : 2) : "—"}
          {unit && <small>{unit}</small>}
        </span>
      </div>
      {valid.length < 2 ? (
        <div className="trend-empty">Not enough rounds for this plant</div>
      ) : (
        <div style={{ height: 132 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="#2E7D4F" fillOpacity={0.1} />}
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
              <YAxis width={36} domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--ink-muted)" }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => [`${v}${unit ? ` ${unit}` : ""}`, title]} />
              <Line type="monotone" dataKey={dataKey} stroke="#2563A8" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {band && <div className="trend-note">Shaded: target {band[0]}–{band[1]}{unit ? ` ${unit}` : ""}</div>}
    </div>
  );
}

function recoverySummary(pts: PlantPoint[]): { kind: "ok" | "warn" | undefined; text: string } {
  if (pts.length < 2) return { kind: undefined, text: "Single check recorded" };
  const last = pts[pts.length - 1];
  const peakY = Math.max(...pts.slice(0, -1).map((p) => p.chlorosisPct ?? 0));
  const y1 = last.chlorosisPct ?? 0;
  if (peakY > y1 && last.vision.status === "healthy") return { kind: "ok", text: `Recovered: yellowing dropped ${peakY}% → ${y1}%` };
  if (peakY > y1) return { kind: "ok", text: `Improving: yellowing reduced ${peakY}% → ${y1}%` };
  if (last.vision.status === "alert") return { kind: "warn", text: `Active vision alert (${last.vision.badgeLabel})` };
  return { kind: "ok", text: "Consistently healthy foliage" };
}

function avgMetric(cells: RoverCell[], metric: string, digits: number, suffix = ""): string {
  const vals = cells.map((c) => c.readings?.[metric]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return "—";
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return `${mean.toFixed(digits)}${suffix}`;
}

function RoundSummaryModal({
  round,
  stageN,
  selectedPlant,
  onPickPlant,
  onClose,
}: {
  round: SurveySummary & { cells: RoverCell[] };
  stageN: number | null;
  selectedPlant: [number, number] | null;
  onPickPlant: (name: string) => void;
  onClose: () => void;
}) {
  const [showBoxes, setShowBoxes] = useState(true);
  const living = round.cells.filter((c) => c.plant);
  const flaggedPlants = living
    .map((c) => ({
      cell: c,
      name: cellName(c.row, c.col),
      vision: evaluatePlantVision({
        row: c.row,
        col: c.col,
        reached: true,
        plant: true,
        cell: c,
        stageN,
        capturedAt: round.finishedAt ?? round.startedAt,
      }),
    }))
    .filter((x) => x.vision.status === "alert" || x.cell.flagged);

  return (
    <Modal title={`${round.bedLabel} · ${when(round.startedAt)}`} onClose={onClose} width={760}>
      <div className="modal-body-erp stack">
        <div className="psm-status-row">
          <StatusCell s={round} />
          <span className="small muted">Recorded automatically by AgriRover</span>
        </div>

        <Kpis
          items={[
            { k: "Plants checked", v: round.plantsDetected ?? living.length },
            { k: "Needs attention", v: flaggedPlants.length },
            { k: "Avg moisture", v: avgMetric(living, "soil_moisture", 1, " %") },
            { k: "Avg soil pH", v: avgMetric(living, "soil_ph", 2) },
            { k: "Avg EC", v: avgMetric(living, "soil_ec", 2, " mS/cm") },
          ]}
        />

        <div className="erp-section">
          <div className="erp-section-header">
            <span className="erp-section-title">
              <Camera size={14} aria-hidden />
              Flagged plants &amp; captures ({flaggedPlants.length})
            </span>
            {flaggedPlants.length > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowBoxes((v) => !v)}>
                {showBoxes ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                {showBoxes ? "Hide AI boxes" : "Show AI boxes"}
              </button>
            )}
          </div>
          {flaggedPlants.length === 0 ? (
            <p className="small muted">No plants flagged in this check — all scanned tomato plots were healthy.</p>
          ) : (
            <div className="rv-round-captures">
              {flaggedPlants.map(({ cell: c, name, vision }) => (
                <div key={name} className="rv-hist-card">
                  <div className="rv-hist-head">
                    <b>{name}</b>
                    <button
                      type="button"
                      className="linkbtn small"
                      onClick={() => {
                        onPickPlant(name);
                        onClose();
                      }}
                    >
                      View plant history
                    </button>
                  </div>
                  <RoverVisionPhoto
                    plantName={name}
                    vision={vision}
                    canopy={c.canopy}
                    chlorosis={c.chlorosis}
                    soilMoisture={c.readings?.soil_moisture}
                    showBoxes={showBoxes}
                    compact
                  />
                  <div className="rv-hist-foot">
                    <Tag kind="warn">{vision.badgeLabel}</Tag>
                    <span className="small muted">
                      Moisture {c.readings?.soil_moisture !== undefined ? `${c.readings.soil_moisture.toFixed(1)}%` : "—"} · pH{" "}
                      {c.readings?.soil_ph !== undefined ? c.readings.soil_ph.toFixed(2) : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {round.rows && round.cols && (
          <div className="erp-section">
            <div className="erp-section-header">
              <span className="erp-section-title">Plot layout snapshot</span>
              <span className="small muted">{round.rows} rows × {round.cols} plants</span>
            </div>
            <RoverMap
              rows={round.rows}
              cols={round.cols}
              cells={round.cells}
              selected={selectedPlant}
              onPick={(row, col) => {
                onPickPlant(cellName(row, col));
                onClose();
              }}
            />
            <div style={{ marginTop: 10 }}>
              <RoverLegend />
            </div>
          </div>
        )}
      </div>

      <div className="modal-foot-erp">
        <div className="erp-foot-actions">
          <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

export default function RoverHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCtx = useMemo(() => {
    const qZone = searchParams.get("zone");
    const qPlant = searchParams.get("plant");
    if (qZone || qPlant) return { zone: qZone ?? "", plant: qPlant };
    return getRoverContext();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const zones = useData(api.zones);
  const previewMode = Boolean(zones.error && zones.data === null);
  const demo = useMemo(() => buildDemoOrchardData(), []);
  const conditions = useData(api.conditions);
  const surveys = useData(api.surveys);

  const [zone, setZone] = useState<string>(initialCtx?.zone ?? "");
  const [selectedPlant, setSelectedPlant] = useState<string | null>(initialCtx?.plant ?? null);
  const [hours, setHours] = useState<number>(RANGES[0].hours);
  const [modalRoundId, setModalRoundId] = useState<string | null>(null);
  const [showAiBoxes, setShowAiBoxes] = useState(true);

  const beds = previewMode ? demo.zones : (zones.data ?? []);
  const activeZone = zone === "all" ? "" : (zone || beds[0]?.zone || "");
  const activeBed = beds.find((b) => b.zone === activeZone);
  const blockLabel = activeBed?.label ?? activeZone;

  const allRounds = previewMode ? demo.surveys : (surveys.data ?? []);
  const filteredRounds = useMemo(
    () => (zone === "all" ? allRounds : allRounds.filter((r) => !activeZone || r.zone === activeZone)),
    [allRounds, zone, activeZone],
  );

  useEffect(() => {
    if (!activeZone && zone !== "all") return;
    setRoverContext({ zone: activeZone || beds[0]?.zone || "", plant: selectedPlant });
    const next = new URLSearchParams();
    if (zone === "all") next.set("zone", "all");
    else if (activeZone) next.set("zone", activeZone);
    if (selectedPlant) next.set("plant", selectedPlant);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [zone, activeZone, selectedPlant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load newest round cells only to populate the Plant filter dropdown cleanly
  const latestRoundId = filteredRounds[0]?.id ?? null;
  const latestRoundFetch = useData(
    () => (previewMode || !latestRoundId ? Promise.resolve(null) : api.survey(latestRoundId)),
    [previewMode, latestRoundId],
  );
  const latestRound = previewMode ? (latestRoundId ? demo.roundsById.get(latestRoundId) ?? null : null) : latestRoundFetch.data;

  // Fetch clicked round details when opening the Round Summary Pop-Up Card
  const modalRoundFetch = useData(
    () => (previewMode || !modalRoundId ? Promise.resolve(null) : api.survey(modalRoundId)),
    [previewMode, modalRoundId],
  );
  const modalRound = previewMode ? (modalRoundId ? demo.roundsById.get(modalRoundId) ?? null : null) : modalRoundFetch.data;

  const plantRc = parsePlantLabel(selectedPlant);

  const plantOptions = useMemo(() => {
    if (!latestRound?.cells) return [];
    return latestRound.cells
      .filter((c) => c.plant)
      .map((c) => cellName(c.row, c.col));
  }, [latestRound?.cells]);

  const activeCond = (previewMode ? demo.conditions : (conditions.data ?? [])).find((c) => c.zone === activeZone);
  const stageN = activeCond?.stage?.n ?? null;

  const blockRoundIds = useMemo(
    () =>
      selectedPlant && activeZone
        ? allRounds
            .filter((s) => s.zone === activeZone && (s.status === "completed" || s.status === "aborted"))
            .slice(0, 14)
            .map((s) => s.id)
        : [],
    [allRounds, activeZone, selectedPlant],
  );
  const blockRoundIdsKey = blockRoundIds.join(",");
  const plantSeriesData = useData(async () => {
    if (!blockRoundIds.length || !plantRc) return [];
    const details = previewMode
      ? blockRoundIds.map((id) => demo.roundsById.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d))
      : await Promise.all(blockRoundIds.map((id) => api.survey(id)));
    return details
      .slice()
      .reverse()
      .map((d): PlantPoint | null => {
        const found: RoverCell | undefined = d.cells.find((c) => c.row === plantRc[0] && c.col === plantRc[1]);
        if (!found || !found.plant) return null;
        const rd = found.readings ?? {};
        const at = d.finishedAt ?? d.startedAt;
        const vision = evaluatePlantVision({
          row: plantRc[0],
          col: plantRc[1],
          reached: true,
          plant: true,
          cell: found,
          stageN,
          capturedAt: at,
        });
        return {
          id: d.id,
          at,
          label: shortDay(at),
          moisture: rd.soil_moisture ?? null,
          ph: rd.soil_ph ?? null,
          ec: rd.soil_ec ?? null,
          soilTemp: rd.soil_temperature ?? null,
          n: rd.nitrogen ?? null,
          p: rd.phosphorus ?? null,
          k: rd.potassium ?? null,
          canopy: found.canopy ?? null,
          canopyPct: found.canopy !== undefined && found.canopy !== null ? Math.round(found.canopy * 100) : null,
          chlorosis: found.chlorosis ?? null,
          chlorosisPct: found.chlorosis !== undefined && found.chlorosis !== null ? Math.round(found.chlorosis * 100) : null,
          note: vision.badgeLabel,
          vision,
        };
      })
      .filter((x): x is PlantPoint => x !== null);
  }, [previewMode, blockRoundIdsKey, selectedPlant, stageN]);

  const targets = targetsFromConditions(activeCond);
  const waitingApi = !previewMode && (zones.loading || surveys.loading) && !zones.error && !surveys.error;
  const demoSeries = useMemo(
    () => (previewMode && activeZone ? demo.telemetryFor(activeZone, hours) : null),
    [previewMode, activeZone, hours, demo],
  );
  const error = previewMode ? null : (zones.error ?? surveys.error ?? modalRoundFetch.error ?? conditions.error);
  const newestAt = filteredRounds[0]?.finishedAt ?? filteredRounds[0]?.startedAt ?? null;

  const comparisonSnapshots = useMemo(() => {
    const pts = plantSeriesData.data ?? [];
    if (pts.length <= 4) return pts;
    const indices = new Set([0, Math.floor(pts.length / 3), Math.floor((2 * pts.length) / 3), pts.length - 1]);
    return [...indices].sort((a, b) => a - b).map((idx) => pts[idx]);
  }, [plantSeriesData.data]);

  const recovery = useMemo(() => recoverySummary(plantSeriesData.data ?? []), [plantSeriesData.data]);

  function chooseBlock(next: string) {
    setZone(next);
    setSelectedPlant(null);
    setModalRoundId(null);
  }

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {error && <Notice kind="alert">{loadProblem(error)}</Notice>}

      <Panel
        title="Soil & round history"
        pad={false}
        right={
          <div className="rv-right">
            {previewMode && <Tag>Sample data · Synced with AgriRover</Tag>}
            <span className="small muted">
              Monitored automatically by AgriRover{newestAt ? ` · Last updated ${ago(newestAt)}` : ""}
            </span>
            <div className="seg" role="group" aria-label="Trend period">
              {RANGES.map((rng) => (
                <button key={rng.hours} type="button" className={hours === rng.hours ? "on" : ""} onClick={() => setHours(rng.hours)}>
                  {rng.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="rv-blocks" role="group" aria-label="Filter by block">
          <button
            type="button"
            className={`f3-chip${zone === "all" ? " on" : ""}`}
            aria-pressed={zone === "all"}
            onClick={() => chooseBlock("all")}
          >
            All blocks
          </button>
          {beds.map((b) => (
            <button
              key={b.zone}
              type="button"
              className={`f3-chip${zone !== "all" && b.zone === activeZone ? " on" : ""}`}
              aria-pressed={zone !== "all" && b.zone === activeZone}
              onClick={() => chooseBlock(b.zone)}
            >
              {b.label ?? b.zone}
            </button>
          ))}
        </div>

        {zone !== "all" && activeZone && (
          <div className="rv-action-bar">
            <div className="rowflex" style={{ gap: 8 }}>
              <label className="rowflex" style={{ gap: 8 }}>
                <span className="small muted">Plant filter</span>
                <select
                  className="erp-select"
                  style={{ width: "auto", minWidth: 160, height: 32, minHeight: 32 }}
                  value={selectedPlant ?? ""}
                  onChange={(e) => setSelectedPlant(e.target.value || null)}
                >
                  <option value="">All plants in {blockLabel}</option>
                  {selectedPlant && !plantOptions.includes(selectedPlant) && (
                    <option value={selectedPlant}>{selectedPlant}</option>
                  )}
                  {plantOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>

              {selectedPlant && (
                <button
                  type="button"
                  className="f3-chip on rowflex"
                  style={{ gap: 5 }}
                  onClick={() => setSelectedPlant(null)}
                  title="Clear plant filter"
                >
                  {selectedPlant} <X size={13} aria-hidden />
                </button>
              )}
            </div>
            <span className="small muted">
              {selectedPlant
                ? `Showing soil & camera history for ${selectedPlant} in ${blockLabel}`
                : `Click any past check row to open its summary card`}
            </span>
          </div>
        )}
      </Panel>

      {/* Compact per-plant AI Vision photo comparison & soil trend charts */}
      {zone !== "all" && activeZone && selectedPlant && (
        <>
          <Panel
            title={`Rover camera history · ${blockLabel} · ${selectedPlant}`}
            icon={Camera}
            pad={false}
            right={
              <div className="rv-right">
                <Tag kind={recovery.kind}>{recovery.text}</Tag>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-pressed={showAiBoxes}
                  onClick={() => setShowAiBoxes((v) => !v)}
                >
                  {showAiBoxes ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  {showAiBoxes ? "Hide AI boxes" : "Show AI boxes"}
                </button>
              </div>
            }
          >
            {(waitingApi || (plantSeriesData.loading && !plantSeriesData.data)) ? (
              <p className="panel-pad muted">Loading plant photos…</p>
            ) : !comparisonSnapshots.length ? (
              <Empty>No past rover photos recorded for {selectedPlant} in {blockLabel}.</Empty>
            ) : (
              <div className="rv-hist-photos">
                {comparisonSnapshots.map((pt, idx) => (
                  <div key={pt.id} className="rv-hist-card">
                    <div className="rv-hist-head">
                      <b>{pt.label}</b>
                      <span className="small muted">{idx === comparisonSnapshots.length - 1 ? "Latest" : `Check #${idx + 1}`}</span>
                    </div>
                    <RoverVisionPhoto
                      plantName={selectedPlant}
                      vision={pt.vision}
                      canopy={pt.canopy}
                      chlorosis={pt.chlorosis}
                      soilMoisture={pt.moisture}
                      showBoxes={showAiBoxes}
                      compact
                    />
                    <div className="rv-hist-foot">
                      <Tag kind={pt.vision.status === "healthy" ? "ok" : pt.vision.status === "alert" ? "warn" : undefined}>
                        {pt.vision.badgeLabel}
                      </Tag>
                      <span className="small muted">
                        Leaf {pt.canopyPct ?? "—"}% · Yellow {pt.chlorosisPct ?? 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={`Plant soil history · ${blockLabel} · ${selectedPlant}`}
            pad={false}
            right={
              <button type="button" className="linkbtn small" onClick={() => setSelectedPlant(null)}>
                Show block summary
              </button>
            }
          >
            {(waitingApi || (plantSeriesData.loading && !plantSeriesData.data)) ? (
              <p className="panel-pad muted">Loading plant readings…</p>
            ) : !plantSeriesData.data?.length ? (
              <Empty>No past readings recorded for {selectedPlant} in {blockLabel}.</Empty>
            ) : (
              <div className="trend-wrap">
                <div className="grid g2">
                  <PlantMetricChart title="Soil moisture" unit="%" data={plantSeriesData.data} dataKey="moisture" band={targets.moisture} />
                  <PlantMetricChart title="Soil pH" unit="" data={plantSeriesData.data} dataKey="ph" band={targets.ph} />
                  <PlantMetricChart title="Soil EC" unit="mS/cm" data={plantSeriesData.data} dataKey="ec" band={targets.ec} />
                  <PlantMetricChart title="Soil temperature" unit="°C" data={plantSeriesData.data} dataKey="soilTemp" band={targets.soilTemp} />
                </div>
              </div>
            )}
          </Panel>
        </>
      )}

      {zone !== "all" && activeCond && (
        <Panel title={`Block soil & air trends · ${activeCond.label ?? activeCond.zone}`} pad={false}>
          <BedTrends zone={activeCond.zone} params={activeCond.params} hours={hours} fallbackSeries={demoSeries} />
        </Panel>
      )}

      <Panel
        title={`Past rover checks${zone !== "all" && blockLabel ? ` · ${blockLabel}` : ""}`}
        pad={false}
        right={<span className="small muted">Click a check to view its summary card</span>}
      >
        {waitingApi ? (
          <p className="panel-pad muted">Loading past checks…</p>
        ) : filteredRounds.length === 0 ? (
          <Empty>No past checks recorded yet{zone !== "all" && blockLabel ? ` for ${blockLabel}` : ""}.</Empty>
        ) : (
          <div className="tablewrap rc-history">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Block</th>
                  <th className="r">Plants Checked</th>
                  <th className="r">Needs Attention</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRounds.map((s) => (
                  <tr
                    key={s.id}
                    className={`pickable${modalRoundId === s.id ? " picked" : ""}`}
                    onClick={() => setModalRoundId(s.id)}
                  >
                    <td className="nowrap"><b>{when(s.startedAt)}</b></td>
                    <td className="nowrap">{s.bedLabel}</td>
                    <td className="r num">{s.plantsDetected ?? s.cellsScanned ?? "—"}</td>
                    <td className="r num">{s.cellsFlagged ?? "—"}</td>
                    <td className="nowrap"><StatusCell s={s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {modalRoundId && modalRound && (
        <RoundSummaryModal
          round={modalRound}
          stageN={stageN}
          selectedPlant={plantRc}
          onPickPlant={(name) => setSelectedPlant(name)}
          onClose={() => setModalRoundId(null)}
        />
      )}
    </main>
  );
}
