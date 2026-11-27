// The first thing on the Rover tab: every plant, one row, with its soil. Each value says where it came from, and a value
// outside its target is marked with a word as well as colour. Tapping a row opens that plant's record.
import { useState } from "react";
import { Tag } from "../../../../components/ui";
import { treeKey, treeName, whenText, type Tree } from "./model";
import { LABEL, statusOf, valueText, type ParamKey, type PlantSoil, type Targets } from "./soil";

export interface SoilTableRow {
  tree: Tree; soil: PlantSoil;
  /** one line under the plant's name */ note: string | null;
  noteKind: "flag" | "done" | "muted";
}

const MARK = { low: "Low", high: "High", check: "Check" } as const;
const FROM = { rover: "from the rover", you: "you logged it", block: "set for the block" } as const;
/** The label each value carries when a phone turns a row into a card. */
const CARD: Partial<Record<ParamKey, string>> = {
  ph: "Soil pH", texture: "Texture", depthCm: "Root depth", drainage: "Drainage", om: "Organic matter", n: "N", p: "P", k: "K", ca: "Ca", mg: "Mg",
};
const PAGE = 50;

function Cell({ k, soil, targets, group }: { k: ParamKey; soil: PlantSoil; targets: Targets; group?: boolean }) {
  const s = soil[k];
  const edge = group ? " sp-edge" : "";
  if (!s) return <td className={`sp-empty${edge}`} data-label={CARD[k]} title={`${LABEL[k]}: not recorded`}><span className="muted">—</span></td>;
  const st = statusOf(k, s.value, targets);
  const out = st !== null && st !== "ok";
  return (
    <td className={`${out ? "sp-out" : ""}${edge}`} data-label={CARD[k]} title={`${LABEL[k]}: ${FROM[s.source]}, ${whenText(s.at)}`}>
      <span className={s.source === "block" ? "sp-block" : undefined}>{valueText(k, s.value)}</span>
      {out && <> <Tag kind="warn">{MARK[st]}</Tag></>}
      {s.source === "you" && <span className="sp-src">you</span>}
    </td>
  );
}

export default function SoilTable({ rows, targets, onOpen }: { rows: SoilTableRow[]; targets: Targets; onOpen: (t: Tree) => void }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <div className="panel">
      <div className="tablewrap">
        <table className="tbl fold sp-table">
          <thead>
            <tr>
              <th rowSpan={2}>Plant</th>
              <th rowSpan={2} className="sp-edge">Soil pH</th>
              <th rowSpan={2} className="sp-edge">Texture</th>
              <th colSpan={2} className="sp-edge sp-group">Rooting depth &amp; drainage</th>
              <th rowSpan={2} className="sp-edge">Organic matter</th>
              <th colSpan={5} className="sp-edge sp-group">Essential nutrients (mg/kg)</th>
            </tr>
            <tr>
              <th className="sp-edge">Depth</th><th>Drainage</th>
              <th className="sp-edge">N</th><th>P</th><th>K</th><th>Ca</th><th>Mg</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r) => {
              const name = treeName(r.tree[0], r.tree[1]);
              return (
                <tr key={treeKey(r.tree[0], r.tree[1])} className="pickable" onClick={() => onOpen(r.tree)}>
                  <td className="nowrap">
                    <button type="button" className="linkbtn sp-name" aria-label={`Open ${name}`} onClick={(e) => { e.stopPropagation(); onOpen(r.tree); }}>{name}</button>
                    {r.note && <span className={`sp-note sp-${r.noteKind}`}>{r.note}</span>}
                  </td>
                  <Cell k="ph" soil={r.soil} targets={targets} group />
                  <Cell k="texture" soil={r.soil} targets={targets} group />
                  <Cell k="depthCm" soil={r.soil} targets={targets} group />
                  <Cell k="drainage" soil={r.soil} targets={targets} />
                  <Cell k="om" soil={r.soil} targets={targets} group />
                  <Cell k="n" soil={r.soil} targets={targets} group />
                  <Cell k="p" soil={r.soil} targets={targets} />
                  <Cell k="k" soil={r.soil} targets={targets} />
                  <Cell k="ca" soil={r.soil} targets={targets} />
                  <Cell k="mg" soil={r.soil} targets={targets} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <p className="panel-pad"><button type="button" className="linkbtn small" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more of {rows.length}</button></p>
      )}
    </div>
  );
}
