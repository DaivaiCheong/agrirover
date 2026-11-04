import { useState } from "react";
import { Empty, Field, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { CATEGORY_LABELS, STOCK_CATEGORIES, cycleLabel, num, todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

export default function Stock() {
  const items = useData(api.stockItems);
  const cycles = useData(api.cycles);
  const [selected, setSelected] = useState<string | null>(null);
  const moves = useData(() => (selected ? api.stockMoves(selected) : Promise.resolve([])), [selected]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("fertilizer");
  const [unit, setUnit] = useState("kg");
  const [inQty, setInQty] = useState("");
  const [inPrice, setInPrice] = useState("");
  const [inCur, setInCur] = useState<"USD" | "KHR">("USD");
  const [useQty, setUseQty] = useState("");
  const [useCycle, setUseCycle] = useState("");
  const [date, setDate] = useState(todayIso());
  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  const item = (items.data ?? []).find((i) => i.id === selected) ?? null;
  const open = (cycles.data ?? []).filter((c) => c.status === "active");
  const cycleId = useCycle || open[0]?.id || "";

  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); setMsg({ kind: "ok", text: ok }); items.reload(); moves.reload(); }
    catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  return (
    <>
      <PageHead crumb="STOCK" kicker="SEED, FERTILIZER, PESTICIDE AND MATERIALS IN THE SHED" title="STOCK" />
      <main className="main stack">
        <Notice>
          Buying stock is not a cost yet. The cost is counted when you <b>use</b> it on a cycle, at the average price you paid.
        </Notice>
        {items.error && <Notice kind="alert">{items.error}</Notice>}

        <div className="grid g32">
          <Panel title="IN THE SHED" pad={false}>
            {(items.data ?? []).length === 0 ? <Empty>Nothing in stock yet. Add an item.</Empty> : (
              <table className="tbl">
                <thead><tr><th>ITEM</th><th>KIND</th><th className="r">ON HAND</th><th className="r">AVG PRICE</th><th className="r">VALUE</th></tr></thead>
                <tbody>
                  {(items.data ?? []).map((i) => (
                    <tr key={i.id} className={`pickable${i.id === selected ? " picked" : ""}`} onClick={() => setSelected(i.id)}>
                      <td><b>{i.name}</b></td><td>{CATEGORY_LABELS[i.category]}</td>
                      <td className="r">{num(i.qtyOnHand, 3)} {i.unit}</td>
                      <td className="r">{usd(i.avgUnitCostUsd, 4)}</td><td className="r">{usd(i.valueUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="ADD AN ITEM">
            <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => api.addStockItem({ name, category, unit }), `${name} added.`).then(() => setName("")); }}>
              <Field label="NAME"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <div className="row2">
                <Field label="KIND"><select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {STOCK_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></Field>
                <Field label="UNIT"><input required value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} /></Field>
              </div>
              <div><button className="btn btn-ghost">Add item</button></div>
            </form>
          </Panel>
        </div>

        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

        {item ? (
          <div className="grid g2">
            <Panel title={`BUY · ${item.name.toUpperCase()}`}>
              <form className="form" onSubmit={(e) => { e.preventDefault();
                run(() => api.stockIn(item.id, { date, qty: Number(inQty), unitPrice: Number(inPrice), currency: inCur }),
                    `Added ${inQty} ${item.unit} to stock.`).then(() => { setInQty(""); setInPrice(""); }); }}>
                <div className="row3">
                  <Field label={`QUANTITY (${item.unit})`}><input required inputMode="decimal" value={inQty} onChange={(e) => setInQty(e.target.value)} /></Field>
                  <Field label={`PRICE PER ${item.unit.toUpperCase()}`}><input required inputMode="decimal" value={inPrice} onChange={(e) => setInPrice(e.target.value)} /></Field>
                  <Field label="CURRENCY"><select value={inCur} onChange={(e) => setInCur(e.target.value as "USD" | "KHR")}>
                    <option value="USD">US dollar</option><option value="KHR">Riel</option></select></Field>
                </div>
                <Field label="DATE"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <div><button className="btn">Add to stock</button></div>
              </form>
            </Panel>

            <Panel title={`USE · ${item.name.toUpperCase()}`}>
              {open.length === 0 ? <Empty>Start a crop cycle first, then you can use stock on it.</Empty> : (
                <form className="form" onSubmit={(e) => { e.preventDefault();
                  run(() => api.stockUse(item.id, { date, qty: Number(useQty), plantingId: cycleId }),
                      `Used ${useQty} ${item.unit}. The cost is now on the cycle.`).then(() => setUseQty("")); }}>
                  <Field label="ON WHICH CYCLE">
                    <select value={cycleId} onChange={(e) => setUseCycle(e.target.value)}>
                      {open.map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
                    </select>
                  </Field>
                  <Field label={`QUANTITY USED (${item.unit})`} hint={`${num(item.qtyOnHand, 3)} ${item.unit} on hand`}>
                    <input required inputMode="decimal" value={useQty} onChange={(e) => setUseQty(e.target.value)} />
                  </Field>
                  <div><button className="btn">Use it</button></div>
                </form>
              )}
            </Panel>
          </div>
        ) : (items.data ?? []).length > 0 && <Notice>Click an item in the list to buy more of it or use it.</Notice>}

        {item && (
          <Panel title={`HISTORY · ${item.name.toUpperCase()}`} pad={false}>
            {(moves.data ?? []).length === 0 ? <Empty>No movements yet.</Empty> : (
              <table className="tbl">
                <thead><tr><th>DATE</th><th>WHAT</th><th className="r">QUANTITY</th><th className="r">PRICE</th><th /></tr></thead>
                <tbody>
                  {(moves.data ?? []).map((m) => (
                    <tr key={m.id}>
                      <td>{m.date}</td>
                      <td>{m.kind === "in" ? <Tag kind="ok">BOUGHT</Tag> : <Tag kind="warn">USED</Tag>}</td>
                      <td className="r">{num(m.qty, 3)} {item.unit}</td><td className="r">{usd(m.unitCostUsd, 4)}</td>
                      <td className="act">{m.kind === "out" && <button className="linkbtn linkbtn-alert" onClick={() => {
                        if (window.confirm("Undo this use? The stock goes back and the cost is removed.")) run(() => api.undoStockUse(m.id), "Use undone.");
                      }}>Undo</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        )}
      </main>
    </>
  );
}
