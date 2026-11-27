import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleCheck, Circle, OctagonX, Play, Plus, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import RoverMap, { RoverLegend } from "../components/RoverMap";
import { TreePhotoCheck } from "../components/TreePhoto";
import Farm3D from "../components/Farm3D";
import { farmBlocks, photoKeys, roverBlock } from "../lib/farm3d";
import { EF, Kpis, More, Notice, Panel, Tag, Toolbar } from "../components/ui";
import { api, loadProblem, type RoverCell } from "../lib/api";
import { todayIso } from "../lib/format";
import { CORNERS, DEFAULT_ROUTE, ROVER, STATUS_WORD, cellName, cornerCell, estimate, fullLitresOf, headingAt, isRoute, litresOf, minutes, roundPlan, route as routeOf,
  spotKey, stopInfo, throughStops, type Corner, type Route } from "../lib/rover";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";

type Simulate = "normal" | "rain" | "low_battery";

// The middle check names the start tree and the way to face, from the route: see placeCheck().
const MANUAL = ["Rows clear of people, animals and hoses", "Rover at the start tree", "Camera clean, probe tip clean"];
const placeCheck = (path: [number, number][]) =>
  path.length === 0 ? "Place a plant on the map first"
    : path.length > 1 ? `Rover on ${cellName(...path[0])}, facing ${cellName(...path[1])}` : `Rover on ${cellName(...path[0])}`;

// The route is set once for a block and kept on this device, so the next round starts where the rover is parked.
const routeKey = (zone: string) => `agrirover.route.${zone}`;
function savedRoute(zone: string): Route {
  try {
    const x: unknown = JSON.parse(localStorage.getItem(routeKey(zone)) ?? "null");
    return isRoute(x) ? x : DEFAULT_ROUTE;
  } catch { return DEFAULT_ROUTE; }
}
const SIMULATE: Record<Simulate, string> = { normal: "Normal round", rain: "Rain starts on the way", low_battery: "Battery runs low on the way" };
const LABEL: Record<string, string> = {
  soil_moisture: "Moisture %", soil_ec: "EC mS/cm", soil_ph: "pH", soil_temperature: "Soil °C",
  nitrogen: "N (trend)", phosphorus: "P (trend)", potassium: "K (trend)", air_temperature: "Air °C", air_humidity: "RH %",
};

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className={ok ? "chk chk-ok" : "chk"}>{ok ? <CircleCheck size={15} aria-hidden /> : <Circle size={15} aria-hidden />}{children}</li>;
}

/** What the photo check said about a plant the rover flagged: kept in Health › Photo library for an expert to confirm. */
function PhotoCheckLine({ check }: { check?: RoverCell["check"] }) {
  if (!check) return <span className="muted">Checking the photo… (real rover only)</span>;
  return (
    <>
      <b>{check.title}</b>{check.also && <span className="muted"> · or {check.also.toLowerCase()}</span>}
      {check.seen && <div className="small">{check.seen}</div>}
      {check.problem && <div className="small muted">{check.problem}</div>}
      <div className="small muted">Triage, not a diagnosis.{check.photoId && <> Kept in <Link to="/photos">Health › Photo library</Link>.</>}</div>
    </>
  );
}

/** One tree as the rover found it: the photo if one came with the round, what the probe read, and what it should get today. */
function CellView({ cell, frame, held }: { cell?: RoverCell; frame?: string | null; held?: boolean }) {
  if (!cell) return <p className="small muted">The rover's photos and readings appear here during a round.</p>;
  const a = cell.advice;
  return (
    <div className={frame ? "rc-cam" : undefined}>
      {frame && <img src={`data:image/jpeg;base64,${frame}`} alt={`Photo of ${cellName(cell.row, cell.col)}`} />}
      <table className="tbl kv"><tbody>
        <tr><th scope="row">Tree</th><td><b>{cellName(cell.row, cell.col)}</b>{!cell.plant && " · no tree seen"}</td></tr>
        {a && cell.plant && <tr><th scope="row">Water today</th><td>{held ? <span className="muted">Held: induction stress</span> : <><b>{a.litres} L</b> of {a.fullLitres} L full demand</>}</td></tr>}
        {cell.plant && <tr><th scope="row">Leaf cover</th><td>{Math.round((cell.canopy ?? 0) * 100)} %{cell.flagged && <> <Tag kind="warn">Yellow {Math.round((cell.chlorosis ?? 0) * 100)} %</Tag></>}</td></tr>}
        {cell.flagged && <tr><th scope="row">Photo check</th><td><PhotoCheckLine check={cell.check} /></td></tr>}
        {Object.keys(LABEL).filter((k) => cell.readings?.[k] !== undefined).map((k) => (
          <tr key={k}><th scope="row">{LABEL[k]}</th><td>{cell.readings[k]}</td></tr>
        ))}
      </tbody></table>
    </div>
  );
}

/** Every tree of the round: the table behind the map. */
export function TreeTable({ cells, picked, onPick, held }: { cells: RoverCell[]; picked?: [number, number] | null; onPick?: (r: number, c: number) => void; held?: boolean }) {
  const trees = cells.filter((c) => c.plant);
  const given = litresOf(cells), full = fullLitresOf(cells);
  const hasAdvice = cells.some((c) => c.advice);
  return (
    <Panel title={`Trees (${trees.length})`} pad={false}
           right={!hasAdvice ? undefined : held ? <span className="small muted">Water held: induction stress</span>
             : <span className="small muted">Water today {given.toFixed(0)} L of {full.toFixed(0)} L full demand</span>}>
      {trees.length === 0 ? <p className="panel-pad small muted">Nothing yet.</p> : (
        <div className="tablewrap rc-list">
          <table className="tbl">
            <thead><tr><th>Tree</th>{hasAdvice && <th className="r">Water L</th>}<th className="r">Moisture %</th><th className="r">EC</th><th className="r">pH</th><th className="r">Leaf %</th><th>Note</th></tr></thead>
            <tbody>
              {trees.map((c) => {
                const notes = [...(c.advice?.notes ?? [])];
                if (!c.advice && c.flagged) notes.push("Yellow leaves");
                return (
                  <tr key={`${c.row}-${c.col}`} className={`pickable${picked?.[0] === c.row && picked?.[1] === c.col ? " picked" : ""}`} onClick={() => onPick?.(c.row, c.col)}>
                    <td className="nowrap"><b>{cellName(c.row, c.col)}</b></td>
                    {hasAdvice && <td className="r">{held ? <span className="muted">Hold</span> : <b>{c.advice?.litres ?? "—"}</b>}</td>}
                    <td className="r">{c.readings?.soil_moisture ?? "—"}</td>
                    <td className="r">{c.readings?.soil_ec ?? "—"}</td>
                    <td className="r">{c.readings?.soil_ph ?? "—"}</td>
                    <td className="r">{c.canopy === undefined || c.canopy === null ? "—" : Math.round(c.canopy * 100)}</td>
                    <td className="small">{notes.join(" · ").replace(/: look/g, "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** The block in 3D fills the first screen, with the round beside it. What to look at across the farm is on Today and Health,
 *  and the schedule is on Plan, so neither is repeated here. */
export default function Rover() {
  const { data, error } = usePoll(api.roverLive, 1000);
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const adviceNow = usePoll(api.advice, 30000);
  const rover = data?.rover, live = data?.mission ?? null;

  const [zone, setZone] = useState("");
  const [rows, setRows] = useState("4");
  const [cols, setCols] = useState("4");
  const [rowM, setRowM] = useState("3");
  const [treeM, setTreeM] = useState("3");
  const [simulate, setSimulate] = useState<Simulate>("normal");
  const [ticked, setTicked] = useState<boolean[]>(MANUAL.map(() => false));
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const [view, setView] = useState<"3d" | "map">("3d");
  const [plan, setPlan] = useState<Route>(DEFAULT_ROUTE);
  const scene = useRef<HTMLDivElement>(null);
  // the plant map of a block (the tomato demo): where the plants stand, so the rover stops at those only
  const maps = useData(api.plantMaps);
  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<Set<string> | null>(null);       // plants placed or removed, not saved yet
  const [crop, setCrop] = useState("Tomato");
  // the plant-map form: "new" makes a new block, "map" gives the chosen block (a bed from Farm › Add bed) its plant map
  const [making, setMaking] = useState<false | "new" | "map">(false);
  const [nb, setNb] = useState({ label: "T2 Tomato", crop: "Tomato", rows: "2", cols: "3", rowM: "0.8", plantM: "0.5" });
  const [saving, setSaving] = useState(false);

  const beds = zones.data ?? [];
  const growing = (cycles.data ?? []).filter((c) => c.status === "active");
  const bed = zone || growing[0]?.zone || beds[0]?.zone || "";
  const cycle = growing.find((c) => c.zone === bed);
  const pm = (maps.data ?? []).find((x) => x.zone === bed) ?? null;
  const savedPlants = useMemo(() => new Set((pm?.plants ?? []).map(([a, b]) => spotKey(a, b))), [pm]);

  // a block with a plant map: its own grid and plants, shown on the map (the 3D view draws guava trees)
  useEffect(() => {
    setDraft(null); setPlacing(false);
    if (!pm) return;
    setRows(String(pm.rows)); setCols(String(pm.cols)); setRowM(String(pm.rowM)); setTreeM(String(pm.plantM)); setCrop(pm.crop);
    setView("map");
  }, [bed, pm?.updatedAt]);       // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (bed) setPlan(savedRoute(bed)); }, [bed]);
  function changeRoute(next: Route) {
    setPlan(next);
    if (bed) localStorage.setItem(routeKey(bed), JSON.stringify(next));
    setView("map");                                   // the route is drawn on the map
    setTicked((t) => t.map((v, i) => (i === 1 ? false : v)));   // a new start tree: place the rover again
  }

  // the block's own rows and spacing, from its setup and tree count
  const grid = cycle?.grid;
  useEffect(() => {
    if (!grid || pm) return;                          // a plant map, where there is one, says where the plants are
    setRows(String(grid.rows)); setCols(String(grid.cols)); setRowM(String(grid.rowM)); setTreeM(String(grid.treeM));
  }, [bed, grid?.rows, grid?.cols, grid?.rowM, grid?.treeM]);

  // the live round if there is one here; otherwise this block's newest stored round
  const m = live && (live.status === "queued" || live.status === "running" || live.zoneId === bed) ? live : null;
  const history = useData(api.surveys, [live?.missionId, live?.status]);
  const last = m ? undefined : (history.data ?? []).find((s) => s.zone === bed && (s.status === "completed" || s.status === "aborted"));
  const lastRound = useData(() => (last ? api.survey(last.id) : Promise.resolve(null)), [last?.id]);
  const adviceList = adviceNow.data ?? [];
  const blockAdvice = adviceList.find((a) => a.zone === bed);
  const adviceOf = new Map((blockAdvice?.trees ?? []).map((t) => [`${t.row},${t.col}`, t]));
  const storedCells: RoverCell[] = (last && lastRound.data?.id === last.id ? lastRound.data.cells : []).map((x) => ({ ...x, advice: adviceOf.get(`${x.row},${x.col}`) ?? null }));
  const slots = roundPlan(growing, "07:00", adviceList, todayIso());
  // during induction stress no water is the plan, not a zero: say "held"
  const shownZone = m?.zoneId ?? bed;
  const held = Boolean(adviceList.find((a) => a.zone === shownZone)?.water.paused);
  // trees someone has photographed, for a mark on the map: the camera on the rover is not built, so a person is the camera for now
  const savedPhotos = useData(() => api.photos("all"));
  const photographed = new Set((savedPhotos.data?.photos ?? []).filter((p) => p.zone === shownZone && p.tree)
    .map((p) => { const [r, t] = p.tree!.replace(/[RT]/g, "").split(" ").map(Number); return `${r - 1},${t - 1}`; }));
  // the same count of trees to look at as Plant health shows
  const looks = useMemo(() => new Map(farmBlocks(adviceNow.data ?? [], cycles.data ?? [], photoKeys(savedPhotos.data?.photos ?? []))
    .map((b) => [b.zone, b.trees.filter((t) => t.alert === "look").length])), [adviceNow.data, cycles.data, savedPhotos.data]);

  const r = Number(rows), c = Number(cols), rm = Number(rowM), tm = Number(treeM);
  const sizeOk = Number.isInteger(r) && Number.isInteger(c) && r >= 1 && c >= 1 && r <= 40 && c <= 40 && r * c <= ROVER.maxTrees && rm >= 0.2 && rm <= 10 && tm >= 0.2 && tm <= 10;
  // the plants on this grid: a smaller grid drops the plants outside it when saved
  const plants = pm ? new Set([...(draft ?? savedPlants)].filter((k) => { const [a, b] = k.split(",").map(Number); return !sizeOk || (a < r && b < c); }))
    : undefined;
  const dirty = Boolean(pm && (draft !== null || r !== pm.rows || c !== pm.cols || rm !== pm.rowM || tm !== pm.plantM || crop.trim() !== pm.crop));
  const est = sizeOk ? estimate(r, c, rm, tm, plan, plants) : null;
  const fullPath = routeOf(sizeOk ? r : 4, sizeOk ? c : 4, plan);
  const planPath = plants ? throughStops(fullPath, plants) : fullPath;
  const asPairs = (s: Set<string>) => [...s].map((k) => k.split(",").map(Number) as [number, number]);

  function togglePlant(row: number, col: number) {
    setDraft((prev) => {
      const next = new Set(prev ?? savedPlants);
      const key = spotKey(row, col);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setTicked((t) => t.map((v, i) => (i === 1 ? false : v)));   // the first plant may have moved: place the rover again
  }
  async function saveMap() {
    if (!pm || !plants || !sizeOk) return;
    setProblem(null); setSaving(true);
    try {
      await api.savePlantMap(pm.zone, { crop: crop.trim() || "Plant", rows: r, cols: c, rowM: rm, plantM: tm, plants: asPairs(plants) });
      await maps.reload();
    } catch (e) { setProblem((e as Error).message); } finally { setSaving(false); }
  }
  async function newBlock() {
    const nr = Number(nb.rows), ncol = Number(nb.cols);
    setProblem(null); setSaving(true);
    try {
      const all: [number, number][] = [];
      for (let a = 0; a < nr; a++) for (let b = 0; b < ncol; b++) all.push([a, b]);   // every spot planted; remove the empty ones on the map
      const body = { crop: nb.crop.trim() || "Plant", rows: nr, cols: ncol, rowM: Number(nb.rowM), plantM: Number(nb.plantM), plants: all };
      const made = making === "map" ? await api.savePlantMap(bed, body) : await api.newPlantBlock({ ...body, label: nb.label.trim() });
      await Promise.all([zones.reload(), maps.reload()]);
      setZone(made.zone); setMaking(false); setPicked(null);
    } catch (e) { setProblem((e as Error).message); } finally { setSaving(false); }
  }

  const running = m?.status === "queued" || m?.status === "running";
  // During a round the map follows the route the rover was sent; otherwise it shows the next round's, to set.
  const shownRoute: Route = running ? (m?.start ? { start: m.start, along: m.along ?? "rows" } : DEFAULT_ROUTE) : plan;
  const raining = beds.some((b) => b.rain === true);
  const online = rover?.status === "online";
  const released = !rover?.estop;
  // a plant map must be saved, and hold a plant, before a round: the rover visits what the server holds
  const mapReady = !pm || (planPath.length > 0 && !dirty);
  const ready = online && released && !raining && ticked.every(Boolean) && sizeOk && Boolean(bed) && !running && mapReady;
  // during a round the map shows the plants the rover was sent to
  const shownPlants = running && m?.stops ? new Set(m.stops.map(([a, b]) => spotKey(a, b))) : plants;

  // a new round starts by following the rover again
  const missionId = m?.missionId;
  useEffect(() => setPicked(null), [missionId]);

  const frame = useData(() => (picked ? api.roverFrame(picked[0], picked[1]) : Promise.resolve(null)), [picked?.[0], picked?.[1], missionId]);
  const cells = m?.cells ?? storedCells;
  const shownCell = picked ? cells.find((x) => x.row === picked[0] && x.col === picked[1])
    : m?.cell ? cells.find((x) => x.row === m.cell![0] && x.col === m.cell![1]) : undefined;
  const shownFrame = picked && m ? frame.data?.frame : m?.frame;

  async function start() {
    setProblem(null);
    try {
      await api.startSurvey({ zoneId: bed, rows: r, cols: c, cellM: tm, rowM: rm, simulate, start: plan.start, along: plan.along,
                              ...(plants ? { stops: asPairs(plants) } : {}) });
      setTicked(MANUAL.map(() => false));            // the checks are for each round
    } catch (e) { setProblem((e as Error).message); }
  }
  async function estop(engaged: boolean) {
    setProblem(null);
    try { await api.roverEstop(engaged); } catch (e) { setProblem((e as Error).message); }
  }

  const stop = m && (m.status === "aborted" || m.status === "rejected" || m.status === "lost" || m.status === "failed") ? stopInfo(m.reason) : null;
  const word = live && (live.status === "queued" || live.status === "running" || m) ? STATUS_WORD[live.status] ?? [undefined, live.status] : [undefined, "Idle"];
  const flagged = cells.filter((x) => x.flagged).length;
  const trees = cells.filter((x) => x.plant).length;
  const hasRound = Boolean(m || last);
  const scanned = m?.cellsScanned ?? last?.cellsScanned ?? null;
  const planned = m?.cellsTotal ?? ((last?.rows ?? 0) * (last?.cols ?? 0));

  // the block and the round fit the window, so nothing important needs scrolling to
  const oneColumn = window.innerWidth <= 900;
  const sceneH = oneColumn ? 340 : Math.max(420, window.innerHeight - 310);

  function pickFromTable(row: number, col: number) {
    setPicked([row, col]);
    scene.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <>
      <Toolbar>
        <span className="tb-left">
          <Tag kind={online ? "ok" : rover?.status === "offline" ? "alert" : "wip"}>{rover?.code ?? "Rover"} {rover?.status ?? "…"}</Tag>
          <Tag kind={word[0]}>{word[1]}</Tag>
          {m?.simulated === false ? <Tag kind="ok">Real rover</Tag> : <Tag>Simulated wheels, camera and probe</Tag>}
        </span>
        {rover?.estop
          ? <><Tag kind="alert">E-stop engaged</Tag><button className="btn btn-sm btn-ghost" onClick={() => estop(false)}>Release</button></>
          : <button className="btn btn-sm btn-alert" onClick={() => estop(true)}><OctagonX size={16} aria-hidden />E-stop</button>}
      </Toolbar>
      <main className="main stack">
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}
        {problem && <Notice kind="alert">{problem}</Notice>}
        {raining && !running && <Notice kind="warn">It is raining on a field node. The rover will not start, and no bed needs water today.</Notice>}
        {stop && <Notice kind="warn"><b>{word[1]}: {stop.label}.</b> {m!.cellsScanned} of {m!.cellsTotal} stops done. {stop.next}</Notice>}

        <div ref={scene}>
          <Panel title={`Block · ${beds.find((b) => b.zone === shownZone)?.label ?? bed}`} pad={false}
                 right={<span className="rv-right">
                   {m ? <span className="small muted">{m.simulated === false ? "Real rover · real speed" : `Generated orchard${running ? ` · ${ROVER.simSpeedup}× real speed` : ""}`}</span>
                     : last ? <span className="small muted">Last round {ago(last.finishedAt ?? last.startedAt)}{last.simulated ? " · simulated" : ""}</span> : null}
                   <span className="seg" role="group" aria-label="View">
                     <button type="button" className={view === "3d" ? "on" : ""} aria-pressed={view === "3d"} onClick={() => setView("3d")}>3D</button>
                     <button type="button" className={view === "map" ? "on" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
                   </span>
                 </span>}>
            <div className="rv-blocks" role="group" aria-label="Block">
              {beds.map((b) => {
                const n = looks.get(b.zone) ?? 0;
                const slot = slots.find((s) => s.zone === b.zone);
                return (
                  <button key={b.zone} type="button" className={`f3-chip${b.zone === shownZone ? " on" : ""}`} aria-pressed={b.zone === shownZone}
                          onClick={() => { setZone(b.zone); setPicked(null); }}>
                    {b.label ?? b.zone}{n ? ` · ${n}` : ""}{slot && !slot.doneAt && <span className="muted"> · Not yet</span>}
                  </button>
                );
              })}
              <button type="button" className={`f3-chip${making === "new" ? " on" : ""}`} aria-pressed={making === "new"} disabled={running}
                      onClick={() => { setMaking(making === "new" ? false : "new"); setPicked(null); }}><Plus size={14} aria-hidden /> New block</button>
            </div>
            <div className="hf">
              <div className="hf-scene">
                {view === "3d" ? (() => {
                  const rowsNow = m?.rows ?? last?.rows ?? (sizeOk ? r : 4), colsNow = m?.cols ?? last?.cols ?? (sizeOk ? c : 4);
                  const rowMNow = m?.rowM ?? cycle?.grid?.rowM ?? (rm || 3), treeMNow = m?.cellM ?? cycle?.grid?.treeM ?? (tm || 3);
                  const block = roverBlock(shownZone, beds.find((b) => b.zone === shownZone)?.label ?? shownZone, rowsNow, colsNow, rowMNow, treeMNow,
                                           cells, photoKeys(savedPhotos.data?.photos ?? []));
                  const path = routeOf(rowsNow, colsNow, shownRoute);
                  const step = m?.cell ? path.findIndex(([a, b]) => a === m.cell![0] && b === m.cell![1]) : -1;
                  return (
                    <>
                      <Farm3D blocks={[block]} focus={shownZone} height={sceneH}
                              selected={picked ? { zone: shownZone, row: picked[0], col: picked[1] } : null}
                              onPick={(t) => setPicked([t.row, t.col])}
                              rover={running && m?.cell ? { zone: shownZone, row: m.cell[0], col: m.cell[1], heading: step >= 0 ? headingAt(path, step) : 0 } : null} />
                      <div className="f3-legend"><span><i className="lg-bang" />Look at</span><span><i className="lg-yellow" />Yellow leaves</span><span><i className="lg-photo" />Photo saved</span></div>
                      {hasRound && !running && <div className="f3-hint">Drag to turn · click a tree</div>}
                    </>
                  );
                })() : (
                  <div className="rv-map" style={{ minHeight: sceneH }}>
                    <div className="rm-wrap">
                      <RoverMap rows={running ? m!.rows : pm && sizeOk ? r : m?.rows ?? last?.rows ?? (sizeOk ? r : 4)}
                                cols={running ? m!.cols : pm && sizeOk ? c : m?.cols ?? last?.cols ?? (sizeOk ? c : 4)} cells={cells}
                                at={running ? m?.cell ?? null : null} selected={picked} onPick={(a, b) => setPicked([a, b])} photos={photographed}
                                route={shownRoute} onRoute={running || placing ? undefined : changeRoute}
                                plants={shownPlants} crop={pm?.crop ?? crop} onPlace={placing && !running ? togglePlant : undefined} />
                    </div>
                    <div className="panel-foot rm-foot"><RoverLegend crop={shownPlants ? pm?.crop ?? crop : undefined} />
                      {!running && <span className="small muted">{placing ? "Tap a spot to place or remove a plant" : `${hasRound ? "Tap a tree · " : ""}Tap a corner dot to start there`}</span>}</div>
                  </div>
                )}
              </div>

              <aside className="hf-list" aria-label={making ? "Plant map" : running ? "At this tree" : picked ? "The tree" : "Today's round"} style={{ maxHeight: oneColumn ? undefined : sceneH }}>
                {making && !running ? (
                  <form className="panel-pad erp-form" onSubmit={(e) => { e.preventDefault(); newBlock(); }}>
                    <div className="rv-round-head"><b>{making === "map" ? `Plant map for ${beds.find((b) => b.zone === bed)?.label ?? bed}` : "New block"}</b>
                      <button type="button" className="linkbtn small" onClick={() => setMaking(false)}>Cancel</button></div>
                    <p className="erp-hint">{making === "map" ? "Where the plants stand in this block, for the rover." : "A block of spots for the rover."} Every spot
                      starts with a plant: remove the empty ones on the map.</p>
                    <div className="erp-grid-2 rc-grid2">
                      {making === "new" && <EF label="Name"><input className="erp-input" required maxLength={80} value={nb.label} onChange={(e) => setNb({ ...nb, label: e.target.value })} /></EF>}
                      <EF label="Crop"><input className="erp-input" required maxLength={40} value={nb.crop} onChange={(e) => setNb({ ...nb, crop: e.target.value })} /></EF>
                      <EF label="Rows"><input className="erp-input" type="number" required min={1} max={40} value={nb.rows} onChange={(e) => setNb({ ...nb, rows: e.target.value })} /></EF>
                      <EF label="Spots a row"><input className="erp-input" type="number" required min={1} max={40} value={nb.cols} onChange={(e) => setNb({ ...nb, cols: e.target.value })} /></EF>
                      <EF label="Row to row (m)"><input className="erp-input" type="number" required min={0.2} max={10} step={0.1} value={nb.rowM} onChange={(e) => setNb({ ...nb, rowM: e.target.value })} /></EF>
                      <EF label="Spot to spot (m)"><input className="erp-input" type="number" required min={0.2} max={10} step={0.1} value={nb.plantM} onChange={(e) => setNb({ ...nb, plantM: e.target.value })} /></EF>
                    </div>
                    <p className="erp-hint">On a floor, leave at least 0.6 m between rows so a pot beside one lane is clear of the next.</p>
                    <button className="btn" type="submit" disabled={saving}><Plus size={16} aria-hidden />{making === "map" ? "Make the plant map" : "Make the block"}</button>
                  </form>
                ) : running ? (
                  <div className="hf-tree">
                    <div className="hf-tree-head"><b>At this tree</b></div>
                    <CellView cell={shownCell} frame={shownFrame} held={held} />
                  </div>
                ) : picked && shownCell ? (
                  <div className="hf-tree">
                    <div className="hf-tree-head">
                      <button type="button" className="linkbtn small" onClick={() => setPicked(null)}><ArrowLeft size={14} aria-hidden /> Today's round</button>
                    </div>
                    <CellView cell={shownCell} frame={shownFrame} held={held} />
                    {shownCell.plant && (
                      <TreePhotoCheck key={`${shownZone}-${shownCell.row}-${shownCell.col}`} zone={shownZone} row={shownCell.row} col={shownCell.col}
                                      soil={false} onSaved={() => savedPhotos.reload()} />
                    )}
                  </div>
                ) : (
                  <div className="panel-pad erp-form">
                    <div className="rv-round-head"><b>Today's round</b><Link className="linkbtn small" to="/plan">Schedule</Link></div>
                    {pm && plants ? (
                      <div className="rv-route">
                        <p className="erp-hint"><b>{plants.size} {crop.trim().toLowerCase() || "plant"} plant{plants.size === 1 ? "" : "s"}</b> on {rows} rows × {cols} spots.
                          The rover drives the route and stops at each plant.</p>
                        <div className="rv-plants">
                          <button type="button" className={`btn btn-sm ${placing ? "" : "btn-ghost"}`} aria-pressed={placing}
                                  onClick={() => { setPlacing(!placing); setView("map"); setPicked(null); }}>
                            <Sprout size={15} aria-hidden />{placing ? "Done placing" : "Place plants"}</button>
                          {dirty && <>
                            <button type="button" className="btn btn-sm" disabled={saving || !sizeOk} onClick={saveMap}>Save plant map</button>
                            <button type="button" className="btn btn-sm btn-ghost" disabled={saving} onClick={() => {
                              setDraft(null); setRows(String(pm.rows)); setCols(String(pm.cols)); setRowM(String(pm.rowM)); setTreeM(String(pm.plantM)); setCrop(pm.crop);
                            }}>Undo changes</button>
                          </>}
                        </div>
                      </div>
                    ) : (
                      <div className="rv-route">
                        <p className="erp-hint">{cycle ? `${cycle.plantCount} trees · ${cycle.setupLabel ?? "no setup"}` : "Nothing growing here: readings only, no advice"}</p>
                        {bed && <div className="rv-plants">
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMaking("map"); setPicked(null); }}>
                            <Sprout size={15} aria-hidden />Place plants for the rover</button>
                        </div>}
                      </div>
                    )}
                    <More label={<span className="small">{rows} rows × {cols} {pm ? "spots" : "trees"} · {rowM} × {treeM} m{simulate !== "normal" ? ` · ${SIMULATE[simulate]}` : ""}</span>}>
                      <div className="erp-form rv-options">
                        <div className="erp-grid-2 rc-grid2">
                          <EF label="Rows"><input className="erp-input" type="number" min={1} max={40} value={rows} onChange={(e) => setRows(e.target.value)} /></EF>
                          <EF label={pm ? "Spots a row" : "Trees a row"}><input className="erp-input" type="number" min={1} max={40} value={cols} onChange={(e) => setCols(e.target.value)} /></EF>
                          <EF label="Row to row (m)"><input className="erp-input" type="number" min={0.2} max={10} step={pm ? 0.1 : 0.5} value={rowM} onChange={(e) => setRowM(e.target.value)} /></EF>
                          <EF label={pm ? "Spot to spot (m)" : "Tree to tree (m)"}><input className="erp-input" type="number" min={0.2} max={10} step={pm ? 0.1 : 0.5} value={treeM} onChange={(e) => setTreeM(e.target.value)} /></EF>
                          {pm && <EF label="Crop"><input className="erp-input" maxLength={40} value={crop} onChange={(e) => setCrop(e.target.value)} /></EF>}
                        </div>
                        <EF label="Simulate">
                          <select className="erp-select" value={simulate} onChange={(e) => setSimulate(e.target.value as Simulate)}>
                            {Object.entries(SIMULATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </EF>
                      </div>
                    </More>
                    <div className="rv-route">
                      <div className="erp-label">Route</div>
                      <div className="erp-grid-2 rc-grid2">
                        <EF label="Start at">
                          <select className="erp-select" value={plan.start} onChange={(e) => changeRoute({ ...plan, start: e.target.value as Corner })}>
                            {CORNERS.map((k) => <option key={k} value={k}>{cellName(...cornerCell(sizeOk ? r : 4, sizeOk ? c : 4, k))}</option>)}
                          </select>
                        </EF>
                        <EF label="Lanes">
                          <span className="seg" role="group" aria-label="Lanes">
                            {(["rows", "across"] as const).map((a) => (
                              <button key={a} type="button" className={plan.along === a ? "on" : ""} aria-pressed={plan.along === a}
                                      onClick={() => changeRoute({ ...plan, along: a })}>{a === "rows" ? "Along rows" : "Across rows"}</button>
                            ))}
                          </span>
                        </EF>
                      </div>
                      <p className="erp-hint">{planPath.length ? `${placeCheck(planPath)}, then ${pm ? "each plant in turn" : "every tree once"}. Or tap a corner dot on the map.` : placeCheck(planPath)}</p>
                    </div>
                    <p className="erp-hint">{est ? `${est.trees} stops · ${est.distanceM.toFixed(est.distanceM < 10 ? 1 : 0)} m · about ${minutes(est.seconds)} on a real rover (probe time is an estimate)` : `At most ${ROVER.maxTrees} trees, 40 a side, spacing 0.2 to 10 m`}</p>
                    <div>
                      <div className="erp-label" style={{ marginBottom: 4 }}>Before starting</div>
                      <ul className="chks">
                        <Check ok={online}>Rover online</Check>
                        <Check ok={released}>E-stop released</Check>
                        <Check ok={!raining}>No rain on the field nodes</Check>
                      </ul>
                      {MANUAL.map((text, i) => (
                        <label key={text} className="chk-man">
                          <input type="checkbox" checked={ticked[i]} onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))} />{i === 1 ? placeCheck(planPath) : text}
                        </label>
                      ))}
                    </div>
                    {pm && !mapReady && <p className="erp-hint">{dirty ? "Save the plant map first: the rover visits the saved plants." : "Place a plant on the map first."}</p>}
                    <button className="btn" disabled={!ready} onClick={start}><Play size={16} aria-hidden />Start round</button>
                  </div>
                )}
              </aside>
            </div>
          </Panel>
        </div>

        <Kpis items={[
          { k: "Stops", v: hasRound && scanned !== null ? `${scanned} of ${planned}` : "—" },
          { k: "Trees seen", v: hasRound ? trees : "—" },
          { k: "Water today", v: !hasRound ? "—" : held ? "Held: stress" : `${litresOf(cells).toFixed(0)} L` },
          { k: "Yellow leaves", v: hasRound ? flagged : "—" },
          { k: `Battery (stops at ${ROVER.batteryStopV} V)`, v: m?.battery != null ? `${m.battery.toFixed(2)} V` : "—" },
        ]} />
        {hasRound && <TreeTable cells={cells} held={held} picked={picked} onPick={pickFromTable} />}
      </main>
    </>
  );
}
