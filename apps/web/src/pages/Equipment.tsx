import { useState } from "react";
import { Empty, Field, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

const STATUS: Record<string, [string, string]> = {
  in_service: ["ok", "IN USE"], retired: ["", "RETIRED"], worn_out: ["warn", "FULLY WORN OUT"],
};

export default function Equipment() {
  const assets = useData(api.assets);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [bought, setBought] = useState(todayIso());
  const [life, setLife] = useState("");
  const [salvage, setSalvage] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

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
    try { await fn(); assets.reload(); } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  const rows = assets.data ?? [];
  const perDay = rows.filter((a) => a.status === "in_service").reduce((s, a) => s + a.dailyDepreciationUsd, 0);

  return (
    <>
      <PageHead crumb="EQUIPMENT" kicker="PUMP, DRIP LINES, TANK, SENSORS: THINGS THAT WEAR OUT" title="EQUIPMENT" />
      <main className="main stack">
        <Notice>
          Equipment is not a cost the day you buy it. Its price is spread over its life, a little each day, and each
          crop cycle carries its share. Right now that is <b>{usd(perDay, 3)}</b> a day across the farm.
        </Notice>
        {assets.error && <Notice kind="alert">{assets.error}</Notice>}
        <Panel title="EQUIPMENT LIST" pad={false}>
          {rows.length === 0 ? <Empty>No equipment yet. Add your pump or drip lines below.</Empty> : (
            <table className="tbl">
              <thead><tr><th>NAME</th><th>BOUGHT</th><th className="r">PRICE</th><th className="r">LIFE (YEARS)</th>
                <th className="r">PER DAY</th><th>STATUS</th><th /></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.name}</b></td><td>{a.boughtOn}</td><td className="r">{usd(a.costUsd)}</td>
                    <td className="r">{a.lifeYears}</td><td className="r">{usd(a.dailyDepreciationUsd, 3)}</td>
                    <td><Tag kind={STATUS[a.status][0]}>{STATUS[a.status][1]}</Tag></td>
                    <td className="act">
                      {a.status === "in_service" && <button className="linkbtn" onClick={() => act(() => api.retireAsset(a.id))}>Retire</button>}
                      {" "}<button className="linkbtn linkbtn-alert" onClick={() => window.confirm(`Remove ${a.name}?`) && act(() => api.deleteAsset(a.id))}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="ADD EQUIPMENT">
          <form className="form" onSubmit={add} style={{ maxWidth: 560 }}>
            <Field label="WHAT IS IT"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="row2">
              <Field label="PRICE PAID (USD)"><input required inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
              <Field label="DATE BOUGHT"><input type="date" required value={bought} onChange={(e) => setBought(e.target.value)} /></Field>
            </div>
            <div className="row2">
              <Field label="HOW MANY YEARS IT LASTS"><input required inputMode="decimal" value={life} onChange={(e) => setLife(e.target.value)} /></Field>
              <Field label="WORTH AT THE END (USD, OPTIONAL)"><input inputMode="decimal" value={salvage} onChange={(e) => setSalvage(e.target.value)} /></Field>
            </div>
            <div><button className="btn">Add equipment</button></div>
          </form>
          {msg && <div style={{ marginTop: 12 }}><Notice kind={msg.kind}>{msg.text}</Notice></div>}
        </Panel>
      </main>
    </>
  );
}
