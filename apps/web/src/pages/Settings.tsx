import { useEffect, useState } from "react";
import { Field, Notice, PageHead, Panel } from "../components/ui";
import { api, type Settings as SettingsT } from "../lib/api";
import { useData } from "../lib/useData";

const FIELDS: { key: keyof SettingsT; label: string; hint: string }[] = [
  { key: "khrPerUsd", label: "RIEL PER US DOLLAR", hint: "Used to turn riel into dollars. Each entry keeps the rate of the day it was made." },
  { key: "familyWageUsdPerDay", label: "FAMILY LABOUR WAGE (USD PER DAY)", hint: "What one day of your own or family work is worth. Counted in the cost, like hired labour." },
  { key: "waterCostPerM3Usd", label: "WATER COST (USD PER m³)", hint: "Pump fuel or electricity, or bought water, per cubic metre. Leave empty if you will enter water costs yourself." },
  { key: "landRentUsdPerHaYear", label: "LAND RENT (USD PER HECTARE PER YEAR)", hint: "Rent paid, or what the land could be rented for if you own it. Leave empty to leave land out." },
  { key: "et0MmDay", label: "ET₀ (mm PER DAY)", hint: "How fast water evaporates where you farm. An assumption until you replace it with a local value." },
  { key: "irrigationEfficiency", label: "IRRIGATION EFFICIENCY (0 to 1)", hint: "Share of the water that reaches the roots. Drip about 0.9, sprinkler 0.75, hand watering 0.6 (typical)." },
];

export default function Settings() {
  const { data, error, reload } = useData(api.settings);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

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
      <PageHead crumb="SETTINGS" kicker="NUMBERS THE WHOLE FARM USES" title="FARM SETTINGS" />
      <main className="main stack">
        {error && <Notice kind="alert">Cannot reach the farm server ({error}).</Notice>}
        {data && !data.rateConfirmed && (
          <Notice kind="warn">
            The exchange rate ({data.khrPerUsd.toLocaleString()} riel per dollar) is a placeholder. Check today's rate
            and press Save so riel amounts are converted correctly.
          </Notice>
        )}
        <Panel title="SETTINGS">
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
        <Notice>
          Empty means not set. A missing number is never guessed: the cost report says what is left out.
        </Notice>
      </main>
    </>
  );
}
