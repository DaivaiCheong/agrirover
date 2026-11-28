import { OctagonX } from "lucide-react";
import type { RoverCell } from "../lib/api";
import { ROVER } from "../lib/rover";

/** Laid over the 3D block when a round stops itself: what happened, that it ended safely, and what was saved. */
const GUARDS: { text: string; keys: string[] }[] = [
  { text: "E-stop · rain · low battery", keys: ["estop", "rain", "battery_low"] },
  { text: "Lost link · bumper", keys: ["link_lost", "controller_bumper", "controller_timeout", "geofence"] },
  { text: "Wheel run-time limited in firmware", keys: [] },
  { text: "Always ends stopped, with a report", keys: ["*"] },
];

type Props = {
  reason: string | null; label: string; simulated: boolean; scenario?: string | null;
  rows: number; cols: number; cells: RoverCell[]; scanned: number; planned: number;
  trees: number; flagged: number; litres: number; battery: number | null;
};

export default function SafeStop({ reason, label, simulated, scenario, rows, cols, cells, scanned, planned, trees, flagged, litres, battery }: Props) {
  const seen = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));
  const tag = `${simulated ? "Simulation" : "Real rover"} · ${scenario === "low_battery" ? "Low battery test" : scenario === "rain" ? "Rain test" : label}`;
  const low = battery != null && battery <= ROVER.batteryStopV + 0.15;
  return (
    <div className="ss" aria-live="polite">
      <div className="ss-tl">
        <div className="ss-tag">{tag}</div>
        <div className="ss-grid" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 24)}, 1fr)` }} aria-label={`${scanned} of ${planned} stops done`}>
          {Array.from({ length: Math.min(rows, 8) }).flatMap((_, ri) => {
            const r = Math.min(rows, 8) - 1 - ri;                     // row 1 at the bottom, like the block
            return Array.from({ length: Math.min(cols, 24) }).map((__, c) => {
              const cell = seen.get(`${r},${c}`);
              const kind = !cell ? "todo" : cell.flagged ? "flag" : (cell.advice?.litres ?? 0) > 0 ? "water" : "ok";
              return <i key={`${r}-${c}`} className={`ss-c ss-${kind}`} />;
            });
          })}
        </div>
        <div className="ss-key"><span><i className="ss-c ss-ok" />Seen</span><span><i className="ss-c ss-water" />Needs water</span>
          <span><i className="ss-c ss-flag" />Look at</span><span><i className="ss-c ss-todo" />Not reached</span></div>
      </div>

      <div className="ss-tr">
        <div className="ss-tr-h">The rover stops itself on</div>
        <ul>
          {GUARDS.map((g) => {
            const hit = g.keys.includes(reason ?? "") || g.keys.includes("*");
            return <li key={g.text} className={hit ? "hit" : ""}><i />{g.text}</li>;
          })}
        </ul>
      </div>

      <div className="ss-banner" role="status">
        <div className="ss-banner-h"><OctagonX size={20} aria-hidden /> {label.toUpperCase()} · ROVER STOPPED SAFELY</div>
        <div className="ss-banner-s">partial report saved · {scanned} of {planned} stops · the farmer is notified</div>
      </div>

      <div className="ss-bar">
        <div><span>Stops done</span><b>{scanned} / {planned}</b></div>
        <div><span>Plants seen</span><b>{trees}</b></div>
        <div><span>Look at</span><b>{flagged}</b></div>
        <div><span>Water proposed</span><b>{litres >= 1 ? `${litres.toFixed(1)} L` : `${Math.round(litres * 1000).toLocaleString()} ml`}</b></div>
        <div><span>Battery</span><b className={low ? "ss-red" : ""}>{battery != null ? `${battery.toFixed(2)} V` : "—"}</b></div>
      </div>
    </div>
  );
}
