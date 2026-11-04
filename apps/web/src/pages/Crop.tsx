import { useEffect, useState } from "react";
import { Panel, Tag } from "../components/ui";
import { api, type PhotoResult } from "../lib/api";

export default function Crop() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setResult(await api.checkPhoto(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="crumb"><span className="lbl">HOME &gt; CROP</span></div>
      <div className="head">
        <div className="lbl">PHONE PHOTO · ONE LEAF · TRIAGE, NOT DIAGNOSIS</div>
        <h1 className="display d-xl" style={{ marginTop: 8 }}>DISEASE CHECK</h1>
      </div>

      <main className="main">
        <div className="grid g2">
          <Panel title="PHOTO">
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

          <Panel title="RESULT">
            {!result && !error && <p className="mono-sm">Choose a photo and press Check.</p>}
            {error && (
              <p className="mono-sm" style={{ color: "var(--alert)" }}>
                {error === "disease model not installed"
                  ? "The disease model is not installed on this farm server yet, so no result can be given."
                  : `Could not check the photo: ${error}`}
              </p>
            )}
            {result && (
              <>
                {result.status === "ok" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Tag kind="info">{result.label}</Tag>
                    <span className="mono-sm">confidence <b>{Math.round((result.confidence ?? 0) * 100)}%</b></span>
                  </div>
                ) : (
                  <Tag kind="warn">NOT SURE</Tag>
                )}
                <p className="mono-sm" style={{ marginTop: 14 }}>{result.note}</p>
              </>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
