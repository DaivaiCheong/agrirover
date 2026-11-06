import type { RoverCell } from "../lib/api";
import { cellName, headingAt, kindOf, serpentine } from "../lib/rover";

const PX = 44;

function describe(c: RoverCell | undefined, row: number, col: number, photo = false): string {
  const name = cellName(row, col);
  if (!c) return `${name}: not reached`;
  if (!c.plant) return `${name}: no tree`;
  const parts: string[] = [];
  const m = c.readings?.soil_moisture;
  if (m !== undefined) parts.push(`soil ${m} %`);
  if (c.advice) parts.push(c.advice.litres > 0 ? `water ${c.advice.litres} L` : "no water today");
  if (c.flagged) parts.push("yellow leaves, go and look");
  if (photo) parts.push("photo saved");
  return `${name}: ${parts.join(", ")}`;
}

/** The block from above, row 1 at the bottom. Every state has a mark as well as a colour: a dot for a tree,
 *  the litres for water, an outline and "!" for yellow leaves. */
export default function RoverMap({ rows, cols, cells, at, selected, onPick, photos }:
  { rows: number; cols: number; cells: RoverCell[]; at?: [number, number] | null; selected?: [number, number] | null; onPick?: (row: number, col: number) => void;
    /** Trees with a saved photo, as "row,col" from 0: a small dark dot in the corner. */
    photos?: Set<string> }) {
  const byCell = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));
  const path = serpentine(rows, cols);
  const y = (row: number) => (rows - 1 - row) * PX;
  const centre = ([r, c]: [number, number]) => [c * PX + PX / 2, y(r) + PX / 2] as const;
  const pts = (list: [number, number][]) => list.map((p) => centre(p).join(",")).join(" ");
  const step = at ? path.findIndex(([r, c]) => r === at[0] && c === at[1]) : -1;
  const words = rows <= 16 && cols <= 16;
  const [ax, ay] = centre(at ?? [0, 0]);

  return (
    <svg className="rm" viewBox={`-1 -1 ${cols * PX + 2} ${rows * PX + 2}`} role="group"
         aria-label={`Block map, ${rows} rows of ${cols} trees, ${cells.length} reached`}>
      {path.map(([row, col]) => {
        const c = byCell.get(`${row},${col}`);
        const x = col * PX, top = y(row);
        const picked = selected?.[0] === row && selected?.[1] === col;
        const pick = c && onPick ? () => onPick(row, col) : undefined;
        return (
          <g key={`${row}-${col}`} className={`rm-cell rm-${kindOf(c)}${c?.flagged ? " rm-flag" : ""}${picked ? " rm-picked" : ""}${pick ? " rm-can" : ""}`}
             role={pick ? "button" : "img"} aria-label={describe(c, row, col, photos?.has(`${row},${col}`))} tabIndex={pick ? 0 : undefined} onClick={pick}
             onKeyDown={pick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } } : undefined}>
            <title>{describe(c, row, col, photos?.has(`${row},${col}`))}</title>
            <rect x={x} y={top} width={PX} height={PX} className="rm-bg" />
          </g>
        );
      })}
      <polyline points={pts(path)} className="rm-path" />
      {step > 0 && <polyline points={pts(path.slice(0, step + 1))} className="rm-done" />}
      <g className="rm-marks">
        {cells.map((c) => {
          const x = c.col * PX, top = y(c.row);
          const litres = c.advice?.litres ?? 0;
          return (
            <g key={`${c.row}-${c.col}`} className={litres > 0 ? "rm-water" : undefined}>
              {c.plant && litres === 0 && <circle cx={x + PX / 2} cy={top + PX / 2} r={3 + Math.min(1, (c.canopy ?? 0.3) / 0.55) * 8} className="rm-plant" />}
              {litres > 0 && words && <text x={x + PX / 2} y={top + PX / 2 + 4} className="rm-ml">{litres < 10 ? litres.toFixed(1) : Math.round(litres)}</text>}
              {c.flagged && <rect x={x + 3} y={top + 3} width={PX - 6} height={PX - 6} className="rm-outline" />}
              {c.flagged && words && <text x={x + PX - 9} y={top + 15} className="rm-bang">!</text>}
              {photos?.has(`${c.row},${c.col}`) && <circle cx={x + 9} cy={top + PX - 9} r={4} className="rm-photo" />}
            </g>
          );
        })}
      </g>
      {at !== undefined && (
        <g className="rm-rover" style={{ transform: `translate(${ax}px, ${ay}px) rotate(${step >= 0 ? headingAt(path, step) : 0}deg)` }}>
          <title>Rover</title>
          <path d="M 13 0 L -9 -10 L -5 0 L -9 10 Z" />
        </g>
      )}
    </svg>
  );
}

export function RoverLegend() {
  return (
    <div className="rm-legend" aria-hidden>
      <span><i className="sw sw-pending" />Not reached</span>
      <span><i className="sw sw-bare" />No tree</span>
      <span><i className="sw sw-ok"><b /></i>No water today</span>
      <span><i className="sw sw-water">L</i>Water, litres</span>
      <span><i className="sw sw-flag">!</i>Yellow leaves</span>
      <span><i className="sw-photo" />Photo saved</span>
    </div>
  );
}
