import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { EF, Empty, FormModal, Kpis, Notice, Panel, Tag, Toolbar, type FormMsg } from "../components/ui";
import { api, type CostInput } from "../lib/api";
import { CATEGORY_LABELS, ENTRY_CATEGORIES, cycleLabel, remember, todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

const FARM_LEVEL = "";

export default function Costs() {
  const cycles = useData(api.cycles);
  const [filter, setFilter] = useState("");
  const costs = useData(() => api.costs(filter || undefined), [filter]);

  const [adding, setAdding] = useState(false);
  const [cycle, setCycle] = useState<string | null>(null);
  const [category, setCategory] = useState(remember.get("category") ?? "seed");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "KHR">((remember.get("currency") as "USD" | "KHR") ?? "USD");
  const [msg, setMsg] = useState<FormMsg>(null);
  const [listError, setListError] = useState<string | null>(null);

  // default to the last cycle used, else the first open one
  useEffect(() => {
    if (cycle !== null || !cycles.data) return;
    const last = remember.get("cycle");
    const open = cycles.data.find((c) => c.status === "active");
    setCycle(last !== null && (last === FARM_LEVEL || cycles.data.some((c) => c.id === last)) ? last : open?.id ?? FARM_LEVEL);
  }, [cycles.data, cycle]);

  const byId = new Map((cycles.data ?? []).map((c) => [c.id, c]));
  const n = (v: string) => (v === "" ? undefined : Number(v));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: CostInput = {
      plantingId: cycle || null, date, category, description: description || undefined,
      qty: n(qty), unit: unit || undefined, unitPrice: n(price), amount: n(amount), currency,
    };
    try {
      const made = await api.addCost(body);
      remember.set("category", category); remember.set("currency", currency); remember.set("cycle", cycle ?? FARM_LEVEL);
      setMsg({ kind: "ok", text: `Saved ${usd(made.amountUsd)}${made.currency === "KHR" ? ` (${made.amount.toLocaleString()} riel)` : ""}.` });
      setDescription(""); setQty(""); setPrice(""); setAmount("");
      costs.reload();
    } catch (err) {
      setMsg({ kind: "alert", text: (err as Error).message });
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this cost? It is hidden, not erased.")) return;
    try { await api.deleteCost(id); costs.reload(); } catch (err) { setListError((err as Error).message); }
  }

  const rows = costs.data ?? [];
  const total = rows.reduce((s, r) => s + r.amountUsd, 0);
  const byKind = new Map<string, number>();
  rows.forEach((r) => byKind.set(r.category, (byKind.get(r.category) ?? 0) + r.amountUsd));
  const top = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <Toolbar>
        <a className="btn btn-ghost btn-sm" href={api.costsCsvUrl}>Download CSV</a>
        <button className="btn btn-sm" onClick={() => { setMsg(null); setAdding(true); }}><Plus size={16} aria-hidden />Add cost</button>
      </Toolbar>
      <main className="main stack">
        {costs.error && <Notice kind="alert">{costs.error}</Notice>}
        {listError && <Notice kind="alert">{listError}</Notice>}

        <Kpis items={[
          { k: "Total", v: usd(total) },
          { k: "Entries", v: rows.length },
          { k: "Largest kind", v: top ? CATEGORY_LABELS[top[0]] ?? top[0] : "—" },
          { k: "Largest amount", v: top ? usd(top[1]) : "—" },
        ]} />

        <Panel title="Costs" pad={false}
               right={
                 <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show costs for">
                   <option value="">All cycles</option>
                   {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
                 </select>}>
          {rows.length === 0 ? <Empty>No costs yet.</Empty> : (
            <div className="tablewrap">
              <table className="tbl fold costs-t">
                <thead><tr><th>Date</th><th>For</th><th>Kind</th><th>Description</th><th className="r">Amount</th><th className="r">USD</th><th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap"><b>{r.date}</b></td>
                      <td data-label="For">{r.plantingId ? byId.get(r.plantingId)?.bedLabel ?? "—" : "Whole farm"}</td>
                      <td data-label="Kind">{CATEGORY_LABELS[r.category] ?? r.category}{r.source === "stock_use" && <> <Tag>Stock</Tag></>}</td>
                      <td data-label="Description">{r.description ?? "—"}</td>
                      <td data-label="Amount" className={`r nowrap${r.currency === "KHR" ? "" : " hide-sm"}`}>{r.currency === "KHR" ? `${r.amount.toLocaleString()} ៛` : usd(r.amount)}</td>
                      <td data-label="USD" className="r"><b>{usd(r.amountUsd)}</b></td>
                      <td className="act">{r.source === "manual" && <button className="linkbtn linkbtn-alert" onClick={() => remove(r.id)}>Delete</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>

      {adding && (
        <FormModal title="Add cost" submit="Save cost" msg={msg} onClose={() => setAdding(false)} onSubmit={save}>
          <div className="erp-form">
            <div className="erp-grid-2">
              <EF label="For" req>
                <select className="erp-select" value={cycle ?? FARM_LEVEL} onChange={(e) => setCycle(e.target.value)}>
                  {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
                  <option value={FARM_LEVEL}>Whole farm (overhead)</option>
                </select>
              </EF>
              <EF label="Kind" req hint={category === "labour_family" ? "Enter days. The price comes from Settings." : undefined}>
                <select className="erp-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {ENTRY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </EF>
            </div>
            <div className="erp-grid-3">
              <EF label="Quantity"><input className="erp-input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></EF>
              <EF label="Unit"><input className="erp-input" placeholder="kg, day, L" value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} /></EF>
              <EF label="Price per unit"><input className="erp-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></EF>
            </div>
            <div className="erp-grid-3">
              <EF label="Or whole amount"><input className="erp-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></EF>
              <EF label="Currency">
                <select className="erp-select" value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "KHR")}>
                  <option value="USD">US dollar</option><option value="KHR">Riel</option>
                </select>
              </EF>
              <EF label="Date" req><input className="erp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></EF>
            </div>
            <EF label="Description"><input className="erp-input" value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} /></EF>
          </div>
        </FormModal>
      )}
    </>
  );
}
