import { useEffect, useMemo, useState } from "react";
import { SyncBadge } from "../components/SampleNotice";
import { Panel, Tag, type FormMsg } from "../components/ui";
import { api, type Settings as SettingsT } from "../lib/api";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import { useData } from "../lib/useData";

const FIELDS: { key: keyof SettingsT; label: string; unit: string; hint: string }[] = [
  { key: "khrPerUsd", label: "Exchange rate", unit: "riel / USD", hint: "Used across USD and Khmer Riel calculations." },
  { key: "familyWageUsdPerDay", label: "Labor wage", unit: "USD / day", hint: "Included in per-plant operation cost." },
  { key: "waterCostPerM3Usd", label: "Water & pump cost", unit: "USD / m³", hint: "Solar drip energy and municipal water." },
  { key: "landRentUsdPerHaYear", label: "Bed & greenhouse overhead", unit: "USD / ha / year", hint: "Greenhouse film, stakes & space allocation." },
  { key: "irrigationEfficiency", label: "Drip efficiency", unit: "0 to 1", hint: "Precision rover drip 0.90 vs hand watering 0.60." },
];

export default function Settings() {
  const { data, error, reload } = useData(api.settings);
  const demo = useMemo(() => buildDemoTomatoFarm(), []);
  const previewMode = Boolean(error && !data);
  const active = previewMode ? demo.settings : (data ?? demo.settings);

  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<FormMsg>(null);

  useEffect(() => {
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, active[f.key] === null ? "" : String(active[f.key])])));
  }, [active]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (previewMode) {
      setMsg({ kind: "ok", text: "Updated in sample session." });
      return;
    }
    const patch: Record<string, number> = {};
    for (const f of FIELDS) {
      if (form[f.key] !== "" && form[f.key] !== undefined) patch[f.key] = Number(form[f.key]);
    }
    try {
      await api.saveSettings(patch);
      setMsg({ kind: "ok", text: "Saved." });
      reload();
    } catch (err) {
      setMsg({ kind: "alert", text: (err as Error).message });
    }
  }

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      <Panel
        title="Tomato Farm Economic Parameters"
        pad={false}
        right={previewMode ? <SyncBadge /> : <span className="small muted">Shared across Finance &amp; Plan</span>}
      >
        <form onSubmit={save}>
          <div className="tablewrap">
            <table className="tbl kv settings-t">
              <tbody>
                {FIELDS.map((f) => (
                  <tr key={f.key}>
                    <th scope="row"><label htmlFor={`set-${f.key}`}>{f.label}</label></th>
                    <td className="settings-in">
                      <div className="erp-input-group">
                        <input
                          id={`set-${f.key}`}
                          className="erp-input"
                          type="number"
                          step="any"
                          value={form[f.key] ?? ""}
                          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        />
                        <span className="erp-input-addon">{f.unit}</span>
                      </div>
                    </td>
                    <td className="small muted">
                      {f.key === "khrPerUsd" && !active.rateConfirmed ? <Tag kind="warn">Verify today's rate</Tag> : f.hint}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-foot">
            {msg && <span className={`erp-msg erp-msg-${msg.kind}`} role="status">{msg.text}</span>}
            <button className="btn btn-sm">Save parameters</button>
          </div>
        </form>
      </Panel>
    </main>
  );
}
