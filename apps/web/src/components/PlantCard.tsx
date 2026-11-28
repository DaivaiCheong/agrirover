import { Bug, CircleCheck, CircleHelp, FlaskConical, Map as MapIcon, Microscope, Stethoscope, TriangleAlert, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { photoImageUrl, type FindingKind, type RoverPhotoCheck } from "../lib/api";
import { cellName } from "../lib/rover";

/** How each kind of finding looks: icon, word, colour class. */
export const KIND: Record<FindingKind, [LucideIcon, string, string]> = {
  healthy: [CircleCheck, "Healthy", "pc-healthy"],
  disease: [Microscope, "Disease", "pc-disease"],
  nutrient: [FlaskConical, "Nutrient", "pc-nutrient"],
  pest: [Bug, "Pest", "pc-pest"],
  problem: [TriangleAlert, "Problem", "pc-disease"],
  unsure: [CircleHelp, "Not sure", "pc-unsure"],
};

export const kindOf = (f?: RoverPhotoCheck | null): FindingKind => f?.kind ?? (f?.label === "healthy" ? "healthy" : f?.label ? "problem" : "unsure");

/** Where to see this plant on the other page: Plant health for the finding, the Rover map for the round. */
export const plantLink = (to: "health" | "rover", zone: string, row: number, col: number) =>
  `${to === "health" ? "/crop" : "/rover"}?zone=${encodeURIComponent(zone)}&tree=${row + 1}-${col + 1}`;

/** "?tree=2-3" back to [row, col] from 0. */
export function treeParam(value: string | null): [number, number] | null {
  const m = value?.match(/^(\d+)-(\d+)$/);
  return m ? [Number(m[1]) - 1, Number(m[2]) - 1] : null;
}

/** One plant on a Plant Inspection round, the same on Rover and Plant health: the rover's photo, what the check found,
 *  what to do now, and why (Mulder's chart for a feed shortage). Links to the same plant on the other page. */
export default function PlantCard({ zone, row, col, finding, link, label }: {
  zone: string; row: number; col: number; finding: RoverPhotoCheck | null | undefined;
  /** which page the link opens: the other one */ link: "health" | "rover"; label?: string }) {
  const kind = kindOf(finding);
  const [Icon, word, cls] = KIND[kind];
  const card = finding?.card;
  return (
    <div className={`pc ${cls}`}>
      <div className="pc-head">
        <Icon size={26} aria-hidden />
        <div>
          <div className="pc-title">{finding ? finding.title : "Not inspected yet"}</div>
          <div className="small muted">{label ? `${label} · ` : ""}{cellName(row, col)} · <span className="pc-kind">{word}</span>
            {finding?.also && <> · or {finding.also.toLowerCase()}</>}</div>
        </div>
      </div>
      {finding?.photoId && <img className="pc-photo" src={photoImageUrl(finding.photoId)} alt={`The rover's photo of ${cellName(row, col)}`} />}
      {finding?.seen && <p className="pc-seen">"{finding.seen}"</p>}
      {finding?.problem && <p className="small muted">{finding.problem}</p>}
      {!finding && <p className="small muted">The rover has not photographed this plant on its newest round.</p>}
      {card && (
        <>
          <div className="pv-k">Looks like</div>
          <p className="pv-signs">{card.signs}</p>
          <div className="pv-k">Do now</div>
          <ol className="pv-steps">{card.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          {card.why && <><div className="pv-k">{kind === "nutrient" ? "Why it happens (nutrients work together)" : "Favoured by"}</div><p className="small">{card.why}</p></>}
          {card.askFirst && <p className="pv-ask">No spray before an agronomist says which, and how much.</p>}
        </>
      )}
      {kind === "healthy" && <p className="pv-none">Nothing to do for this plant today.</p>}
      <div className="pc-acts">
        {link === "health"
          ? <Link className="btn btn-sm" to={plantLink("health", zone, row, col)}><Stethoscope size={15} aria-hidden />Open in Plant health</Link>
          : <Link className="btn btn-sm btn-ghost" to={plantLink("rover", zone, row, col)}><MapIcon size={15} aria-hidden />Show on the rover map</Link>}
        {finding?.photoId && <Link className="linkbtn small" to="/photos">Confirm in Photo library</Link>}
        {card && <Link className="linkbtn small" to="/guide">Full guide</Link>}
      </div>
      <p className="pv-foot">AI triage from the rover's photo, not a diagnosis · a plant specialist confirms before you treat</p>
    </div>
  );
}

/** The round at a glance: how many plants were inspected and what was found, by kind. */
export function InspectionSummary({ s, onKind, active }: {
  s: { inspected: number } & Partial<Record<FindingKind, number>>; onKind?: (k: FindingKind | null) => void; active?: FindingKind | null }) {
  const kinds: FindingKind[] = ["disease", "nutrient", "pest", "problem", "healthy", "unsure"];
  return (
    <div className="pc-sum" role="group" aria-label="What the inspection found">
      <span className="pc-sum-n"><b>{s.inspected}</b> inspected</span>
      {kinds.filter((k) => (s[k] ?? 0) > 0).map((k) => {
        const [Icon, word, cls] = KIND[k];
        return (
          <button key={k} type="button" className={`pc-chip ${cls}${active === k ? " on" : ""}`} aria-pressed={active === k} disabled={!onKind}
                  onClick={() => onKind?.(active === k ? null : k)}>
            <Icon size={14} aria-hidden />{s[k]} {word.toLowerCase()}
          </button>
        );
      })}
    </div>
  );
}
