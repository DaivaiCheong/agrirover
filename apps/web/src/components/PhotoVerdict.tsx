import { useState } from "react";
import { Bug, CircleCheck, CircleHelp, Droplets, FlaskConical, Microscope, Shovel, TriangleAlert, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { Disease, PhotoResult } from "../lib/api";

const GROUP: Record<string, [LucideIcon, string]> = {
  fungus: [Microscope, "Fungus"], alga: [Microscope, "Alga"], insect: [Bug, "Insect"],
  feed: [FlaskConical, "Feed or soil"], water: [Droplets, "Water"], roots: [Shovel, "Roots"],
};

/** One possible cause, cut down to what a farmer acts on: what it looks like, and two or three steps. */
function MatchCard({ d, onSoil, busy }: { d: Disease; onSoil?: (symptom: string) => void; busy?: boolean }) {
  const [Icon, group] = GROUP[d.card.group] ?? [Microscope, d.kind];
  return (
    <div className="pv-card">
      <div className="pv-cause">
        <span className="pv-gicon"><Icon size={18} aria-hidden /></span>
        <div>
          <div className="pv-name">{d.title}</div>
          <div className="small muted">{group}</div>
        </div>
      </div>
      <div className="pv-k">Looks like</div>
      <p className="pv-signs">{d.card.signs}</p>
      <div className="pv-k">Do now</div>
      <ol className="pv-steps">{d.card.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      {d.card.askFirst && <p className="pv-ask">No spray before an agronomist says which, and how much.</p>}
      <div className="pv-acts">
        {d.symptom && onSoil && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onSoil(d.symptom!)}>Check the soil</button>}
        <Link className="linkbtn" to="/guide">Full guide</Link>
      </div>
    </div>
  );
}

/** The photo check's answer at a glance: is something wrong, what it most likely is, and what to do. */
export default function PhotoVerdict({ r, onSoil, busy }: { r: PhotoResult; onSoil?: (symptom: string) => void; busy?: boolean }) {
  const [pick, setPick] = useState(0);
  const unsure = r.status !== "ok";
  const healthy = !unsure && r.label === "healthy";
  const [Icon, title, cls] = unsure ? [CircleHelp, "Can't tell", "pv-unsure"]
    : healthy ? [CircleCheck, "Looks healthy", "pv-ok"] : [TriangleAlert, "Problem found", "pv-problem"];
  const shown = r.matches[Math.min(pick, r.matches.length - 1)];

  return (
    <div className="pv">
      <div className={`pv-head ${cls}`}>
        <Icon size={30} aria-hidden />
        <div>
          <div className="pv-title">{title}</div>
          {unsure ? <div className="pv-seen">Take a closer, sharper photo of one leaf or fruit.</div>
            : r.seen && <div className="pv-seen">{r.seen}</div>}
        </div>
      </div>

      {healthy && <p className="pv-none">Nothing to do for this leaf or fruit.</p>}

      {!unsure && !healthy && r.matches.length > 0 && (
        <>
          {r.matches.length > 1 && (
            <div className="pv-tabs" role="tablist" aria-label="Possible causes">
              {r.matches.map((d, i) => (
                <button key={d.id} type="button" role="tab" aria-selected={i === pick} className={`pv-tab${i === pick ? " on" : ""}`} onClick={() => setPick(i)}>
                  <span className="pv-tab-k">{i === 0 ? "Most likely" : "Or"}</span>{d.title}
                </button>
              ))}
            </div>
          )}
          {shown && <MatchCard key={shown.id} d={shown} onSoil={onSoil} busy={busy} />}
        </>
      )}

      {!unsure && !healthy && r.matches.length === 0 && (
        <p className="pv-none">Compare it with the <Link to="/guide">Disease guide</Link>, or save it for an expert.</p>
      )}

      <p className="pv-foot">
        {r.matches.length > 0 ? "AI guess, right about 4 in 10" : "AI screen"} · a plant specialist confirms before you treat
      </p>
    </div>
  );
}
