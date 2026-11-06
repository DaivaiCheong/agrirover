import { useEffect, useState } from "react";
import { Camera, CircleCheck, Circle, OctagonX, Play } from "lucide-react";
import RoundSchedule from "../components/RoundSchedule";
import RoverMap, { RoverLegend } from "../components/RoverMap";
import { EF, Kpis, More, Notice, Panel, Tag, Toolbar } from "../components/ui";
import { api, loadProblem, type Advice, type RoverCell } from "../lib/api";
import { litres, todayIso } from "../lib/format";
import { ROVER, STATUS_WORD, cellName, estimate, fullLitresOf, litresOf, minutes, roundPlan, stopInfo } from "../lib/rover";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";

type Simulate = "normal" | "rain" | "low_battery";

const MANUAL = ["Rows clear of people, animals and hoses", "Rover at the first tree, facing along row 1", "Camera clean, probe tip clean"];
const LABEL: Record<string, string> = {
  soil_moisture: "Moisture %", soil_ec: "EC mS/cm", soil_ph: "pH", soil_temperature: "Soil °C",
  nitrogen: "N (trend)", phosphorus: "P (trend)", potassium: "K (trend)", air_temperature: "Air °C", air_humidity: "RH %",
};

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className={ok ? "chk chk-ok" : "chk"}>{ok ? <CircleCheck size={15} aria-hidden /> : <Circle size={15} aria-hidden />}{children}</li>;
}

/** One tree as the rover found it: the photo, what the probe read, and what it should get today. */
function CellView({ cell, frame }: { cell?: RoverCell; frame?: string | null }) {
  if (!cell) return <p className="small muted">The rover's photos and readings appear here during a round.</p>;
  const a = cell.advice;
  return (
    <div className="rc-cam">
      {frame ? <img src={`data:image/jpeg;base64,${frame}`} alt={`Photo of ${cellName(cell.row, cell.col)}`} /> : <div className="rc-nophoto small muted">No photo kept</div>}
      <table className="tbl kv"><tbody>
        <tr><th scope="row">Tree</th><td><b>{cellName(cell.row, cell.col)}</b>{!cell.plant && " · no tree seen"}</td></tr>
        {a && cell.plant && <tr><th scope="row">Water today</th><td><b>{a.litres} L</b> of {a.fullLitres} L full demand</td></tr>}
        {cell.plant && <tr><th scope="row">Leaf cover</th><td>{Math.round((cell.canopy ?? 0) * 100)} %{cell.flagged && <> <Tag kind="warn">Yellow {Math.round((cell.chlorosis ?? 0) * 100)} %</Tag></>}</td></tr>}
        {Object.keys(LABEL).filter((k) => cell.readings?.[k] !== undefined).map((k) => (
          <tr key={k}><th scope="row">{LABEL[k]}</th><td>{cell.readings[k]}</td></tr>
        ))}
      </tbody></table>
    </div>
  );
}

/** Every tree of the round: the table behind the map. */
export function TreeTable({ cells, picked, onPick }: { cells: RoverCell[]; picked?: [number, number] | null; onPick?: (r: number, c: number) => void }) {
  const trees = cells.filter((c) => c.plant);
  const given = litresOf(cells), full = fullLitresOf(cells);
  const hasAdvice = cells.some((c) => c.advice);
  return (
    <Panel title={`Trees (${trees.length})`} pad={false}
           right={hasAdvice ? <span className="small muted">Water today {given.toFixed(0)} L of {full.toFixed(0)} L full demand</span> : undefined}>
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
                    {hasAdvice && <td className="r"><b>{c.advice?.litres ?? "—"}</b></td>}
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

/** What the rover found in each block on its newest round. */
function FoundToday({ advice, picked, onPick, waiting }: { advice: Advice[]; picked: string; onPick: (zone: string) => void; waiting?: string }) {
  const count = (a: Advice, note: string) => a.trees.filter((t) => t.notes.some((n) => n.startsWith(note))).length;
  return (
    <Panel title="Found today" pad={false} right={advice.some((a) => a.simulated) ? <span className="small muted">Simulated rounds</span> : undefined}>
      {waiting ? <p className="panel-pad small muted">{waiting}</p> : advice.length === 0 ? <p className="panel-pad small muted">Nothing is growing yet.</p> : (
        <div className="tablewrap">
          <table className="tbl fold">
            <thead><tr><th>Block</th><th>Round</th><th className="r">Trees</th><th className="r">Dry</th><th className="r">Water</th><th>To look at</th></tr></thead>
            <tbody>
              {advice.map((a) => {
                const looks = a.todo.filter((t) => t.kind === "look");
                const gaps = a.trees.filter((t) => !t.plant).length;
                return (
                  <tr key={a.zone} className={`pickable${a.zone === picked ? " picked" : ""}`} onClick={() => onPick(a.zone)}>
                    <td className="nowrap"><b>{a.label}</b><div className="small muted">Day {a.day} · {a.stage.short}</div></td>
                    <td data-label="Round" className="nowrap">{a.surveyedAt ? ago(a.surveyedAt) : <span className="muted">None today</span>}{a.partial && <> <Tag kind="warn">Stopped early</Tag></>}</td>
                    <td data-label="Trees" className="r">{a.surveyed ? a.treesSeen : "—"}{gaps > 0 && <div className="small muted">{gaps} no tree</div>}</td>
                    <td data-label="Dry" className="r">{a.surveyed ? count(a, "Dry") : "—"}</td>
                    <td data-label="Water" className="r nowrap">{a.surveyed ? (a.water.paused ? "Hold" : litres(a.water.litres)) : "—"}</td>
                    <td data-label="To look at">
                      {looks.length === 0 ? <span className="muted">{a.surveyed ? "Nothing" : "—"}</span> : (
                        <ul className="found-list">{looks.map((t) => <li key={t.text}>{t.detail ? <More label={t.text}>{t.detail}</More> : t.text}</li>)}</ul>
                      )}
                    </td>
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

export default function Rover() {
  const { data, error } = usePoll(api.roverLive, 1000);
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const adviceNow = usePoll(api.advice, 30000);
  const roundTime = useData(() => api.schedule(1));
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

  const beds = zones.data ?? [];
  const growing = (cycles.data ?? []).filter((c) => c.status === "active");
  const bed = zone || growing[0]?.zone || beds[0]?.zone || "";
  const cycle = growing.find((c) => c.zone === bed);

  // the block's own rows and spacing, from its setup and tree count
  const grid = cycle?.grid;
  useEffect(() => {
    if (!grid) return;
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
  const slots = roundPlan(growing, roundTime.data?.roundTime ?? "07:00", adviceList, todayIso());
  const adviceWait = adviceNow.data === null ? (adviceNow.error ? "Could not be loaded just now." : "Loading…") : undefined;

  const r = Number(rows), c = Number(cols), rm = Number(rowM), tm = Number(treeM);
  const sizeOk = Number.isInteger(r) && Number.isInteger(c) && r >= 1 && c >= 1 && r <= 40 && c <= 40 && r * c <= ROVER.maxTrees && rm >= 0.2 && rm <= 10 && tm >= 0.2 && tm <= 10;
  const est = sizeOk ? estimate(r, c, rm, tm) : null;

  const running = m?.status === "queued" || m?.status === "running";
  const raining = beds.some((b) => b.rain === true);
  const online = rover?.status === "online";
  const released = !rover?.estop;
  const ready = online && released && !raining && ticked.every(Boolean) && sizeOk && Boolean(bed) && !running;

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
      await api.startSurvey({ zoneId: bed, rows: r, cols: c, cellM: tm, rowM: rm, simulate });
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

  return (
    <>
      <Toolbar>
        <span className="tb-left">
          <Tag kind={online ? "ok" : rover?.status === "offline" ? "alert" : "wip"}>{rover?.code ?? "Rover"} {rover?.status ?? "…"}</Tag>
          <Tag>Simulated wheels, camera and probe</Tag>
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

        <Kpis items={[
          { k: "Status", v: <Tag kind={word[0]}>{word[1]}</Tag> },
          { k: "Stops", v: hasRound && scanned !== null ? `${scanned} of ${planned}` : "—" },
          { k: "Trees seen", v: hasRound ? trees : "—" },
          { k: "Water today", v: hasRound ? `${litresOf(cells).toFixed(0)} L` : "—" },
          { k: "Yellow leaves", v: hasRound ? flagged : "—" },
          { k: `Battery (stops at ${ROVER.batteryStopV} V)`, v: m?.battery != null ? `${m.battery.toFixed(2)} V` : "—" },
        ]} />

        <FoundToday advice={adviceList} waiting={adviceWait} picked={bed} onPick={(z) => { setZone(z); setPicked(null); }} />
        <RoundSchedule plan={slots} onPick={(z) => { setZone(z); setPicked(null); }} />

        <div className="grid g32 rc-top">
          <div className="stack">
            <Panel title={`Block map · ${beds.find((b) => b.zone === (m?.zoneId ?? bed))?.label ?? bed}`} pad={false}
                   right={m ? <span className="small muted">Generated orchard{running ? ` · ${ROVER.simSpeedup}× real speed` : ""}</span>
                     : last ? <span className="small muted">Last round {ago(last.finishedAt ?? last.startedAt)}{last.simulated ? " · simulated" : ""}</span> : undefined}>
              <div className="rm-wrap">
                <RoverMap rows={m?.rows ?? last?.rows ?? (sizeOk ? r : 4)} cols={m?.cols ?? last?.cols ?? (sizeOk ? c : 4)} cells={cells}
                          at={m ? m.cell ?? [0, 0] : last ? undefined : [0, 0]} selected={picked} onPick={(a, b) => setPicked([a, b])} />
              </div>
              <div className="panel-foot rm-foot"><RoverLegend /></div>
            </Panel>
            {hasRound && <TreeTable cells={cells} picked={picked} onPick={(a, b) => setPicked([a, b])} />}
          </div>

          <div className="stack">
            {running ? (
              <Panel title="At this tree" icon={Camera}><CellView cell={shownCell} frame={shownFrame} /></Panel>
            ) : (
              <Panel title="Today's round">
                <div className="erp-form">
                  <EF label="Block" req hint={cycle ? `${cycle.plantCount} trees · ${cycle.setupLabel ?? "no setup"}` : "Nothing growing here: readings only, no advice"}>
                    <select className="erp-select" value={bed} onChange={(e) => setZone(e.target.value)}>
                      {beds.map((b) => <option key={b.zone} value={b.zone}>{b.label ?? b.zone}</option>)}
                    </select>
                  </EF>
                  <div className="erp-grid-2 rc-grid2">
                    <EF label="Rows"><input className="erp-input" type="number" min={1} max={40} value={rows} onChange={(e) => setRows(e.target.value)} /></EF>
                    <EF label="Trees a row"><input className="erp-input" type="number" min={1} max={40} value={cols} onChange={(e) => setCols(e.target.value)} /></EF>
                    <EF label="Row to row (m)"><input className="erp-input" type="number" min={0.2} max={10} step={0.5} value={rowM} onChange={(e) => setRowM(e.target.value)} /></EF>
                    <EF label="Tree to tree (m)"><input className="erp-input" type="number" min={0.2} max={10} step={0.5} value={treeM} onChange={(e) => setTreeM(e.target.value)} /></EF>
                  </div>
                  <p className="erp-hint">{est ? `${est.trees} stops · ${est.distanceM.toFixed(0)} m · about ${minutes(est.seconds)} on a real rover (probe time is an estimate)` : `At most ${ROVER.maxTrees} trees, 40 a side, spacing 0.2 to 10 m`}</p>
                  <EF label="Simulate">
                    <select className="erp-select" value={simulate} onChange={(e) => setSimulate(e.target.value as Simulate)}>
                      <option value="normal">Normal round</option>
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
                  <button className="btn" disabled={!ready} onClick={start}><Play size={16} aria-hidden />Start round</button>
                  <More label={<span className="small muted">Why one round a day?</span>}>A once-a-day picture is enough to set the day's water and feed, and the probe arm's time per tree is the limit. Fixed probes can still read every few minutes where one spot needs watching.</More>
                </div>
              </Panel>
            )}
            {!running && hasRound && cells.length > 0 && (
              <Panel title="At this tree" icon={Camera}
                     right={picked ? <button className="linkbtn small" onClick={() => setPicked(null)}>Last tree</button> : undefined}>
                <CellView cell={shownCell} frame={shownFrame} />
              </Panel>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
