import { useState } from "react";
import { Plus } from "lucide-react";
import { EF, Empty, FormModal, Kpis, Notice, Panel, Tag, Toolbar, type FormMsg } from "../components/ui";
import { api } from "../lib/api";
import { todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

const STATUS: Record<string, [string | undefined, string]> = {
  in_service: ["ok", "In use"], retired: [undefined, "Retired"], worn_out: ["warn", "Worn out"],
};

export default function Equipment() {
  const assets = useData(api.assets);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [bought, setBought] = useState(todayIso());
  const [life, setLife] = useState("");
  const [salvage, setSalvage] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.addAsset({ name, costUsd: Number(cost), boughtOn: bought, lifeYears: Number(life),
                           salvageUsd: salvage === "" ? undefined : Number(salvage) });
      setMsg({ kind: "ok", text: `${name} added.` });
      setName(""); setCost(""); setLife(""); setSalvage("");
      assets.reload();
    } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); setListError(null); assets.reload(); } catch (err) { setListError((err as Error).message); }
  }

  const rows = assets.data ?? [];
  const inUse = rows.filter((a) => a.status === "in_service");
  const perDay = inUse.reduce((s, a) => s + a.dailyDepreciationUsd, 0);

  return (
    <>
      <Toolbar>
        <button className="btn btn-sm" onClick={() => { setMsg(null); setAdding(true); }}><Plus size={16} aria-hidden />Add equipment</button>
      </Toolbar>
      <main className="main stack">
        {assets.error && <Notice kind="alert">{assets.error}</Notice>}
        {listError && <Notice kind="alert">{listError}</Notice>}

        <Kpis items={[
          { k: "In use", v: inUse.length },
          { k: "Cost per day", v: usd(perDay, 3) },
          { k: "Paid in total", v: usd(rows.reduce((s, a) => s + a.costUsd, 0)) },
        ]} />

        <Panel title="Equipment" pad={false}>
          {rows.length === 0 ? <Empty>No equipment yet.</Empty> : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>Name</th><th>Bought</th><th className="r">Price</th><th className="r">Life, years</th>
                  <th className="r">Per day</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.name}</b></td><td data-label="Bought" className="nowrap">{a.boughtOn}</td><td data-label="Price" className="r">{usd(a.costUsd)}</td>
                      <td data-label="Life, years" className="r">{a.lifeYears}</td><td data-label="Per day" className="r">{usd(a.dailyDepreciationUsd, 3)}</td>
                      <td data-label="Status"><Tag kind={STATUS[a.status][0]}>{STATUS[a.status][1]}</Tag></td>
                      <td className="act">
                        {a.status === "in_service" && <button className="linkbtn" onClick={() => act(() => api.retireAsset(a.id))}>Retire</button>}
                        {" "}<button className="linkbtn linkbtn-alert" onClick={() => window.confirm(`Remove ${a.name}?`) && act(() => api.deleteAsset(a.id))}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>

      {adding && (
        <FormModal title="Add equipment" submit="Save" msg={msg} onClose={() => setAdding(false)} onSubmit={add} width={480}>
          <div className="erp-form">
            <EF label="Name" req><input className="erp-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></EF>
            <div className="erp-grid-2">
              <EF label="Price paid (USD)" req><input className="erp-input" required inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></EF>
              <EF label="Date bought" req><input className="erp-input" type="date" required value={bought} onChange={(e) => setBought(e.target.value)} /></EF>
              <EF label="Life (years)" req hint="The price is spread over this, a little each day."><input className="erp-input" required inputMode="decimal" value={life} onChange={(e) => setLife(e.target.value)} /></EF>
              <EF label="Worth at the end (USD)"><input className="erp-input" inputMode="decimal" value={salvage} onChange={(e) => setSalvage(e.target.value)} /></EF>
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
