import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Leaf, Plus } from "lucide-react";
import { EF, Empty, FormModal, Kpis, Notice, Panel, Tag, Toolbar, type FormMsg } from "../components/ui";
import { api, loadProblem, type LeafOverview, type LeafSample, type LeafStatus } from "../lib/api";
import { dayMonthYear, todayIso } from "../lib/format";
import { rangeIn, resultLine, toValues } from "../lib/leaf";
import { useData } from "../lib/useData";

function Status({ status }: { status: LeafStatus }) {
  if (status === "low") return <Tag kind="warn"><ArrowDown size={12} aria-hidden />Low</Tag>;
  if (status === "high") return <Tag kind="warn"><ArrowUp size={12} aria-hidden />High</Tag>;
  if (status === "check") return <Tag kind="warn">Check unit</Tag>;
  if (status === "none") return <span className="muted">No range</span>;
  return <span className="muted">OK</span>;
}

function NewSample({ blocks, onClose, onSaved }: { blocks: LeafOverview["blocks"]; onClose: () => void; onSaved: () => void }) {
  const [zone, setZone] = useState(blocks[0]?.zone ?? "");
  const [takenOn, setTakenOn] = useState(todayIso());
  const [from, setFrom] = useState<"block" | "tree">("block");
  const [row, setRow] = useState("");
  const [col, setCol] = useState("");
  const [pairs, setPairs] = useState("12");
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.addLeafSample({
        zone, takenOn, leafPairs: Number(pairs), row: from === "tree" ? Number(row) - 1 : null, col: from === "tree" ? Number(col) - 1 : null,
        collectedBy: by || null, note: note || null,
      });
      setNote(""); setRow(""); setCol("");
      setMsg({ kind: "ok", text: "Saved" });
      onSaved();
    } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  return (
    <FormModal title="New leaf sample" submit="Save sample" onClose={onClose} onSubmit={save} msg={msg}>
      <EF label="Block" req>
        <select className="erp-select" value={zone} required onChange={(e) => setZone(e.target.value)}>
          {blocks.map((b) => <option key={b.zone} value={b.zone}>{b.label}{b.variety ? ` · ${b.variety}` : ""} · {b.stage}</option>)}
        </select>
      </EF>
      <EF label="Date taken" req><input className="erp-input" type="date" required value={takenOn} max={todayIso()} onChange={(e) => setTakenOn(e.target.value)} /></EF>
      <EF label="Leaves from" req>
        <select className="erp-select" value={from} onChange={(e) => setFrom(e.target.value as "block" | "tree")}>
          <option value="block">Across the block</option>
          <option value="tree">One tree</option>
        </select>
      </EF>
      {from === "tree" && (
        <div className="grid g2">
          <EF label="Row" req><input className="erp-input" type="number" min={1} step={1} required value={row} onChange={(e) => setRow(e.target.value)} /></EF>
          <EF label="Tree" req><input className="erp-input" type="number" min={1} step={1} required value={col} onChange={(e) => setCol(e.target.value)} /></EF>
        </div>
      )}
      <EF label="Leaf pairs" req hint="Third pair from the branch end, mid-canopy, at full flowering. At least 12 pairs.">
        <input className="erp-input" type="number" min={1} max={1000} step={1} required value={pairs} onChange={(e) => setPairs(e.target.value)} />
      </EF>
      <EF label="Collected by"><input className="erp-input" maxLength={80} value={by} onChange={(e) => setBy(e.target.value)} /></EF>
      <EF label="Note"><input className="erp-input" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></EF>
    </FormModal>
  );
}

function Results({ s, view, onClose, onSaved }: { s: LeafSample; view: LeafOverview; onClose: () => void; onSaved: () => void }) {
  const saved = new Map(s.results.map((r) => [r.nutrient, r]));
  const majors = new Set(view.nutrients.filter((n) => n.base === "g/kg").map((n) => n.code));
  const [unit, setUnit] = useState(s.results.find((r) => majors.has(r.nutrient))?.unit ?? "g/kg");
  const [typed, setTyped] = useState<Record<string, string>>(Object.fromEntries(s.results.map((r) => [r.nutrient, String(r.value)])));
  const [lab, setLab] = useState(s.lab ?? "");
  const [on, setOn] = useState(s.resultsOn ?? todayIso());
  const [msg, setMsg] = useState<FormMsg>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const values = toValues(view.nutrients, typed, unit);
    try {
      await api.saveLeafResults(s.id, { lab: lab || null, resultsOn: values.length ? on : null, values });
      onSaved();
      onClose();
    } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  return (
    <FormModal title="Lab result" submit="Save result" onClose={onClose} onSubmit={save} msg={msg} width={620}>
      <p className="small muted">{s.zoneLabel ?? "—"}{s.tree ? ` · ${s.tree}` : ""} · taken {dayMonthYear(s.takenOn)} · {s.stage}, day {s.cropDay} · {s.leafPairs} leaf pairs</p>
      {!s.atBloom && <p className="small"><Tag>Not at flowering</Tag> <span className="muted">The ranges come from leaves taken at flowering.</span></p>}
      <div className="grid g2">
        <EF label="Lab"><input className="erp-input" maxLength={120} value={lab} onChange={(e) => setLab(e.target.value)} /></EF>
        <EF label="Result date"><input className="erp-input" type="date" min={s.takenOn} max={todayIso()} value={on} onChange={(e) => setOn(e.target.value)} /></EF>
      </div>
      <EF label="N, P, K, Ca, Mg and S reported in">
        <select className="erp-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="g/kg">g/kg</option>
          <option value="%">%</option>
        </select>
      </EF>
      <div className="tablewrap">
        <table className="tbl leaf-entry">
          <thead><tr><th>Nutrient</th><th>Result</th><th>Status</th></tr></thead>
          <tbody>
            {view.nutrients.map((n) => {
              const u = n.base === "g/kg" ? unit : "mg/kg";
              const was = saved.get(n.code);
              const same = was && typed[n.code] === String(was.value) && (was.unit === u || (was.unit === "ppm" && u === "mg/kg"));
              return (
                <tr key={n.code}>
                  <td><b>{n.symbol}</b> <span className="small muted">{n.name}</span><div className="small muted nowrap leaf-range">{rangeIn(n, u)} {n.range ? u : `· ${u}`}</div></td>
                  <td><input className="erp-input" type="number" min={0} step="any" inputMode="decimal" aria-label={`${n.name} result`} value={typed[n.code] ?? ""}
                             onChange={(e) => setTyped({ ...typed, [n.code]: e.target.value })} /></td>
                  <td>{same ? <Status status={was.status} /> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">{view.rangeSource}. Leave blank what the lab did not report.</p>
    </FormModal>
  );
}

function Compare({ view }: { view: LeafOverview }) {
  const cols = view.compare;
  const rows = view.nutrients.filter((n) => cols.some((c) => c.values[n.code]));
  return (
    <Panel title="Blocks compared" pad={false} right={<span className="small muted">Newest result from across each block</span>}>
      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nutrient</th><th>Range</th>
              {cols.map((c) => <th key={c.zone} className="r">{c.label}<div className="small muted leaf-col">{dayMonthYear(c.takenOn)} · {c.stage}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.code}>
                <td className="nowrap"><b>{n.symbol}</b> <span className="small muted">{n.base}</span></td>
                <td className="small muted nowrap">{rangeIn(n, n.base)}</td>
                {cols.map((c) => {
                  const v = c.values[n.code];
                  return (
                    <td key={c.zone} className="r nowrap">
                      {v ? <>{v.inBase} {v.status === "low" && <ArrowDown size={12} aria-label="low" />}{v.status === "high" && <ArrowUp size={12} aria-label="high" />}{v.status === "check" && <Tag kind="warn">Check unit</Tag>}</> : <span className="muted">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function LeafTests() {
  const { data: v, error, reload } = useData(api.leafTests);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<LeafSample | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function remove(s: LeafSample) {
    if (!window.confirm(`Delete this sample from ${s.zoneLabel ?? "the block"}, and its lab result? This cannot be undone.`)) return;
    try { await api.deleteLeafSample(s.id); setListError(null); reload(); }
    catch (err) { setListError((err as Error).message); }
  }

  return (
    <>
      <Toolbar>
        <button type="button" className="btn btn-sm" disabled={!v?.blocks.length} onClick={() => setAdding(true)}><Plus size={16} aria-hidden />New sample</button>
      </Toolbar>
      <main className="main stack">
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}
        {listError && <Notice kind="alert">{listError}</Notice>}
        {v && v.total > 0 && (
          <Kpis items={[
            { k: "Samples", v: v.total },
            { k: "Waiting for lab", v: v.waiting },
            { k: "With results", v: v.withResults },
            { k: "Outside range", v: v.outOfRange },
          ]} />
        )}
        {v && v.compare.length > 0 && <Compare view={v} />}
        {v && (
          <Panel title="Samples" pad={false} right={<span className="small muted">Advice does not use these yet</span>}>
            {v.samples.length === 0 ? (
              <Empty icon={Leaf}>No leaf samples yet.</Empty>
            ) : (
              <div className="tablewrap">
                <table className="tbl fold">
                  <thead><tr><th>Block</th><th>Taken</th><th>Leaves</th><th>Stage</th><th>Lab</th><th>Result</th><th /></tr></thead>
                  <tbody>
                    {v.samples.map((s) => (
                      <tr key={s.id}>
                        <td><b>{s.zoneLabel ?? "—"}</b>{s.variety && <div className="small muted">{s.variety}</div>}</td>
                        <td data-label="Taken" className="nowrap">{dayMonthYear(s.takenOn)}</td>
                        <td data-label="Leaves">{s.tree ?? "Across the block"}<div className="small muted">{s.leafPairs} pairs{s.collectedBy ? ` · ${s.collectedBy}` : ""}</div></td>
                        <td data-label="Stage" className="nowrap">{s.stage}, day {s.cropDay}{!s.atBloom && <div><Tag>Not at flowering</Tag></div>}</td>
                        <td data-label="Lab">{s.lab ?? "—"}{s.resultsOn && <div className="small muted">{dayMonthYear(s.resultsOn)}</div>}</td>
                        <td data-label="Result">{s.results.length === 0 ? <span className="muted">{resultLine(s)}</span> : <b>{resultLine(s)}</b>}</td>
                        <td className="act nowrap">
                          <button type="button" className="linkbtn" onClick={() => setOpen(s)}>{s.results.length ? "Open" : "Enter result"}</button>{" "}
                          <button type="button" className="linkbtn" onClick={() => remove(s)}>Delete</button>
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
      {adding && v && <NewSample blocks={v.blocks} onClose={() => setAdding(false)} onSaved={reload} />}
      {open && v && <Results key={open.id} s={open} view={v} onClose={() => setOpen(null)} onSaved={reload} />}
    </>
  );
}
