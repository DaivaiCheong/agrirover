import { useEffect, useState } from "react";
import { Camera, CircleCheck, Circle, OctagonX, Play } from "lucide-react";
import RoverMap, { RoverLegend } from "../components/RoverMap";
import { EF, Kpis, Notice, Panel, Tag, Toolbar } from "../components/ui";
import { api, loadProblem, type RoverCell } from "../lib/api";
import { ROVER, STATUS_WORD, cellName, estimate, litresToWater, minutes, stopInfo, toCheck } from "../lib/rover";
import { useData } from "../lib/useData";
import { usePoll } from "../lib/usePoll";

type Simulate = "normal" | "rain" | "low_battery";

const MANUAL = ["Bed clear of people, animals and hoses", "Rover on the start corner, facing along row 1", "Camera clean, hood and light on"];

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className={ok ? "chk chk-ok" : "chk"}>{ok ? <CircleCheck size={15} aria-hidden /> : <Circle size={15} aria-hidden />}{children}</li>;
}

/** One cell as the rover saw it: its photo and the numbers it took from the photo. */
function CellView({ cell, frame }: { cell?: RoverCell; frame?: string | null }) {
  if (!cell) return <p className="small muted">The rover's photos appear here during a survey.</p>;
  return (
    <div className="rc-cam">
      {frame ? <img src={`data:image/jpeg;base64,${frame}`} alt={`Photo of ${cellName(cell.row, cell.col)}`} /> : <div className="rc-nophoto small muted">No photo kept</div>}
      <table className="tbl kv"><tbody>
        <tr><th scope="row">Cell</th><td><b>{cellName(cell.row, cell.col)}</b></td></tr>
        <tr><th scope="row">Plant</th><td>{cell.plant ? `Yes, ${Math.round((cell.canopy ?? 0) * 100)} % leaf cover` : "None"}</td></tr>
        <tr><th scope="row">Soil dryness</th><td>{cell.dryness === null ? "Not visible" : `${cell.dryness.toFixed(2)} of 1`}</td></tr>
        <tr><th scope="row">Water</th><td>{cell.needs_water ? <><b>{cell.suggested_ml} ml</b> proposed</> : "No"}</td></tr>
        <tr><th scope="row">Yellowing</th><td>{cell.flagged ? <><Tag kind="warn">Check</Tag> {Math.round((cell.chlorosis ?? 0) * 100)} % of leaf</> : "No"}</td></tr>
      </tbody></table>
    </div>
  );
}

/** What someone should go and look at. Also the table behind the map. */
export function ToCheck({ cells, picked, onPick }: { cells: RoverCell[]; picked?: [number, number] | null; onPick?: (r: number, c: number) => void }) {
  const list = toCheck(cells);
  return (
    <Panel title={`Cells to check (${list.length})`} pad={false} right={<span className="small muted">{litresToWater(cells).toFixed(2)} L proposed · nothing is watered until you act</span>}>
      {list.length === 0 ? <p className="panel-pad small muted">Nothing yet.</p> : (
        <div className="tablewrap rc-list">
          <table className="tbl">
            <thead><tr><th>Cell</th><th>Finding</th><th className="r">Water ml</th><th className="r">Dryness</th><th className="r">Yellowing %</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={`${c.row}-${c.col}`} className={`pickable${picked?.[0] === c.row && picked?.[1] === c.col ? " picked" : ""}`} onClick={() => onPick?.(c.row, c.col)}>
                  <td className="nowrap"><b>{cellName(c.row, c.col)}</b></td>
                  <td>{[c.needs_water && "Needs water", c.flagged && "Yellowing"].filter(Boolean).join(" · ")}</td>
                  <td className="r">{c.needs_water ? c.suggested_ml : "—"}</td>
                  <td className="r">{c.dryness === null ? "—" : c.dryness.toFixed(2)}</td>
                  <td className="r">{c.flagged ? Math.round((c.chlorosis ?? 0) * 100) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default function Rover() {
  const { data, error } = usePoll(api.roverLive, 1000);
  const zones = useData(api.zones);
  const rover = data?.rover, m = data?.mission ?? null;

  const [zone, setZone] = useState("");
  const [rows, setRows] = useState("4");
  const [cols, setCols] = useState("10");
  const [cellM, setCellM] = useState("0.5");
  const [simulate, setSimulate] = useState<Simulate>("normal");
  const [ticked, setTicked] = useState<boolean[]>(MANUAL.map(() => false));
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<[number, number] | null>(null);

  const beds = zones.data ?? [];
  const bed = zone || beds[0]?.zone || "";
  const bedInfo = beds.find((b) => b.zone === bed);
  const r = Number(rows), c = Number(cols), size = Number(cellM);
  const sizeOk = Number.isInteger(r) && Number.isInteger(c) && r >= 1 && c >= 1 && r <= 40 && c <= 40 && r * c <= ROVER.maxCells && size >= 0.2 && size <= 1;
  const est = sizeOk ? estimate(r, c, size) : null;

  const running = m?.status === "queued" || m?.status === "running";
  const raining = beds.some((b) => b.rain === true);
  const online = rover?.status === "online";
  const released = !rover?.estop;
  const ready = online && released && !raining && ticked.every(Boolean) && sizeOk && Boolean(bed) && !running;

  // a new survey starts by following the rover again
  const missionId = m?.missionId;
  useEffect(() => setPicked(null), [missionId]);

  const frame = useData(() => (picked ? api.roverFrame(picked[0], picked[1]) : Promise.resolve(null)), [picked?.[0], picked?.[1], missionId]);
  const cells = m?.cells ?? [];
  const shownCell = picked ? cells.find((x) => x.row === picked[0] && x.col === picked[1])
    : m?.cell ? cells.find((x) => x.row === m.cell![0] && x.col === m.cell![1]) : undefined;
  const shownFrame = picked ? frame.data?.frame : m?.frame;

  async function start() {
    setProblem(null);
    try {
      await api.startSurvey({ zoneId: bed, rows: r, cols: c, cellM: size, simulate });
      setTicked(MANUAL.map(() => false));            // the checks are for each survey
    } catch (e) { setProblem((e as Error).message); }
  }
  async function estop(engaged: boolean) {
    setProblem(null);
    try { await api.roverEstop(engaged); } catch (e) { setProblem((e as Error).message); }
  }

  const stop = m && (m.status === "aborted" || m.status === "rejected" || m.status === "lost" || m.status === "failed") ? stopInfo(m.reason) : null;
  const word = m ? STATUS_WORD[m.status] ?? [undefined, m.status] : [undefined, "Idle"];
  const needWater = cells.filter((x) => x.needs_water).length;
  const flagged = cells.filter((x) => x.flagged).length;
  const plants = cells.filter((x) => x.plant).length;

  return (
    <>
      <Toolbar>
        <span className="tb-left">
          <Tag kind={online ? "ok" : rover?.status === "offline" ? "alert" : "wip"}>{rover?.code ?? "Rover"} {rover?.status ?? "…"}</Tag>
          <Tag>Simulated wheels and camera</Tag>
        </span>
        {rover?.estop
          ? <><Tag kind="alert">E-stop engaged</Tag><button className="btn btn-sm btn-ghost" onClick={() => estop(false)}>Release</button></>
          : <button className="btn btn-sm btn-alert" onClick={() => estop(true)}><OctagonX size={16} aria-hidden />E-stop</button>}
      </Toolbar>
      <main className="main stack">
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}
        {problem && <Notice kind="alert">{problem}</Notice>}
        {stop && (
          <Notice kind="warn"><b>{word[1]}: {stop.label}.</b> {m!.cellsScanned} of {m!.cellsTotal} cells surveyed. {stop.next}</Notice>
        )}

        <Kpis items={[
          { k: "Status", v: <Tag kind={word[0]}>{word[1]}</Tag> },
          { k: "Cells", v: m ? `${m.cellsScanned} of ${m.cellsTotal}` : "—" },
          { k: "Plants", v: m ? plants : "—" },
          { k: "Need water", v: m ? needWater : "—" },
          { k: "Yellowing", v: m ? flagged : "—" },
          { k: `Battery (stops at ${ROVER.batteryStopV} V)`, v: m?.battery != null ? `${m.battery.toFixed(2)} V` : "—" },
        ]} />

        <div className="grid g32 rc-top">
          <div className="stack">
          <Panel title={m ? `Bed map · ${beds.find((b) => b.zone === m.zoneId)?.label ?? m.zoneId}` : "Bed map"} pad={false}
                 right={m ? <span className="small muted">Generated field{running ? ` · ${ROVER.simSpeedup}× real speed` : ""}</span> : undefined}>
            <div className="rm-wrap">
              <RoverMap rows={m?.rows ?? (sizeOk ? r : 4)} cols={m?.cols ?? (sizeOk ? c : 10)} cells={cells}
                        at={m ? m.cell ?? [0, 0] : [0, 0]} selected={picked} onPick={(a, b) => setPicked([a, b])} />
            </div>
            <div className="panel-foot rm-foot"><RoverLegend /></div>
          </Panel>
          {m && <ToCheck cells={cells} picked={picked} onPick={(a, b) => setPicked([a, b])} />}
          </div>

          <div className="stack">
            {running ? (
              <Panel title="Camera" icon={Camera}>
                <CellView cell={shownCell} frame={shownFrame} />
              </Panel>
            ) : (
              <Panel title="New survey">
                <div className="erp-form">
                  <EF label="Bed" req hint={bedInfo?.areaM2 && est ? `This grid covers ${est.areaM2.toFixed(1)} of ${Number(bedInfo.areaM2).toFixed(0)} m²` : undefined}>
                    <select className="erp-select" value={bed} onChange={(e) => setZone(e.target.value)}>
                      {beds.map((b) => <option key={b.zone} value={b.zone}>{b.label ?? b.zone}</option>)}
                    </select>
                  </EF>
                  <div className="erp-grid-3 rc-grid">
                    <EF label="Rows"><input className="erp-input" type="number" min={1} max={40} value={rows} onChange={(e) => setRows(e.target.value)} /></EF>
                    <EF label="Columns"><input className="erp-input" type="number" min={1} max={40} value={cols} onChange={(e) => setCols(e.target.value)} /></EF>
                    <EF label="Cell (m)"><input className="erp-input" type="number" min={0.2} max={1} step={0.1} value={cellM} onChange={(e) => setCellM(e.target.value)} /></EF>
                  </div>
                  <p className="erp-hint">{est ? `${est.cells} cells · ${est.distanceM.toFixed(1)} m · ${minutes(est.seconds)} on a real rover` : `At most ${ROVER.maxCells} cells, 40 a side, cell 0.2 to 1 m`}</p>
                  <EF label="Simulate">
                    <select className="erp-select" value={simulate} onChange={(e) => setSimulate(e.target.value as Simulate)}>
                      <option value="normal">Normal survey</option>
                      <option value="rain">Rain starts on the way</option>
                      <option value="low_battery">Battery runs low on the way</option>
                    </select>
                  </EF>
                  <div>
                    <div className="erp-label" style={{ marginBottom: 4 }}>Before starting</div>
                    <ul className="chks">
                      <Check ok={online}>Rover online</Check>
                      <Check ok={released}>E-stop released</Check>
                      <Check ok={!raining}>No rain on the field nodes</Check>
                    </ul>
                    {MANUAL.map((text, i) => (
                      <label key={text} className="chk-man">
                        <input type="checkbox" checked={ticked[i]} onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))} />{text}
                      </label>
                    ))}
                  </div>
                  <button className="btn" disabled={!ready} onClick={start}><Play size={16} aria-hidden />Start survey</button>
                </div>
              </Panel>
            )}
            {!running && m && cells.length > 0 && (
              <Panel title="Camera" icon={Camera}
                     right={picked ? <button className="linkbtn small" onClick={() => setPicked(null)}>Last cell</button> : undefined}>
                <CellView cell={shownCell} frame={shownFrame} />
              </Panel>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
