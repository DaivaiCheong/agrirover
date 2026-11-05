import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Calculator, CalendarDays, Droplets, FlaskConical, Gauge, Sprout, Wheat, type LucideIcon } from "lucide-react";
import EnvRibbon from "../components/EnvRibbon";
import { DocFlag, OrchardJobs, StageStrip } from "../components/Orchard";
import { Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, type OrchardCycle as View } from "../lib/api";
import { trim } from "../lib/conditions";
import { dayMonth, dayMonthYear, litres, num, riel, usd } from "../lib/format";
import { useData } from "../lib/useData";

type TabId = "jobs" | "targets" | "feed" | "forecast" | "questions";
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "jobs", label: "Jobs", icon: CalendarDays },
  { id: "targets", label: "Targets", icon: Gauge },
  { id: "feed", label: "Fertigation", icon: FlaskConical },
  { id: "forecast", label: "Forecast", icon: Wheat },
  { id: "questions", label: "Open questions", icon: BookOpen },
];

const range = (r: [number, number] | null, unit = "") => (r ? `${trim(r[0])}${r[0] === r[1] ? "" : `–${trim(r[1])}`}${unit}` : "—");

function Targets({ v }: { v: View }) {
  return (
    <div className="stack">
      <Panel title="Each stage" pad={false}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Stage</th><th className="r">Days</th><th className="r">Moisture %</th><th className="r">EC mS/cm</th><th className="r">Share of ETc</th><th className="r">Kc</th><th>Water</th></tr></thead>
            <tbody>
              {v.stages.map((s) => (
                <tr key={s.key} className={s.n === v.stage.n ? "picked" : ""}>
                  <td><b>{s.title}</b></td>
                  <td className="r nowrap">{s.firstDay}–{s.lastDay}</td>
                  <td className="r">{range(s.moisture)}</td>
                  <td className="r">{range(s.ec)}</td>
                  <td className="r">{s.etcPct ? range(s.etcPct, " %") : "None"}</td>
                  <td className="r">{s.kc ?? "—"}</td>
                  <td className="small muted">{s.water}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <DocFlag issues={v.docIssues} n={1} />
      <DocFlag issues={v.docIssues} n={2} />
      <Panel title="Every reading" pad={false}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Reading</th><th>Target</th><th>Critical</th><th>What it means</th></tr></thead>
            <tbody>
              {v.rules.map((r) => <tr key={r.label}><td><b>{r.label}</b></td><td>{r.target}</td><td>{r.critical}</td><td className="small muted">{r.note}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Panel>
      <DocFlag issues={v.docIssues} n={6} />
      <DocFlag issues={v.docIssues} n={10} />
    </div>
  );
}

function Fertigation({ v }: { v: View }) {
  const f = v.fertigation;
  return (
    <div className="stack">
      <Panel title={`Feed now: ${f.aim.toLowerCase()}`} icon={FlaskConical} right={<Tag kind={f.nitrogen === "None" ? "wip" : "info"}>Nitrogen: {f.nitrogen.toLowerCase()}</Tag>}>
        <div className="stack">
          {f.tanks.length > 0 ? (
            <div className="tanks">
              {f.tanks.map((t) => (
                <div key={t.name} className="tank"><div className="lbl lbl-ink">{t.name}</div>{t.products.map((p) => <div key={p} className="small">{p}</div>)}</div>
              ))}
            </div>
          ) : <p className="small muted">Nothing goes through the drip in this stage.</p>}
          {f.clash && <Notice kind="warn">{f.clash}</Notice>}
          {f.phases.length > 0 && (
            <div>
              <div className="lbl lbl-ink" style={{ marginBottom: 6 }}>One run</div>
              <div className="phases">
                {f.phases.map((p, i) => <div key={i} className={`phase phase-${i === 1 ? "feed" : "water"}`} style={{ flexGrow: p.pct }}><b>{p.pct} %</b> {p.label}<div className="small">{p.what}</div></div>)}
              </div>
              <p className="small muted" style={{ marginTop: 6 }}>{f.waterPh}</p>
            </div>
          )}
          {f.soil && <p className="small"><b>Soil:</b> {f.soil}</p>}
          {f.foliar.length > 0 && (
            <ul className="tasklist">
              {f.foliar.map((x) => <li key={x.text}><Sprout size={18} aria-hidden /><span>{x.text} {x.confirm && <Tag kind="warn">Confirm with an agronomist</Tag>}</span></li>)}
            </ul>
          )}
        </div>
      </Panel>
      {v.setup?.orchard && <p className="small muted">Yearly dose for this setup: {v.setup.orchard.npk}.</p>}
    </div>
  );
}

function Forecast({ v }: { v: View }) {
  const f = v.cycle.forecast, o = v.setup?.orchard;
  if (!f || !o || !v.setup) return <Notice>Choose a growing setup to see the forecast.</Notice>;
  return (
    <div className="stack">
      <Panel title={v.setup.label} icon={Wheat} pad={false}>
        <table className="tbl"><tbody>
          <tr><td>Cultivars</td><td className="r">{o.cultivars}</td></tr>
          <tr><td>First harvest</td><td className="r">{o.firstBearing}</td></tr>
          <tr><td>Harvest a year, {f.plants} trees</td><td className="r"><b>{num(f.kgLow, 0)}–{num(f.kgHigh, 0)} kg</b></td></tr>
          <tr><td>Per tree a year</td><td className="r">{v.setup.kgPerPlant[0]}–{v.setup.kgPerPlant[1]} kg</td></tr>
          <tr><td>Benchmark per hectare (document)</td><td className="r">{range(o.tPerHa)} t</td></tr>
          <tr><td>Benchmark per 50 m² (document)</td><td className="r">{num(o.kgPer50m2[0], 0)}–{num(o.kgPer50m2[1], 0)} kg</td></tr>
          <tr><td>Price used</td><td className="r">{f.pricePerKgUsd === null ? "None" : `${usd(f.pricePerKgUsd)} a kg (${riel(f.pricePerKgUsd, 4000)})`}</td></tr>
          <tr><td>Revenue a year</td><td className="r"><b>{f.revenueLowUsd === null || f.revenueHighUsd === null ? "—" : `${usd(f.revenueLowUsd, 0)}–${usd(f.revenueHighUsd, 0)}`}</b></td></tr>
          <tr><td>Drip</td><td className="r">{o.drip}</td></tr>
        </tbody></table>
      </Panel>
      {o.docIssue && <Notice kind="warn"><b>To settle: this setup's yield table.</b> {o.docIssue}</Notice>}
      <DocFlag issues={v.docIssues} n={4} />
      <DocFlag issues={v.docIssues} n={5} />
      <div><Link className="btn btn-sm btn-ghost" to={`/cycles/${v.cycle.id}`}><Calculator size={15} aria-hidden />Cost report</Link></div>
    </div>
  );
}

export default function OrchardCycle() {
  const { id = "" } = useParams();
  const [wanted, setWanted] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<TabId>("jobs");
  const { data: v, error, reload } = useData(() => api.orchardCycle(id, wanted), [id, wanted]);

  const c = v?.cycle, p = c?.perennial;
  const stress = v && p?.stress && v.stage.n === 1;
  const walking = v && v.day !== v.actualDay;
  const dateOf = (day: number) => { const d = new Date(`${c!.plantedOn}T00:00:00`); d.setDate(d.getDate() + day - 1); return d.toLocaleDateString("sv-SE"); };

  async function done(job: string) { await api.orchardJobDone(id, job); reload(); }
  async function fruit(mm: number) { await api.orchardFruitSize(id, mm); reload(); }

  return (
    <>
      <PageHead icon={Sprout} title={c?.bedLabel ?? "Crop cycle"}
                sub={c ? `${c.cropName}${c.variety ? ` (${c.variety})` : ""} · ${c.plantCount} trees · ${c.setupLabel ?? "no setup"}` : undefined}
                actions={<Link className="btn btn-ghost btn-sm" to="/cycles"><ArrowLeft size={16} aria-hidden />My crops</Link>} />
      <main className="main stack">
        {error && <Notice kind="alert">{error}</Notice>}
        {v && c && p && (
          <>
            <Panel title={`Day ${v.day} of ${v.stages[v.stages.length - 1].lastDay}: ${v.stage.title}`} icon={CalendarDays}
                   right={<span className="small muted">{dayMonthYear(dateOf(v.day))}</span>}>
              <div className="stack">
                <StageStrip stages={v.stages} day={v.day} />
                {v.sample && (
                  <div className="walk">
                    <label className="small" htmlFor="walk-day"><b>Walk the cycle</b> (sample only): drag to see what the app says on any day</label>
                    <input id="walk-day" type="range" min={1} max={180} value={v.day} onChange={(e) => setWanted(Number(e.target.value))} />
                    {walking && <button type="button" className="linkbtn" onClick={() => setWanted(undefined)}>Back to today (day {v.actualDay})</button>}
                  </div>
                )}
                <div className="erp-summary-banner" style={{ marginTop: 0 }}>
                  <div className="erp-summary-item"><span className="k">Trees planted</span><span className="v">{dayMonthYear(p.treesPlantedOn)}</span></div>
                  <div className="erp-summary-item"><span className="k">Tree age</span><span className="v">{p.treeAgeYears} years</span></div>
                  <div className="erp-summary-item"><span className="k">How it was started</span><span className="v">{p.regulationLabel}</span></div>
                  <div className="erp-summary-item"><span className="k">Harvest</span><span className="v">{dayMonth(p.harvestFrom)} – {dayMonth(p.harvestTo)}</span></div>
                </div>
                {p.rainyHarvest && <Notice kind="warn">This harvest falls in the rainy months: expect watery fruit, lower sugar and more fruit flies. Starting the cycle earlier or later moves it.</Notice>}
              </div>
            </Panel>

            <div className="grid g2">
              <EnvRibbon bed={v.conditions} />
              <Panel title="What matters now" icon={Droplets}>
                <div className="stack">
                  {stress
                    ? <Notice kind="info"><b>Watering is paused on purpose.</b> Dry soil is the goal here: it stops leaf growth so the trees flower together later. Two priming irrigations end the stress on day {v.stage.lastDay + 1}.</Notice>
                    : (
                      <p className="small">
                        <b>{litres(v.water.litresTotal)} of water today</b>, {v.water.litresPerTree} L a tree.
                        {" "}At {v.water.emitterLphPerTree} L/h a tree that is about <b>{v.water.hoursPerRun} hours</b> of drip.
                        {" "}A planning amount: if the soil is already at its target, skip.
                      </p>
                    )}
                  {!stress && v.water.hoursPerRun > 0 && (
                    <Notice kind="alert">The field node stops any run after {v.water.firmwareLimitSeconds} seconds, so this water cannot be delivered with today's hardware. To decide before the real build.</Notice>
                  )}
                  <p className="small"><b>Water:</b> {v.stage.water}</p>
                  <p className="small"><b>Feed:</b> {v.stage.feed}</p>
                  <p className="small"><b>Do:</b> {v.stage.actions}</p>
                </div>
              </Panel>
            </div>

            <div className="tabs tabs-in" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? " tab-on" : ""}`} onClick={() => setTab(t.id)}>
                  <t.icon size={17} aria-hidden />{t.label}
                </button>
              ))}
            </div>

            {tab === "jobs" && (
              <Panel pad={false}>
                <OrchardJobs jobs={v.jobs} fruitMm={v.fruitMm} onDone={walking ? undefined : done} onFruit={walking ? undefined : fruit} />
                <div className="panel-pad" style={{ borderTop: "1px solid var(--line)" }}>
                  <DocFlag issues={v.docIssues} n={8} />
                </div>
              </Panel>
            )}
            {tab === "targets" && <Targets v={v} />}
            {tab === "feed" && <Fertigation v={v} />}
            {tab === "forecast" && <Forecast v={v} />}
            {tab === "questions" && (
              <Panel title="What the guava document leaves open" icon={BookOpen} pad={false}>
                <table className="tbl"><tbody>
                  {v.docIssues.map((i) => <tr key={i.n}><td className="nowrap"><b>{i.n}. {i.title}</b></td><td>{i.detail}</td></tr>)}
                </tbody></table>
              </Panel>
            )}
          </>
        )}
      </main>
    </>
  );
}
