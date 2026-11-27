// The Rover's daily page, the Field log. The rover checks the trees; the farmer looks only at what needs them, and logs
// what they find: soil readings, and what they see on each tree. Setup (the plant map, route and camera) is on its own tab.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Settings } from "lucide-react";
import BlockPicker from "../features/rover/ui/BlockPicker";
import { BlockMap, NeedsYou, NextRound, PlantLog, RoundsList, SoilLog, type AutoCheck, type MapState, type PlantRow, type SoilRow } from "../features/rover/ui/fieldlog/Panels";
import { FieldWalk, PhotoDialog, PlantDialog, SoilDialog, TreeDialog, type TreeOption } from "../features/rover/ui/fieldlog/Dialogs";
import {
  METER, RESULT, SEEN, handledTrees, knownCount, layoutOf, layoutOk, lookItems, numText, parseTree, rangeText, roundSoil,
  treeKey, treeName, treesOf, type LookItem, type Result, type Tree,
} from "../features/rover/ui/fieldlog/model";
import { addPlant, addSoil, newId, useFieldLog } from "../features/rover/ui/fieldlog/store";
import { savedCamera, savedInspect } from "../features/rover/ui/fieldlog/roundSettings";
import { Kpis, Notice, Panel } from "../components/ui";
import { api, type RoverCell, type RoverPhotoCheck } from "../lib/api";
import { DEFAULT_ROUTE, cellName, estimate, minutes, route as routeOf, savedRoute, spotKey, stopInfo, throughStops, type Route } from "../lib/rover";
import { useData } from "../lib/useData";
import { useInspection } from "../lib/useInspection";
import { ago, usePoll } from "../lib/usePoll";
import "../features/rover/ui/fieldlog/fieldlog.css";

/** The three things a farmer checks by eye before the rover goes. The middle one names the start tree from the route. */
const MANUAL = ["Rows clear of people and hoses", "Rover at the start tree", "Camera and probe clean"];
/** A round needs at least this charge, the same figure the rover's guard uses. */
const BATTERY_START_V = 11.6;

const placeCheck = (path: [number, number][]) =>
  path.length === 0 ? "Place a plant on the map first"
    : path.length > 1 ? `Rover on ${cellName(...path[0])}, facing ${cellName(...path[1])}` : `Rover on ${cellName(...path[0])}`;

/** One dialog at a time. */
type Dialog = { kind: "tree"; tree: Tree } | { kind: "plant"; tree: Tree | null } | { kind: "soil" } | { kind: "photo"; tree: Tree } | null;

export default function Rover() {
  const [search, setSearch] = useSearchParams();
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const maps = useData(api.plantMaps);
  const surveys = usePoll(api.surveys, 10000);
  const live = usePoll(api.roverLive, 2000);
  const test = usePoll(api.roverTest, 5000);
  const log = useFieldLog();

  const [dialog, setDialog] = useState<Dialog>(null);
  const [walk, setWalk] = useState<LookItem[] | null>(null);
  const [ticked, setTicked] = useState<boolean[]>(MANUAL.map(() => false));
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // ---- the block: which one, its grid, and which spots hold a tree
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
  const trees = treesOf(pm, layout);
  const total = trees.length;
  const plantWord = pm ? "plants" : "trees";
  const label = bed?.label ?? cycle?.bedLabel ?? zone;
  const planned: Route = zone ? savedRoute(zone) : DEFAULT_ROUTE;
  const stopSet = pm ? new Set(pm.plants.map(([r, c]) => spotKey(r, c))) : null;
  const fullPath = layout ? routeOf(layout.rows, layout.cols, planned) : [];
  const path = stopSet ? throughStops(fullPath, stopSet) : fullPath;

  // ---- the last finished round, its trees and readings
  const here = (surveys.data ?? []).filter((s) => s.zone === zone).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const last = here.find((s) => s.status === "completed" || s.status === "aborted");
  const lastRound = useData(() => (last ? api.survey(last.id) : Promise.resolve(null)), [last?.id]);
  const cells: RoverCell[] = lastRound.data?.cells ?? [];
  const plantCells = cells.filter((c) => c.plant);
  const inspection = useInspection(zone, 10000);
  const findings = useMemo(
    () => new Map((inspection.data?.plants ?? []).map((p) => [treeKey(p.row, p.col), p.finding] as [string, RoverPhotoCheck | null])),
    [inspection.data],
  );
  const cellOf = (t: Tree) => cells.find((c) => c.row === t[0] && c.col === t[1]);
  const findingOf = (t: Tree) => findings.get(treeKey(t[0], t[1])) ?? cellOf(t)?.check ?? null;

  // ---- what needs the farmer, and what they have logged
  const since = last ? last.finishedAt ?? last.startedAt : null;
  const items = lookItems(plantCells, findings);
  const handled = handledTrees(log.plants, zone, since);
  const todo = items.filter((i) => !handled.has(treeKey(i.row, i.col)));
  // every spot the rover looked at is known, even one where it saw no tree
  const checked = new Set(cells.map((c) => treeKey(c.row, c.col)));
  const emptySpots = new Set(cells.filter((c) => !c.plant).map((c) => treeKey(c.row, c.col)));
  const known = knownCount(checked, log.plants, zone, total);
  const soil = roundSoil(cells);
  const myPlants = log.plants.filter((e) => e.zone === zone).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const mySoil = log.soil.filter((e) => e.zone === zone);
  const soilCount = plantCells.filter((c) => c.readings?.soil_moisture !== undefined).length + mySoil.length;

  // ---- the rover, and whether a round can start
  const mission = live.data?.mission ?? null;
  const midRound = Boolean(mission && (mission.status === "queued" || mission.status === "running"));
  const runningHere = midRound && mission?.zoneId === zone;
  const runningElsewhere = midRound && !runningHere;
  const rover = live.data?.rover;
  const online = rover?.status === "online";
  const released = rover ? !rover.estop : false;
  const raining = beds.some((b) => b.rain === true);
  const volts = test.data?.rover.batteryV ?? null;
  const batteryOk = volts == null || volts >= BATTERY_START_V;
  const auto: AutoCheck[] = [
    { ok: online, label: "Rover online", fix: "It is not answering. Check its power and Wi-Fi." },
    { ok: released, label: "E-stop released", fix: "Hold the release button in the bar above." },
    { ok: !raining, label: "No rain", fix: "It is raining on the farm. Wait for it to stop." },
    { ok: batteryOk, label: "Battery charged", fix: `Charge it first. A round needs ${BATTERY_START_V} V or more.` },
    { ok: !runningElsewhere, label: "Rover free", fix: "It is on a round in another block." },
    { ok: layoutOk(layout) && total > 0, label: "Block laid out", fix: "This block has no trees to visit. Lay it out on the Setup tab." },
  ];
  const ready = auto.every((a) => a.ok) && ticked.every(Boolean) && !runningHere;
  const manual = MANUAL.map((t, i) => (i === 1 ? placeCheck(path) : t));
  const est = layout ? estimate(layout.rows, layout.cols, layout.rowM, layout.treeM, planned, stopSet ?? undefined) : null;
  const summary = layout && est
    ? `${total} ${plantWord} · ${est.trees} stops · ${est.distanceM.toFixed(est.distanceM < 10 ? 1 : 0)} m · about ${minutes(est.seconds)}`
    : "This block has no trees laid out yet";
  const runningText = runningHere && mission
    ? `A round is on its way: ${mission.cellsScanned} of ${mission.cellsTotal} trees checked. The lists below are from the last finished round.`
    : null;

  async function start() {
    if (!layout) return;
    const camera = savedCamera(zone), inspect = savedInspect(zone);
    setBusy(true); setStartError(null);
    try {
      await api.startSurvey({
        zoneId: zone, rows: layout.rows, cols: layout.cols, cellM: layout.treeM, rowM: layout.rowM, simulate: "normal",
        start: planned.start, along: planned.along,
        ...(pm ? { stops: pm.plants } : {}),
        ...(inspect ? { inspect: true } : {}),
        ...(camera !== "side" ? { look: camera } : {}),
      });
      setTicked(MANUAL.map(() => false));
    } catch (e) { setStartError((e as Error).message); } finally { setBusy(false); }
  }

  // ---- the block map and the logs
  const lookKeys = new Set(todo.map((i) => treeKey(i.row, i.col)));
  const states = new Map<string, MapState>();
  for (const [r, c] of trees) {
    const k = treeKey(r, c);
    states.set(k, handled.has(k) ? "logged" : lookKeys.has(k) ? "look" : emptySpots.has(k) ? "empty" : checked.has(k) ? "fine" : "unchecked");
  }
  const emptyCount = emptySpots.size;
  const treeOptions: TreeOption[] = trees.map(([r, c]) => ({ key: treeKey(r, c), name: treeName(r, c), tree: [r, c] as Tree }));
  const soilRows: SoilRow[] = [
    ...(last && plantCells.length ? [{
      key: `rover-${last.id}`, at: last.finishedAt ?? last.startedAt, where: "Whole block",
      moisture: rangeText(soil.moisture), ec: rangeText(soil.ec, 1), ph: rangeText(soil.ph, 1),
      who: `Rover, ${soil.trees} ${plantWord}`,
    }] : []),
    ...mySoil.map((e) => ({
      key: e.id, at: e.at, where: e.tree ? treeName(e.tree[0], e.tree[1]) : "Whole block",
      moisture: numText(e.moisture), ec: numText(e.ec, 1), ph: numText(e.ph, 1), who: METER[e.meter], note: e.note,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const plantRows: PlantRow[] = myPlants.map((e) => ({
    key: e.id, at: e.at, tree: e.tree, name: treeName(e.tree[0], e.tree[1]),
    saw: e.seen ? SEEN[e.seen] : e.roverSaw ? `Rover: ${e.roverSaw}` : "—",
    result: RESULT[e.result], did: [e.did, e.note].filter(Boolean).join(" · ") || "—",
  }));

  function decide(i: LookItem, result: Result) {
    addPlant({ id: newId(), zone, at: new Date().toISOString(), tree: [i.row, i.col], result, roverSaw: i.what });
  }

  // a link from Plant health ("?tree=2-3") opens that tree's record
  const treeQuery = search.get("tree");
  useEffect(() => {
    const t = parseTree(treeQuery);
    if (t) setDialog({ kind: "tree", tree: t });
  }, [treeQuery]);

  return (
    <main className="main">
      <div className="fl-top">
        <BlockPicker blocks={beds.map((b) => ({ zone: b.zone, label: b.label ?? b.zone }))} value={zone} onChange={(z) => setSearch({ zone: z })} />
        <span className="small muted fl-grow">
          {layout
            ? `${label}: ${total} ${plantWord}, ${layout.rows} rows × ${layout.cols}${emptyCount ? ` · ${emptyCount} ${emptyCount === 1 ? "spot" : "spots"} with no tree seen` : ""}`
            : `${label} has no trees laid out yet`}
        </span>
        <Link className="btn btn-sm btn-ghost" to={`/rover/setup?zone=${encodeURIComponent(zone)}`}><Settings size={15} aria-hidden />Setup</Link>
      </div>

      {live.error && <Notice kind="alert">{live.error}</Notice>}
      {runningText && <Notice kind="info">{runningText}</Notice>}
      {last?.status === "aborted" && (
        <Notice kind="warn">The last round stopped: {stopInfo(last.abortReason)?.label ?? "unknown reason"}. Trees checked before that are below.</Notice>
      )}

      <div className="fl-stack">
        <Kpis items={[
          { k: "Known condition", v: total ? `${known} of ${total}` : "—" },
          { k: "Need you", v: last ? todo.length : "—" },
          { k: "Soil readings", v: soilCount },
          { k: "Last round", v: last ? ago(last.finishedAt ?? last.startedAt) : "None yet" },
        ]} />
        <p className="small muted fl-note">
          Known condition: trees the rover checked in its last round, plus any you logged. Need you: flagged trees you have not looked at since.
        </p>

        <NeedsYou
          items={todo}
          emptyText={last ? "Nothing needs you. The rover found no tree to look at since its last round." : "No round yet. Start one, and the rover checks every tree."}
          onWalk={() => setWalk(todo)}
          onOpen={(i) => setDialog({ kind: "tree", tree: [i.row, i.col] })}
        />
      </div>

      <div className="fl-two">
        <NextRound
          auto={auto} manual={manual} ticked={ticked}
          onTick={(i, on) => setTicked(ticked.map((t, j) => (j === i ? on : t)))}
          ready={ready && layoutOk(layout)} busy={busy} error={startError} summary={summary}
          running={runningText ? "A round is running in this block." : null}
          settingsHref={`/rover/setup?zone=${encodeURIComponent(zone)}`} onStart={start}
        />
        <Panel title="Block map">
          {layout && total > 0
            ? <BlockMap rows={layout.rows} cols={layout.cols} trees={trees} states={states} label={`${label}: one mark a tree`}
                        onPick={(r, c) => setDialog({ kind: "tree", tree: [r, c] })} />
            : <p className="muted">No trees to map yet.</p>}
        </Panel>
      </div>

      <div className="fl-stack">
        <SoilLog rows={soilRows} onLog={() => setDialog({ kind: "soil" })} />
        <PlantLog rows={plantRows} onLog={() => setDialog({ kind: "plant", tree: null })} onOpen={(t) => setDialog({ kind: "tree", tree: t })} />
        <RoundsList rounds={here.slice(0, 5)} total={total} />
      </div>

      {dialog?.kind === "tree" && (
        <TreeDialog
          zone={zone} tree={dialog.tree} cell={cellOf(dialog.tree)} finding={findingOf(dialog.tree)}
          history={myPlants.filter((e) => e.tree[0] === dialog.tree[0] && e.tree[1] === dialog.tree[1])}
          roundWhen={last ? last.finishedAt ?? last.startedAt : null}
          onLog={() => setDialog({ kind: "plant", tree: dialog.tree })}
          onPhoto={() => setDialog({ kind: "photo", tree: dialog.tree })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "plant" && (
        <PlantDialog zone={zone} trees={treeOptions} initial={dialog.tree} onSave={addPlant} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "soil" && (
        <SoilDialog zone={zone} trees={treeOptions} initial={null} onSave={addSoil} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "photo" && <PhotoDialog zone={zone} tree={dialog.tree} onClose={() => setDialog(null)} />}
      {walk && (
        <FieldWalk
          items={walk} onDecide={decide}
          onDetails={(i) => { setWalk(null); setDialog({ kind: "plant", tree: [i.row, i.col] }); }}
          onClose={() => setWalk(null)}
        />
      )}
    </main>
  );
}
