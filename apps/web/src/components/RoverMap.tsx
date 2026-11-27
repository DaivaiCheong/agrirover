import type { RoverCell } from "../lib/api";
import { cellName } from "../lib/rover";

/** Compact, light-surface plot layout card matching AgriRover's soft borders and status badges. */
export default function RoverMap({ rows, cols, cells, at, selected, onPick, photos }: {
  rows: number;
  cols: number;
  cells: RoverCell[];
  at?: [number, number] | null;
  selected?: [number, number] | null;
  onPick?: (row: number, col: number) => void;
  photos?: Set<string>;
}) {
  const byCell = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));

  return (
    <div
      className="pm-grid-wrap"
      role="group"
      aria-label={`Block map, ${rows} rows of ${cols} plants, ${cells.length} reached`}
    >
      <div className="pm-rows">
        {Array.from({ length: rows }, (_, idx) => {
          const row = rows - 1 - idx; // Row 1 at the bottom, matching the 3D CAD orientation
          return (
            <div key={row} className="pm-row">
              <span className="pm-row-lbl" aria-hidden>R{row + 1}</span>
              <div className="pm-cells" style={{ gridTemplateColumns: `repeat(${cols}, minmax(82px, 1fr))` }}>
                {Array.from({ length: cols }, (_, col) => {
                  const c = byCell.get(`${row},${col}`);
                  const name = cellName(row, col);
                  const isPicked = selected?.[0] === row && selected?.[1] === col;
                  const isAt = at?.[0] === row && at?.[1] === col;
                  const litres = c?.advice?.litres ?? 0;
                  const hasPhoto = photos?.has(`${row},${col}`);

                  const state = !c
                    ? "pending"
                    : !c.plant
                      ? "empty"
                      : c.flagged
                        ? "warn"
                        : "ok";

                  const subText = !c
                    ? "Not reached"
                    : !c.plant
                      ? "No plant"
                      : litres > 0
                        ? `${litres.toFixed(1)} L`
                        : c.readings?.soil_moisture !== undefined
                          ? `${c.readings.soil_moisture.toFixed(1)}%`
                          : "Optimal";

                  const TagEl = c && onPick ? "button" : "div";
                  return (
                    <TagEl
                      key={`${row}-${col}`}
                      {...(TagEl === "button" ? { type: "button" as const, onClick: () => onPick?.(row, col) } : {})}
                      className={`pm-card pm-${state}${isPicked ? " pm-picked" : ""}${isAt ? " pm-at" : ""}${c && onPick ? " pm-pickable" : ""}`}
                      aria-label={`${name}: ${subText}${c?.flagged ? ", needs attention" : ""}`}
                    >
                      <div className="pm-card-top">
                        <span className="pm-dot" aria-hidden />
                        <span className="pm-name">{name}</span>
                        {c?.flagged && <span className="pm-alert" title="Needs attention" aria-label="Needs attention">!</span>}
                        {!c?.flagged && hasPhoto && <span className="pm-photo-dot" title="Photo saved" aria-hidden />}
                      </div>
                      <div className="pm-meta">{subText}</div>
                    </TagEl>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RoverLegend() {
  return (
    <div className="pm-legend" aria-hidden>
      <span><i className="pm-sw pm-sw-ok" />Optimal</span>
      <span><i className="pm-sw pm-sw-warn">!</i>Needs attention</span>
      <span><i className="pm-sw pm-sw-empty" />No plant</span>
      <span><i className="pm-sw pm-sw-pending" />Not reached</span>
    </div>
  );
}
