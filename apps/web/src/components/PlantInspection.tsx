import { useState } from "react";
import { ArrowLeft, Map as MapIcon, ScanSearch } from "lucide-react";
import { Link } from "react-router-dom";
import PlantCard, { InspectionSummary, KIND, kindOf } from "./PlantCard";
import RoverMap from "./RoverMap";
import { TreePhotoCheck } from "./TreePhoto";
import { Panel } from "./ui";
import { photoImageUrl, type FindingKind, type PlantMap, type RoverCell } from "../lib/api";
import { useInspection } from "../lib/queries";
import { savedRoute, spotKey } from "../lib/rover";
import { ago } from "../lib/usePoll";

/** The rover's newest Plant Inspection of a block with a plant map: the same map as the Rover screen, marked by what each
 *  plant's photo showed; the problems listed with their photos; a plant opens the same card as on Rover. */
export default function PlantInspection({ maps, asked, askedTree }: { maps: PlantMap[]; asked: string | null; askedTree: [number, number] | null }) {
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
