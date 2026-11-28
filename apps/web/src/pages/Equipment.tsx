import { useState, type FormEvent } from "react";
import { Plus, Wrench } from "lucide-react";
import { EF, Empty, ErrorNotice, FormModal, Kpis, Panel, Tag, Toolbar, failMsg, type FormMsg } from "../components/ui";
import { todayIso, usd } from "../lib/format";
import { errorText, useAddAsset, useAssets, useDeleteAsset, useRetireAsset } from "../lib/queries";

const STATUS: Record<string, [string | undefined, string]> = {
  in_service: ["ok", "In use"],
  retired: [undefined, "Retired"],
  worn_out: ["warn", "Worn out"],
};

/** Equipment wears out a little every day; that share goes into each crop's cost report as depreciation. */
export default function Equipment() {
  const assets = useAssets();
  const retire = useRetireAsset();
  const remove = useDeleteAsset();
  const [adding, setAdding] = useState(false);

  const rows = assets.data ?? [];
  const inUse = rows.filter((a) => a.status === "in_service");
  const perDay = inUse.reduce((s, a) => s + a.dailyDepreciationUsd, 0);

  return (
    <>
      <Toolbar>
        <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />Add equipment</button>
      </Toolbar>
      <main className="main stack">
        {assets.error && <ErrorNotice error={errorText(assets.error)} onRetry={() => assets.refetch()} />}
        <Kpis
          loading={assets.isPending}
          items={[
            { k: "In use", icon: Wrench, v: inUse.length, d: `${rows.length - inUse.length} retired` },
            { k: "Wear per day", v: usd(perDay, 3), d: "Shared across the growing crops by area" },
            { k: "Invested", v: usd(rows.reduce((s, a) => s + a.costUsd, 0)), d: "Price paid, all equipment" },
          ]}
        />
        <Panel title="Equipment" icon={Wrench} pad={false}>
          {rows.length === 0 ? (
            <Empty icon={Wrench}>{assets.isPending ? "Loading…" : "No equipment yet."}</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>Name</th><th>Bought</th><th className="r">Price</th><th className="r">Life</th><th className="r">Per day</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.name}</b></td>
                      <td data-label="Bought" className="nowrap">{a.boughtOn}</td>
                      <td data-label="Price" className="r">{usd(a.costUsd)}</td>
                      <td data-label="Life" className="r">{a.lifeYears} years</td>
                      <td data-label="Per day" className="r">{usd(a.dailyDepreciationUsd, 3)}</td>
                      <td data-label="Status"><Tag kind={STATUS[a.status]?.[0]}>{STATUS[a.status]?.[1] ?? a.status}{a.retiredOn ? ` ${a.retiredOn}` : ""}</Tag></td>
                      <td className="act">
                        {a.status === "in_service" && (
                          <button className="linkbtn" disabled={retire.isPending}
                                  onClick={() => window.confirm(`Retire ${a.name} today? It stops adding wear to the crops.`) && retire.mutate(a.id)}>Retire</button>
                        )}{" "}
                        <button className="linkbtn linkbtn-alert" disabled={remove.isPending}
                                onClick={() => window.confirm(`Remove ${a.name}? Its wear leaves every cost report.`) && remove.mutate(a.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
      {adding && <AddAssetDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function AddAssetDialog({ onClose }: { onClose: () => void }) {
  const add = useAddAsset();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [bought, setBought] = useState(todayIso());
  const [life, setLife] = useState("");
  const [salvage, setSalvage] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await add.mutateAsync({ name, costUsd: Number(cost), boughtOn: bought, lifeYears: Number(life), salvageUsd: salvage === "" ? undefined : Number(salvage) });
      setMsg({ kind: "ok", text: `${name} added. Its wear now counts in the crops' costs.` });
      setName(""); setCost(""); setLife(""); setSalvage("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title="Add equipment" submit="Save" msg={msg} onClose={onClose} onSubmit={save} busy={add.isPending} width={480}>
      <div className="erp-form">
        <EF label="Name" req><input className="erp-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></EF>
        <div className="erp-grid-2">
          <EF label="Price paid (USD)" req><input className="erp-input" required inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></EF>
          <EF label="Date bought" req><input className="erp-input" type="date" required value={bought} onChange={(e) => setBought(e.target.value)} /></EF>
          <EF label="Life (years)" req><input className="erp-input" required inputMode="decimal" value={life} onChange={(e) => setLife(e.target.value)} /></EF>
          <EF label="Worth at the end (USD)"><input className="erp-input" inputMode="decimal" value={salvage} onChange={(e) => setSalvage(e.target.value)} /></EF>
        </div>
      </div>
    </FormModal>
  );
}
