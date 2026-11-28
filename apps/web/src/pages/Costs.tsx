import { useMemo, useState, type FormEvent } from "react";
import { Download, Package, Plus, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { EF, Empty, ErrorNotice, FormModal, Kpis, Panel, Tag, Toolbar, failMsg, type FormMsg } from "../components/ui";
import { api, type CostInput } from "../lib/api";
import { useFarmFocus } from "../lib/farmContext";
import { CATEGORY_LABELS, ENTRY_CATEGORIES, cycleLabel, remember, todayIso, usd } from "../lib/format";
import { errorText, useAddCost, useCosts, useCycles, useDeleteCost, useSettings } from "../lib/queries";

const FARM_LEVEL = "";

/** Every cost, by crop: what was typed here and what came from stock used on a crop. */
export default function Costs() {
  const cycles = useCycles();
  const costs = useCosts();
  const del = useDeleteCost();
  const { zone } = useFarmFocus();
  const [filter, setFilter] = useState<string>(() => (zone ? cycles.data?.find((c) => c.zone === zone && c.status === "active")?.id ?? "" : ""));
  const [adding, setAdding] = useState(false);

  const byId = useMemo(() => new Map((cycles.data ?? []).map((c) => [c.id, c])), [cycles.data]);
  const rows = (costs.data ?? []).filter((r) => (filter === "farm" ? !r.plantingId : !filter || r.plantingId === filter));
  const total = rows.reduce((s, r) => s + r.amountUsd, 0);
  const fromStock = rows.filter((r) => r.source === "stock_use").reduce((s, r) => s + r.amountUsd, 0);
  const byKind = new Map<string, number>();
  rows.forEach((r) => byKind.set(r.category, (byKind.get(r.category) ?? 0) + r.amountUsd));
  const top = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <Toolbar>
        <select className="erp-select toolbar-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show costs for">
          <option value="">All crops and the farm</option>
          {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
          <option value="farm">Whole farm (overhead)</option>
        </select>
        <a className="btn btn-ghost btn-sm" href={api.costsCsvUrl}><Download size={15} aria-hidden />CSV</a>
        <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />Add cost</button>
      </Toolbar>
      <main className="main stack">
        {costs.error && <ErrorNotice error={errorText(costs.error)} onRetry={() => costs.refetch()} />}
        <Kpis
          loading={costs.isPending}
          items={[
            { k: "Total", icon: ReceiptText, v: usd(total), d: `${rows.length} entries` },
            { k: "From stock", icon: Package, v: usd(fromStock), d: <Link className="linkbtn small" to="/stock">Stock used on crops →</Link> },
            { k: "Largest kind", v: top ? CATEGORY_LABELS[top[0]] ?? top[0] : "—", d: top ? usd(top[1]) : "" },
            { k: "Feeds", v: "Cost reports", d: <Link className="linkbtn small" to="/cop">Every crop's cost per kg →</Link> },
          ]}
        />

        <Panel title="Cost ledger" pad={false}>
          {rows.length === 0 ? (
            <Empty icon={ReceiptText}>
              {costs.isPending ? "Loading…" : <>No cost recorded{filter ? " here" : ""}. Seedlings, fertilizer, labour and fuel go here, by crop. <button className="linkbtn" onClick={() => setAdding(true)}>Add one</button></>}
            </Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold costs-t">
                <thead><tr><th>Date</th><th>For</th><th>Kind</th><th>Description</th><th className="r">Amount</th><th className="r">USD</th><th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap"><b>{r.date}</b></td>
                      <td data-label="For">{r.plantingId ? byId.get(r.plantingId)?.bedLabel ?? "—" : "Whole farm"}</td>
                      <td data-label="Kind">{CATEGORY_LABELS[r.category] ?? r.category}{r.source === "stock_use" && <> <Tag>Stock</Tag></>}{r.sample && <> <Tag>Sample</Tag></>}</td>
                      <td data-label="Description">{r.description ?? "—"}</td>
                      <td data-label="Amount" className="r nowrap">{r.currency === "KHR" ? `${r.amount.toLocaleString()} ៛` : usd(r.amount)}</td>
                      <td data-label="USD" className="r"><b>{usd(r.amountUsd)}</b></td>
                      <td className="act">
                        {r.source === "manual" ? (
                          <button className="linkbtn linkbtn-alert" disabled={del.isPending}
                                  onClick={() => window.confirm(`Delete this ${usd(r.amountUsd)} cost? It is hidden from the reports, not erased.`) && del.mutate(r.id)}>
                            Delete
                          </button>
                        ) : (
                          <Link className="linkbtn small" to="/stock" title="Undo the stock use to remove this cost">Undo in Stock</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
      {adding && <AddCostDialog defaultCycle={filter && filter !== "farm" ? filter : null} onClose={() => setAdding(false)} />}
    </>
  );
}

function AddCostDialog({ defaultCycle, onClose }: { defaultCycle: string | null; onClose: () => void }) {
  const cycles = useCycles();
  const settings = useSettings();
  const add = useAddCost();
  const open = (cycles.data ?? []).filter((c) => c.status === "active");
  const [cycle, setCycle] = useState<string>(() => {
    const last = remember.get("cycle");
    return defaultCycle ?? (last !== null && (last === FARM_LEVEL || open.some((c) => c.id === last)) ? last : open[0]?.id ?? FARM_LEVEL);
  });
  const [category, setCategory] = useState(remember.get("category") ?? "seed");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "KHR">((remember.get("currency") as "USD" | "KHR") ?? "USD");
  const [msg, setMsg] = useState<FormMsg>(null);
  const n = (v: string) => (v === "" ? undefined : Number(v));
  const family = category === "labour_family";

  async function save(e: FormEvent) {
    e.preventDefault();
    const body: CostInput = {
      plantingId: cycle || null, date, category, description: description || undefined,
      qty: n(qty), unit: unit || undefined, unitPrice: n(price), amount: n(amount), currency,
    };
    try {
      const made = await add.mutateAsync(body);
      remember.set("category", category); remember.set("currency", currency); remember.set("cycle", cycle);
      setMsg({ kind: "ok", text: `Saved ${usd(made.amountUsd)}${made.currency === "KHR" ? ` (${made.amount.toLocaleString()} ៛)` : ""}. The crop's cost report is updated.` });
      setDescription(""); setQty(""); setPrice(""); setAmount("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }

  return (
    <FormModal title="Add a cost" submit="Save cost" msg={msg} onClose={onClose} onSubmit={save} busy={add.isPending}>
      <div className="erp-form">
        <div className="erp-grid-2">
          <EF label="For" req>
            <select className="erp-select" value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {(cycles.data ?? []).map((c) => <option key={c.id} value={c.id}>{cycleLabel(c)}</option>)}
              <option value={FARM_LEVEL}>Whole farm (shared by the crops growing that day)</option>
            </select>
          </EF>
          <EF label="Kind" req hint={family ? `Enter days: the wage ($${settings.data?.familyWageUsdPerDay ?? "?"} a day) comes from Settings.` : undefined}>
            <select className="erp-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {ENTRY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </EF>
        </div>
        <div className="erp-grid-3">
          <EF label={family ? "Days" : "Quantity"}><input className="erp-input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></EF>
          <EF label="Unit"><input className="erp-input" placeholder={family ? "day" : "kg, L, bag"} value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} /></EF>
          <EF label="Price per unit"><input className="erp-input" inputMode="decimal" placeholder={family ? "from Settings" : ""} value={price} onChange={(e) => setPrice(e.target.value)} /></EF>
        </div>
        <div className="erp-grid-3">
          <EF label="Or the whole amount"><input className="erp-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></EF>
          <EF label="Currency">
            <select className="erp-select" value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "KHR")}>
              <option value="USD">US dollar</option><option value="KHR">Riel</option>
            </select>
          </EF>
          <EF label="Date" req><input className="erp-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></EF>
        </div>
        <EF label="Description"><input className="erp-input" value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} /></EF>
        <p className="small muted">Inputs from your shed go through Farm › Stock › Use: that books the cost here at the price you paid.</p>
      </div>
    </FormModal>
  );
}
