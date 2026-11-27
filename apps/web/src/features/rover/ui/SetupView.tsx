// Setup for a block, done once: its plant map (where the trees stand), the route the rover takes, and the camera.
// The Field log uses these settings on every round.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import RoverMap, { RoverLegend } from "../../../components/RoverMap";
import { EF, Empty, More, Notice, Panel } from "../../../components/ui";
import { api } from "../../../lib/api";
import { CORNERS, DEFAULT_ROUTE, cellName, cornerCell, estimate, minutes, savedRoute, spotKey, type Corner, type Route } from "../../../lib/rover";
import { useData } from "../../../lib/useData";
import BlockPicker from "./BlockPicker";
import { CAMERA, savedCamera, savedInspect, setCamera, setInspect, setRoute, type CameraMode } from "./fieldlog/roundSettings";
import { layoutOf, layoutOk } from "./fieldlog/model";

type Msg = { kind: "ok" | "alert"; text: string } | null;

export default function SetupView() {
  const [search, setSearch] = useSearchParams();
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const maps = useData(api.plantMaps);

  const beds = zones.data ?? [];
  const growing = (cycles.data ?? []).filter((c) => c.status === "active");
  // a block named in the address must exist; once the blocks have loaded, an unknown one falls back to the first
  const requested = search.get("zone");
  const zone = requested && (beds.length === 0 || beds.some((b) => b.zone === requested))
    ? requested : growing[0]?.zone || beds[0]?.zone || "";
  const bed = beds.find((b) => b.zone === zone);
  const cycle = growing.find((c) => c.zone === zone);
  const pm = (maps.data ?? []).find((m) => m.zone === zone) ?? null;
  const layout = layoutOf(pm, cycle);
  const label = bed?.label ?? cycle?.bedLabel ?? zone;

  // route, camera and inspection: read for the block, kept on this device
  const [route, setRouteState] = useState<Route>(DEFAULT_ROUTE);
  const [camera, setCameraState] = useState<CameraMode>("left");
  const [inspect, setInspectState] = useState(true);
  useEffect(() => {
    if (!zone) return;
    setRouteState(savedRoute(zone));
    setCameraState(savedCamera(zone));
    setInspectState(savedInspect(zone));
  }, [zone]);

  // the plant map: the saved plants, a draft while placing, and the layout fields
  const saved = useMemo(() => new Set((pm?.plants ?? []).map(([r, c]) => spotKey(r, c))), [pm]);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [placing, setPlacing] = useState(false);
  const [dims, setDims] = useState({ crop: "", rows: "", cols: "", rowM: "", plantM: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [nb, setNb] = useState({ label: "", crop: "Tomato", rows: "2", cols: "3", rowM: "0.8", plantM: "0.5" });
  useEffect(() => {
    setDraft(null); setPlacing(false); setMsg(null);
    setDims(pm
      ? { crop: pm.crop, rows: String(pm.rows), cols: String(pm.cols), rowM: String(pm.rowM), plantM: String(pm.plantM) }
      : { crop: "", rows: "", cols: "", rowM: "", plantM: "" });
  }, [zone, pm?.updatedAt]);  // eslint-disable-line react-hooks/exhaustive-deps

  const plants = draft ?? saved;
  const numDims = { rows: Number(dims.rows), cols: Number(dims.cols), rowM: Number(dims.rowM), treeM: Number(dims.plantM) };
  const dimsOk = layoutOk(numDims);
  const mapRows = pm && dimsOk ? numDims.rows : layout?.rows ?? 0;
  const mapCols = pm && dimsOk ? numDims.cols : layout?.cols ?? 0;
  const dirty = Boolean(pm) && (draft !== null || dims.crop !== pm?.crop || Number(dims.rows) !== pm?.rows || Number(dims.cols) !== pm?.cols
    || Number(dims.rowM) !== pm?.rowM || Number(dims.plantM) !== pm?.plantM);
  const est = layout ? estimate(mapRows, mapCols, layout.rowM, layout.treeM, route, pm ? plants : undefined) : null;

  function togglePlant(row: number, col: number) {
    const key = spotKey(row, col);
    setDraft((prev) => {
      const next = new Set(prev ?? saved);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function savePlantMap() {
    if (!pm) return;
    const rows = Number(dims.rows), cols = Number(dims.cols);
    if (!dimsOk) { setMsg({ kind: "alert", text: "Rows and spots are whole numbers from 1 to 40; spacing is from 0.2 to 10 m." }); return; }
    const body = {
      crop: dims.crop.trim() || pm.crop, rows, cols, rowM: numDims.rowM, plantM: numDims.treeM,
      plants: [...plants].map((k) => k.split(",").map(Number) as [number, number]).filter(([r, c]) => r < rows && c < cols),
    };
    setBusy(true); setMsg(null);
    try {
      await api.savePlantMap(pm.zone, body);
      await maps.reload();
      setMsg({ kind: "ok", text: "Plant map saved." });
    } catch (e) { setMsg({ kind: "alert", text: (e as Error).message }); } finally { setBusy(false); }
  }

  async function makePlantMap() {
    if (!layout || !zone) return;
    const all: [number, number][] = [];
    for (let r = 0; r < layout.rows; r++) for (let c = 0; c < layout.cols; c++) all.push([r, c]);
    setBusy(true); setMsg(null);
    try {
      await api.savePlantMap(zone, { crop: cycle?.cropName || "Plant", rows: layout.rows, cols: layout.cols, rowM: layout.rowM, plantM: layout.treeM, plants: all });
      await maps.reload();
      setPlacing(true);
      setMsg({ kind: "ok", text: "Plant map made. Tap a spot to remove an empty one, then save." });
    } catch (e) { setMsg({ kind: "alert", text: (e as Error).message }); } finally { setBusy(false); }
  }

  async function makeBlock(e: FormEvent) {
    e.preventDefault();
    const rows = Number(nb.rows), cols = Number(nb.cols);
    const spacing = { rowM: Number(nb.rowM), treeM: Number(nb.plantM) };
    if (!layoutOk({ rows, cols, ...spacing })) { setMsg({ kind: "alert", text: "Rows and spots are whole numbers from 1 to 40; spacing is from 0.2 to 10 m." }); return; }
    const all: [number, number][] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) all.push([r, c]);
    setBusy(true); setMsg(null);
    try {
      const made = await api.newPlantBlock({ label: nb.label.trim() || "New block", crop: nb.crop.trim() || "Plant", rows, cols, rowM: spacing.rowM, plantM: spacing.treeM, plants: all });
      await Promise.all([zones.reload(), maps.reload()]);
      setNewOpen(false);
      setSearch({ zone: made.zone });
    } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); } finally { setBusy(false); }
  }

  function changeRoute(next: Route) {
    setRouteState(next);
    if (zone) setRoute(zone, next);
  }
  function changeCamera(c: CameraMode) {
    setCameraState(c);
    if (zone) setCamera(zone, c);
  }
  function changeInspect(on: boolean) {
    setInspectState(on);
    if (zone) setInspect(zone, on);
  }

  return (
    <main className="main">
      <div className="fl-top">
        <BlockPicker blocks={beds.map((b) => ({ zone: b.zone, label: b.label ?? b.zone }))} value={zone} onChange={(z) => setSearch({ zone: z })} />
        <span className="small muted fl-grow">{label}: setup, done once. Rounds use these settings.</span>
        <Link className="btn btn-sm btn-ghost" to={`/rover?zone=${encodeURIComponent(zone)}`}><ArrowLeft size={15} aria-hidden />Field log</Link>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {!zone || (!layout && !pm) ? (
        <Empty>This block has no trees yet. Give it a growing crop under Crops, or make a new block below.</Empty>
      ) : null}

      <div className="fl-stack">
        <Panel title="Plant map" right={
          pm ? (
            <span className="fl-grow" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className={`btn btn-sm ${placing ? "" : "btn-ghost"}`} aria-pressed={placing} onClick={() => setPlacing(!placing)}>
                {placing ? "Done placing" : "Place plants"}
              </button>
              {dirty && <>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={savePlantMap}>Save plant map</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => {
                  setDraft(null);
                  setDims({ crop: pm.crop, rows: String(pm.rows), cols: String(pm.cols), rowM: String(pm.rowM), plantM: String(pm.plantM) });
                }}>Undo</button>
              </>}
            </span>
          ) : undefined
        }>
          <div className="panel-pad">
            {pm ? (
              <p className="small muted">
                {plants.size} {pm.crop.toLowerCase() || "plant"} plants · {mapRows} rows × {mapCols} spots · {numDims.rowM || pm.rowM} m between rows, {numDims.treeM || pm.plantM} m between plants
              </p>
            ) : layout ? (
              <>
                <p className="small muted">No plant map yet. The rover visits every spot of the grid: {layout.rows} rows × {layout.cols} spots.</p>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={makePlantMap}>Make the plant map</button>
              </>
            ) : (
              <p className="small muted">No trees to map yet.</p>
            )}
          </div>

          {(pm || layout) && (
            <div className="rv-map-wrap" style={{ padding: "0 16px 16px" }}>
              <RoverMap rows={mapRows} cols={mapCols} cells={[]} route={route} onRoute={changeRoute}
                        plants={pm ? plants : undefined} crop={pm?.crop ?? cycle?.cropName ?? "Plant"}
                        onPlace={pm && placing ? togglePlant : undefined} />
              <div className="panel-foot rm-foot"><RoverLegend crop={pm ? pm.crop : undefined} />
                <span className="small muted">{placing ? "Tap a spot to place or remove a plant" : "Tap a corner dot to start the route there"}</span></div>
            </div>
          )}

          {pm && (
            <More label={<span className="small">Change the layout</span>}>
              <div className="erp-form" style={{ padding: 16 }}>
                <div className="erp-grid-2 rc-grid2">
                  <EF label="Rows"><input className="erp-input" type="number" min={1} max={40} value={dims.rows} onChange={(e) => setDims({ ...dims, rows: e.target.value })} /></EF>
                  <EF label="Spots a row"><input className="erp-input" type="number" min={1} max={40} value={dims.cols} onChange={(e) => setDims({ ...dims, cols: e.target.value })} /></EF>
                  <EF label="Row to row (m)"><input className="erp-input" type="number" min={0.2} max={10} step={0.1} value={dims.rowM} onChange={(e) => setDims({ ...dims, rowM: e.target.value })} /></EF>
                  <EF label="Spot to spot (m)"><input className="erp-input" type="number" min={0.2} max={10} step={0.1} value={dims.plantM} onChange={(e) => setDims({ ...dims, plantM: e.target.value })} /></EF>
                  <EF label="Crop"><input className="erp-input" maxLength={40} value={dims.crop} onChange={(e) => setDims({ ...dims, crop: e.target.value })} /></EF>
                </div>
                {!dimsOk && <p className="erp-hint">Rows and spots: whole numbers from 1 to 40. Spacing: 0.2 to 10 m.</p>}
              </div>
            </More>
          )}
        </Panel>

        <div className="fl-two">
          <Panel title="Route">
            <div className="panel-pad">
              <div className="fl-grid-2">
                <EF label="Start at">
                  <select className="erp-select" value={route.start} onChange={(e) => changeRoute({ ...route, start: e.target.value as Corner })}>
                    {CORNERS.map((k) => <option key={k} value={k}>{cellName(...cornerCell(mapRows, mapCols, k))}</option>)}
                  </select>
                </EF>
                <EF label="Lanes">
                  <span className="seg" role="group" aria-label="Lanes">
                    {(["rows", "across"] as const).map((a) => (
                      <button key={a} type="button" className={route.along === a ? "on" : ""} aria-pressed={route.along === a}
                              onClick={() => changeRoute({ ...route, along: a })}>{a === "rows" ? "Along rows" : "Across rows"}</button>
                    ))}
                  </span>
                </EF>
              </div>
              <p className="small muted" style={{ marginTop: 12 }}>
                {est ? `${est.trees} stops · ${est.distanceM.toFixed(est.distanceM < 10 ? 1 : 0)} m · about ${minutes(est.seconds)} on a round` : "No layout yet"}
              </p>
            </div>
          </Panel>

          <Panel title="Camera">
            <div className="panel-pad">
              <EF label="How the camera looks at a tree">
                <select className="erp-select" value={camera} onChange={(e) => changeCamera(e.target.value as CameraMode)}>
                  {(Object.keys(CAMERA) as CameraMode[]).map((k) => <option key={k} value={k}>{CAMERA[k]}</option>)}
                </select>
              </EF>
              <label className="chk-man" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={inspect} onChange={(e) => changeInspect(e.target.checked)} />Photograph every tree on a round
              </label>
              <p className="small muted" style={{ marginTop: 12 }}>These settings apply to the next round of this block.</p>
            </div>
          </Panel>
        </div>

        <Panel title="New block">
          <div className="panel-pad">
            {!newOpen ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNewOpen(true)}>Make a new block of trees</button>
            ) : (
              <form onSubmit={makeBlock} className="erp-form">
                <div className="erp-grid-2 rc-grid2">
                  <EF label="Name" req><input className="erp-input" required maxLength={80} value={nb.label} onChange={(e) => setNb({ ...nb, label: e.target.value })} /></EF>
                  <EF label="Crop" req><input className="erp-input" required maxLength={40} value={nb.crop} onChange={(e) => setNb({ ...nb, crop: e.target.value })} /></EF>
                  <EF label="Rows" req><input className="erp-input" type="number" required min={1} max={40} value={nb.rows} onChange={(e) => setNb({ ...nb, rows: e.target.value })} /></EF>
                  <EF label="Spots a row" req><input className="erp-input" type="number" required min={1} max={40} value={nb.cols} onChange={(e) => setNb({ ...nb, cols: e.target.value })} /></EF>
                  <EF label="Row to row (m)" req><input className="erp-input" type="number" required min={0.2} max={10} step={0.1} value={nb.rowM} onChange={(e) => setNb({ ...nb, rowM: e.target.value })} /></EF>
                  <EF label="Spot to spot (m)" req><input className="erp-input" type="number" required min={0.2} max={10} step={0.1} value={nb.plantM} onChange={(e) => setNb({ ...nb, plantM: e.target.value })} /></EF>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-sm" type="submit" disabled={busy}>Make the block</button>
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => setNewOpen(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}
