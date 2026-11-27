import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Map as MapIcon, ScanSearch, Trees } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import AnyPhotoCheck from "../components/AnyPhotoCheck";
import Farm3D, { type TreeRef } from "../components/Farm3D";
import PlantCard, { InspectionSummary, KIND, kindOf, treeParam } from "../components/PlantCard";
import RoverMap from "../components/RoverMap";
import { TreePhotoCheck } from "../components/TreePhoto";
import { Notice, Panel } from "../components/ui";
import { api, loadProblem, photoImageUrl, type FindingKind, type PlantMap, type RoverCell } from "../lib/api";
import { farmBlocks, photoKeys, toLookAt } from "../lib/farm3d";
import { savedRoute, spotKey } from "../lib/rover";
import { useData } from "../lib/useData";
import { useInspection } from "../lib/useInspection";
import { ago } from "../lib/usePoll";

const name = (row: number, col: number) => `R${row + 1} T${col + 1}`;

/** The rover's newest Plant Inspection of a block with a plant map: the same map as the Rover screen, marked by what each
 *  plant's photo showed; the problems listed with their photos; a plant opens the same card as on Rover. */
function PlantInspection({ maps, asked, askedTree }: { maps: PlantMap[]; asked: string | null; askedTree: [number, number] | null }) {
  const [zone, setZone] = useState(asked && maps.some((m) => m.zone === asked) ? asked : maps[0].zone);
  const [picked, setPicked] = useState<[number, number] | null>(askedTree);
  const [kind, setKind] = useState<FindingKind | null>(null);
  const pm = maps.find((m) => m.zone === zone) ?? maps[0];
  const insp = useInspection(pm.zone);
  const plants = insp.data?.plants ?? [];
  const cells: RoverCell[] = plants.filter((p) => p.row < pm.rows && p.col < pm.cols).map((p) => ({
    row: p.row, col: p.col, plant: p.plant ?? Boolean(p.finding), flagged: Boolean(p.flagged), readings: p.readings,
    canopy: p.canopy, chlorosis: p.yellow, check: p.finding }));
  const shown = picked ? plants.find((p) => p.row === picked[0] && p.col === picked[1]) : undefined;
  const listed = plants.filter((p) => p.finding && (kind ? kindOf(p.finding) === kind : kindOf(p.finding) !== "healthy"));
  const s = insp.data?.summary;
  const when = insp.data?.live ? "in progress" : insp.data?.finishedAt ? ago(insp.data.finishedAt) : insp.data?.startedAt ? ago(insp.data.startedAt) : null;
  const sceneH = Math.max(window.innerWidth < 600 ? 300 : 380, window.innerHeight - (window.innerWidth < 900 ? 300 : 330));

  return (
    <Panel title={`Plant Inspection · ${pm.label}`} icon={ScanSearch} pad={false}
           right={<span className="rv-right">
             <span className="small muted">{insp.data?.missionId ? `Rover round ${when ?? ""}${insp.data.simulated ? " · simulated wheels" : ""}` : "No round yet"}</span>
             <Link className="btn btn-sm btn-ghost" to={`/rover?zone=${encodeURIComponent(pm.zone)}`}><MapIcon size={15} aria-hidden />Rover</Link>
           </span>}>
      {maps.length > 1 && (
        <div className="rv-blocks" role="group" aria-label="Block">
          {maps.map((m) => <button key={m.zone} type="button" className={`f3-chip${m.zone === pm.zone ? " on" : ""}`} aria-pressed={m.zone === pm.zone}
                                   onClick={() => { setZone(m.zone); setPicked(null); setKind(null); }}>{m.label}</button>)}
        </div>
      )}
      <div className="hf">
        <div className="hf-scene">
          <div className="rv-map" style={{ minHeight: sceneH }}>
            <div className="rm-wrap">
              <RoverMap rows={pm.rows} cols={pm.cols} cells={cells} selected={picked} onPick={(a, b) => setPicked([a, b])}
                        route={savedRoute(pm.zone)} plants={new Set(pm.plants.map(([a, b]) => spotKey(a, b)))} crop={pm.crop} />
            </div>
            <div className="panel-foot rm-foot">
              <span className="rm-legend"><span><i className="pc-dot pc-healthy" />Healthy</span><span><i className="pc-dot pc-disease" />Disease</span>
                <span><i className="pc-dot pc-nutrient" />Nutrient</span><span><i className="pc-dot pc-pest" />Pest</span></span>
              <span className="small muted">Tap a plant</span>
            </div>
          </div>
        </div>
        <aside className="hf-list" aria-label={shown ? "The plant" : "What the inspection found"} style={{ maxHeight: window.innerWidth < 900 ? undefined : sceneH + 40 }}>
          {picked ? (
            <div className="hf-tree">
              <div className="hf-tree-head">
                <button type="button" className="linkbtn small" onClick={() => setPicked(null)}><ArrowLeft size={14} aria-hidden /> All plants</button>
              </div>
              <PlantCard zone={pm.zone} row={picked[0]} col={picked[1]} finding={shown?.finding} link="rover" label={pm.label} />
              <details className="hf-more">
                <summary>Take a closer photo of this plant</summary>
                <TreePhotoCheck key={`${pm.zone}-${picked[0]}-${picked[1]}`} zone={pm.zone} row={picked[0]} col={picked[1]} />
              </details>
            </div>
          ) : (
            <div className="panel-pad stack" style={{ gap: 10 }}>
              {s && s.inspected > 0 ? <InspectionSummary s={s} onKind={setKind} active={kind} />
                : <p className="small muted">No plant photographed yet. Start a round with <b>Camera check every plant</b> on <Link to={`/rover?zone=${encodeURIComponent(pm.zone)}`}>Rover</Link>.</p>}
              {s && s.inspected > 0 && (
                <>
                  <div className="erp-label">{kind ? `${kind[0].toUpperCase()}${kind.slice(1)}` : "To look at"} · {listed.length}</div>
                  {listed.length === 0 && <p className="small muted">{kind ? "None." : "No problem found on this round."}</p>}
                  <ul className="pi-list">
                    {listed.map((p) => (
                      <li key={`${p.row}-${p.col}`}>
                        <button type="button" className="pi-item" onClick={() => setPicked([p.row, p.col])}>
                          {p.finding?.photoId ? <img src={photoImageUrl(p.finding.photoId)} alt="" /> : <span className="pi-blank" />}
                          <span><b>{p.name}</b> <span className={`pc-kind ${KIND[kindOf(p.finding)][2]}`}>{KIND[kindOf(p.finding)][1]}</span>
                            <span className="small muted" style={{ display: "block" }}>{p.finding?.title}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </Panel>
  );
}

/** Plant health starts from the farm: the trees this morning's round marked stand out in 3D, a click picks one, and its
 *  photo is read against that tree's own soil. A photo with no tree in mind is folded away below. */
export default function Crop() {
  const [search] = useSearchParams();
  const asked = search.get("zone");
  const advice = useData(api.advice);
  const cycles = useData(api.cycles);
  const photos = useData(() => api.photos("all"));
  const maps = useData(api.plantMaps);
  const [picked, setPicked] = useState<TreeRef | null>(null);
  const [focus, setFocus] = useState<string | null>(asked);

  const blocks = useMemo(() => farmBlocks(advice.data ?? [], cycles.data ?? [], photoKeys(photos.data?.photos ?? [])),
    [advice.data, cycles.data, photos.data]);
  const list = toLookAt(blocks);
  const looks = list.filter((x) => x.tree.alert === "look");
  const block = picked ? blocks.find((b) => b.zone === picked.zone) : undefined;
  const tree = picked ? block?.trees.find((t) => t.row === picked.row && t.col === picked.col) : undefined;
  const newest = (advice.data ?? []).map((a) => a.surveyedAt).filter((x): x is string => Boolean(x)).sort().pop();
  const loading = advice.data === null || cycles.data === null;

  // from Today's "Check a photo" on a block: frame that block and pick its first tree to look at
  useEffect(() => {
    if (!asked || picked || !blocks.length) return;
    const first = list.find((x) => x.block.zone === asked && x.tree.alert === "look");
    if (first) setPicked({ zone: asked, row: first.tree.row, col: first.tree.col });
  }, [asked, looks.length]);     // eslint-disable-line react-hooks/exhaustive-deps   (the marks come with the advice, after the blocks)

  function pick(t: TreeRef, frame = false) {
    setPicked(t);
    if (frame) setFocus(t.zone);
  }
  // the farm fills the screen, so problem, tree and answer are seen together without scrolling
  const sceneH = Math.max(window.innerWidth < 600 ? 320 : 420, window.innerHeight - (window.innerWidth < 900 ? 260 : 250));

  return (
    <main className="main stack">
      {(advice.error || cycles.error) && <Notice kind="alert">{loadProblem(advice.error ?? cycles.error ?? "")}</Notice>}

      {/* blocks with a plant map (the tomato farm): the rover's Plant Inspection, linked both ways with the Rover screen */}
      {(maps.data ?? []).length > 0 && (
        <PlantInspection key={asked ?? ""} maps={maps.data!} asked={asked} askedTree={treeParam(search.get("tree"))} />
      )}

      {/* guava blocks keep the 3D farm; with none growing, it is left out */}
      {(loading || blocks.length > 0 || (maps.data ?? []).length === 0) && <Panel title="Your farm" icon={Trees} pad={false}
             right={<span className="small muted">{newest ? `Rover ${ago(newest)}` : "No round yet"}{(advice.data ?? []).some((a) => a.simulated) ? " · simulated" : ""}</span>}>
        <div className="hf">
          <div className="hf-scene">
            {loading ? <p className="panel-pad muted">Loading…</p> : (
              <>
                <Farm3D blocks={blocks} selected={picked} onPick={(t) => pick(t)} focus={focus} height={sceneH} />
                <div className="f3-bar">
                  <button type="button" className={`f3-chip${focus === null ? " on" : ""}`} onClick={() => setFocus(null)}>Whole farm</button>
                  {blocks.map((b) => {
                    const n = b.trees.filter((t) => t.alert === "look").length;
                    return <button key={b.zone} type="button" className={`f3-chip${focus === b.zone ? " on" : ""}`} onClick={() => setFocus(b.zone)}>
                      {b.label}{n ? ` · ${n}` : ""}</button>;
                  })}
                </div>
                <div className="f3-legend"><span><i className="lg-bang" />Look at</span><span><i className="lg-yellow" />Yellow leaves</span><span><i className="lg-photo" />Photo saved</span></div>
                <div className="f3-hint">Drag to turn · scroll to zoom</div>
              </>
            )}
          </div>
          <aside className="hf-list" aria-label={picked ? "The tree" : "Trees to look at"} style={{ maxHeight: window.innerWidth < 900 ? undefined : sceneH }}>
            {picked && block ? (
              <div className="hf-tree">
                <div className="hf-tree-head">
                  <button type="button" className="linkbtn small" onClick={() => setPicked(null)}><ArrowLeft size={14} aria-hidden /> All trees</button>
                  <b>{block.label} · {name(picked.row, picked.col)}</b>
                  {tree?.note && <span className="small muted">{tree.note}</span>}
                </div>
                <TreePhotoCheck key={`${picked.zone}-${picked.row}-${picked.col}`} zone={picked.zone} row={picked.row} col={picked.col}
                                onSaved={() => photos.reload()} />
              </div>
            ) : (
              <>
                <div className="hf-list-head">To look at <b>{looks.length}</b><span className="small muted"> · click one, or a ! on the farm</span></div>
                {!loading && list.length === 0 && <p className="small muted" style={{ padding: "0 14px" }}>Nothing marked. Run a round from <Link to="/rover">Rover</Link>.</p>}
                <ul>
                  {list.map(({ block: b, tree: t }) => (
                    <li key={`${b.zone}-${t.row}-${t.col}`}>
                      <button type="button" className={`hf-item${t.alert === "expected" ? " hf-expected" : ""}`}
                              onClick={() => pick({ zone: b.zone, row: t.row, col: t.col }, true)}>
                        <span className={t.alert === "look" ? "hf-mark" : "hf-mark hf-mark-ok"}>{t.alert === "look" ? "!" : "i"}</span>
                        <span><b>{b.label} · {name(t.row, t.col)}</b><span className="small muted">{t.note}</span></span>
                        {t.photo && <span className="hf-photo" title="Photo saved" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </Panel>}

      <details className="hf-more">
        <summary>Photo without a tree: a fruit, a branch, or the whole block</summary>
        <div className="hf-more-body"><AnyPhotoCheck initialZone={asked ?? ""} /></div>
      </details>
    </main>
  );
}
