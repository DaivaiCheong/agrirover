import { useEffect, useState, type FormEvent } from "react";
import { Activity, Camera, ScanSearch } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import CorrelationCard from "../components/CorrelationCard";
import { EF, Empty, Field, FormModal, More, Notice, Panel, Tag, Toolbar, type FormMsg } from "../components/ui";
import { api, type Correlation, type PhotoResult } from "../lib/api";
import { useData } from "../lib/useData";

const MATCH_NOTE = "From the Disease guide. Right about 4 times in 10 in testing: compare with the plant before acting.";

export default function Crop() {
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const symptoms = useData(api.symptoms);
  const labels = useData(api.photoLabels);
  const [search] = useSearchParams();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [row, setRow] = useState("");
  const [col, setCol] = useState("");
  const [part, setPart] = useState("leaf");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saveMsg, setSaveMsg] = useState<FormMsg>(null);

  const [zone, setZone] = useState(search.get("zone") ?? "");
  const [symptom, setSymptom] = useState("");
  const [corr, setCorr] = useState<Correlation | null>(null);
  const [corrError, setCorrError] = useState<string | null>(null);
  const [crossing, setCrossing] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // the bed a photo or symptom is about: the first bed with a crop, until the farmer picks another
  const beds = zones.data ?? [];
  const growing = new Set((cycles.data ?? []).filter((c) => c.status === "active").map((c) => c.zone));
  const bed = zone || beds.find((b) => growing.has(b.zone))?.zone || beds[0]?.zone || "";

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function check() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const r = await api.checkPhoto(file, bed || undefined);
      setResult(r);
      if (r.symptom) setSymptom(r.symptom);
      setCorr(r.correlation);                           // the photo's own cross-check, when the model named a symptom we have a rule for
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function crossCheck(chosen: string = symptom) {
    if (!bed || !chosen) return;
    setCrossing(true);
    setCorrError(null);
    try {
      setCorr(await api.diagnose(bed, chosen));
    } catch (e) {
      setCorr(null);
      setCorrError((e as Error).message);
    } finally {
      setCrossing(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!file || !bed) return;
    if ((row === "") !== (col === "")) { setSaveMsg({ kind: "alert", text: "Give both the row and the tree, or neither." }); return; }
    try {
      await api.savePhoto(file, {
        zone: bed, part, row: row === "" ? undefined : Number(row) - 1, col: col === "" ? undefined : Number(col) - 1,
        label, note, modelLabel: result?.label, modelSeen: result?.seen,
      });
      setSaving(false); setSaved(true); setNote(""); setLabel("");
    } catch (err) { setSaveMsg({ kind: "alert", text: (err as Error).message }); }
  }

  function changeBed(z: string) {
    setZone(z);
    setCorr(null);                                      // a verdict about one bed must not sit under another bed's name
    setCorrError(null);
  }

  return (
    <>
      {beds.length > 0 && (
        <Toolbar>
          <select className="erp-select toolbar-select" aria-label="Bed" value={bed} onChange={(e) => changeBed(e.target.value)}>
            {beds.map((b) => <option key={b.zone} value={b.zone}>{b.label ?? b.zone}</option>)}
          </select>
        </Toolbar>
      )}

      <main className="main stack">
        <div className="grid g2">
          <Panel title="Photo" icon={Camera}>
            <input type="file" accept="image/jpeg,image/png" capture="environment"
                   onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); setSaved(false); }} />
            {preview && (
              <img src={preview} alt="selected plant" style={{
                display: "block", marginTop: 14, maxWidth: "100%", maxHeight: 320, border: "1px solid var(--line)",
              }} />
            )}
            <div className="head-actions" style={{ marginTop: 14 }}>
              <button className="btn btn-sm" disabled={!file || busy} onClick={check}>
                {busy ? "Checking…" : "Check photo"}
              </button>
              <button className="btn btn-sm btn-ghost" disabled={!file || !bed || saved} onClick={() => { setSaveMsg(null); setSaving(true); }}>
                {saved ? "Saved" : "Save to library"}
              </button>
            </div>
            {saved
              ? <p className="small muted" style={{ marginTop: 10 }}>Saved. Confirm what it shows in the <Link to="/photos">Photo library</Link>.</p>
              : <p className="small muted" style={{ marginTop: 10 }}>{labels.data?.online ? "Check photo sends it to Ollama's online service." : "Stays on your farm server."} Not kept here unless you save it.</p>}
          </Panel>

          <Panel title="Result" icon={ScanSearch}>
            {!result && !error && <p className="small muted">No photo checked yet.</p>}
            {error && (
              <Notice kind="warn">
                {`Could not check the photo: ${error}. You can still pick the symptom below.`}
              </Notice>
            )}
            {result && (
              <>
                {result.status === "ok" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Tag>{result.label === "healthy" ? "Looks healthy" : "Something looks wrong"}</Tag>
                    {result.confidence !== null && <span className="mono-sm">confidence <b>{Math.round(result.confidence * 100)}%</b></span>}
                  </div>
                ) : (
                  <Tag kind="warn">Not sure</Tag>
                )}
                {result.seen && <p className="mono-sm" style={{ marginTop: 10 }}>{result.seen}</p>}
                {result.label === "problem" && (
                  <p className="mono-sm muted" style={{ marginTop: 10 }}>Compare with the <Link to="/guide">Disease guide</Link>, then choose the closest symptom below.</p>
                )}
                {result.matches.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="erp-label">Possible matches</div>
                    <p className="small muted">{MATCH_NOTE}</p>
                    <table className="tbl"><tbody>
                      {result.matches.map((d) => (
                        <tr key={d.id}>
                          <td><More label={<b>{d.title}</b>}>{[d.leaf && `Leaf: ${d.leaf}`, d.fruit && `Fruit: ${d.fruit}`, d.notToConfuse && `Not to confuse: ${d.notToConfuse}`, `What to do: ${d.do}`].filter(Boolean).join(" ")}</More></td>
                          <td className="act nowrap">{d.symptom && <button className="linkbtn" disabled={crossing} onClick={() => { setSymptom(d.symptom!); crossCheck(d.symptom!); }}>Check the soil</button>}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                )}
                <p className="mono-sm" style={{ marginTop: 14 }}>{result.note}</p>
              </>
            )}
          </Panel>
        </div>

        <Panel title="Check against the sensors" icon={Activity} right={<span className="small muted">Triage, not a diagnosis</span>}>
          {beds.length === 0 ? (
            <Empty icon={Activity}>No beds yet.</Empty>
          ) : (
            <div className="stack">
              <div className="pick-row">
                <Field label="Symptom">
                  <select value={symptom} onChange={(e) => { setSymptom(e.target.value); setCorr(null); setCorrError(null); }}>
                    <option value="">Choose a symptom</option>
                    {(symptoms.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </Field>
                <button className="btn btn-sm" disabled={!symptom || crossing} onClick={() => crossCheck()}>
                  {crossing ? "Checking…" : "Cross-check"}
                </button>
              </div>
              {corrError && <Notice kind="alert">{corrError}</Notice>}
              {corr && corr.zone === bed ? <CorrelationCard c={corr} /> : (
                !corrError && <p className="small muted">No symptom checked yet.</p>
              )}
            </div>
          )}
        </Panel>
      </main>

      {saving && (
        <FormModal title="Save this photo" submit="Save" onClose={() => setSaving(false)} onSubmit={save} msg={saveMsg}>
          <div className="erp-grid-2">
            <EF label="Row"><input className="erp-input" type="number" min={1} value={row} onChange={(e) => setRow(e.target.value)} /></EF>
            <EF label="Tree"><input className="erp-input" type="number" min={1} value={col} onChange={(e) => setCol(e.target.value)} /></EF>
          </div>
          <EF label="Part of the tree">
            <select className="erp-select" value={part} onChange={(e) => setPart(e.target.value)}>
              {(labels.data?.parts ?? ["leaf"]).map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </EF>
          <EF label="What you think it is" hint="Your guess is kept apart from the expert's answer">
            <select className="erp-select" value={label} onChange={(e) => setLabel(e.target.value)}>
              <option value="">Not sure</option>
              {(labels.data?.labels ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </EF>
          <EF label="Note"><input className="erp-input" value={note} onChange={(e) => setNote(e.target.value)} /></EF>
        </FormModal>
      )}
    </>
  );
}
