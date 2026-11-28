import { useEffect, useState, type FormEvent } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { ErrorNotice, Panel, Skeleton, Tag, failMsg, type FormMsg } from "../components/ui";
import type { Settings as SettingsT } from "../lib/api";
import { errorText, useSaveSettings, useSettings } from "../lib/queries";

const FIELDS: { key: keyof SettingsT; label: string; unit: string; hint: string }[] = [
  { key: "khrPerUsd", label: "Exchange rate", unit: "riel / USD", hint: "Converts riel entries to dollars and shows every amount in riel." },
  { key: "familyWageUsdPerDay", label: "Family labour", unit: "USD / day", hint: "Prices a day of family work entered in the cost ledger." },
  { key: "waterCostPerM3Usd", label: "Water and pumping", unit: "USD / m³", hint: "Estimates water cost when no water bill is entered." },
  { key: "landRentUsdPerHaYear", label: "Land rent", unit: "USD / ha / year", hint: "Shared into each crop's cost by its area and days." },
  { key: "irrigationEfficiency", label: "Drip efficiency", unit: "0 to 1", hint: "Share of water that reaches the roots (drip about 0.9)." },
];

/** The farm's own prices. Every cost report and riel amount reads them. */
export default function Settings() {
  const settings = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<FormMsg>(null);
  const data = settings.data;

  useEffect(() => {
    if (data) setForm(Object.fromEntries(FIELDS.map((f) => [f.key, data[f.key] === null ? "" : String(data[f.key])])));
  }, [data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const patch: Record<string, number> = {};
    for (const f of FIELDS) if (form[f.key] !== "" && form[f.key] !== undefined) patch[f.key] = Number(form[f.key]);
    try {
      await save.mutateAsync(patch);
      setMsg({ kind: "ok", text: "Saved. Cost reports use the new values." });
    } catch (err) {
      setMsg(failMsg(err));
    }
  }

  return (
    <main className="main stack">
      {settings.error && <ErrorNotice error={errorText(settings.error)} onRetry={() => settings.refetch()} />}
      <Panel title="Farm prices and rates" icon={SettingsIcon} pad={false} right={<span className="small muted">Used by Finance, the cost ledger and every cost report</span>}>
        {!data ? (
          <div className="panel-pad stack"><Skeleton h={30} /><Skeleton h={30} /><Skeleton h={30} /></div>
        ) : (
          <form onSubmit={submit}>
            <div className="tablewrap">
              <table className="tbl kv settings-t">
                <tbody>
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
                      <td className="small muted">{f.key === "khrPerUsd" && !data.rateConfirmed ? <Tag kind="warn">Check today's rate</Tag> : f.hint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-foot">
              {msg && <span className={`erp-msg erp-msg-${msg.kind}`} role="status">{msg.text}</span>}
              <button className="btn btn-sm" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
            </div>
          </form>
        )}
      </Panel>
    </main>
  );
}
