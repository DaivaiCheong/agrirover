import { useEffect, useState } from "react";
import { Plus, Sprout } from "lucide-react";
import { Modal, Notice, Panel, Tag, type FormMsg } from "../components/ui";
import NewCropForm from "../components/NewCropForm";
import { api, type Settings as SettingsT, loadProblem } from "../lib/api";
import { useData } from "../lib/useData";

const FIELDS: { key: keyof SettingsT; label: string; unit: string; hint: string }[] = [
  { key: "khrPerUsd", label: "Exchange rate", unit: "riel / USD", hint: "Each entry keeps the rate of its day." },
  { key: "familyWageUsdPerDay", label: "Family labour wage", unit: "USD / day", hint: "Counted in the cost, like hired labour." },
  { key: "waterCostPerM3Usd", label: "Water cost", unit: "USD / m³", hint: "Pump fuel, power or bought water." },
  { key: "landRentUsdPerHaYear", label: "Land rent", unit: "USD / ha / year", hint: "Paid, or what it could rent for." },
  { key: "irrigationEfficiency", label: "Irrigation efficiency", unit: "0 to 1", hint: "Drip 0.9, sprinkler 0.75, hand 0.6 (typical)." },
];

export default function Settings() {
  const { data, error, reload } = useData(api.settings);
  const crops = useData(api.crops);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<FormMsg>(null);
  const [showAddCrop, setShowAddCrop] = useState(false);

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
      <main className="main stack" style={{ paddingTop: 12 }}>
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}

        <Panel title="Farm numbers" pad={false} right={<span className="small muted">Empty means not set, never guessed</span>}>
          <form onSubmit={save}>
            <div className="tablewrap">
              <table className="tbl kv settings-t"><tbody>
                {FIELDS.map((f) => (
                  <tr key={f.key}>
                    <th scope="row"><label htmlFor={`set-${f.key}`}>{f.label}</label></th>
                    <td className="settings-in">
                      <div className="erp-input-group">
                        <input id={`set-${f.key}`} className="erp-input" type="number" step="any" value={form[f.key] ?? ""}
                               onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                        <span className="erp-input-addon">{f.unit}</span>
                      </div>
                    </td>
                    <td className="small muted">
                      {f.key === "khrPerUsd" && data && !data.rateConfirmed ? <Tag kind="warn">Placeholder: check today's rate</Tag> : f.hint}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <div className="panel-foot">
              {msg && <span className={`erp-msg erp-msg-${msg.kind}`} role="status">{msg.text}</span>}
              <button className="btn btn-sm">Save</button>
            </div>
          </form>
        </Panel>

        <Panel title="Crops" icon={Sprout} pad={false}
               right={<button className="btn btn-sm btn-ghost" onClick={() => setShowAddCrop(true)}><Plus size={14} aria-hidden />Add crop</button>}>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Crop</th><th className="r">Cycle days</th><th>Water data</th></tr></thead>
              <tbody>
                {(crops.data ?? []).map((c) => (
                  <tr key={c.slug}>
                    <td><b>{c.name}</b></td>
                    <td className="r">{c.stageDays ? c.stageDays.reduce((a, b) => a + b, 0) : "—"}</td>
                    <td><Tag kind={c.hasWaterData ? "ok" : undefined}>{c.hasWaterData ? "Ready" : "None"}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>

      {showAddCrop && (
        <Modal title="Add crop" onClose={() => setShowAddCrop(false)} width={520}>
          <div className="modal-body-erp"><div className="erp-section">
            <NewCropForm onAdded={() => { crops.reload(); setShowAddCrop(false); }} />
          </div></div>
        </Modal>
      )}
    </>
  );
}
