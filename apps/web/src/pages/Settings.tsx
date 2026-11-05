import { useEffect, useState } from "react";
import { Plus, Sprout, X } from "lucide-react";
import { Field, Notice, PageIntro, Panel, Tag } from "../components/ui";
import NewCropForm from "../components/NewCropForm";
import { api, type Settings as SettingsT, loadProblem } from "../lib/api";
import { useData } from "../lib/useData";

const FIELDS: { key: keyof SettingsT; label: string; hint: string }[] = [
  { key: "khrPerUsd", label: "Riel per US dollar", hint: "Used to turn riel into dollars. Each entry keeps the rate of the day it was made." },
  { key: "familyWageUsdPerDay", label: "Family labour wage (USD per day)", hint: "What one day of your own or family work is worth. Counted in the cost, like hired labour." },
  { key: "waterCostPerM3Usd", label: "Water cost (USD per m³)", hint: "Pump fuel or electricity, or bought water, per cubic metre. Leave empty if you will enter water costs yourself." },
  { key: "landRentUsdPerHaYear", label: "Land rent (USD per hectare per year)", hint: "Rent paid, or what the land could be rented for if you own it. Leave empty to leave land out." },
  { key: "irrigationEfficiency", label: "Irrigation efficiency (0 to 1)", hint: "Share of the water that reaches the roots. Drip about 0.9, sprinkler 0.75, hand watering 0.6 (typical)." },
];

export default function Settings() {
  const { data, error, reload } = useData(api.settings);
  const crops = useData(api.crops);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);
  const [showAddCrop, setShowAddCrop] = useState(false);
  const [cropMsg, setCropMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, data[f.key] === null ? "" : String(data[f.key])])));
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const patch: Record<string, number> = {};
    for (const f of FIELDS) if (form[f.key] !== "" && form[f.key] !== undefined) patch[f.key] = Number(form[f.key]);
    try {
      await api.saveSettings(patch);
      setMsg({ kind: "ok", text: "Saved." });
      reload();
    } catch (err) {
      setMsg({ kind: "alert", text: (err as Error).message });
    }
  }

  return (
    <>
      <PageIntro>Numbers the whole farm uses. Leave a number empty if you do not know it; the app will say what is missing.</PageIntro>
      <main className="main stack">
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}
        {data && !data.rateConfirmed && (
          <Notice kind="warn">
            The exchange rate ({data.khrPerUsd.toLocaleString()} riel per dollar) is a placeholder. Check today's rate
            and press Save so riel amounts are converted correctly.
          </Notice>
        )}
        <Panel title="Settings">
          <form className="form" onSubmit={save} style={{ maxWidth: 560 }}>
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input type="number" step="any" value={form[f.key] ?? ""}
                       onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </Field>
            ))}
            <div><button className="btn">Save</button></div>
          </form>
          {msg && <div style={{ marginTop: 12 }}><Notice kind={msg.kind}>{msg.text}</Notice></div>}
        </Panel>

        <Panel
          title="Crops"
          icon={Sprout}
          right={!showAddCrop ? (
            <button className="btn btn-sm" onClick={() => setShowAddCrop(true)}>
              <Plus size={16} aria-hidden />Add crop
            </button>
          ) : undefined}
        >
          {cropMsg && <div style={{ marginBottom: 14 }}><Notice kind="ok">{cropMsg}</Notice></div>}

          <div style={{ display: "grid", gap: 8 }}>
            {(crops.data ?? []).map((c) => (
              <div
                key={c.slug}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 14px",
                  background: "var(--surface-alt)",
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--line)",
                }}
              >
                <div>
                  <b style={{ fontSize: 15 }}>{c.name}</b>
                  {c.stageDays && (
                    <span className="small muted" style={{ marginLeft: 10 }}>
                      {c.stageDays.reduce((a, b) => a + b, 0)} cycle days
                    </span>
                  )}
                </div>
                <Tag kind={c.hasWaterData ? "ok" : "idle"}>
                  {c.hasWaterData ? "Water data ready" : "No water data"}
                </Tag>
              </div>
            ))}
          </div>

          {showAddCrop && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <b style={{ fontSize: 16 }}>New crop profile</b>
                <button className="linkbtn" onClick={() => setShowAddCrop(false)}>
                  <X size={16} aria-hidden style={{ verticalAlign: -2 }} /> Cancel
                </button>
              </div>
              <NewCropForm
                onAdded={() => {
                  crops.reload();
                  setShowAddCrop(false);
                  setCropMsg("New crop added to farm.");
                }}
              />
            </div>
          )}
        </Panel>

        <Notice>
          Empty means not set. A missing number is never guessed: the cost report says what is left out.
        </Notice>
      </main>
    </>
  );
}
