import { useEffect, useState } from "react";
import { Activity, Camera, ScanSearch } from "lucide-react";
import CorrelationCard from "../components/CorrelationCard";
import { Empty, Field, Notice, PageIntro, Panel, Tag } from "../components/ui";
import { api, type Correlation, type PhotoResult } from "../lib/api";
import { useData } from "../lib/useData";

export default function Crop() {
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const symptoms = useData(api.symptoms);

  const [zone, setZone] = useState("");
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

  async function crossCheck() {
    if (!bed || !symptom) return;
    setCrossing(true);
    setCorrError(null);
    try {
      setCorr(await api.diagnose(bed, symptom));
    } catch (e) {
      setCorr(null);
      setCorrError((e as Error).message);
    } finally {
      setCrossing(false);
    }
  }

  function changeBed(z: string) {
    setZone(z);
    setCorr(null);                                      // a verdict about one bed must not sit under another bed's name
    setCorrError(null);
  }

  return (
    <>
      <PageIntro
        actions={beds.length > 0 && (
          <label className="rowflex small" style={{ gap: 8 }}>
            <span className="lbl lbl-ink">Bed</span>
            <select className="erp-select" style={{ width: 200 }} value={bed} onChange={(e) => changeBed(e.target.value)}>
              {beds.map((b) => <option key={b.zone} value={b.zone}>{b.label ?? b.zone}</option>)}
            </select>
          </label>
        )}
      >
        Photograph one leaf, or pick the symptom you see, and check it against this bed's live soil and air readings.
        A first look, not a diagnosis.
      </PageIntro>

      <main className="main stack">
        <div className="grid g2">
          <Panel title="Photo" icon={Camera}>
            <input type="file" accept="image/jpeg,image/png" capture="environment"
                   onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }} />
            {preview && (
              <img src={preview} alt="selected plant" style={{
                display: "block", marginTop: 14, maxWidth: "100%", maxHeight: 320, border: "1px solid var(--line)",
              }} />
            )}
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-sm" disabled={!file || busy} onClick={check}>
                {busy ? "Checking…" : "Check photo"}
              </button>
            </div>
            <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 14 }}>
              The photo is sent to your farm server for the check and is not stored.
            </p>
          </Panel>

          <Panel title="Result" icon={ScanSearch}>
            {!result && !error && <p className="mono-sm">Choose a photo and press Check.</p>}
            {error && (
              <Notice kind="warn">
                {error === "disease model not installed"
                  ? "The disease model is not installed on this farm server yet, so a photo cannot be read. You can still pick the symptom below."
                  : `Could not check the photo: ${error}`}
              </Notice>
            )}
            {result && (
              <>
                {result.status === "ok" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Tag kind="info">{result.label}</Tag>
                    <span className="mono-sm">confidence <b>{Math.round((result.confidence ?? 0) * 100)}%</b></span>
                  </div>
                ) : (
                  <Tag kind="warn">Not sure</Tag>
                )}
                {result.status === "ok" && !result.symptom && (
                  <p className="mono-sm muted" style={{ marginTop: 10 }}>
                    No sensor rule for this one, so there is nothing to cross-check.
                  </p>
                )}
                <p className="mono-sm" style={{ marginTop: 14 }}>{result.note}</p>
              </>
            )}
          </Panel>
        </div>

        <Panel title="Check against the sensors" icon={Activity}>
          {beds.length === 0 ? (
            <Empty icon={Activity}>No beds yet. Add a bed on the Beds tab to check a symptom against its sensors.</Empty>
          ) : (
            <div className="stack">
              <div className="pick-row">
                <Field label="Symptom you see">
                  <select value={symptom} onChange={(e) => { setSymptom(e.target.value); setCorr(null); setCorrError(null); }}>
                    <option value="">Choose a symptom</option>
                    {(symptoms.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </Field>
                <button className="btn" disabled={!symptom || crossing} onClick={crossCheck}>
                  {crossing ? "Checking…" : "Cross-check"}
                </button>
              </div>
              {corrError && <Notice kind="alert">{corrError}</Notice>}
              {corr && corr.zone === bed ? <CorrelationCard c={corr} /> : (
                !corrError && <p className="mono-sm muted">Pick a symptom to see whether this bed's soil and air readings explain it.</p>
              )}
            </div>
          )}
        </Panel>
      </main>
    </>
  );
}
