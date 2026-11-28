// The dialogs behind the plant table: a plant's record, the soil and health logs, a photo, and starting a round.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, Circle, Play } from "lucide-react";
import { EF, FormModal, Modal, Notice, Tag, type FormMsg } from "../../../../components/ui";
import PlantCard from "../../../../components/PlantCard";
import { TreePhotoCheck } from "../../../../components/TreePhoto";
import type { RoverCell, RoverPhotoCheck } from "../../../../lib/api";
import { newId } from "./store";
import { RESULT, SEEN, treeKey, treeName, whenText, type PlantEntry, type Result, type Seen, type Tree } from "./model";
import {
  ALL_KEYS, DRAINAGE, LABEL, METER, TEXTURE, soilProblem, statusOf, valueText,
  type Drainage, type Meter, type PlantSoil, type SoilEntry, type SoilValues, type Targets, type Texture,
} from "./soil";

export interface TreeOption { key: string; name: string; tree: Tree }

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const MARK = { low: "Low", high: "High", check: "Check" } as const;
const FROM = { rover: "Rover", you: "You", block: "Block" } as const;

/** One plant: its soil, value by value with its source, what the rover's camera saw, and what the farmer logged. */
export function PlantRecordDialog({ zone, tree, cell, finding, soil, targets, health, roundWhen, historyHref, onAddSoil, onLog, onPhoto, onClose }: {
  zone: string; tree: Tree; cell: RoverCell | undefined; finding: RoverPhotoCheck | null; soil: PlantSoil; targets: Targets; health: PlantEntry[];
  roundWhen: string | null; historyHref: string; onAddSoil: () => void; onLog: () => void; onPhoto: () => void; onClose: () => void;
}) {
  return (
    <Modal title={treeName(tree[0], tree[1])} onClose={onClose} width={620}>
      <div className="modal-body-erp"><div className="erp-section">
        <p className="small muted">{roundWhen ? `The rover's last round: ${whenText(roundWhen)}.` : "No round yet: the rover has not checked this plant."}</p>
        <table className="tbl kv"><tbody>
          {ALL_KEYS.map((k) => {
            const s = soil[k];
            const st = s ? statusOf(k, s.value, targets) : null;
            return (
              <tr key={k}>
                <th scope="row">{LABEL[k]}</th>
                <td>{s ? valueText(k, s.value) : <span className="muted">Not recorded</span>}{st && st !== "ok" && <> <Tag kind="warn">{MARK[st]}</Tag></>}</td>
                <td className="small muted">{s ? `${FROM[s.source]}, ${whenText(s.at)}` : ""}</td>
              </tr>
            );
          })}
        </tbody></table>
        {cell?.plant && (
          <>
            <h3 className="fl-h3">Camera</h3>
            <PlantCard zone={zone} row={tree[0]} col={tree[1]} finding={finding} link="health" />
          </>
        )}
        <h3 className="fl-h3">Your health log</h3>
        {health.length === 0 ? <p className="small muted">Nothing logged for this plant yet.</p> : (
          <ul className="fl-list">
            {health.map((e) => (
              <li key={e.id}>
                <span><span className="small muted">{whenText(e.at)}</span> · {e.seen ? SEEN[e.seen] : e.roverSaw ? `Rover: ${e.roverSaw}` : "—"}</span>
                <span className="small">{RESULT[e.result]}</span>
              </li>
            ))}
          </ul>
        )}
      </div></div>
      <div className="modal-foot-erp">
        <Link className="linkbtn small" to={historyHref}>Daily history</Link>
        <div className="erp-foot-actions fl-wrap">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onPhoto}>Check a photo</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onLog}>Log what I see</button>
          <button type="button" className="btn btn-sm" onClick={onAddSoil}>Add soil values</button>
        </div>
      </div>
    </Modal>
  );
}

const NUTRIENTS = [["n", "Nitrogen (N)"], ["p", "Phosphorus (P)"], ["k", "Potassium (K)"], ["ca", "Calcium (Ca)"], ["mg", "Magnesium (Mg)"]] as const;
const WATER = [["moisture", "Moisture (%)", 0.1], ["ec", "EC (mS/cm)", 0.01]] as const;
type NumberKey = "ph" | "depthCm" | "om" | "n" | "p" | "k" | "ca" | "mg" | "moisture" | "ec";

/** Soil values the farmer measured, for the whole block or one plant. Fill only what was measured. */
export function SoilDialog({ zone, trees, initial, onSave, onClose }: {
  zone: string; trees: TreeOption[]; initial: Tree | null; onSave: (e: SoilEntry) => void; onClose: () => void;
}) {
  const [where, setWhere] = useState(initial ? treeKey(initial[0], initial[1]) : "block");
  const [when, setWhen] = useState(localNow());
  const [meter, setMeter] = useState<Meter>("hand");
  const [numbers, setNumbers] = useState<Partial<Record<NumberKey, string>>>({});
  const [texture, setTexture] = useState<Texture | "">("");
  const [drainage, setDrainage] = useState<Drainage | "">("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);

  const field = (k: NumberKey, label: string, step: number) => (
    <EF key={k} label={label}>
      <input className="erp-input" type="number" inputMode="decimal" step={step} value={numbers[k] ?? ""} onChange={(e) => setNumbers({ ...numbers, [k]: e.target.value })} />
    </EF>
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const values: SoilValues = { texture: texture || undefined, drainage: drainage || undefined };
    for (const [k, raw] of Object.entries(numbers) as [NumberKey, string][]) values[k] = num(raw);
    const problem = soilProblem(values);
    if (problem) { setMsg({ kind: "alert", text: problem }); return; }
    const tree = where === "block" ? null : trees.find((t) => t.key === where)?.tree ?? null;
    onSave({ ...values, id: newId(), zone, at: new Date(when).toISOString(), tree, meter, note: note.trim() || undefined });
    setMsg({ kind: "ok", text: where === "block" ? "Saved for the whole block, on this device." : "Saved for this plant, on this device." });
    setNumbers({}); setTexture(""); setDrainage(""); setNote("");
  }

  return (
    <FormModal title="Add soil values" submit="Save" onClose={onClose} onSubmit={submit} msg={msg} width={620}>
      <p className="small muted">Fill only what you measured.</p>
      <div className="erp-grid-2 rc-grid2">
        <EF label="For" req>
          <select className="erp-select" value={where} onChange={(e) => setWhere(e.target.value)}>
            <option value="block">The whole block</option>
            {trees.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </EF>
        <EF label="Measured with">
          <select className="erp-select" value={meter} onChange={(e) => setMeter(e.target.value as Meter)}>
            {(Object.keys(METER) as Meter[]).map((k) => <option key={k} value={k}>{METER[k]}</option>)}
          </select>
        </EF>
        <EF label="When" req><input className="erp-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></EF>
      </div>

      <h3 className="fl-h3">Soil</h3>
      <div className="erp-grid-2 rc-grid2">
        {field("ph", "Soil pH", 0.01)}
        <EF label="Texture">
          <select className="erp-select" value={texture} onChange={(e) => setTexture(e.target.value as Texture | "")}>
            <option value="">Not measured</option>
            {(Object.keys(TEXTURE) as Texture[]).map((k) => <option key={k} value={k}>{TEXTURE[k]}</option>)}
          </select>
        </EF>
        {field("depthCm", "Root depth (cm)", 1)}
        <EF label="Drainage">
          <select className="erp-select" value={drainage} onChange={(e) => setDrainage(e.target.value as Drainage | "")}>
            <option value="">Not measured</option>
            {(Object.keys(DRAINAGE) as Drainage[]).map((k) => <option key={k} value={k}>{DRAINAGE[k]}</option>)}
          </select>
        </EF>
        {field("om", "Organic matter (%)", 0.1)}
      </div>

      <h3 className="fl-h3">Essential nutrients (mg/kg)</h3>
      <div className="erp-grid-2 rc-grid2">{NUTRIENTS.map(([k, label]) => field(k, label, 1))}</div>

      <h3 className="fl-h3">Water</h3>
      <div className="erp-grid-2 rc-grid2">{WATER.map(([k, label, step]) => field(k, label, step))}</div>
      <EF label="Note" hint="Optional"><input className="erp-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></EF>
    </FormModal>
  );
}

/** What the farmer sees on one plant, and what they decided. Stays open for the next one. */
export function PlantDialog({ zone, trees, initial, onSave, onClose }: {
  zone: string; trees: TreeOption[]; initial: Tree; onSave: (e: PlantEntry) => void; onClose: () => void;
}) {
  const [tree, setTree] = useState(treeKey(initial[0], initial[1]));
  const [seen, setSeen] = useState<Seen | "">("");
  const [result, setResult] = useState<Result>("checking");
  const [did, setDid] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = trees.find((x) => x.key === tree);
    if (!t) { setMsg({ kind: "alert", text: "Choose the plant." }); return; }
    onSave({
      id: newId(), zone, at: new Date().toISOString(), tree: t.tree, result,
      seen: seen || undefined, did: did.trim() || undefined, note: note.trim() || undefined,
    });
    setMsg({ kind: "ok", text: `Saved for ${t.name}.` });
    setSeen(""); setDid(""); setNote("");
  }

  return (
    <FormModal title="Log what I see" submit="Save" onClose={onClose} onSubmit={submit} msg={msg}>
      <EF label="Plant" req>
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

/** A photo of a plant, checked and saved with the photo library (the same check as Plant health). */
export function PhotoDialog({ zone, tree, onClose }: { zone: string; tree: Tree; onClose: () => void }) {
  return (
    <Modal title={`Photo of ${treeName(tree[0], tree[1])}`} onClose={onClose} width={580}>
      <div className="modal-body-erp"><div className="erp-section">
        <TreePhotoCheck zone={zone} row={tree[0]} col={tree[1]} soil={false} />
      </div></div>
    </Modal>
  );
}

export interface AutoCheck { ok: boolean; label: string; fix: string }

/** The checks before the rover can go, and the start. */
export function StartRoundDialog({ summary, auto, manual, ticked, onTick, ready, busy, error, onStart, onClose }: {
  summary: string; auto: AutoCheck[]; manual: string[]; ticked: boolean[]; onTick: (i: number, on: boolean) => void;
  ready: boolean; busy: boolean; error: string | null; onStart: () => void; onClose: () => void;
}) {
  return (
    <Modal title="Start a round" onClose={onClose} width={520}>
      <div className="modal-body-erp"><div className="erp-section">
        <p className="small muted">{summary}</p>
        <ul className="fl-checks">
          {auto.map((a) => (
            <li key={a.label} className={a.ok ? "ok" : "no"}>
              {a.ok ? <CircleCheck size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
              <span>{a.label}{!a.ok && <span className="small muted"> · {a.fix}</span>}</span>
            </li>
          ))}
        </ul>
        <div className="erp-label" style={{ marginBottom: 4 }}>Before starting</div>
        {manual.map((text, i) => (
          <label key={i} className="chk-man"><input type="checkbox" checked={ticked[i]} onChange={(e) => onTick(i, e.target.checked)} />{text}</label>
        ))}
        {error && <Notice kind="alert">{error}</Notice>}
      </div></div>
      <div className="modal-foot-erp">
        <span />
        <div className="erp-foot-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-sm" disabled={!ready || busy} onClick={onStart}><Play size={15} aria-hidden />{busy ? "Starting…" : "Start round"}</button>
        </div>
      </div>
    </Modal>
  );
}
