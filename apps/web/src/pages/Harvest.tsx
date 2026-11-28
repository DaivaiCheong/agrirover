import { useMemo, useState, type FormEvent } from "react";
import { HandCoins, Plus, Scale, Wheat } from "lucide-react";
import { Link } from "react-router-dom";
import { EF, Empty, ErrorNotice, FormModal, Kpis, Panel, Tag, Toolbar, failMsg, type FormMsg } from "../components/ui";
import type { Cycle } from "../lib/api";
import { useFarmFocus } from "../lib/farmContext";
import { cycleLabel, num, todayIso } from "../lib/format";
import { errorText, useAddHarvest, useAddSale, useDeleteHarvest, useDeleteSale, useFarm, useHarvestLedger } from "../lib/queries";
import { usdToRiel } from "../lib/tomatoFinance";

type Dialog = "harvest" | "sale" | null;

export default function Harvest() {
  const farm = useFarm();
  const { zone, setZone } = useFarmFocus();
  const rate = farm.rate;

  // the crops that can have harvests: growing ones first, then closed ones
  const crops = useMemo(
    () => [...farm.cycles].sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.zone.localeCompare(b.zone)),
    [farm.cycles],
  );
  const scoped = zone ? crops.filter((c) => c.zone === zone) : crops;
  const ledger = useHarvestLedger(scoped.map((c) => c.id));
  const byId = new Map(crops.map((c) => [c.id, c]));

  const harvestRows = scoped.flatMap((c) => (ledger.harvests.get(c.id) ?? []).map((h) => ({ ...h, cycle: c })))
    .sort((a, b) => b.date.localeCompare(a.date));
  const saleRows = scoped.flatMap((c) => (ledger.sales.get(c.id) ?? []).map((s) => ({ ...s, cycle: c })))
    .sort((a, b) => b.date.localeCompare(a.date));

  const blocks = farm.blocks.filter((b) => b.plantCount > 0 && (!zone || b.zone === zone));
  const expectedKg = blocks.reduce((s, b) => s + b.expectedYieldKg, 0);
  const projectedUsd = blocks.reduce((s, b) => s + b.projectedRevenueUsd, 0);
  const pickedKg = harvestRows.reduce((s, h) => s + h.kgTotal, 0);
  const marketKg = harvestRows.reduce((s, h) => s + h.kgMarketable, 0);
  const soldKg = saleRows.reduce((s, x) => s + x.kg, 0);
  const soldUsd = saleRows.reduce((s, x) => s + x.amountUsd, 0);

  const [dialog, setDialog] = useState<Dialog>(null);
  const deleteHarvest = useDeleteHarvest();
  const deleteSale = useDeleteSale();
  const loading = farm.loading || ledger.loading;

  return (
    <>
      <Toolbar>
        <select className="erp-select toolbar-select" aria-label="Block" value={zone ?? ""} onChange={(e) => setZone(e.target.value || null)}>
          <option value="">All blocks</option>
          {farm.zones.map((z) => <option key={z.zone} value={z.zone}>{z.label ?? z.zone}</option>)}
        </select>
        <button className="btn btn-sm btn-ghost" onClick={() => setDialog("sale")} disabled={!crops.length}>
          <HandCoins size={16} aria-hidden />Record sale
        </button>
        <button className="btn btn-sm" onClick={() => setDialog("harvest")} disabled={!crops.length}>
          <Plus size={16} aria-hidden />Record harvest
        </button>
      </Toolbar>
      <main className="main stack">
        {(farm.error || ledger.error) && <ErrorNotice error={farm.error ?? errorText(ledger.error)} onRetry={farm.refetch} />}
        <Kpis
          loading={loading}
          items={[
            { k: "Expected this cycle", icon: Scale, v: `${num(expectedKg, 1)} kg`, d: `${blocks.reduce((s, b) => s + b.plantCount, 0)} plants × the workbook's yield` },
            { k: "Picked so far", icon: Wheat, tone: "ok", v: `${num(pickedKg, 1)} kg`,
              d: pickedKg > 0 ? `${num(marketKg, 1)} kg marketable (${Math.round((marketKg / pickedKg) * 100)}%)` : "No harvest recorded yet" },
            { k: "Sold", icon: HandCoins, v: `$${soldUsd.toFixed(2)}`, d: `${num(soldKg, 1)} kg · ~${usdToRiel(soldUsd, rate).toLocaleString()} ៛` },
            { k: "Projected revenue", v: `$${projectedUsd.toFixed(2)}`,
              d: projectedUsd > 0 ? `${Math.round((soldUsd / projectedUsd) * 100)}% earned so far` : "No crop growing" },
          ]}
        />

        <div className="grid g2">
          <Panel title="Harvests" icon={Wheat} pad={false}>
            {harvestRows.length === 0 ? (
              <Empty icon={Wheat}>
                {loading ? "Loading…" : <>No harvest recorded{zone ? " for this block" : ""}. <button className="linkbtn" onClick={() => setDialog("harvest")}>Record one</button></>}
              </Empty>
            ) : (
              <div className="tablewrap">
                <table className="tbl fold">
                  <thead><tr><th>Date</th><th>Crop</th><th className="r">Picked</th><th className="r">Marketable</th><th className="r">Lost</th><th /></tr></thead>
                  <tbody>
                    {harvestRows.map((h) => (
                      <tr key={h.id}>
                        <td className="nowrap"><b>{h.date}</b></td>
                        <td data-label="Crop"><b>{h.cycle.bedLabel}</b><div className="small muted">{h.cycle.variety ?? "Tomato"}{h.note ? ` · ${h.note}` : ""}</div></td>
                        <td data-label="Picked" className="r nowrap">{num(h.kgTotal, 1)} kg</td>
                        <td data-label="Marketable" className="r nowrap"><b>{num(h.kgMarketable, 1)} kg</b></td>
                        <td data-label="Lost" className="r nowrap">{h.kgLost > 0 ? <Tag kind="warn">{num(h.kgLost, 1)} kg</Tag> : "—"}</td>
                        <td className="act">
                          <button className="linkbtn linkbtn-alert" disabled={deleteHarvest.isPending}
                                  onClick={() => window.confirm(`Delete the ${h.date} harvest of ${h.cycle.bedLabel}?`) && deleteHarvest.mutate(h.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Sales" icon={HandCoins} pad={false} right={<Link className="linkbtn small" to="/cop">Profit by block →</Link>}>
            {saleRows.length === 0 ? (
              <Empty icon={HandCoins}>
                {loading ? "Loading…" : <>No sale recorded{zone ? " for this block" : ""}. <button className="linkbtn" onClick={() => setDialog("sale")}>Record one</button></>}
              </Empty>
            ) : (
              <div className="tablewrap">
                <table className="tbl fold">
                  <thead><tr><th>Date</th><th>Crop & buyer</th><th className="r">Kg</th><th className="r">Price</th><th className="r">Total</th><th /></tr></thead>
                  <tbody>
                    {saleRows.map((s) => (
                      <tr key={s.id}>
                        <td className="nowrap"><b>{s.date}</b></td>
                        <td data-label="Crop & buyer"><b>{s.cycle.bedLabel}</b><div className="small muted">{s.buyer ?? "No buyer named"}</div></td>
                        <td data-label="Kg" className="r nowrap">{num(s.kg, 1)}</td>
                        <td data-label="Price" className="r nowrap">{s.currency === "KHR" ? `${s.pricePerKg.toLocaleString()} ៛` : `$${s.pricePerKg.toFixed(2)}`}</td>
                        <td data-label="Total" className="r nowrap"><b>${s.amountUsd.toFixed(2)}</b><div className="small muted">~{usdToRiel(s.amountUsd, rate).toLocaleString()} ៛</div></td>
                        <td className="act">
                          <button className="linkbtn linkbtn-alert" disabled={deleteSale.isPending}
                                  onClick={() => window.confirm(`Delete the ${s.date} sale from ${s.cycle.bedLabel}?`) && deleteSale.mutate(s.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </main>

      {dialog === "harvest" && <HarvestDialog crops={crops} preferZone={zone} onClose={() => setDialog(null)} />}
      {dialog === "sale" && <SaleDialog crops={crops} preferZone={zone} rate={rate} byId={byId} onClose={() => setDialog(null)} />}
    </>
  );
}

function pickDefault(crops: Cycle[], zone: string | null) {
  return (zone ? crops.find((c) => c.zone === zone && c.status === "active") : null)?.id ?? crops.find((c) => c.status === "active")?.id ?? crops[0]?.id ?? "";
}

function HarvestDialog({ crops, preferZone, onClose }: { crops: Cycle[]; preferZone: string | null; onClose: () => void }) {
  const add = useAddHarvest();
  const [cycleId, setCycleId] = useState(() => pickDefault(crops, preferZone));
  const [date, setDate] = useState(todayIso());
  const [total, setTotal] = useState("");
  const [market, setMarket] = useState("");
  const [home, setHome] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const lost = Math.max(0, Number(total || 0) - Number(market || 0) - Number(home || 0));

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await add.mutateAsync({ cycleId, body: { date, kgTotal: Number(total), kgMarketable: Number(market), kgHome: home ? Number(home) : undefined, note: note || undefined } });
      setMsg({ kind: "ok", text: `Saved ${total} kg. The cost per kg of this crop is updated.` });
      setTotal(""); setMarket(""); setHome(""); setNote("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }

  return (
    <FormModal title="Record a harvest" submit="Save harvest" msg={msg} onClose={onClose} onSubmit={save} busy={add.isPending}>
      <div className="erp-form">
        <EF label="Crop" req>
          <select className="erp-select" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {crops.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
          </select>
        </EF>
        <div className="erp-grid-2">
          <EF label="Date" req><input className="erp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></EF>
          <EF label="Picked (kg)" req><input className="erp-input" required autoFocus inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></EF>
          <EF label="Marketable (kg)" req hint="What can be sold"><input className="erp-input" required inputMode="decimal" value={market} onChange={(e) => setMarket(e.target.value)} /></EF>
          <EF label="Kept at home (kg)"><input className="erp-input" inputMode="decimal" value={home} onChange={(e) => setHome(e.target.value)} /></EF>
        </div>
        <EF label="Note" hint={total ? `Lost or culled: ${lost.toFixed(1)} kg` : undefined}>
          <input className="erp-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="First truss, grade A…" />
        </EF>
      </div>
    </FormModal>
  );
}

function SaleDialog({ crops, preferZone, rate, byId, onClose }:
  { crops: Cycle[]; preferZone: string | null; rate: number; byId: Map<string, Cycle>; onClose: () => void }) {
  const add = useAddSale();
  const [cycleId, setCycleId] = useState(() => pickDefault(crops, preferZone));
  const [date, setDate] = useState(todayIso());
  const [kg, setKg] = useState("");
  const [price, setPrice] = useState(() => String(byId.get(pickDefault(crops, preferZone))?.expectedPriceUsdPerKg ?? ""));
  const [currency, setCurrency] = useState<"USD" | "KHR">("USD");
  const [buyer, setBuyer] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const total = Number(kg || 0) * Number(price || 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const sale = await add.mutateAsync({ cycleId, body: { date, kg: Number(kg), pricePerKg: Number(price), currency, buyer: buyer || undefined } });
      setMsg({ kind: "ok", text: `Saved $${sale.amountUsd.toFixed(2)}. Revenue and profit are updated.` });
      setKg(""); setBuyer("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }

  return (
    <FormModal title="Record a sale" submit="Save sale" msg={msg} onClose={onClose} onSubmit={save} busy={add.isPending}>
      <div className="erp-form">
        <EF label="Crop" req>
          <select className="erp-select" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {crops.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
          </select>
        </EF>
        <div className="erp-grid-3">
          <EF label="Kg sold" req><input className="erp-input" required autoFocus inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></EF>
          <EF label="Price per kg" req><input className="erp-input" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></EF>
          <EF label="Currency">
            <select className="erp-select" value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "KHR")}>
              <option value="USD">US dollar</option><option value="KHR">Riel</option>
            </select>
          </EF>
        </div>
        <div className="erp-grid-2">
          <EF label="Date" req><input className="erp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></EF>
          <EF label="Buyer"><input className="erp-input" maxLength={120} value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Market, restaurant…" /></EF>
        </div>
        {total > 0 && (
          <p className="small muted">
            Total {currency === "USD" ? `$${total.toFixed(2)} (~${usdToRiel(total, rate).toLocaleString()} ៛)` : `${Math.round(total).toLocaleString()} ៛ (~$${(total / rate).toFixed(2)})`}
          </p>
        )}
      </div>
    </FormModal>
  );
}
