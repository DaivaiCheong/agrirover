import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Calculator, ClipboardCheck, Droplets, FlaskConical, Pencil, Ruler, Sprout, Square, Wheat } from "lucide-react";
import EnvRibbon from "../components/EnvRibbon";
import { CloseCropDialog, EditCropDialog } from "../components/CropDialogs";
import { Empty, ErrorNotice, Kpis, More, PageHead, PageSkeleton, Panel, Tag } from "../components/ui";
import { useFarmFocus } from "../lib/farmContext";
import { litres, num } from "../lib/format";
import { errorText, useFarm, useFruitSize, useJobToggle, useOrchard } from "../lib/queries";
import { usdAndRiel } from "../lib/tomatoFinance";

const JOB_TAG: Record<string, [string | undefined, string]> = {
  done: ["ok", "Done"], due: ["warn", "Due now"], overdue: ["alert", "Overdue"], later: [undefined, "Later"], past: [undefined, "Past"],
};

/** One tomato crop: its stage, its tasks, its feed plan, its plants and its money, all live. */
export default function OrchardCycle() {
  const { id = "" } = useParams();
  const orchard = useOrchard(id);
  const farm = useFarm();
  const { setFocus } = useFarmFocus();
  const toggle = useJobToggle(orchard.data?.cycle.id ?? id);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);

  if (orchard.isPending) return <PageSkeleton />;
  if (orchard.error || !orchard.data) {
    return <main className="main stack"><ErrorNotice error={errorText(orchard.error ?? "not found")} onRetry={() => orchard.refetch()} /></main>;
  }
  const o = orchard.data;
  const cycle = o.cycle;
  const block = farm.blocks.find((b) => b.zone === cycle.zone);
  const plants = farm.allRows.filter((r) => r.zone === cycle.zone && r.plant);
  const advice = o.advice;
  const open = cycle.status === "active";
  const due = o.jobs.filter((j) => j.state === "due" || j.state === "overdue");

  return (
    <>
      <PageHead
        icon={Sprout}
        title={cycle.bedLabel}
        sub={`${cycle.variety ?? "Tomato"} · ${cycle.plantCount ?? "?"} plants · ${cycle.setupLabel ?? "no setup"} · planted ${cycle.plantedOn}${cycle.status === "closed" ? `, closed ${cycle.endedOn}` : ""}`}
        actions={
          <>
            <Link className="btn btn-ghost btn-sm" to="/cycles"><ArrowLeft size={15} aria-hidden />Crops</Link>
            <Link className="btn btn-ghost btn-sm" to={`/rover?zone=${cycle.zone}`} onClick={() => setFocus(cycle.zone)}><Bot size={15} aria-hidden />Rover</Link>
            <Link className="btn btn-ghost btn-sm" to={`/cycles/${cycle.id}`}><Calculator size={15} aria-hidden />Cost report</Link>
            <Link className="btn btn-ghost btn-sm" to="/harvest" onClick={() => setFocus(cycle.zone)}><Wheat size={15} aria-hidden />Harvest</Link>
            {open && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden />Edit</button>}
            {open && <button className="btn btn-ghost btn-sm" onClick={() => setClosing(true)}><Square size={13} aria-hidden />Close</button>}
          </>
        }
      />
      <main className="main stack">
        <Kpis
          items={[
            { k: "Day", icon: Sprout, v: `${o.day} of 110`, d: o.stage.title },
            { k: "Water today", icon: Droplets, tone: "info", v: advice ? (advice.water.paused ? "Paused" : litres(advice.water.litres)) : "—",
              d: advice ? `${advice.treesWatered} plants · ${advice.water.savedLitres > 0 ? `${litres(advice.water.savedLitres)} saved` : "no round yet"}` : "Needs a rover round" },
            { k: "Tasks due", icon: ClipboardCheck, tone: due.length ? "warn" : "ok", v: `${due.length}`, d: due[0]?.title ?? "Nothing due in this stage" },
            { k: "Spent / budget", icon: Calculator, v: block ? `$${block.spentToDateUsd.toFixed(2)}` : "—",
              d: block ? `of $${block.budgetUsd.toFixed(2)} · expected ${num(block.expectedYieldKg, 1)} kg (${usdAndRiel(block.projectedRevenueUsd, farm.rate)})` : "" },
          ]}
        />

        <Panel title="Growth stages" pad={false} right={<span className="small muted">{o.stage.water}</span>}>
          <div className="timeline">
            {o.stages.map((s) => (
              <div key={s.n} className={`tl-step${s.n < o.stage.n ? " tl-done" : s.n === o.stage.n ? " tl-now" : ""}`}>
                <i />
                <span>{s.short}</span>
                <span className="muted">day {s.firstDay}–{s.lastDay}</span>
              </div>
            ))}
          </div>
          <div className="panel-pad small" style={{ borderTop: "1px solid var(--line)" }}>
            <b>This stage:</b> {o.stage.actions} <span className="muted">· Feed: {o.stage.feed}</span>
          </div>
        </Panel>

        <div className="grid g2">
          <Panel title="Tasks" icon={ClipboardCheck} pad={false} right={<span className="small muted">Tick when done: Plan updates</span>}>
            <div className="joblist">
              {o.jobs.map((j) => {
                const [kind, word] = JOB_TAG[j.state] ?? [undefined, j.state];
                const done = j.state === "done";
                return (
                  <label key={j.id} className={`job${done ? " job-done" : ""}`}>
                    <input type="checkbox" checked={done} aria-label={j.title}
                           disabled={!open || toggle.isPending || (j.ongoing && !done && j.state === "later")}
                           onChange={() => toggle.mutate({ job: j.id, done: !done })} />
                    <span>
                      <span className="job-title"><b>{j.title}</b></span>
                      <span className="small muted" style={{ display: "block" }}>{j.detail} · day {j.firstDay}–{j.lastDay}</span>
                    </span>
                    <Tag kind={kind}>{word}</Tag>
                  </label>
                );
              })}
            </div>
            {open && <FruitSize cycleId={cycle.id} mm={o.fruitMm} />}
          </Panel>

          <div className="stack">
            {o.conditions && <EnvRibbon bed={o.conditions} />}
            <Panel title="Feed plan" icon={FlaskConical}>
              <div className="stack small">
                <span><b>Aim:</b> {o.fertigation.aim}</span>
                <span><b>Nitrogen:</b> {o.fertigation.nitrogen}</span>
                {o.fertigation.tanks.map((t) => <span key={t.name}><b>{t.name}:</b> {t.products.join(", ")}</span>)}
                {o.fertigation.clash && <span className="tag tag-warn" style={{ whiteSpace: "normal" }}>{o.fertigation.clash}</span>}
                {o.fertigation.foliar.map((f) => <span key={f.text}><b>Foliar:</b> {f.text}</span>)}
                <span className="muted">Water pH {o.fertigation.waterPh}{advice?.feed ? ` · Today: ${advice.feed.reason}` : ""}</span>
                <More label="Soil targets for tomato">
                  <table className="tbl kv">
                    <tbody>
                      {o.rules.map((r) => <tr key={r.label}><th>{r.label}</th><td>{r.target} <span className="muted">(critical {r.critical})</span><div className="small muted">{r.note}</div></td></tr>)}
                    </tbody>
                  </table>
                </More>
                <More label="Leaf tissue ranges">
                  {o.leafRanges.map((l) => <div key={l.nutrient}>{l.nutrient}: <b>{l.range}</b></div>)}
                  <Link className="linkbtn small" to="/leaf-tests">Record a leaf test →</Link>
                </More>
              </div>
            </Panel>
          </div>
        </div>

        <Panel title={`Plants in ${cycle.bedLabel}`} pad={false} right={<span className="small muted">From the newest rover round</span>}>
          {plants.length === 0 ? (
            <Empty>No round has checked this block yet. <Link to={`/rover?zone=${cycle.zone}`}>Start one on the Rover page</Link>.</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>Plant</th><th>Camera</th><th>Soil</th><th className="r">pH</th><th className="r">Moisture</th><th className="r">N mg/kg</th><th className="r">Water today</th></tr></thead>
                <tbody>
                  {plants.map((p) => (
                    <tr key={p.name}>
                      <td><Link to={`/rover?zone=${p.zone}&plant=${p.name}`}><b>{p.name}</b></Link></td>
                      <td data-label="Camera"><Tag kind={p.vision.status === "healthy" ? "ok" : p.vision.status === "alert" ? "warn" : undefined}>{p.vision.badgeLabel}</Tag></td>
                      <td data-label="Soil" className="small">{p.status === "attention" ? p.issues.join(" · ") : "In range"}</td>
                      <td data-label="pH" className="r">{p.readings.ph !== null ? p.readings.ph.toFixed(2) : "—"}</td>
                      <td data-label="Moisture" className="r">{p.readings.moisture !== null ? `${p.readings.moisture.toFixed(1)}%` : "—"}</td>
                      <td data-label="N" className="r">{p.readings.n !== null ? Math.round(p.readings.n) : "—"}</td>
                      <td data-label="Water" className="r">{p.waterLitres !== null ? `${p.waterLitres} L` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
      {editing && <EditCropDialog cycle={cycle} onClose={() => setEditing(false)} />}
      {closing && <CloseCropDialog cycle={cycle} onClose={() => setClosing(false)} />}
    </>
  );
}

function FruitSize({ cycleId, mm }: { cycleId: string; mm: number | null }) {
  const save = useFruitSize(cycleId);
  const [value, setValue] = useState(mm ? String(mm) : "");
  const [problem, setProblem] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    try {
      await save.mutateAsync(Number(value));
    } catch (err) {
      setProblem(errorText(err));
    }
  }
  return (
    <form className="panel-foot" onSubmit={submit} style={{ justifyContent: "flex-start" }}>
      <Ruler size={15} aria-hidden />
      <label className="small" htmlFor="fruit-mm"><b>Fruit size</b> (widest green fruit, mm)</label>
      <input id="fruit-mm" className="erp-input" style={{ width: 90 }} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn btn-sm btn-ghost" disabled={!value || save.isPending}>Save</button>
      {problem && <span className="erp-msg erp-msg-alert">{problem}</span>}
    </form>
  );
}
