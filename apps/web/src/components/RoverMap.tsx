import type { RoverCell } from "../lib/api";
import { CORNERS, DEFAULT_ROUTE, cellName, cornerCell, headingAt, kindOf, route as routeOf, spotKey, throughStops, type Corner, type Route } from "../lib/rover";

const PX = 44;
const PAD = 16;      // room around the block for the corner buttons

function describe(c: RoverCell | undefined, row: number, col: number, photo = false, crop?: string | null): string {
  const name = cellName(row, col);
  if (crop !== undefined && !c) return crop ? `${name}: ${crop.toLowerCase()}` : `${name}: empty spot`;
  if (!c) return `${name}: not reached`;
  if (!c.plant) return `${name}: no tree`;
  const parts: string[] = [];
  const m = c.readings?.soil_moisture;
  if (m !== undefined) parts.push(`soil ${m} %`);
  if (c.advice) parts.push(c.advice.litres > 0 ? `water ${c.advice.litres} L` : "no water today");
  if (c.flagged) parts.push(c.check ? `yellow leaves, ${c.check.title.toLowerCase()}` : "yellow leaves, go and look");
  if (photo) parts.push("photo saved");
  return `${name}: ${parts.join(", ")}`;
}

const onKey = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

/** The block from above, row 1 at the bottom. Every state has a mark as well as a colour: a dot for a tree,
 *  the litres for water, an outline and "!" for yellow leaves. The dashed line is the route, from the start corner;
 *  with onRoute, a button at each corner makes it the start.
 *  With a plant map (`plants`), each plant is a red dot, the route runs from the first plant to the last, and the
 *  rover stops at the plants only; with onPlace, tapping a spot places or removes a plant. */
export default function RoverMap({ rows, cols, cells, at, selected, onPick, photos, route = DEFAULT_ROUTE, onRoute, plants, crop = "Plant", onPlace }:
  { rows: number; cols: number; cells: RoverCell[]; at?: [number, number] | null; selected?: [number, number] | null; onPick?: (row: number, col: number) => void;
    /** Trees with a saved photo, as "row,col" from 0: a small dark dot in the corner. */
    photos?: Set<string>;
    /** The route drawn, and the rover's heading along it. */
    route?: Route;
    /** Set: the corner buttons show, and pressing one starts the route there. */
    onRoute?: (r: Route) => void;
    /** The spots that hold a plant, as "row,col" from 0. Absent: every spot is a stop, as on the guava blocks. */
    plants?: Set<string>;
    crop?: string;
    /** Set: every spot is a button that places or removes a plant. */
    onPlace?: (row: number, col: number) => void }) {
  const byCell = new Map(cells.map((c) => [spotKey(c.row, c.col), c]));
  const grid = routeOf(rows, cols, route);
  const path = plants ? throughStops(grid, plants) : grid;        // what the rover drives; empty with no plant placed
  const y = (row: number) => (rows - 1 - row) * PX;
  const centre = ([r, c]: [number, number]) => [c * PX + PX / 2, y(r) + PX / 2] as const;
  const pts = (list: [number, number][]) => list.map((p) => centre(p).join(",")).join(" ");
  const step = at ? path.findIndex(([r, c]) => r === at[0] && c === at[1]) : -1;
  const words = rows <= 16 && cols <= 16;
  const first = path[0];
  const [ax, ay] = centre(at ?? first ?? [0, 0]);
  // null: no round yet, so the rover is drawn where a person places it, on the start spot facing its second stop
  const facing = headingAt(path, step >= 0 ? step : 0);
  const pad = onRoute ? PAD : 1;
  const pickCorner = (corner: Corner) => onRoute?.({ ...route, start: corner });
  const label = plants ? `${plants.size} ${crop.toLowerCase()} plants on ${rows} rows of ${cols} spots` : `${rows} rows of ${cols} trees`;

  return (
    <svg className={`rm${onPlace ? " rm-placing" : ""}`} viewBox={`${-pad} ${-pad} ${cols * PX + 2 * pad} ${rows * PX + 2 * pad}`} role="group"
         aria-label={`Block map, ${label}, ${cells.length} reached.${first ? ` Route starts at ${cellName(...first)}, ${route.along === "rows" ? "along the rows" : "across the rows"}` : " No plant to visit."}`}>
      {grid.map(([row, col]) => {
        const key = spotKey(row, col);
        const c = byCell.get(key);
        const x = col * PX, top = y(row);
        const picked = selected?.[0] === row && selected?.[1] === col;
        const planted = plants?.has(key);
        const act = onPlace ? () => onPlace(row, col) : c && onPick ? () => onPick(row, col) : undefined;
        const text = onPlace ? `${cellName(row, col)}: ${planted ? `${crop.toLowerCase()}, tap to remove` : "empty, tap to place a plant"}`
          : describe(c, row, col, photos?.has(key), plants ? (planted ? crop : null) : undefined);
        return (
          <g key={key} className={`rm-cell rm-${kindOf(c)}${c?.flagged ? " rm-flag" : ""}${picked ? " rm-picked" : ""}${act ? " rm-can" : ""}${plants && !planted ? " rm-empty" : ""}`}
             role={act ? "button" : "img"} aria-label={text} aria-pressed={onPlace ? Boolean(planted) : undefined} tabIndex={act ? 0 : undefined} onClick={act}
             onKeyDown={act ? onKey(act) : undefined}>
            <title>{text}</title>
            <rect x={x} y={top} width={PX} height={PX} className="rm-bg" />
          </g>
        );
      })}
      {path.length > 1 && <polyline points={pts(path)} className="rm-path" />}
      {step > 0 && <polyline points={pts(path.slice(0, step + 1))} className="rm-done" />}
      {plants && (
        <g className="rm-crops">
          {[...plants].map((key) => {
            const [r, c] = key.split(",").map(Number);
            if (r >= rows || c >= cols) return null;
            const [cx, cy] = centre([r, c]);
            return (
              <g key={key} className="rm-crop">
                <circle cx={cx} cy={cy + 2} r={8} />
                <path d={`M ${cx - 5} ${cy - 6} L ${cx} ${cy - 3} L ${cx + 5} ${cy - 6}`} />
              </g>
            );
          })}
        </g>
      )}
      {first && <circle cx={centre(first)[0]} cy={centre(first)[1]} r={PX / 2 - 4} className="rm-start"><title>{`Start: ${cellName(...first)}`}</title></circle>}
      {onRoute && CORNERS.map((corner) => {
        const [r, c] = cornerCell(rows, cols, corner);
        const on = corner === route.start;
        // just outside the block, at the corner's own corner
        const cx = corner[1] === "e" ? cols * PX + PAD / 2 - 2 : -PAD / 2 + 2;
        const cy = corner[0] === "n" ? -PAD / 2 + 2 : rows * PX + PAD / 2 - 2;
        const text = `Start from the ${cellName(r, c)} corner`;
        return (
          <g key={corner} className={`rm-corner${on ? " on" : ""}`} role="button" tabIndex={0} aria-label={text} aria-pressed={on}
             onClick={() => pickCorner(corner)} onKeyDown={onKey(() => pickCorner(corner))}>
            <title>{text}</title>
            <circle cx={cx} cy={cy} r={5.5} />
          </g>
        );
      })}
      <g className="rm-marks">
        {cells.filter((c) => c.row < rows && c.col < cols).map((c) => {
          const x = c.col * PX, top = y(c.row);
          const litres = c.advice?.litres ?? 0;
          return (
            <g key={spotKey(c.row, c.col)} className={litres > 0 ? "rm-water" : undefined}>
              {c.plant && litres === 0 && !plants && <circle cx={x + PX / 2} cy={top + PX / 2} r={3 + Math.min(1, (c.canopy ?? 0.3) / 0.55) * 8} className="rm-plant" />}
              {plants && <circle cx={x + PX - 9} cy={top + 9} r={4} className={c.plant ? "rm-seen" : "rm-unseen"}><title>{c.plant ? "Plant seen" : "No plant seen"}</title></circle>}
              {litres > 0 && words && <text x={x + PX / 2} y={top + PX / 2 + 4} className="rm-ml">{litres < 10 ? litres.toFixed(1) : Math.round(litres)}</text>}
              {c.flagged && <rect x={x + 3} y={top + 3} width={PX - 6} height={PX - 6} className="rm-outline" />}
              {c.flagged && words && <text x={x + PX - 9} y={top + 15} className="rm-bang">!</text>}
              {c.check && c.check.label && c.check.label !== "healthy" && (
                <rect x={x + 6} y={top + PX - 12} width={PX - 12} height={5} rx={2} className="rm-checked"><title>{c.check.title}</title></rect>
              )}
              {photos?.has(spotKey(c.row, c.col)) && <circle cx={x + 9} cy={top + PX - 9} r={4} className="rm-photo" />}
            </g>
          );
        })}
      </g>
      {at !== undefined && first && (
        <g className="rm-rover" style={{ transform: `translate(${ax}px, ${ay}px) rotate(${facing}deg)` }}>
          <title>Rover</title>
          <path d="M 13 0 L -9 -10 L -5 0 L -9 10 Z" />
        </g>
      )}
    </svg>
  );
}

export function RoverLegend({ crop }: { crop?: string }) {
  return (
    <div className="rm-legend" aria-hidden>
      <span><i className="sw-start" />Start</span>
      {crop ? (
        <>
          <span><i className="sw-crop" />{crop}: the rover stops here</span>
          <span><i className="sw sw-pending" />Empty spot: drives past</span>
          <span><i className="sw-seen" />Plant seen</span>
        </>
      ) : (
        <>
          <span><i className="sw sw-pending" />Not reached</span>
          <span><i className="sw sw-bare" />No tree</span>
          <span><i className="sw sw-ok"><b /></i>No water today</span>
          <span><i className="sw sw-water">L</i>Water, litres</span>
          <span><i className="sw sw-flag">!</i>Yellow leaves</span>
        </>
      )}
      <span><i className="sw-photo" />Photo saved</span>
    </div>
  );
}
