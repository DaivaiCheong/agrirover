import { useState } from "react";
import { Plus } from "lucide-react";
import { EF, Empty, FormModal, Kpis, Notice, Panel, Toolbar, type FormMsg } from "../components/ui";
import { api } from "../lib/api";
import { cycleLabel, num, todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

export default function Harvest() {
  const cycles = useData(api.cycles);
  const [picked, setPicked] = useState("");
  const cycleId = picked || cycles.data?.[0]?.id || "";
  const harvests = useData(() => (cycleId ? api.harvests(cycleId) : Promise.resolve([])), [cycleId]);
  const sales = useData(() => (cycleId ? api.sales(cycleId) : Promise.resolve([])), [cycleId]);

  const [dialog, setDialog] = useState<"harvest" | "sale" | null>(null);
  const [hDate, setHDate] = useState(todayIso());
  const [kgTotal, setKgTotal] = useState("");
  const [kgMarket, setKgMarket] = useState("");
  const [kgHome, setKgHome] = useState("");
  const [sDate, setSDate] = useState(todayIso());
  const [sKg, setSKg] = useState("");
  const [sPrice, setSPrice] = useState("");
  const [sCur, setSCur] = useState<"USD" | "KHR">("USD");
  const [buyer, setBuyer] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string, after: () => void) {
    try { await fn(); setMsg({ kind: "ok", text: ok }); after(); }
    catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }
  async function remove(what: string, fn: () => Promise<unknown>, after: () => void) {
    if (!window.confirm(`Delete this ${what}?`)) return;
    try { await fn(); setListError(null); after(); } catch (err) { setListError((err as Error).message); }
  }
  const open = (d: "harvest" | "sale") => { setMsg(null); setDialog(d); };

  const hs = harvests.data ?? [];
  const ss = sales.data ?? [];

  return (
    <>
      {(cycles.data ?? []).length > 0 && (
        <Toolbar>
          <select className="erp-select toolbar-select" aria-label="Crop" value={cycleId} onChange={(e) => setPicked(e.target.value)}>
            {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
          </select>
        </Toolbar>
      )}
      <main className="main stack">
        {cycles.error && <Notice kind="alert">{cycles.error}</Notice>}
        {listError && <Notice kind="alert">{listError}</Notice>}
        {(cycles.data ?? []).length === 0 ? <Empty>Start a crop first.</Empty> : (
          <>
            <Kpis items={[
              { k: "Harvested", v: `${num(hs.reduce((s, h) => s + h.kgTotal, 0), 1)} kg` },
              { k: "To sell", v: `${num(hs.reduce((s, h) => s + h.kgMarketable, 0), 1)} kg` },
              { k: "Lost", v: `${num(hs.reduce((s, h) => s + h.kgLost, 0), 1)} kg` },
              { k: "Sold", v: `${num(ss.reduce((s, x) => s + x.kg, 0), 1)} kg` },
              { k: "Revenue", v: usd(ss.reduce((s, x) => s + x.amountUsd, 0)) },
            ]} />

            <div className="grid g2">
              <Panel title="Harvests" pad={false} right={<button className="btn btn-sm btn-ghost" onClick={() => open("harvest")}><Plus size={14} aria-hidden />Add</button>}>
                {hs.length === 0 ? <Empty>No harvest yet.</Empty> : (
                  <div className="tablewrap">
                    <table className="tbl fold">
                      <thead><tr><th>Date</th><th className="r">Kg</th><th className="r">To sell</th><th className="r">Home</th><th className="r">Lost</th><th /></tr></thead>
                      <tbody>{hs.map((h) => (
                        <tr key={h.id}><td className="nowrap"><b>{h.date}</b></td><td data-label="Kg" className="r">{num(h.kgTotal, 2)}</td><td data-label="To sell" className="r">{num(h.kgMarketable, 2)}</td>
                          <td data-label="Home" className="r">{num(h.kgHome, 2)}</td><td data-label="Lost" className="r">{num(h.kgLost, 2)}</td>
                          <td className="act"><button className="linkbtn linkbtn-alert" onClick={() => remove("harvest", () => api.deleteHarvest(h.id), harvests.reload)}>Delete</button></td></tr>))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
              <Panel title="Sales" pad={false} right={<button className="btn btn-sm btn-ghost" onClick={() => open("sale")}><Plus size={14} aria-hidden />Add</button>}>
                {ss.length === 0 ? <Empty>No sales yet.</Empty> : (
                  <div className="tablewrap">
                    <table className="tbl fold">
                      <thead><tr><th>Date</th><th className="r">Kg</th><th className="r">Price</th><th className="r">USD</th><th>Buyer</th><th /></tr></thead>
                      <tbody>{ss.map((s) => (
                        <tr key={s.id}><td className="nowrap"><b>{s.date}</b></td><td data-label="Kg" className="r">{num(s.kg, 2)}</td>
                          <td data-label="Price" className="r nowrap">{s.currency === "KHR" ? `${s.pricePerKg.toLocaleString()} ៛` : usd(s.pricePerKg)}</td>
                          <td data-label="USD" className="r"><b>{usd(s.amountUsd)}</b></td><td data-label="Buyer">{s.buyer ?? "—"}</td>
                          <td className="act"><button className="linkbtn linkbtn-alert" onClick={() => remove("sale", () => api.deleteSale(s.id), sales.reload)}>Delete</button></td></tr>))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
          </>
        )}
      </main>

      {dialog === "harvest" && (
        <FormModal title="Add harvest" submit="Save harvest" msg={msg} onClose={() => setDialog(null)} width={480}
                   onSubmit={(e) => { e.preventDefault();
                     run(() => api.addHarvest(cycleId, { date: hDate, kgTotal: Number(kgTotal), kgMarketable: Number(kgMarket), kgHome: kgHome === "" ? undefined : Number(kgHome) }),
                         "Harvest saved.", () => { setKgTotal(""); setKgMarket(""); setKgHome(""); harvests.reload(); }); }}>
          <div className="erp-form">
            <div className="erp-grid-3">
              <EF label="Kg harvested" req><input className="erp-input" required autoFocus inputMode="decimal" value={kgTotal} onChange={(e) => setKgTotal(e.target.value)} /></EF>
              <EF label="Kg to sell" req><input className="erp-input" required inputMode="decimal" value={kgMarket} onChange={(e) => setKgMarket(e.target.value)} /></EF>
              <EF label="Kg kept home"><input className="erp-input" inputMode="decimal" value={kgHome} onChange={(e) => setKgHome(e.target.value)} /></EF>
            </div>
            <EF label="Date" req hint="What is left over counts as lost. Cost per kg uses the kg to sell."><input className="erp-input" type="date" required value={hDate} onChange={(e) => setHDate(e.target.value)} /></EF>
          </div>
        </FormModal>
      )}

      {dialog === "sale" && (
        <FormModal title="Add sale" submit="Save sale" msg={msg} onClose={() => setDialog(null)} width={480}
                   onSubmit={(e) => { e.preventDefault();
                     run(() => api.addSale(cycleId, { date: sDate, kg: Number(sKg), pricePerKg: Number(sPrice), currency: sCur, buyer: buyer || undefined }),
                         "Sale saved.", () => { setSKg(""); setSPrice(""); setBuyer(""); sales.reload(); }); }}>
          <div className="erp-form">
            <div className="erp-grid-3">
              <EF label="Kg sold" req><input className="erp-input" required autoFocus inputMode="decimal" value={sKg} onChange={(e) => setSKg(e.target.value)} /></EF>
              <EF label="Price per kg" req><input className="erp-input" required inputMode="decimal" value={sPrice} onChange={(e) => setSPrice(e.target.value)} /></EF>
              <EF label="Currency"><select className="erp-select" value={sCur} onChange={(e) => setSCur(e.target.value as "USD" | "KHR")}>
                <option value="USD">US dollar</option><option value="KHR">Riel</option></select></EF>
            </div>
            <div className="erp-grid-2">
              <EF label="Date" req><input className="erp-input" type="date" required value={sDate} onChange={(e) => setSDate(e.target.value)} /></EF>
              <EF label="Buyer"><input className="erp-input" value={buyer} maxLength={120} onChange={(e) => setBuyer(e.target.value)} /></EF>
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
