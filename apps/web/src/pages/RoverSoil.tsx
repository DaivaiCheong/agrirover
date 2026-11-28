// The Rover tab's first page: every plant in the block and its soil, one row a plant. The rover fills pH, N, P and K; the
// farmer adds what it cannot measure. Day by day values are on History; the plant map, route and camera on Setup.
import { useEffect, useMemo, useState } from "react";
import BlockPicker from "../features/rover/ui/BlockPicker";
import SoilTable, { type SoilTableRow } from "../features/rover/ui/fieldlog/SoilTable";
import { PhotoDialog, PlantDialog, PlantRecordDialog, SoilDialog, StartRoundDialog, type AutoCheck, type TreeOption } from "../features/rover/ui/fieldlog/Dialogs";
import { RESULT, handledTrees, layoutOk, lookItems, parseTree, treeKey, treeName, whenText, type Tree } from "../features/rover/ui/fieldlog/model";
import { outOfTarget, plantSoil, sameTree, targetsFor } from "../features/rover/ui/fieldlog/soil";
import { addPlant, addSoil, useFieldLog } from "../features/rover/ui/fieldlog/store";
import { useBlock } from "../features/rover/ui/fieldlog/useBlock";
import { savedCamera, savedInspect } from "../features/rover/ui/fieldlog/roundSettings";
import { Empty, Notice } from "../components/ui";
import type { RoverCell, RoverPhotoCheck } from "../lib/api";
import { DEFAULT_ROUTE, cellName, estimate, minutes, route as routeOf, savedRoute, spotKey, stopInfo, throughStops, type Route } from "../lib/rover";
import { errorText, useConditions, useInspection, useRoverLive, useRoverTest, useStartRound, useSurvey, useSurveys } from "../lib/queries";
import "../features/rover/ui/fieldlog/fieldlog.css";

/** The three things a farmer checks by eye before the rover goes. The middle one names the start tree from the route. */
const MANUAL = ["Rows clear of people and hoses", "Rover at the start plant", "Camera and probe clean"];
/** A round needs at least this charge, the same figure the rover's guard uses. */
const BATTERY_START_V = 11.6;

const placeCheck = (path: [number, number][]) =>
  path.length === 0 ? "Place a plant on the map first"
    : path.length > 1 ? `Rover on ${cellName(...path[0])}, facing ${cellName(...path[1])}` : `Rover on ${cellName(...path[0])}`;

/** One dialog at a time. A soil, health or photo dialog opened from a plant's record goes back to it when closed. */
type Dialog =
  | { kind: "record"; tree: Tree } | { kind: "soil"; tree: Tree | null } | { kind: "plant"; tree: Tree } | { kind: "photo"; tree: Tree }
  | { kind: "start" } | null;

export default function RoverSoil() {
  const b = useBlock();
  const { zone, pm, layout, trees } = b;
  const surveys = useSurveys(10000);
  const live = useRoverLive(true);
  const test = useRoverTest();
  const conditions = useConditions();
  const startRound = useStartRound();
  const log = useFieldLog();

  const [dialog, setDialog] = useState<Dialog>(null);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [ticked, setTicked] = useState<boolean[]>(MANUAL.map(() => false));
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // ---- the last finished round: its readings, and what the camera found
  const here = (surveys.data ?? []).filter((s) => s.zone === zone).sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt));
  const last = here.find((s) => s.status === "completed" || s.status === "aborted");
  const lastRound = useSurvey(last?.id);
  // while another block's round loads, the old one is still held: show nothing rather than the wrong block's readings
  const cells: RoverCell[] = last && lastRound.data?.id === last.id ? lastRound.data.cells : [];
  const roundAt = last ? last.finishedAt ?? last.startedAt : null;
  const cellMap = new Map(cells.map((c) => [treeKey(c.row, c.col), c]));
  const inspection = useInspection(zone, 10000);
  const findings = useMemo(
    () => new Map((inspection.data?.plants ?? []).map((p) => [treeKey(p.row, p.col), p.finding] as [string, RoverPhotoCheck | null])),
    [inspection.data],
  );

  // ---- one row a plant
  const zoneSoil = log.soil.filter((e) => e.zone === zone);
  const zonePlants = log.plants.filter((e) => e.zone === zone).sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const condition = conditions.data?.find((c) => c.zone === zone);
  const crop = b.crop ?? condition?.cropName ?? null;
  const targets = targetsFor(crop, condition?.params);
  const looks = new Map(lookItems(cells, findings).map((i) => [treeKey(i.row, i.col), i]));
  const handled = handledTrees(log.plants, zone, roundAt);
  const rows: (SoilTableRow & { attention: boolean })[] = trees.map((tree) => {
    const k = treeKey(tree[0], tree[1]);
    const cell = cellMap.get(k);
    const soil = plantSoil(tree, cell, roundAt, zoneSoil);
    const flag = handled.has(k) ? undefined : looks.get(k);
    const logged = zonePlants.find((e) => sameTree(e.tree, tree));
    const [note, noteKind] = cell && !cell.plant ? ["No plant seen", "muted" as const]
      : flag ? [flag.what, "flag" as const]
      : handled.has(k) && logged ? [`You: ${RESULT[logged.result]}`, "done" as const]
      : [null, "muted" as const];
    return { tree, soil, note, noteKind, attention: Boolean(flag) || outOfTarget(soil, targets).length > 0 };
  });
  const attention = rows.filter((r) => r.attention);
  const treeOptions: TreeOption[] = trees.map((t) => ({ key: treeKey(t[0], t[1]), name: treeName(t[0], t[1]), tree: t }));

  // ---- the rover, and whether a round can start
  const mission = live.data?.mission ?? null;
  const midRound = Boolean(mission && (mission.status === "queued" || mission.status === "running"));
  const runningHere = midRound && mission?.zoneId === zone;
  const rover = live.data?.rover;
  const volts = test.data?.rover.batteryV ?? null;
  const planned: Route = zone ? savedRoute(zone) : DEFAULT_ROUTE;
  const stopSet = pm ? new Set(pm.plants.map(([r, c]) => spotKey(r, c))) : null;
  const fullPath = layout ? routeOf(layout.rows, layout.cols, planned) : [];
  const path = stopSet ? throughStops(fullPath, stopSet) : fullPath;
  const auto: AutoCheck[] = [
    { ok: rover?.status === "online", label: "Rover online", fix: "It is not answering. Check its power and Wi-Fi." },
    { ok: rover ? !rover.estop : false, label: "E-stop released", fix: "Hold the release button at the top." },
    { ok: !(b.zones.data ?? []).some((z) => z.rain === true), label: "No rain", fix: "It is raining on the farm. Wait for it to stop." },
    { ok: volts == null || volts >= BATTERY_START_V, label: "Battery charged", fix: `Charge it first. A round needs ${BATTERY_START_V} V or more.` },
    { ok: !(midRound && !runningHere), label: "Rover free", fix: "It is on a round in another block." },
    { ok: layoutOk(layout) && trees.length > 0, label: "Block laid out", fix: "This block has no plants to visit. Lay it out on the Setup tab." },
  ];
  const ready = auto.every((a) => a.ok) && ticked.every(Boolean) && !runningHere;
  const est = layout ? estimate(layout.rows, layout.cols, layout.rowM, layout.treeM, planned, stopSet ?? undefined) : null;
  const summary = layout && est
    ? `${est.trees} stops · ${est.distanceM.toFixed(est.distanceM < 10 ? 1 : 0)} m · about ${minutes(est.seconds)}`
    : "This block has no plants laid out yet";

  async function start() {
    if (!layout) return;
    const camera = savedCamera(zone), inspect = savedInspect(zone);
    setBusy(true); setStartError(null);
    try {
      await startRound.mutateAsync({
        zoneId: zone, rows: layout.rows, cols: layout.cols, cellM: layout.treeM, rowM: layout.rowM, simulate: "normal",
        start: planned.start, along: planned.along,
        ...(pm ? { stops: pm.plants } : {}),
        ...(inspect ? { inspect: true } : {}),
        ...(camera !== "side" ? { look: camera } : {}),
      });
      setTicked(MANUAL.map(() => false));
      setDialog(null);
    } catch (e) { setStartError(errorText(e)); } finally { setBusy(false); }
  }

  // a link from Plant health ("?tree=2-3") opens that plant's record
  const treeQuery = b.search.get("tree");
  useEffect(() => {
    const t = parseTree(treeQuery);
    if (t) setDialog({ kind: "record", tree: t });
  }, [treeQuery]);

  const record = dialog?.kind === "record" ? dialog.tree : null;
  const close = () => setDialog(null);
  const back = (tree: Tree | null) => setDialog(tree ? { kind: "record", tree } : null);

  return (
    <main className="main">
      <div className="fl-top">
        <BlockPicker blocks={b.options} value={zone} onChange={b.setZone} />
        <span className="small muted fl-grow">
          {trees.length} plants · {roundAt ? `rover checked ${whenText(roundAt)}` : "no round yet"}
        </span>
        <span className="seg" role="group" aria-label="Show">
          <button type="button" className={onlyAttention ? "" : "on"} aria-pressed={!onlyAttention} onClick={() => setOnlyAttention(false)}>All plants</button>
          <button type="button" className={onlyAttention ? "on" : ""} aria-pressed={onlyAttention} onClick={() => setOnlyAttention(true)}>Needs attention {attention.length}</button>
        </span>
        <button type="button" className="btn btn-sm btn-ghost" disabled={!zone} onClick={() => setDialog({ kind: "soil", tree: null })}>Set block soil</button>
        <button type="button" className="btn btn-sm" disabled={!zone} onClick={() => setDialog({ kind: "start" })}>Start round</button>
      </div>

      {live.error && <Notice kind="alert">{errorText(live.error)}</Notice>}
      {runningHere && mission && (
        <Notice kind="info">A round is on its way: {mission.cellsScanned} of {mission.cellsTotal} plants checked. The table shows the last finished round.</Notice>
      )}
      {last?.status === "aborted" && (
        <Notice kind="warn">The last round stopped: {stopInfo(last.abortReason)?.label ?? "unknown reason"}. Plants checked before that are below.</Notice>
      )}

      <p className="small muted">{targets.words ? `Targets${crop ? ` for ${crop.toLowerCase()}` : ""}: ${targets.words}` : "No soil targets for this crop yet"}</p>

      {trees.length === 0 ? <Empty>This block has no plants yet. Lay it out on the Setup tab.</Empty>
        : onlyAttention && attention.length === 0 ? <Empty>No plant needs attention.</Empty>
        : <SoilTable key={`${zone}-${onlyAttention}`} rows={onlyAttention ? attention : rows} targets={targets} onOpen={(tree) => setDialog({ kind: "record", tree })} />}

      <p className="small muted fl-note">
        The rover measures pH, N, P and K. Texture, root depth, drainage, organic matter, calcium and magnesium come from you or a lab test: set
        them for the whole block, or open a plant. N, P and K from the probe show the trend only, never a dose. <span className="sp-block">Grey
        italics</span> are set for the whole block; “you” marks what you logged for that plant.
      </p>

      {record && (
        <PlantRecordDialog
          zone={zone} tree={record} cell={cellMap.get(treeKey(record[0], record[1]))}
          finding={findings.get(treeKey(record[0], record[1])) ?? cellMap.get(treeKey(record[0], record[1]))?.check ?? null}
          soil={plantSoil(record, cellMap.get(treeKey(record[0], record[1])), roundAt, zoneSoil)} targets={targets}
          health={zonePlants.filter((e) => sameTree(e.tree, record))} roundWhen={roundAt}
          historyHref={`/rover/history?zone=${encodeURIComponent(zone)}&tree=${record[0] + 1}-${record[1] + 1}`}
          onAddSoil={() => setDialog({ kind: "soil", tree: record })}
          onLog={() => setDialog({ kind: "plant", tree: record })}
          onPhoto={() => setDialog({ kind: "photo", tree: record })}
          onClose={close}
        />
      )}
      {dialog?.kind === "soil" && <SoilDialog zone={zone} trees={treeOptions} initial={dialog.tree} onSave={addSoil} onClose={() => back(dialog.tree)} />}
      {dialog?.kind === "plant" && <PlantDialog zone={zone} trees={treeOptions} initial={dialog.tree} onSave={addPlant} onClose={() => back(dialog.tree)} />}
      {dialog?.kind === "photo" && <PhotoDialog zone={zone} tree={dialog.tree} onClose={() => back(dialog.tree)} />}
      {dialog?.kind === "start" && (
        <StartRoundDialog
          summary={summary} auto={auto} manual={MANUAL.map((t, i) => (i === 1 ? placeCheck(path) : t))} ticked={ticked}
          onTick={(i, on) => setTicked(ticked.map((t, j) => (j === i ? on : t)))}
          ready={ready && layoutOk(layout)} busy={busy} error={startError} onStart={start} onClose={close}
        />
      )}
    </main>
  );
}
