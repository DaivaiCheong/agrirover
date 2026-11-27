// The Field log's dialogs: a tree's record, the two logs (soil, what the farmer sees), a photo, and the field walk.
import { useState, type FormEvent } from "react";
import { FormModal, EF, Modal, type FormMsg } from "../../../../components/ui";
import PlantCard from "../../../../components/PlantCard";
import { TreePhotoCheck } from "../../../../components/TreePhoto";
import { photoImageUrl, type RoverCell, type RoverPhotoCheck } from "../../../../lib/api";
import { newId } from "./store";
import {
  METER, RESULT, SEEN, numText, soilLine, soilProblem, treeKey, treeName, whenText,
  type LookItem, type PlantEntry, type Result, type Seen, type SoilEntry, type SoilMeter, type Tree,
} from "./model";

export interface TreeOption { key: string; name: string; tree: Tree }

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** One tree: what the rover found, its soil, what the farmer logged for it, and the two things to do about it. */
export function TreeDialog({ zone, tree, cell, finding, history, roundWhen, onLog, onPhoto, onClose }: {
  zone: string; tree: Tree; cell: RoverCell | undefined; finding: RoverPhotoCheck | null; history: PlantEntry[];
  roundWhen: string | null; onLog: () => void; onPhoto: () => void; onClose: () => void;
}) {
  const r = cell?.readings ?? {};
  return (
    <Modal title={treeName(tree[0], tree[1])} onClose={onClose} width={580}>
      <div className="modal-body-erp"><div className="erp-section">
        <p className="small muted">{roundWhen ? `The rover checked this tree on ${whenText(roundWhen)}.` : "The rover has not checked this tree yet."}</p>
        {cell?.plant && <PlantCard zone={zone} row={tree[0]} col={tree[1]} finding={finding} link="health" />}
        {cell && (
          <table className="tbl kv"><tbody>
            <tr><th scope="row">Moisture</th><td>{numText(r.soil_moisture)} %</td></tr>
            <tr><th scope="row">EC</th><td>{numText(r.soil_ec, 1)} mS/cm</td></tr>
            <tr><th scope="row">pH</th><td>{numText(r.soil_ph, 1)}</td></tr>
            {cell.flagged && <tr><th scope="row">Leaves</th><td>Yellow</td></tr>}
          </tbody></table>
        )}
        <h3 className="fl-h3">Your log</h3>
        {history.length === 0 ? <p className="small muted">Nothing logged for this tree yet.</p> : (
          <ul className="fl-list">
            {history.map((e) => (
              <li key={e.id}>
                <span><span className="small muted">{whenText(e.at)}</span> · {e.seen ? SEEN[e.seen] : e.roverSaw ? `Rover: ${e.roverSaw}` : "—"}</span>
                <span className="small">{RESULT[e.result]}</span>
              </li>
            ))}
          </ul>
        )}
      </div></div>
      <div className="modal-foot-erp">
        <span />
        <div className="erp-foot-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onPhoto}>Check a photo</button>
          <button type="button" className="btn btn-sm" onClick={onLog}>Log what I see</button>
        </div>
      </div>
    </Modal>
  );
}

/** A soil reading from a hand meter, for the whole block or one tree. Stays open for the next one. */
export function SoilDialog({ zone, trees, initial, onSave, onClose }: {
  zone: string; trees: TreeOption[]; initial: Tree | null; onSave: (e: SoilEntry) => void; onClose: () => void;
}) {
  const [where, setWhere] = useState(initial ? treeKey(initial[0], initial[1]) : "block");
  const [when, setWhen] = useState(localNow());
  const [moisture, setMoisture] = useState("");
  const [ec, setEc] = useState("");
  const [ph, setPh] = useState("");
  const [meter, setMeter] = useState<SoilMeter>("hand");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = { moisture: num(moisture), ec: num(ec), ph: num(ph) };
    const problem = soilProblem(v);
    if (problem) { setMsg({ kind: "alert", text: problem }); return; }
    const tree = where === "block" ? null : trees.find((t) => t.key === where)?.tree ?? null;
    onSave({ id: newId(), zone, at: new Date(when).toISOString(), tree, ...v, meter, note: note.trim() || undefined });
    setMsg({ kind: "ok", text: "Saved on this device." });
    setMoisture(""); setEc(""); setPh(""); setNote("");
  }

  return (
    <FormModal title="Log a soil reading" submit="Save reading" onClose={onClose} onSubmit={submit} msg={msg}>
      <EF label="Where" req>
        <select className="erp-select" value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="block">Whole block</option>
          {trees.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </EF>
      <EF label="When" req>
        <input className="erp-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </EF>
      <div className="erp-grid-2 rc-grid2">
        <EF label="Moisture %"><input className="erp-input" type="number" inputMode="decimal" step={0.1} value={moisture} onChange={(e) => setMoisture(e.target.value)} /></EF>
        <EF label="EC mS/cm"><input className="erp-input" type="number" inputMode="decimal" step={0.1} value={ec} onChange={(e) => setEc(e.target.value)} /></EF>
        <EF label="pH"><input className="erp-input" type="number" inputMode="decimal" step={0.1} value={ph} onChange={(e) => setPh(e.target.value)} /></EF>
        <EF label="Measured with">
          <select className="erp-select" value={meter} onChange={(e) => setMeter(e.target.value as SoilMeter)}>
            {(Object.keys(METER) as SoilMeter[]).map((k) => <option key={k} value={k}>{METER[k]}</option>)}
          </select>
        </EF>
      </div>
      <EF label="Note" hint="Optional"><input className="erp-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></EF>
    </FormModal>
  );
}

/** What the farmer sees on one tree, and what they decided. Stays open for the next one. */
export function PlantDialog({ zone, trees, initial, onSave, onClose }: {
  zone: string; trees: TreeOption[]; initial: Tree | null; onSave: (e: PlantEntry) => void; onClose: () => void;
}) {
  const [tree, setTree] = useState(initial ? treeKey(initial[0], initial[1]) : trees[0]?.key ?? "");
  const [seen, setSeen] = useState<Seen | "">("");
  const [result, setResult] = useState<Result>("checking");
  const [did, setDid] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = trees.find((x) => x.key === tree);
    if (!t) { setMsg({ kind: "alert", text: "Choose the tree." }); return; }
    onSave({
      id: newId(), zone, at: new Date().toISOString(), tree: t.tree, result,
      seen: seen || undefined, did: did.trim() || undefined, note: note.trim() || undefined,
    });
    setMsg({ kind: "ok", text: `Saved for ${t.name}.` });
    setSeen(""); setDid(""); setNote("");
  }

  return (
    <FormModal title="Log what I see" submit="Save" onClose={onClose} onSubmit={submit} msg={msg}>
      <EF label="Tree" req>
        <select className="erp-select" value={tree} onChange={(e) => setTree(e.target.value)}>
          {trees.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </EF>
      <EF label="What I see" hint="Pick the closest">
        <select className="erp-select" value={seen} onChange={(e) => setSeen(e.target.value as Seen | "")}>
          <option value="">Not sure yet</option>
          {(Object.keys(SEEN) as Seen[]).map((k) => <option key={k} value={k}>{SEEN[k]}</option>)}
        </select>
      </EF>
      <EF label="What I decided" req>
        <select className="erp-select" value={result} onChange={(e) => setResult(e.target.value as Result)}>
          {(Object.keys(RESULT) as Result[]).map((k) => <option key={k} value={k}>{RESULT[k]}</option>)}
        </select>
      </EF>
      <EF label="What I did" hint="Optional"><input className="erp-input" maxLength={200} value={did} onChange={(e) => setDid(e.target.value)} /></EF>
      <EF label="Note" hint="Optional"><input className="erp-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></EF>
    </FormModal>
  );
}

/** A photo of a tree, checked and saved with the photo library (the same check as Plant health). */
export function PhotoDialog({ zone, tree, onClose }: { zone: string; tree: Tree; onClose: () => void }) {
  return (
    <Modal title={`Photo of ${treeName(tree[0], tree[1])}`} onClose={onClose} width={580}>
      <div className="modal-body-erp"><div className="erp-section">
        <TreePhotoCheck zone={zone} row={tree[0]} col={tree[1]} soil={false} />
      </div></div>
    </Modal>
  );
}

/** The flagged trees one at a time, in order: the rover's photo and words, and three answers. */
export function FieldWalk({ items, onDecide, onDetails, onClose }: {
  items: LookItem[]; onDecide: (i: LookItem, r: Result) => void; onDetails: (i: LookItem) => void; onClose: () => void;
}) {
  const [at, setAt] = useState(0);
  const [logged, setLogged] = useState(0);
  const item = items[at];

  if (!item) {
    return (
      <Modal title="Field walk" onClose={onClose} width={580}>
        <div className="modal-body-erp"><div className="erp-section">
          <h3 className="fl-h3">Walk done</h3>
          <p>{logged} logged{items.length > logged ? `, ${items.length - logged} skipped` : ""}.</p>
          <p className="small muted">The next round checks every tree again.</p>
        </div></div>
        <div className="modal-foot-erp">
          <span />
          <div className="erp-foot-actions"><button type="button" className="btn btn-sm" onClick={onClose}>Done</button></div>
        </div>
      </Modal>
    );
  }

  const decide = (r: Result) => { onDecide(item, r); setLogged(logged + 1); setAt(at + 1); };
  const soil = soilLine(item.readings);
  return (
    <Modal title={`Field walk, ${at + 1} of ${items.length}`} onClose={onClose} width={580}>
      <div className="modal-body-erp"><div className="erp-section fl-walk">
        <h3 className="fl-h3">{item.name}</h3>
        <p><b>The rover saw:</b> {item.what}</p>
        {item.photoId && <img className="fl-photo" src={photoImageUrl(item.photoId)} alt={`Rover photo of ${item.name}`} />}
        {soil && <p className="small muted">{soil}</p>}
        <div className="fl-walk-buttons">
          <button type="button" className="btn" onClick={() => decide("confirmed")}>Confirmed a problem</button>
          <button type="button" className="btn btn-ghost" onClick={() => decide("notIt")}>Not a problem</button>
          <button type="button" className="btn btn-ghost" onClick={() => decide("fixed")}>Fixed it</button>
        </div>
      </div></div>
      <div className="modal-foot-erp">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAt(at + 1)}>Skip</button>
        <div className="erp-foot-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onDetails(item)}>Add details</button>
        </div>
      </div>
    </Modal>
  );
}
