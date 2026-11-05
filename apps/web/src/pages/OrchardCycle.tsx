import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calculator, Sprout } from "lucide-react";
import EnvRibbon from "../components/EnvRibbon";
import { OrchardJobs, StageStrip } from "../components/Orchard";
import { Kpis, More, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, type OrchardCycle as View } from "../lib/api";
import { trim } from "../lib/conditions";
import { dayMonth, dayMonthYear, litres, num, riel, usd } from "../lib/format";
import { useData } from "../lib/useData";

type TabId = "jobs" | "targets" | "feed" | "forecast" | "questions";

const range = (r: [number, number] | null, unit = "") => (r ? `${trim(r[0])}${r[0] === r[1] ? "" : `–${trim(r[1])}`}${unit}` : "—");

/** The questions the document leaves open that touch this tab: a pointer, not a paragraph. */
function Open({ ns, go }: { ns: number[]; go: () => void }) {
  return <button type="button" className="linkbtn small" onClick={go}>Open questions {ns.join(", ")}</button>;
}

function Targets({ v, go }: { v: View; go: () => void }) {
  return (
    <div className="stack">
      <Panel title="By stage" pad={false} right={<Open ns={[1, 2]} go={go} />}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Stage</th><th className="r">Days</th><th className="r">Moisture %</th><th className="r">EC mS/cm</th><th className="r">% of ETc</th><th className="r">Kc</th></tr></thead>
            <tbody>
              {v.stages.map((s) => (
                <tr key={s.key} className={s.n === v.stage.n ? "picked" : ""}>
                  <td><b>{s.title}</b></td>
                  <td className="r nowrap">{s.firstDay}–{s.lastDay}</td>
                  <td className="r">{range(s.moisture)}</td>
                  <td className="r">{range(s.ec)}</td>
                  <td className="r">{s.etcPct ? range(s.etcPct) : "None"}</td>
                  <td className="r">{s.kc ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="By reading" pad={false} right={<Open ns={[6, 10]} go={go} />}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Reading</th><th>Target</th><th>Critical</th></tr></thead>
            <tbody>
              {v.rules.map((r) => <tr key={r.label}><td><More label={<b>{r.label}</b>}>{r.note}</More></td><td>{r.target}</td><td>{r.critical}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Fertigation({ v }: { v: View }) {
  const f = v.fertigation;
  return (
    <Panel title={`Feed: ${f.aim.toLowerCase()}`} pad={false}>
      <table className="tbl kv"><tbody>
        <tr><th scope="row">Nitrogen</th><td>{f.nitrogen}</td></tr>
        {f.tanks.length === 0 && <tr><th scope="row">Tanks</th><td className="muted">Nothing through the drip</td></tr>}
        {f.tanks.map((t) => <tr key={t.name}><th scope="row">{t.name}</th><td>{t.products.join(" · ")}</td></tr>)}
        {f.clash && <tr><th scope="row">Do not mix</th><td><Tag kind="warn">Clash</Tag> {f.clash}</td></tr>}
        {f.phases.map((p, i) => <tr key={i}><th scope="row">Run {i + 1}</th><td><b>{p.pct} %</b> {p.label} <span className="muted">· {p.what}</span></td></tr>)}
        {f.phases.length > 0 && <tr><th scope="row">Water pH</th><td>{f.waterPh}</td></tr>}
        {f.soil && <tr><th scope="row">Soil</th><td>{f.soil}</td></tr>}
        {f.foliar.map((x) => <tr key={x.text}><th scope="row">Foliar</th><td>{x.text} {x.confirm && <Tag>Ask an agronomist</Tag>}</td></tr>)}
        {v.setup?.orchard && <tr><th scope="row">Yearly dose</th><td>{v.setup.orchard.npk}</td></tr>}
      </tbody></table>
    </Panel>
  );
}

function Forecast({ v, go }: { v: View; go: () => void }) {
  const f = v.cycle.forecast, o = v.setup?.orchard;
  if (!f || !o || !v.setup) return <Notice>No growing setup chosen.</Notice>;
  return (
    <div className="stack">
      <Panel title={v.setup.label} pad={false} right={<Open ns={[3, 4, 5]} go={go} />}>
        <table className="tbl kv"><tbody>
          <tr><th scope="row">Cultivars</th><td>{o.cultivars}</td></tr>
          <tr><th scope="row">First harvest</th><td>{o.firstBearing}</td></tr>
          <tr><th scope="row">Harvest a year, {f.plants} trees</th><td><b>{num(f.kgLow, 0)}–{num(f.kgHigh, 0)} kg</b></td></tr>
          <tr><th scope="row">Per tree a year</th><td>{v.setup.kgPerPlant[0]}–{v.setup.kgPerPlant[1]} kg</td></tr>
          <tr><th scope="row">Document, per hectare</th><td>{range(o.tPerHa)} t</td></tr>
          <tr><th scope="row">Document, per 50 m²</th><td>{num(o.kgPer50m2[0], 0)}–{num(o.kgPer50m2[1], 0)} kg</td></tr>
          <tr><th scope="row">Price</th><td>{f.pricePerKgUsd === null ? "None" : `${usd(f.pricePerKgUsd)} a kg (${riel(f.pricePerKgUsd, 4000)})`}</td></tr>
          <tr><th scope="row">Revenue a year</th><td><b>{f.revenueLowUsd === null || f.revenueHighUsd === null ? "—" : `${usd(f.revenueLowUsd, 0)}–${usd(f.revenueHighUsd, 0)}`}</b></td></tr>
          <tr><th scope="row">Drip</th><td>{o.drip}</td></tr>
          {o.docIssue && <tr><th scope="row">Yield table</th><td><More label={<Tag kind="warn">Does not multiply out</Tag>}>{o.docIssue}</More></td></tr>}
        </tbody></table>
      </Panel>
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

  const tabs: { id: TabId; label: string }[] = [
    { id: "jobs", label: "Jobs" }, { id: "targets", label: "Targets" }, { id: "feed", label: "Fertigation" },
    { id: "forecast", label: "Forecast" }, { id: "questions", label: `Open questions (${v?.docIssues.length ?? 0})` },
  ];
  const go = () => setTab("questions");

  return (
    <>
      <PageHead icon={Sprout} title={c?.bedLabel ?? "Crop cycle"}
                sub={c ? `${c.cropName}${c.variety ? ` (${c.variety})` : ""} · ${c.plantCount} trees · ${c.setupLabel ?? "no setup"}` : undefined}
                actions={<Link className="btn btn-ghost btn-sm" to="/cycles"><ArrowLeft size={16} aria-hidden />My crops</Link>} />
      <main className="main stack">
        {error && <Notice kind="alert">{error}</Notice>}
        {v && c && p && (
          <>
            <Panel title={`Day ${v.day} of ${v.stages[v.stages.length - 1].lastDay} · ${v.stage.title}`}
                   right={<span className="small muted">{dayMonthYear(dateOf(v.day))}</span>}>
              <div className="stack">
                <StageStrip stages={v.stages} day={v.day} />
                {v.sample && (
                  <div className="walk">
                    <label className="small muted" htmlFor="walk-day">Walk the cycle (sample)</label>
                    <input id="walk-day" type="range" min={1} max={180} value={v.day} onChange={(e) => setWanted(Number(e.target.value))} />
                    {walking && <button type="button" className="linkbtn small" onClick={() => setWanted(undefined)}>Today (day {v.actualDay})</button>}
                  </div>
                )}
                <Kpis items={[
                  { k: "Trees planted", v: dayMonthYear(p.treesPlantedOn) },
                  { k: "Tree age", v: `${p.treeAgeYears} years` },
                  { k: "Started by", v: p.regulationLabel },
                  { k: "Harvest", v: <>{dayMonth(p.harvestFrom)} – {dayMonth(p.harvestTo)}{p.rainyHarvest && <> <Tag kind="warn">Rainy months</Tag></>}</> },
                ]} />
              </div>
            </Panel>

            <div className="grid g2">
              <EnvRibbon bed={v.conditions} />
              <Panel title="Now" pad={false}>
                <table className="tbl kv"><tbody>
                  {stress ? (
                    <tr><th scope="row">Water</th><td><Tag>Paused for stress</Tag> until day {v.stage.lastDay}, then two priming irrigations</td></tr>
                  ) : (
                    <>
                      <tr><th scope="row">Water plan</th><td><b>{litres(v.water.litresTotal)}</b> · {v.water.litresPerTree} L a tree. Skip if the soil is at target.</td></tr>
                      {v.water.hoursPerRun > 0 && (
                        <tr><th scope="row">Drip</th><td><b>{v.water.hoursPerRun} h</b> at {v.water.emitterLphPerTree} L/h a tree{" "}
                          <Tag kind="warn">Node stops at {v.water.firmwareLimitSeconds} s</Tag></td></tr>
                      )}
                    </>
                  )}
                  {!stress && <tr><th scope="row">Stage</th><td>{v.stage.water}</td></tr>}
                  <tr><th scope="row">Feed</th><td>{v.stage.feed}</td></tr>
                  <tr><th scope="row">Do</th><td>{v.stage.actions}</td></tr>
                </tbody></table>
              </Panel>
            </div>

            <div className="tabs tabs-in" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? " tab-on" : ""}`} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "jobs" && (
              <Panel pad={false}>
                <OrchardJobs jobs={v.jobs} fruitMm={v.fruitMm} onDone={walking ? undefined : done} onFruit={walking ? undefined : fruit} />
              </Panel>
            )}
            {tab === "targets" && <Targets v={v} go={go} />}
            {tab === "feed" && <Fertigation v={v} />}
            {tab === "forecast" && <Forecast v={v} go={go} />}
            {tab === "questions" && (
              <Panel pad={false}>
                <div className="tablewrap">
                  <table className="tbl">
                    <thead><tr><th className="r">#</th><th>Question</th><th>What the document says</th></tr></thead>
                    <tbody>
                      {v.docIssues.map((i) => <tr key={i.n}><td className="r">{i.n}</td><td className="nowrap"><b>{i.title}</b></td><td>{i.detail}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </>
        )}
      </main>
    </>
  );
}
