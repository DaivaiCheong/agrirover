import { useEffect, useState } from "react";
import { Empty, Field, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, type CostInput } from "../lib/api";
import { CATEGORY_LABELS, ENTRY_CATEGORIES, cycleLabel, remember, todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

const FARM_LEVEL = "";

export default function Costs() {
  const cycles = useData(api.cycles);
  const [filter, setFilter] = useState("");
  const costs = useData(() => api.costs(filter || undefined), [filter]);

  const [cycle, setCycle] = useState<string | null>(null);
  const [category, setCategory] = useState(remember.get("category") ?? "seed");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "KHR">((remember.get("currency") as "USD" | "KHR") ?? "USD");
  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  // default to the last cycle used, else the first open one
  useEffect(() => {
    if (cycle !== null || !cycles.data) return;
    const last = remember.get("cycle");
    const open = cycles.data.find((c) => c.status === "active");
    setCycle(last !== null && (last === FARM_LEVEL || cycles.data.some((c) => c.id === last)) ? last : open?.id ?? FARM_LEVEL);
  }, [cycles.data, cycle]);

  const byId = new Map((cycles.data ?? []).map((c) => [c.id, c]));
  const num = (v: string) => (v === "" ? undefined : Number(v));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: CostInput = {
      plantingId: cycle || null, date, category, description: description || undefined,
      qty: num(qty), unit: unit || undefined, unitPrice: num(price), amount: num(amount), currency,
    };
    try {
      const made = await api.addCost(body);
      remember.set("category", category); remember.set("currency", currency); remember.set("cycle", cycle ?? FARM_LEVEL);
      setMsg({ kind: "ok", text: `Saved ${usd(made.amountUsd)}${made.currency === "KHR" ? ` (${made.amount.toLocaleString()} riel)` : ""}. Add another.` });
      setDescription(""); setQty(""); setPrice(""); setAmount("");
      costs.reload();
    } catch (err) {
      setMsg({ kind: "alert", text: (err as Error).message });
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this cost? It is hidden, not erased.")) return;
    try { await api.deleteCost(id); costs.reload(); } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  const rows = costs.data ?? [];
  const total = rows.reduce((s, r) => s + r.amountUsd, 0);

  return (
    <>
      <PageHead crumb="COSTS" kicker="EVERY DOLLAR OR RIEL SPENT, IN ONE LIST" title="COSTS"
                actions={<a className="btn btn-ghost btn-sm" href={api.costsCsvUrl}>Download CSV</a>} />
      <main className="main stack">
        <Panel title="ADD A COST">
          <form className="form" onSubmit={save}>
            <div className="row2">
              <Field label="FOR">
                <select value={cycle ?? FARM_LEVEL} onChange={(e) => setCycle(e.target.value)}>
                  {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
                  <option value={FARM_LEVEL}>Whole farm (shared overhead)</option>
                </select>
              </Field>
              <Field label="WHAT KIND">
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {ENTRY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </Field>
            </div>
            <Field label="DESCRIPTION (OPTIONAL)"><input value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} /></Field>
            <div className="row3">
              <Field label="QUANTITY"><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
              <Field label="UNIT (kg, day, L…)"><input value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} /></Field>
              <Field label="PRICE PER UNIT"><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            </div>
            <div className="row3">
              <Field label="OR THE WHOLE AMOUNT" hint="Fill the amount, or quantity and price.">
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="CURRENCY">
                <select value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "KHR")}>
                  <option value="USD">US dollar</option><option value="KHR">Riel</option>
                </select>
              </Field>
              <Field label="DATE"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>
            {category === "labour_family" && (
              <Notice>Family labour: enter the days. The price per day comes from the family wage in Settings.</Notice>
            )}
            <div><button className="btn">Save cost</button></div>
          </form>
          {msg && <div style={{ marginTop: 12 }}><Notice kind={msg.kind}>{msg.text}</Notice></div>}
        </Panel>

        <Panel title={`COST LIST · ${usd(total)} IN THIS LIST`} pad={false}
               right={
                 <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show costs for">
                   <option value="">All cycles</option>
                   {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
                 </select>}>
          {costs.error && <Notice kind="alert">{costs.error}</Notice>}
          {rows.length === 0 ? <Empty>No costs yet. Add the first one above.</Empty> : (
            <table className="tbl">
              <thead><tr><th>DATE</th><th>FOR</th><th>KIND</th><th>DESCRIPTION</th><th className="r">AMOUNT</th><th className="r">USD</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.plantingId ? byId.get(r.plantingId)?.bedLabel ?? "—" : "Whole farm"}</td>
                    <td>{CATEGORY_LABELS[r.category] ?? r.category}{r.source === "stock_use" && <> <Tag>STOCK</Tag></>}</td>
                    <td>{r.description ?? ""}</td>
                    <td className="r">{r.currency === "KHR" ? `${r.amount.toLocaleString()} ៛` : usd(r.amount)}</td>
                    <td className="r"><b>{usd(r.amountUsd)}</b></td>
                    <td className="act">{r.source === "manual" && <button className="linkbtn linkbtn-alert" onClick={() => remove(r.id)}>Delete</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </main>
    </>
  );
}
