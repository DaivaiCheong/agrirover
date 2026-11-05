import { useState } from "react";
import { EF, Notice } from "./ui";
import { api } from "../lib/api";

/** A crop that is not in the list. It needs its water numbers, which an agronomist or the FAO-56 tables give. */
export default function NewCropForm({ onAdded }: { onAdded: (slug: string) => void }) {
  const [name, setName] = useState("");
  const [kc, setKc] = useState({ ini: "", mid: "", end: "" });
  const [stages, setStages] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const made = await api.addCrop({ name, kc: { ini: Number(kc.ini), mid: Number(kc.mid), end: Number(kc.end) },
                                       stageDays: stages.map(Number) });
      onAdded(made.slug);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="erp-form" onSubmit={add}>
      <EF label="Crop name" req><input className="erp-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></EF>
      <div className="erp-grid-3">
        {(["ini", "mid", "end"] as const).map((k) => (
          <EF key={k} label={`Kc ${k}`} req>
            <input className="erp-input" type="number" step="any" min={0.01} max={2} required value={kc[k]}
                   onChange={(e) => setKc({ ...kc, [k]: e.target.value })} />
          </EF>
        ))}
      </div>
      <div className="erp-grid-2">
        {["Initial", "Development", "Mid-season", "Late"].map((label, i) => (
          <EF key={label} label={`${label} (days)`} req>
            <input className="erp-input" type="number" min={1} max={400} required value={stages[i]}
                   onChange={(e) => setStages(stages.map((s, j) => (j === i ? e.target.value : s)))} />
          </EF>
        ))}
      </div>
      <div><button className="btn btn-sm">Add this crop</button></div>
      {error && <Notice kind="alert">{error}</Notice>}
    </form>
  );
}
