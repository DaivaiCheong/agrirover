import { useState, type FormEvent } from "react";
import { FlaskConical, Plus, TestTubes } from "lucide-react";
import { EF, Empty, ErrorNotice, FormModal, Kpis, Panel, Tag, Toolbar, failMsg, type FormMsg } from "../components/ui";
import type { LeafOverview, LeafSample, LeafStatus } from "../lib/api";
import { useFarmFocus } from "../lib/farmContext";
import { todayIso } from "../lib/format";
import { errorText, useAddLeafSample, useDeleteLeafSample, useLeafTests, useSaveLeafResults } from "../lib/queries";

const KIND: Record<LeafStatus, string | undefined> = { low: "warn", high: "warn", ok: "ok", check: undefined, none: undefined };

/** Leaf samples sent to a lab, and what came back, rated against the tomato ranges. */
export default function LeafTests() {
  const leaf = useLeafTests();
  const del = useDeleteLeafSample();
  const [adding, setAdding] = useState(false);
  const [resultsFor, setResultsFor] = useState<LeafSample | null>(null);
  const o = leaf.data;

  return (
    <>
      <Toolbar>
        <button className="btn btn-sm" onClick={() => setAdding(true)} disabled={!o?.blocks.length}><Plus size={16} aria-hidden />Record a sample</button>
      </Toolbar>
      <main className="main stack">
        {leaf.error && <ErrorNotice error={errorText(leaf.error)} onRetry={() => leaf.refetch()} />}
        <Kpis
          loading={leaf.isPending}
          items={[
            { k: "Samples", icon: TestTubes, v: o?.total ?? 0, d: `${o?.withResults ?? 0} with lab results` },
            { k: "At the lab", tone: o?.waiting ? "warn" : undefined, v: o?.waiting ?? 0, d: "Enter the results when they come back" },
            { k: "Out of range", tone: o?.outOfRange ? "warn" : "ok", v: o?.outOfRange ?? 0, d: "Samples with a nutrient low or high" },
            { k: "Ranges", icon: FlaskConical, v: `${o?.nutrients.length ?? 0} nutrients`, d: o?.rangeSource ?? "" },
          ]}
        />

        {o && o.compare.length > 0 && (
          <Panel title="Latest result per bed" icon={FlaskConical} pad={false}>
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Bed</th><th>Sampled</th>
                    {o.nutrients.map((n) => <th key={n.symbol} className="r keep-case">{n.symbol} <small>{n.range ? `${n.range[0]}–${n.range[1]} ${n.base}` : ""}</small></th>)}
                  </tr>
                </thead>
                <tbody>
                  {o.compare.map((c) => (
                    <tr key={c.zone}>
                      <td><b>{c.label}</b><div className="small muted">{c.variety ?? ""}</div></td>
                      <td className="nowrap">{c.takenOn}<div className="small muted">{c.stage}</div></td>
                      {o.nutrients.map((n) => {
                        const v = c.values[n.symbol];
                        return <td key={n.symbol} className="r">{v ? <Tag kind={KIND[v.status]}>{v.inBase.toFixed(2)}</Tag> : <span className="muted">—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <Panel title="Samples" icon={TestTubes} pad={false}>
          {(o?.samples ?? []).length === 0 ? (
            <Empty icon={TestTubes}>{leaf.isPending ? "Loading…" : "No sample yet. Take 20–30 leaf pairs of the youngest fully open leaves at first flowering."}</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>Taken</th><th>Bed</th><th>Stage</th><th className="r">Leaf pairs</th><th>Result</th><th /></tr></thead>
                <tbody>
                  {o!.samples.map((s) => (
                    <tr key={s.id}>
                      <td className="nowrap"><b>{s.takenOn}</b></td>
                      <td data-label="Bed">{s.zoneLabel ?? s.zone}{s.tree ? ` · ${s.tree}` : ""}<div className="small muted">{s.collectedBy ?? ""}</div></td>
                      <td data-label="Stage">{s.cropDay ? `Day ${s.cropDay}` : ""}{s.stage ? ` · ${s.stage}` : ""}{s.atBloom && <> <Tag kind="ok">At bloom</Tag></>}</td>
                      <td data-label="Leaf pairs" className="r">{s.leafPairs}</td>
                      <td data-label="Result">
                        {s.results.length === 0 ? <Tag kind="warn">At the lab</Tag> : (
                          <span className="chips">
                            {s.results.map((r) => <Tag key={r.symbol} kind={KIND[r.status]}>{r.symbol} {r.inBase.toFixed(2)}{r.base}</Tag>)}
                          </span>
                        )}
                        {s.lab && <div className="small muted">{s.lab}{s.resultsOn ? `, ${s.resultsOn}` : ""}</div>}
                      </td>
                      <td className="act">
                        <button className="linkbtn" onClick={() => setResultsFor(s)}>{s.results.length ? "Edit results" : "Enter results"}</button>{" "}
                        <button className="linkbtn linkbtn-alert" disabled={del.isPending}
                                onClick={() => window.confirm(`Delete the ${s.takenOn} sample of ${s.zoneLabel ?? s.zone}?`) && del.mutate(s.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
      {adding && o && <SampleDialog overview={o} onClose={() => setAdding(false)} />}
      {resultsFor && o && <ResultsDialog sample={resultsFor} overview={o} onClose={() => setResultsFor(null)} />}
    </>
  );
}

function SampleDialog({ overview, onClose }: { overview: LeafOverview; onClose: () => void }) {
  const add = useAddLeafSample();
  const { zone: focusZone } = useFarmFocus();
  const [zone, setZone] = useState(overview.blocks.find((b) => b.zone === focusZone)?.zone ?? overview.blocks[0]?.zone ?? "");
  const [takenOn, setTakenOn] = useState(todayIso());
  const [pairs, setPairs] = useState("25");
  const [row, setRow] = useState("");
  const [col, setCol] = useState("");
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await add.mutateAsync({
        zone, takenOn, leafPairs: Number(pairs),
        row: row ? Number(row) - 1 : null, col: col ? Number(col) - 1 : null,
        collectedBy: by || null, note: note || null,
      });
      setMsg({ kind: "ok", text: "Recorded. Enter the results when the lab sends them." });
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title="Record a leaf sample" submit="Save sample" msg={msg} onClose={onClose} onSubmit={save} busy={add.isPending}>
      <div className="erp-form">
        <div className="erp-grid-2">
          <EF label="Bed" req>
            <select className="erp-select" value={zone} onChange={(e) => setZone(e.target.value)}>
              {overview.blocks.map((b) => <option key={b.zone} value={b.zone}>{b.label} · day {b.day}</option>)}
            </select>
          </EF>
          <EF label="Taken on" req><input className="erp-input" type="date" required value={takenOn} onChange={(e) => setTakenOn(e.target.value)} /></EF>
          <EF label="Leaf pairs" req><input className="erp-input" type="number" min={1} required value={pairs} onChange={(e) => setPairs(e.target.value)} /></EF>
          <EF label="Collected by"><input className="erp-input" maxLength={80} value={by} onChange={(e) => setBy(e.target.value)} /></EF>
          <EF label="Row" hint="For one plant only"><input className="erp-input" type="number" min={1} value={row} onChange={(e) => setRow(e.target.value)} /></EF>
          <EF label="Plant in the row"><input className="erp-input" type="number" min={1} value={col} onChange={(e) => setCol(e.target.value)} /></EF>
        </div>
        <EF label="Note"><input className="erp-input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></EF>
      </div>
    </FormModal>
  );
}

function ResultsDialog({ sample, overview, onClose }: { sample: LeafSample; overview: LeafOverview; onClose: () => void }) {
  const save = useSaveLeafResults();
  const existing = new Map(sample.results.map((r) => [r.symbol, r]));
  const [values, setValues] = useState<Record<string, { value: string; unit: string }>>(() =>
    Object.fromEntries(overview.nutrients.map((n) => {
      const r = existing.get(n.symbol);
      return [n.symbol, { value: r ? String(r.value) : "", unit: r?.unit ?? n.base }];
    })));
  const [lab, setLab] = useState(sample.lab ?? "");
  const [resultsOn, setResultsOn] = useState(sample.resultsOn ?? todayIso());
  const [msg, setMsg] = useState<FormMsg>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = Object.entries(values).filter(([, v]) => v.value !== "").map(([nutrient, v]) => ({ nutrient, value: Number(v.value), unit: v.unit }));
    try {
      const doc = await save.mutateAsync({ id: sample.id, body: { lab: lab || null, resultsOn: resultsOn || null, values: list } });
      const off = [...doc.low.map((x) => `${x} low`), ...doc.high.map((x) => `${x} high`)];
      setMsg({ kind: "ok", text: off.length ? `Saved: ${off.join(", ")}.` : "Saved: every nutrient entered is in range." });
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title={`Lab results · ${sample.zoneLabel ?? sample.zone}, ${sample.takenOn}`} submit="Save results" msg={msg} onClose={onClose} onSubmit={submit} busy={save.isPending} width={640}>
      <div className="erp-form">
        <div className="lab-grid">
          {overview.nutrients.map((n) => (
            <EF key={n.symbol} label={`${n.name} (${n.symbol})`} hint={n.range ? `${n.range[0]}–${n.range[1]} ${n.base}` : undefined}>
              <div className="erp-input-group">
                <input className="erp-input" inputMode="decimal" value={values[n.symbol].value}
                       onChange={(e) => setValues({ ...values, [n.symbol]: { ...values[n.symbol], value: e.target.value } })} />
                <select className="erp-select" style={{ width: 82 }} value={values[n.symbol].unit} aria-label={`${n.symbol} unit`}
                        onChange={(e) => setValues({ ...values, [n.symbol]: { ...values[n.symbol], unit: e.target.value } })}>
                  {overview.units.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
            </EF>
          ))}
        </div>
        <div className="erp-grid-2">
          <EF label="Lab"><input className="erp-input" maxLength={120} value={lab} onChange={(e) => setLab(e.target.value)} /></EF>
          <EF label="Results dated"><input className="erp-input" type="date" value={resultsOn} onChange={(e) => setResultsOn(e.target.value)} /></EF>
        </div>
      </div>
    </FormModal>
  );
}
