import { useState } from "react";
import { ArrowRight, Cloud, CloudRain, Droplets, Gauge, Plus, Sprout, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import EnvRibbon from "../components/EnvRibbon";
import { OrchardJobs, StageStrip } from "../components/Orchard";
import { Empty, Field, Led, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem, type BedConditions, type Cycle, type ZoneDecision, type ZoneNow } from "../lib/api";
import { trim } from "../lib/conditions";
import { dayMonthYear, litres, longToday, suggestedArea } from "../lib/format";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";

const STALE_AFTER_S = 300;

function badge(d: ZoneDecision): [string, string] {
  if (d.decision === "irrigate") return ["warn", "Needs water"];
  if (d.decision === "hold_in_range") return d.reason === "no_reading" ? ["wip", "No data"] : ["ok", "Soil is fine"];
  const why = d.decision.replace(/^(defer|hold|suppress)_/, "").replace(/_/g, " ");
  return ["info", why.charAt(0).toUpperCase() + why.slice(1)];
}

const isStale = (z: ZoneNow) => z.recordedAt !== null && Date.now() - new Date(z.recordedAt).getTime() > STALE_AFTER_S * 1000;

function CropCard({ c, areaPerPlant, cond, decision, onChanged }:
  { c: Cycle; areaPerPlant: number; cond?: BedConditions; decision?: ZoneDecision; onChanged: () => void }) {
  // a crop with no plant count has no plan: ask for the number right here
  const { data: plan, error, loading } = useData(
    () => (c.plantCount ? api.cyclePlan(c.id) : Promise.resolve(null)), [c.id, c.plantCount, c.areaM2]);
  const [plants, setPlants] = useState("");
  const [area, setArea] = useState("");
  const [areaTouched, setAreaTouched] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // the area follows the plant count until the farmer types one of their own
  function plantsChanged(v: string) {
    setPlants(v);
    const n = Number(v);
    if (!areaTouched && Number.isInteger(n) && n > 0) setArea(String(suggestedArea(n, areaPerPlant)));
  }

  async function savePlants(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    try { await api.updateCycle(c.id, { plantCount: Number(plants), areaM2: area ? Number(area) : undefined }); onChanged(); }
    catch (err) { setSaveError((err as Error).message); }
  }

  // a tree crop: stage strip, jobs that can be ticked off, and a pause on purpose during stress
  const orchard = useData(() => (c.perennial ? api.orchardCycle(c.id) : Promise.resolve(null)), [c.id]);
  const o = orchard.data;
  const trees = Boolean(c.perennial);
  const stress = Boolean(o && c.perennial?.stress && o.stage.n === 1);
  const jobsNow = o?.jobs.filter((j) => j.state === "due" || j.state === "overdue") ?? [];
  const jobNext = o?.jobs.find((j) => j.state === "later");
  const shownBed = o?.conditions ?? cond;
  async function jobDone(job: string) { await api.orchardJobDone(c.id, job); orchard.reload(); }
  async function fruit(mm: number) { await api.orchardFruitSize(c.id, mm); orchard.reload(); }

  const now = plan?.now.state === "growing" ? plan.now : null;
  const planLink = trees ? `/cycles/${c.id}/orchard` : `/plan?${new URLSearchParams({ crop: c.crop, plants: String(c.plantCount ?? ""), date: c.plantedOn })}`;

  return (
    <section className="panel panel-pad cropcard">
      <div className="cc-top">
        <div className="iconbox"><Sprout size={22} aria-hidden /></div>
        <div style={{ minWidth: 0 }}>
          <div className="cc-title">{c.bedLabel}</div>
          <div className="small muted">
            {c.cropName}{c.variety ? ` (${c.variety})` : ""} · {c.day !== null && c.day > 0 ? `day ${c.day}${plan ? ` of ${plan.cycleDays}` : ""}` : `planting ${dayMonthYear(c.plantedOn)}`}
            {c.plantCount ? ` · ${c.plantCount.toLocaleString()} ${trees ? "trees" : "plants"}` : ""}
          </div>
        </div>
        {now?.stageTitle && !trees && <span style={{ marginLeft: "auto" }}><Tag kind="ok">{now.stageTitle}</Tag></span>}
      </div>

      {o && <StageStrip stages={o.stages} day={o.day} />}

      {plan && !trees && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={plan.cycleDays} aria-valuenow={Math.max(0, c.day ?? 0)}
             aria-label="How far through the crop">
          <i style={{ width: `${Math.min(100, (Math.max(0, c.day ?? 0) / plan.cycleDays) * 100)}%` }} />
        </div>
      )}

      {shownBed && <EnvRibbon bed={shownBed} />}

      {stress && o && (
        <Notice kind="info"><b>Watering is paused on purpose.</b> Dry soil is the goal until day {o.stage.lastDay}, then two priming irrigations start the flush.</Notice>
      )}

      {c.trialArm === "guided" && decision && (
        <div className="rowflex small" style={{ gap: 8 }}>
          <Gauge size={16} aria-hidden style={{ color: "var(--brand)" }} />
          <span>Watering rule</span>
          <Tag kind={badge(decision)[0]}>{badge(decision)[1]}</Tag>
          {decision.thresholdPct !== null && (
            <span className="muted">
              waters below {decision.thresholdPct.toFixed(0)}% moisture
              {cond?.stage ? `; the target for this stage is ${trim(cond.stage.moisture[0])}–${trim(cond.stage.moisture[1])}%` : ""}
            </span>
          )}
        </div>
      )}

      {trees && o ? (
        <>
          {!stress && now && (
            <div className="cc-water">
              <Droplets size={26} aria-hidden style={{ color: "var(--water)", alignSelf: "center" }} />
              <span className="big">{litres(now.litersToday)}</span>
              <span className="muted">of water today · {now.litersPerPlant.toFixed(1)} L a tree · about {o.water.hoursPerRun} h of drip</span>
            </div>
          )}
          {!stress && now && <p className="small muted">A planning amount. If the soil is already at its target, skip.</p>}
          {jobsNow.length > 0 && (
            <div>
              <div className="lbl lbl-ink" style={{ marginBottom: 6 }}>Jobs for now</div>
              <OrchardJobs jobs={jobsNow} fruitMm={o.fruitMm} onDone={jobDone} onFruit={fruit} />
            </div>
          )}
          {jobNext && (
            <p className="small muted"><ArrowRight size={14} aria-hidden style={{ verticalAlign: "-2px" }} />{" "}
              On day {jobNext.firstDay}: {jobNext.title.toLowerCase()}</p>
          )}
        </>
      ) : now ? (
        <>
          <div>
            <div className="cc-water">
              <Droplets size={26} aria-hidden style={{ color: "var(--water)", alignSelf: "center" }} />
              <span className="big">{litres(now.litersToday)}</span>
              <span className="muted">of water today · {now.litersPerPlant.toFixed(1)} L a plant</span>
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="chip chip-water"><Cloud size={14} aria-hidden />Cloudy: {litres(now.ifCloudy)}</span>
              <span className="chip chip-water"><CloudRain size={14} aria-hidden />Rainy: {litres(now.ifRainy)} or none</span>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              A planning amount, best given early in the morning. If the soil sensor says wet, skip.
            </p>
          </div>
          {now.tasks.length > 0 && (
            <div>
              <div className="lbl lbl-ink" style={{ marginBottom: 6 }}>Jobs for now</div>
              <ul className="tasklist">
                {now.tasks.map((t) => <li key={t.text}><Sprout size={18} aria-hidden /><span>{t.text}</span></li>)}
              </ul>
            </div>
          )}
          {now.next && (
            <p className="small muted"><ArrowRight size={14} aria-hidden style={{ verticalAlign: "-2px" }} />{" "}
              In {now.next.inDays} day{now.next.inDays === 1 ? "" : "s"}: {now.next.text}</p>
          )}
        </>
      ) : plan?.now.state === "not_planted" ? (
        <Notice>
          Planting is in {plan.now.startsInDays} day{plan.now.startsInDays === 1 ? "" : "s"}, on {dayMonthYear(c.plantedOn)}.
          Water starts the day after. The full plan shows what it will need.
        </Notice>
      ) : plan?.now.state === "finished" ? (
        <Notice>This crop's plan has finished. Record the last harvest, then close it in My crops.</Notice>
      ) : !c.plantCount ? (
        <form className="form" onSubmit={savePlants}>
          <Field label="How many plants are on this bed?" hint="Then we work out today's water and the jobs for this week.">
            <input type="number" inputMode="numeric" min={1} step={1} required value={plants}
                   onChange={(e) => plantsChanged(e.target.value)} />
          </Field>
          <Field label="How big is the bed (m²)?"
                 hint={`Water follows the ground each plant gets. We suggest ${areaPerPlant} m² a plant; change it if your bed is different.`}>
            <input type="number" inputMode="decimal" min={0.1} step="any" value={area}
                   onChange={(e) => { setArea(e.target.value); setAreaTouched(true); }} />
          </Field>
          <div><button className="btn" disabled={!plants}><Droplets size={18} aria-hidden />Show today's water</button></div>
          {saveError && <Notice kind="alert">{saveError}</Notice>}
        </form>
      ) : error ? (
        <Notice kind="alert">{error}</Notice>
      ) : loading ? <p className="muted">Working out today's water…</p> : null}

      {c.plantCount && <div><Link className="linkbtn" to={planLink}>{trees ? "Open this cycle" : "See the full plan"} <ArrowRight size={14} aria-hidden style={{ verticalAlign: "-2px" }} /></Link></div>}
    </section>
  );
}

export default function Dashboard() {
  const cycles = useData(api.cycles);
  const crops = useData(api.crops);
  const decisions = usePoll(api.decisionsToday);
  const zones = usePoll(api.zones);
  const conditions = usePoll(api.conditions);
  const error = cycles.error ?? decisions.error ?? zones.error ?? conditions.error;
  const active = (cycles.data ?? []).filter((c) => c.status === "active");
  const decisionOf = new Map((decisions.data ?? []).map((d) => [d.zone, d]));
  const condOf = new Map((conditions.data ?? []).map((b) => [b.zone, b]));

  return (
    <>
      <PageHead icon={Sun} title="Today" sub={longToday()}
                actions={<Link className="btn" to="/cycles?add=true"><Plus size={18} aria-hidden />Add crop</Link>} />
      <main className="main stack">
        {error && <Notice kind="alert">{loadProblem(error)} Showing the last data received, if any.</Notice>}

        {cycles.data !== null && active.length === 0 && (
          <Panel><Empty icon={Sprout}>
            No crop is growing yet.
            <Link className="btn" to="/cycles?add=true" style={{ marginTop: 6 }}><Plus size={18} aria-hidden />Add your first crop</Link>
          </Empty></Panel>
        )}

        {active.length > 0 && <div className="grid g2">{active.map((c) => (
          <CropCard key={c.id} c={c} onChanged={cycles.reload} cond={condOf.get(c.zone)}
                    decision={decisionOf.get(c.zone)}
                    areaPerPlant={crops.data?.find((x) => x.slug === c.crop)?.defaultAreaPerPlantM2 ?? 0.5} />
        ))}</div>}

        <Panel title="Watering rule" icon={Gauge} pad={false}
               right={<span className="small muted">Rule engine · decided at 06:00</span>}>
          {(zones.data ?? []).length === 0 && <Empty icon={Gauge}>No beds set up yet.</Empty>}
          {(zones.data ?? []).map((z) => {
            const d = decisionOf.get(z.zone);
            const [kind, label] = d ? badge(d) : ["wip", "No decision yet"];
            return (
              <div key={z.zone} className="stagecard">
                <div className="rowflex" style={{ justifyContent: "space-between" }}>
                  <div>
                    <b style={{ fontSize: 16 }}>{z.label ?? z.zone}</b>
                    {d && <div className="small muted">{d.text}</div>}
                  </div>
                  <Tag kind={kind}>{label}</Tag>
                </div>
                <div className="rowflex small">
                  <span>
                    Moisture <b>{z.moisturePct === null ? "—" : `${z.moisturePct.toFixed(0)}%`}</b>
                    {d?.thresholdPct != null && <span className="muted"> · waters below {d.thresholdPct.toFixed(0)}%</span>}
                  </span>
                  <span style={{ color: isStale(z) ? "var(--alert)" : "var(--ink-muted)", fontWeight: 600 }}>
                    {z.recordedAt === null ? "No reading yet" : `${isStale(z) ? "Old reading · " : ""}${ago(z.recordedAt)}`}
                  </span>
                  <Led kind={z.rain === null ? "idle" : z.rain ? "alert" : "ok"}>{z.rain === null ? "Rain unknown" : z.rain ? "Raining" : "No rain"}</Led>
                  <span className="muted">Supply {z.supplyVoltage === null ? "—" : `${z.supplyVoltage.toFixed(2)} V`}</span>
                  <span className="muted">Water pH {z.waterPh === null ? "—" : z.waterPh.toFixed(1)}</span>
                </div>
              </div>
            );
          })}
          <div className="panel-pad" style={{ borderTop: "1px solid var(--line)" }}>
            <p className="small muted">
              The sensors advise; you decide. Approve or skip in Telegram. Nothing here opens a valve.
            </p>
          </div>
        </Panel>
      </main>
    </>
  );
}
