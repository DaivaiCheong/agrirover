import { useState, type FormEvent } from "react";
import { Droplets, Package, Plus, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { EF, Empty, ErrorNotice, FormModal, Kpis, Panel, Tag, Toolbar, failMsg, type FormMsg } from "../components/ui";
import type { Cycle, StockItem } from "../lib/api";
import { CATEGORY_LABELS, STOCK_CATEGORIES, cycleLabel, litres, num, todayIso, usd } from "../lib/format";
import {
  errorText, useAddStockItem, useAdvice, useCycles, useSettings, useStock, useStockIn, useStockMoves, useStockUse, useUndoStockMove,
} from "../lib/queries";
import { usdToRiel } from "../lib/tomatoFinance";

type Dialog = "add" | "buy" | "use" | null;

/** Inputs in the shed. Buying adds stock; using it on a crop books its cost on that crop, at the average price paid. */
export default function Stock() {
  const items = useStock();
  const cycles = useCycles();
  const advice = useAdvice();
  const settings = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const moves = useStockMoves(selected);
  const undo = useUndoStockMove();
  const [dialog, setDialog] = useState<Dialog>(null);

  const rows = items.data ?? [];
  const item = rows.find((i) => i.id === selected) ?? null;
  const open = (cycles.data ?? []).filter((c) => c.status === "active");
  const byId = new Map((cycles.data ?? []).map((c) => [c.id, c]));
  const totalValueUsd = rows.reduce((s, i) => s + i.valueUsd, 0);
  const low = rows.filter((i) => i.qtyOnHand <= 0);
  const waterTodayL = (advice.data ?? []).reduce((s, a) => s + a.water.litres, 0);
  const plants = open.reduce((s, c) => s + (c.plantCount ?? 0), 0);
  const rate = settings.data?.khrPerUsd ?? 4080;

  function openFor(i: StockItem, d: Dialog) {
    setSelected(i.id);
    setDialog(d);
  }

  return (
    <>
      <Toolbar>
        <button className="btn btn-sm" onClick={() => setDialog("add")}><Plus size={16} aria-hidden />Add item</button>
      </Toolbar>
      <main className="main stack">
        {items.error && <ErrorNotice error={errorText(items.error)} onRetry={() => items.refetch()} />}
        <Kpis
          loading={items.isPending}
          items={[
            { k: "Drip water today", icon: Droplets, tone: "info", v: litres(waterTodayL), d: `${plants} plants, from the rover's last rounds` },
            { k: "Items", icon: Package, v: rows.length, tone: low.length ? "warn" : undefined, d: low.length ? `${low.length} out of stock` : "All in stock" },
            { k: "Stock value", v: usd(totalValueUsd), d: `~${usdToRiel(totalValueUsd, rate).toLocaleString()} ៛ at the average price paid` },
            { k: "Used on crops", icon: ReceiptText, v: "Booked as costs", d: <Link className="linkbtn small" to="/costs">Cost ledger →</Link> },
          ]}
        />

        <Panel title="Inputs in stock" pad={false} right={<span className="small muted">Select a row to see its movements</span>}>
          {rows.length === 0 ? (
            <Empty icon={Package}>{items.isPending ? "Loading…" : "Nothing in stock yet."}</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>Item</th><th>Kind</th><th className="r">On hand</th><th className="r">Average price</th><th className="r">Value</th><th /></tr></thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className={`pickable${i.id === selected ? " picked" : ""}`} onClick={() => setSelected(i.id === selected ? null : i.id)}>
                      <td><b>{i.name}</b></td>
                      <td data-label="Kind">{CATEGORY_LABELS[i.category] ?? i.category}</td>
                      <td data-label="On hand" className="r nowrap">{i.qtyOnHand <= 0 ? <Tag kind="warn">0 {i.unit}</Tag> : `${num(i.qtyOnHand, 2)} ${i.unit}`}</td>
                      <td data-label="Average price" className="r">{usd(i.avgUnitCostUsd, 2)} / {i.unit}</td>
                      <td data-label="Value" className="r">{usd(i.valueUsd)}</td>
                      <td className="act">
                        <button className="linkbtn" onClick={(e) => { e.stopPropagation(); openFor(i, "buy"); }}>Buy</button>{" "}
                        <button className="linkbtn" disabled={i.qtyOnHand <= 0} onClick={(e) => { e.stopPropagation(); openFor(i, "use"); }}>Use on a crop</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {item && (
          <Panel title={`Movements · ${item.name}`} pad={false}>
            {moves.isPending ? <Empty>Loading…</Empty> : (moves.data ?? []).length === 0 ? (
              <Empty>No movement yet.</Empty>
            ) : (
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th>Date</th><th>What</th><th>Crop</th><th className="r">Quantity</th><th className="r">Price</th><th /></tr></thead>
                  <tbody>
                    {(moves.data ?? []).map((m) => (
                      <tr key={m.id}>
                        <td className="nowrap">{m.date}</td>
                        <td><Tag kind={m.kind === "in" ? "ok" : undefined}>{m.kind === "in" ? "Bought" : "Used"}</Tag></td>
                        <td>{m.plantingId ? byId.get(m.plantingId)?.bedLabel ?? "—" : "—"}</td>
                        <td className="r nowrap">{num(m.qty, 3)} {item.unit}</td>
                        <td className="r">{usd(m.unitCostUsd, 2)}</td>
                        <td className="act">
                          <button className="linkbtn linkbtn-alert" disabled={undo.isPending}
                                  onClick={() => window.confirm(m.kind === "out"
                                    ? "Undo this use? The stock goes back and its cost leaves the crop."
                                    : "Undo this purchase? The quantity leaves the stock.") && undo.mutate(m.id)}>
                            Undo
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </main>

      {dialog === "add" && <AddItemDialog onClose={() => setDialog(null)} />}
      {dialog === "buy" && item && <BuyDialog item={item} onClose={() => setDialog(null)} />}
      {dialog === "use" && item && <UseDialog item={item} crops={open} cycleLabelOf={cycleLabel} onClose={() => setDialog(null)} />}
    </>
  );
}

function AddItemDialog({ onClose }: { onClose: () => void }) {
  const add = useAddStockItem();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("fertilizer");
  const [unit, setUnit] = useState("kg");
  const [msg, setMsg] = useState<FormMsg>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await add.mutateAsync({ name, category, unit });
      setMsg({ kind: "ok", text: `${name} added. Buy some to put it in stock.` });
      setName("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title="Add an item" submit="Add item" msg={msg} onClose={onClose} onSubmit={save} busy={add.isPending} width={480}>
      <div className="erp-form">
        <EF label="Name" req><input className="erp-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></EF>
        <div className="erp-grid-2">
          <EF label="Kind">
            <select className="erp-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {STOCK_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </EF>
          <EF label="Unit" req><input className="erp-input" required value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} /></EF>
        </div>
      </div>
    </FormModal>
  );
}

function BuyDialog({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const buy = useStockIn();
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"USD" | "KHR">("USD");
  const [date, setDate] = useState(todayIso());
  const [msg, setMsg] = useState<FormMsg>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await buy.mutateAsync({ id: item.id, body: { date, qty: Number(qty), unitPrice: Number(price), currency } });
      setMsg({ kind: "ok", text: `Added ${qty} ${item.unit}. Buying is not a crop cost until it is used.` });
      setQty(""); setPrice("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title={`Buy · ${item.name}`} submit="Add to stock" msg={msg} onClose={onClose} onSubmit={save} busy={buy.isPending} width={480}>
      <div className="erp-form">
        <div className="erp-grid-2">
          <EF label={`Quantity (${item.unit})`} req><input className="erp-input" required autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></EF>
          <EF label={`Price per ${item.unit}`} req><input className="erp-input" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></EF>
          <EF label="Currency">
            <select className="erp-select" value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "KHR")}>
              <option value="USD">US dollar</option><option value="KHR">Riel</option>
            </select>
          </EF>
          <EF label="Date" req><input className="erp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></EF>
        </div>
      </div>
    </FormModal>
  );
}

function UseDialog({ item, crops, cycleLabelOf, onClose }: {
  item: StockItem; crops: Cycle[]; cycleLabelOf: typeof cycleLabel; onClose: () => void;
}) {
  const use = useStockUse();
  const [cycleId, setCycleId] = useState(crops[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(todayIso());
  const [msg, setMsg] = useState<FormMsg>(null);
  const cost = Number(qty || 0) * item.avgUnitCostUsd;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!cycleId) { setMsg({ kind: "alert", text: "Start a crop first: stock is used on a crop." }); return; }
    try {
      const res = await use.mutateAsync({ id: item.id, body: { date, qty: Number(qty), plantingId: cycleId } });
      setMsg({ kind: "ok", text: `Used ${qty} ${item.unit}: ${usd(res.cost.amountUsd)} booked on the crop.` });
      setQty("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title={`Use · ${item.name}`} submit="Use on crop" msg={msg} onClose={onClose} onSubmit={save} busy={use.isPending} width={480}>
      <div className="erp-form">
        <EF label="Crop" req>
          <select className="erp-select" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {crops.map((c) => <option key={c.id} value={c.id}>{cycleLabelOf(c)}</option>)}
          </select>
        </EF>
        <div className="erp-grid-2">
          <EF label={`Quantity (${item.unit})`} req hint={`${num(item.qtyOnHand, 2)} ${item.unit} on hand`}>
            <input className="erp-input" required autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </EF>
          <EF label="Date" req><input className="erp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></EF>
        </div>
        {cost > 0 && <p className="small muted">Cost to the crop: {usd(cost)} ({usd(item.avgUnitCostUsd, 2)} a {item.unit}, the average price paid)</p>}
      </div>
    </FormModal>
  );
}
