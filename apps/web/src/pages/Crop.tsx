import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trees } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import AnyPhotoCheck from "../components/AnyPhotoCheck";
import Farm3D, { type TreeRef } from "../components/Farm3D";
import { TreePhotoCheck } from "../components/TreePhoto";
import { Notice, Panel } from "../components/ui";
import { api, loadProblem } from "../lib/api";
import { farmBlocks, photoKeys, toLookAt } from "../lib/farm3d";
import { useData } from "../lib/useData";
import { ago } from "../lib/usePoll";

const name = (row: number, col: number) => `R${row + 1} T${col + 1}`;

/** Plant health starts from the farm: the trees this morning's round marked stand out in 3D, a click picks one, and its
 *  photo is read against that tree's own soil. A photo with no tree in mind is folded away below. */
export default function Crop() {
  const [search] = useSearchParams();
  const asked = search.get("zone");
  const advice = useData(api.advice);
  const cycles = useData(api.cycles);
  const photos = useData(() => api.photos("all"));
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

      <Panel title="Your farm" icon={Trees} pad={false}
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
      </Panel>

      <details className="hf-more">
        <summary>Photo without a tree: a fruit, a branch, or the whole block</summary>
        <div className="hf-more-body"><AnyPhotoCheck initialZone={asked ?? ""} /></div>
      </details>
    </main>
  );
}
