import { useState } from "react";
import { Plus } from "lucide-react";
import { EF, Empty, FormModal, Kpis, Notice, Panel, Tag, Toolbar, type FormMsg } from "../components/ui";
import { api, type StockItem } from "../lib/api";
import { CATEGORY_LABELS, STOCK_CATEGORIES, cycleLabel, num, todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

type Dialog = "add" | "buy" | "use" | null;

export default function Stock() {
  const items = useData(api.stockItems);
  const cycles = useData(api.cycles);
  const [selected, setSelected] = useState<string | null>(null);
  const moves = useData(() => (selected ? api.stockMoves(selected) : Promise.resolve([])), [selected]);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("fertilizer");
  const [unit, setUnit] = useState("kg");
  const [inQty, setInQty] = useState("");
  const [inPrice, setInPrice] = useState("");
  const [inCur, setInCur] = useState<"USD" | "KHR">("USD");
  const [useQty, setUseQty] = useState("");
  const [useCycle, setUseCycle] = useState("");
  const [date, setDate] = useState(todayIso());
  const [msg, setMsg] = useState<FormMsg>(null);
  const [listError, setListError] = useState<string | null>(null);

  const rows = items.data ?? [];
  const item = rows.find((i) => i.id === selected) ?? null;
  const open = (cycles.data ?? []).filter((c) => c.status === "active");
  const cycleId = useCycle || open[0]?.id || "";

  async function run(fn: () => Promise<unknown>, ok: string, after?: () => void) {
    try { await fn(); setMsg({ kind: "ok", text: ok }); items.reload(); moves.reload(); after?.(); }
    catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  function openFor(i: StockItem, d: Dialog) { setSelected(i.id); setMsg(null); setDialog(d); }

  async function undo(id: string) {
    if (!window.confirm("Undo this use? The stock goes back and the cost is removed.")) return;
    try { await api.undoStockUse(id); items.reload(); moves.reload(); setListError(null); }
    catch (err) { setListError((err as Error).message); }
  }

  return (
    <>
      <Toolbar>
        <button className="btn btn-sm" onClick={() => { setMsg(null); setDialog("add"); }}><Plus size={16} aria-hidden />Add item</button>
      </Toolbar>
      <main className="main stack">
        {items.error && <Notice kind="alert">{items.error}</Notice>}
        {listError && <Notice kind="alert">{listError}</Notice>}

        <Kpis items={[
          { k: "Items", v: rows.length },
          { k: "Value on hand", v: usd(rows.reduce((s, i) => s + i.valueUsd, 0)) },
        ]} />

        <Panel title="In the shed" pad={false}>
          {rows.length === 0 ? <Empty>Nothing in stock yet.</Empty> : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>Item</th><th>Kind</th><th className="r">On hand</th><th className="r">Avg price</th><th className="r">Value</th><th /></tr></thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className={`pickable${i.id === selected ? " picked" : ""}`} onClick={() => setSelected(i.id === selected ? null : i.id)}>
                      <td><b>{i.name}</b></td><td data-label="Kind">{CATEGORY_LABELS[i.category]}</td>
                      <td data-label="On hand" className="r nowrap">{num(i.qtyOnHand, 3)} {i.unit}</td>
                      <td data-label="Avg price" className="r">{usd(i.avgUnitCostUsd, 4)}</td><td data-label="Value" className="r">{usd(i.valueUsd)}</td>
                      <td className="act">
                        <button className="linkbtn" onClick={(e) => { e.stopPropagation(); openFor(i, "buy"); }}>Buy</button>{" "}
                        <button className="linkbtn" onClick={(e) => { e.stopPropagation(); openFor(i, "use"); }}>Use</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {item && (
          <Panel title={`History · ${item.name}`} pad={false}>
            {(moves.data ?? []).length === 0 ? <Empty>No movements yet.</Empty> : (
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th>Date</th><th>What</th><th className="r">Quantity</th><th className="r">Price</th><th /></tr></thead>
                  <tbody>
                    {(moves.data ?? []).map((m) => (
                      <tr key={m.id}>
                        <td className="nowrap">{m.date}</td>
                        <td><Tag>{m.kind === "in" ? "Bought" : "Used"}</Tag></td>
                        <td className="r nowrap">{num(m.qty, 3)} {item.unit}</td><td className="r">{usd(m.unitCostUsd, 4)}</td>
                        <td className="act">{m.kind === "out" && <button className="linkbtn linkbtn-alert" onClick={() => undo(m.id)}>Undo</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </main>

      {dialog === "add" && (
        <FormModal title="Add item" submit="Add item" msg={msg} onClose={() => setDialog(null)} width={480}
                   onSubmit={(e) => { e.preventDefault(); run(() => api.addStockItem({ name, category, unit }), `${name} added.`, () => setName("")); }}>
          <div className="erp-form">
            <EF label="Name" req><input className="erp-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></EF>
            <div className="erp-grid-2">
              <EF label="Kind"><select className="erp-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {STOCK_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></EF>
              <EF label="Unit" req><input className="erp-input" required value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} /></EF>
            </div>
          </div>
        </FormModal>
      )}

      {dialog === "buy" && item && (
        <FormModal title={`Buy · ${item.name}`} submit="Add to stock" msg={msg} onClose={() => setDialog(null)} width={480}
                   onSubmit={(e) => { e.preventDefault();
                     run(() => api.stockIn(item.id, { date, qty: Number(inQty), unitPrice: Number(inPrice), currency: inCur }),
                         `Added ${inQty} ${item.unit}.`, () => { setInQty(""); setInPrice(""); }); }}>
          <div className="erp-form">
            <div className="erp-grid-2">
              <EF label={`Quantity (${item.unit})`} req><input className="erp-input" required autoFocus inputMode="decimal" value={inQty} onChange={(e) => setInQty(e.target.value)} /></EF>
              <EF label={`Price per ${item.unit}`} req><input className="erp-input" required inputMode="decimal" value={inPrice} onChange={(e) => setInPrice(e.target.value)} /></EF>
              <EF label="Currency"><select className="erp-select" value={inCur} onChange={(e) => setInCur(e.target.value as "USD" | "KHR")}>
                <option value="USD">US dollar</option><option value="KHR">Riel</option></select></EF>
              <EF label="Date" req><input className="erp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></EF>
            </div>
            <p className="erp-hint">Counted as a cost when used, at the average price.</p>
          </div>
        </FormModal>
      )}

      {dialog === "use" && item && (
        <FormModal title={`Use · ${item.name}`} submit="Use it" msg={msg} onClose={() => setDialog(null)} width={480}
                   onSubmit={(e) => { e.preventDefault();
                     if (!cycleId) { setMsg({ kind: "alert", text: "Start a crop first." }); return; }
                     run(() => api.stockUse(item.id, { date, qty: Number(useQty), plantingId: cycleId }),
                         `Used ${useQty} ${item.unit}. Cost added.`, () => setUseQty("")); }}>
          <div className="erp-form">
            <EF label="On which crop" req>
              <select className="erp-select" value={cycleId} onChange={(e) => setUseCycle(e.target.value)}>
                {open.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
              </select>
            </EF>
            <div className="erp-grid-2">
              <EF label={`Quantity (${item.unit})`} req hint={`${num(item.qtyOnHand, 3)} ${item.unit} on hand`}>
                <input className="erp-input" required autoFocus inputMode="decimal" value={useQty} onChange={(e) => setUseQty(e.target.value)} />
              </EF>
              <EF label="Date" req><input className="erp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></EF>
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
