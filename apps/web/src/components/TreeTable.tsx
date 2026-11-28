import { Panel } from "./ui";
import type { RoverCell } from "../lib/api";
import { cellName, fullLitresOf, litresOf } from "../lib/rover";

/** Every tree of a round: the table behind the map. Used by the round history. */
export function TreeTable({ cells, picked, onPick, held }: { cells: RoverCell[]; picked?: [number, number] | null; onPick?: (r: number, c: number) => void; held?: boolean }) {
  const trees = cells.filter((c) => c.plant);
  const given = litresOf(cells), full = fullLitresOf(cells);
  const hasAdvice = cells.some((c) => c.advice);
  return (
    <Panel title={`Trees (${trees.length})`} pad={false}
           right={!hasAdvice ? undefined : held ? <span className="small muted">Water held: induction stress</span>
             : <span className="small muted">Water today {given.toFixed(0)} L of {full.toFixed(0)} L full demand</span>}>
      {trees.length === 0 ? <p className="panel-pad small muted">Nothing yet.</p> : (
        <div className="tablewrap rc-list">
          <table className="tbl">
            <thead><tr><th>Tree</th>{hasAdvice && <th className="r">Water L</th>}<th className="r">Moisture %</th><th className="r">EC</th><th className="r">pH</th><th className="r">Leaf %</th><th>Note</th></tr></thead>
            <tbody>
              {trees.map((c) => {
                const notes = [...(c.advice?.notes ?? [])];
                if (!c.advice && c.flagged) notes.push("Yellow leaves");
                return (
                  <tr key={`${c.row}-${c.col}`} className={`pickable${picked?.[0] === c.row && picked?.[1] === c.col ? " picked" : ""}`} onClick={() => onPick?.(c.row, c.col)}>
                    <td className="nowrap"><b>{cellName(c.row, c.col)}</b></td>
                    {hasAdvice && <td className="r">{held ? <span className="muted">Hold</span> : <b>{c.advice?.litres ?? "—"}</b>}</td>}
                    <td className="r">{c.readings?.soil_moisture ?? "—"}</td>
                    <td className="r">{c.readings?.soil_ec ?? "—"}</td>
                    <td className="r">{c.readings?.soil_ph ?? "—"}</td>
                    <td className="r">{c.canopy === undefined || c.canopy === null ? "—" : Math.round(c.canopy * 100)}</td>
                    <td className="small">{notes.join(" · ").replace(/: look/g, "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
