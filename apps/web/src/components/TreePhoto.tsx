import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Camera } from "lucide-react";
import { Link } from "react-router-dom";
import PhotoVerdict from "./PhotoVerdict";
import { Notice } from "./ui";
import { api, type PhotoResult, type TreeContext } from "../lib/api";
import { useData } from "../lib/useData";

const UNIT: Record<string, string> = { pct: " %", "mS/cm": "", pH: "" };
/** Causes the soil can speak to. A fungus or an insect is not read from a probe, so the soil line stays quiet for those. */
const SOIL_GROUPS = new Set(["feed", "water", "roots"]);

/** The soil under one tree from the newest round, each reading against its stage's target. */
export function TreeSoil({ t }: { t: TreeContext }) {
  if (!t.found) {
    return <p className="small muted">No fresh rover round reached {t.name}. <Link to="/rover">Run a round</Link>, or check the photo on its own.</p>;
  }
  return (
    <div className="ts">
      <div className="ts-head">Soil under {t.name}{t.simulated && <span className="muted"> · simulated round</span>}</div>
      <div className="ts-grid">
        {t.readings.map((r) => (
          <div key={r.metric} className={`ts-item${r.state && r.state !== "ok" ? " ts-off" : ""}`}>
            <span className="ts-k">{r.label}</span>
            <span className="ts-v">
              {r.value === null ? "—" : `${r.value}${UNIT[r.unit] ?? ""}`}
              {r.state === "low" && <ArrowDown size={14} aria-label="below target" />}
              {r.state === "high" && <ArrowUp size={14} aria-label="above target" />}
            </span>
            {r.low !== null && r.high !== null && <span className="ts-t">target {r.low}–{r.high}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** What the soil under this tree says about the photo's answer, in one line. Only for causes a probe can speak to. */
export function SoilSays({ r }: { r: PhotoResult }) {
  const t = r.tree;
  const group = r.matches[0]?.card.group;
  if (!t?.found || !t.soil || r.status !== "ok" || r.label === "healthy" || (group && !SOIL_GROUPS.has(group))) return null;
  const unknown = t.soil.cause === "unknown";
  return (
    <div className="ts-says">
      <div className="ts-k">This tree's soil</div>
      <p><b>{unknown ? "Does not explain it." : `${t.soil.text[0].toUpperCase()}${t.soil.text.slice(1)}.`}</b>{" "}
        {unknown ? "Take a leaf test, and look at the roots if it spreads." : t.soil.action}</p>
    </div>
  );
}

/** Photograph one tree the rover has read, and check it against that tree's own soil. The rover's camera is not built:
 *  for now a person is the camera, and the round says which trees are worth the walk. */
export function TreePhotoCheck({ zone, row, col, onSaved, soil = true }:
  { zone: string; row: number; col: number; onSaved?: () => void; /** false where the tree's readings are already on screen */ soil?: boolean }) {
  const ctx = useData(() => api.treeContext(zone, row, col), [zone, row, col]);
  const online = useData(api.photoLabels);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const name = ctx.data?.name ?? `R${row + 1} T${col + 1}`;

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function check() {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try { setResult(await api.checkPhoto(file, zone, { row, col })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!file) return;
    setError(null);
    try {
      await api.savePhoto(file, { zone, part: "leaf", row, col, modelLabel: result?.label, modelSeen: result?.seen });
      setSaved(true);
      onSaved?.();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="tp">
      {soil && ctx.data && <TreeSoil t={ctx.data} />}
      <div className="tp-photo">
        {preview && <img src={preview} alt={`Photo of ${name}`} className="tp-thumb" />}
        <div className="tp-acts">
          <label className="btn btn-sm btn-ghost tp-pick">
            <Camera size={16} aria-hidden />{file ? "Another photo" : `Photo of ${name}`}
            <input type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only"
                   onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); setSaved(false); }} />
          </label>
          <button type="button" className="btn btn-sm" disabled={!file || busy} onClick={check}>{busy ? "Checking…" : "Check photo"}</button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!file || saved} onClick={save}>{saved ? `Saved to ${name}` : `Save to ${name}`}</button>
        </div>
      </div>
      {!file && <p className="small muted">{online.data?.online ? "Check sends the photo to Ollama's online service." : "The photo stays on your farm server."} Saving keeps it with this tree's readings for an expert.</p>}
      {error && <Notice kind="warn">{`Could not do that: ${error}`}</Notice>}
      {result && (
        <div className="tp-result" ref={(el) => el?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>
          <PhotoVerdict r={result} lead={<SoilSays r={result} />} />
        </div>
      )}
    </div>
  );
}
