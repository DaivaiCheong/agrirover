import { useState } from "react";
import { Empty, Field, Notice, PageHead, Panel } from "../components/ui";
import { api } from "../lib/api";
import { cycleLabel, num, todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

export default function Harvest() {
  const cycles = useData(api.cycles);
  const [picked, setPicked] = useState("");
  const cycleId = picked || cycles.data?.[0]?.id || "";
  const harvests = useData(() => (cycleId ? api.harvests(cycleId) : Promise.resolve([])), [cycleId]);
  const sales = useData(() => (cycleId ? api.sales(cycleId) : Promise.resolve([])), [cycleId]);

  const [hDate, setHDate] = useState(todayIso());
  const [kgTotal, setKgTotal] = useState("");
  const [kgMarket, setKgMarket] = useState("");
  const [kgHome, setKgHome] = useState("");
  const [sDate, setSDate] = useState(todayIso());
  const [sKg, setSKg] = useState("");
  const [sPrice, setSPrice] = useState("");
  const [sCur, setSCur] = useState<"USD" | "KHR">("USD");
  const [buyer, setBuyer] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string, after: () => void) {
    try { await fn(); setMsg({ kind: "ok", text: ok }); after(); }
    catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  const hs = harvests.data ?? [];
  const ss = sales.data ?? [];
  const kgMarketable = hs.reduce((s, h) => s + h.kgMarketable, 0);
  const kgSold = ss.reduce((s, x) => s + x.kg, 0);
  const revenue = ss.reduce((s, x) => s + x.amountUsd, 0);

  return (
    <>
      <PageHead crumb="HARVEST AND SALES" kicker="WHAT CAME OFF THE PLANTS, AND WHAT IT SOLD FOR" title="HARVEST AND SALES" />
      <main className="main stack">
        {cycles.error && <Notice kind="alert">{cycles.error}</Notice>}
        {(cycles.data ?? []).length === 0 ? <Empty>Start a crop cycle first.</Empty> : (
          <>
            <Field label="CYCLE">
              <select value={cycleId} onChange={(e) => setPicked(e.target.value)}>
                {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
              </select>
            </Field>
            <Notice>
              Marketable <b>{num(kgMarketable, 2)} kg</b> · sold <b>{num(kgSold, 2)} kg</b> for <b>{usd(revenue)}</b>.
              Cost per kg uses the marketable kg, so enter every harvest.
            </Notice>
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

            <div className="grid g2">
              <Panel title="HARVEST">
                <form className="form" onSubmit={(e) => { e.preventDefault();
                  run(() => api.addHarvest(cycleId, { date: hDate, kgTotal: Number(kgTotal), kgMarketable: Number(kgMarket),
                                                       kgHome: kgHome === "" ? undefined : Number(kgHome) }),
                      "Harvest saved.", () => { setKgTotal(""); setKgMarket(""); setKgHome(""); harvests.reload(); }); }}>
                  <Field label="DATE"><input type="date" required value={hDate} onChange={(e) => setHDate(e.target.value)} /></Field>
                  <div className="row3">
                    <Field label="KG HARVESTED"><input required inputMode="decimal" value={kgTotal} onChange={(e) => setKgTotal(e.target.value)} /></Field>
                    <Field label="KG TO SELL"><input required inputMode="decimal" value={kgMarket} onChange={(e) => setKgMarket(e.target.value)} /></Field>
                    <Field label="KG KEPT AT HOME"><input inputMode="decimal" value={kgHome} onChange={(e) => setKgHome(e.target.value)} /></Field>
                  </div>
                  <p className="mono-sm" style={{ color: "var(--ink-muted)" }}>What is left over (harvested minus to sell minus kept) counts as lost.</p>
                  <div><button className="btn">Save harvest</button></div>
                </form>
              </Panel>

              <Panel title="SALE">
                <form className="form" onSubmit={(e) => { e.preventDefault();
                  run(() => api.addSale(cycleId, { date: sDate, kg: Number(sKg), pricePerKg: Number(sPrice), currency: sCur,
                                                   buyer: buyer || undefined }),
                      "Sale saved.", () => { setSKg(""); setSPrice(""); setBuyer(""); sales.reload(); }); }}>
                  <Field label="DATE"><input type="date" required value={sDate} onChange={(e) => setSDate(e.target.value)} /></Field>
                  <div className="row3">
                    <Field label="KG SOLD"><input required inputMode="decimal" value={sKg} onChange={(e) => setSKg(e.target.value)} /></Field>
                    <Field label="PRICE PER KG"><input required inputMode="decimal" value={sPrice} onChange={(e) => setSPrice(e.target.value)} /></Field>
                    <Field label="CURRENCY"><select value={sCur} onChange={(e) => setSCur(e.target.value as "USD" | "KHR")}>
                      <option value="USD">US dollar</option><option value="KHR">Riel</option></select></Field>
                  </div>
                  <Field label="BUYER (OPTIONAL)"><input value={buyer} maxLength={120} onChange={(e) => setBuyer(e.target.value)} /></Field>
                  <div><button className="btn">Save sale</button></div>
                </form>
              </Panel>
            </div>

            <div className="grid g2">
              <Panel title="HARVESTS" pad={false}>
                {hs.length === 0 ? <Empty>No harvest yet.</Empty> : (
                  <table className="tbl">
                    <thead><tr><th>DATE</th><th className="r">HARVESTED</th><th className="r">TO SELL</th><th className="r">HOME</th><th className="r">LOST</th><th /></tr></thead>
                    <tbody>{hs.map((h) => (
                      <tr key={h.id}><td>{h.date}</td><td className="r">{num(h.kgTotal, 2)}</td><td className="r">{num(h.kgMarketable, 2)}</td>
                        <td className="r">{num(h.kgHome, 2)}</td><td className="r">{num(h.kgLost, 2)}</td>
                        <td className="act"><button className="linkbtn linkbtn-alert" onClick={() => window.confirm("Delete this harvest?") && run(() => api.deleteHarvest(h.id), "Deleted.", harvests.reload)}>Delete</button></td></tr>))}
                    </tbody>
                  </table>
                )}
              </Panel>
              <Panel title="SALES" pad={false}>
                {ss.length === 0 ? <Empty>No sales yet.</Empty> : (
                  <table className="tbl">
                    <thead><tr><th>DATE</th><th className="r">KG</th><th className="r">PRICE / KG</th><th className="r">USD</th><th>BUYER</th><th /></tr></thead>
                    <tbody>{ss.map((s) => (
                      <tr key={s.id}><td>{s.date}</td><td className="r">{num(s.kg, 2)}</td>
                        <td className="r">{s.currency === "KHR" ? `${s.pricePerKg.toLocaleString()} ៛` : usd(s.pricePerKg)}</td>
                        <td className="r"><b>{usd(s.amountUsd)}</b></td><td>{s.buyer ?? ""}</td>
                        <td className="act"><button className="linkbtn linkbtn-alert" onClick={() => window.confirm("Delete this sale?") && run(() => api.deleteSale(s.id), "Deleted.", sales.reload)}>Delete</button></td></tr>))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>
          </>
        )}
      </main>
    </>
  );
}
