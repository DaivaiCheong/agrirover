import { useState } from "react";
import { ArrowRight, Droplets, Gauge, Plus, Sprout, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import EnvRibbon from "../components/EnvRibbon";
import { JobRow, JobsHead, StageStrip } from "../components/Orchard";
import { Empty, Field, Kpis, More, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem, type BedConditions, type CropPlan, type Cycle, type OrchardCycle, type OrchardJob, type ZoneDecision, type ZoneNow } from "../lib/api";
import { trim } from "../lib/conditions";
import { dayMonthYear, litres, longToday, suggestedArea } from "../lib/format";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";

const STALE_AFTER_S = 300;

function badge(d: ZoneDecision): [string | undefined, string] {
  if (d.decision === "irrigate") return ["warn", "Needs water"];
  if (d.decision === "hold_in_range") return d.reason === "no_reading" ? ["wip", "No data"] : ["ok", "Soil is fine"];
  const why = d.decision.replace(/^(defer|hold|suppress)_/, "").replace(/_/g, " ");
  return [undefined, why.charAt(0).toUpperCase() + why.slice(1)];
}

const isStale = (z: ZoneNow) => z.recordedAt !== null && Date.now() - new Date(z.recordedAt).getTime() > STALE_AFTER_S * 1000;

/** What a growing crop needs today: its plan, and for a tree crop its stage and jobs. */
type Loaded = { plan: CropPlan | null; orchard: OrchardCycle | null; error: string | null };

async function loadCrop(c: Cycle): Promise<Loaded> {
  try {
    const [plan, orchard] = await Promise.all([
      c.plantCount ? api.cyclePlan(c.id) : Promise.resolve(null),
      c.perennial ? api.orchardCycle(c.id) : Promise.resolve(null),
    ]);
    return { plan, orchard, error: null };
  } catch (e) {
    return { plan: null, orchard: null, error: (e as Error).message };
  }
}

const growingNow = (l?: Loaded) => (l?.plan?.now.state === "growing" ? l.plan.now : null);
const inStress = (c: Cycle, l?: Loaded) => Boolean(l?.orchard && c.perennial?.stress && l.orchard.stage.n === 1);
/** Litres planned today. A tree crop's figure is the one its own page shows, so the two can never disagree. */
const waterToday = (c: Cycle, l?: Loaded) => (inStress(c, l) ? 0 : l?.orchard?.water.litresTotal ?? growingNow(l)?.litersToday ?? 0);

function CropCard({ c, areaPerPlant, cond, loaded, onChanged }:
  { c: Cycle; areaPerPlant: number; cond?: BedConditions; loaded?: Loaded; onChanged: () => void }) {
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

  const plan = loaded?.plan ?? null, o = loaded?.orchard ?? null;
  const trees = Boolean(c.perennial);
  const stress = inStress(c, loaded);
  const shownBed = o?.conditions ?? cond;
  const now = growingNow(loaded);
  const planLink = trees ? `/cycles/${c.id}/orchard` : `/plan?${new URLSearchParams({ crop: c.crop, plants: String(c.plantCount ?? ""), date: c.plantedOn })}`;

  return (
    <section className="panel cropcard">
      <div className="cc-top">
        <div style={{ minWidth: 0 }}>
          <span className="cc-title">{c.bedLabel}</span>
          <span className="small muted"> {c.cropName}{c.variety ? ` (${c.variety})` : ""}{c.plantCount ? ` · ${c.plantCount.toLocaleString()} ${trees ? "trees" : "plants"}` : ""}</span>
        </div>
        {c.plantCount && <Link className="linkbtn cc-open" to={planLink} aria-label={`Open ${c.bedLabel}`}>Open <ArrowRight size={14} aria-hidden /></Link>}
      </div>

      {o && <StageStrip stages={o.stages} day={o.day} />}

      {plan && !trees && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={plan.cycleDays} aria-valuenow={Math.max(0, c.day ?? 0)}
             aria-label="How far through the crop">
          <i style={{ width: `${Math.min(100, (Math.max(0, c.day ?? 0) / plan.cycleDays) * 100)}%` }} />
        </div>
      )}

      {shownBed && <EnvRibbon bed={shownBed} />}

      {stress && o ? (
        <div className="cc-water"><Droplets size={15} aria-hidden /><span>Water</span><Tag>Paused for stress</Tag><span className="muted">until day {o.stage.lastDay}</span></div>
      ) : o ? (
        <div className="cc-water">
          <Droplets size={15} aria-hidden /><span>Water plan</span>
          <b>{litres(o.water.litresTotal)}</b>
          <span className="muted">{o.water.litresPerTree} L a tree · {o.water.hoursPerRun} h drip</span>
        </div>
      ) : now ? (
        <div className="cc-water">
          <Droplets size={15} aria-hidden /><span>Water plan</span>
          <b>{litres(now.litersToday)}</b>
          <span className="muted">{now.litersPerPlant.toFixed(1)} L a plant · cloudy {litres(now.ifCloudy)} · rainy {litres(now.ifRainy)} or none</span>
        </div>
      ) : plan?.now.state === "not_planted" ? (
        <div className="cc-water muted">Planting {dayMonthYear(c.plantedOn)}, in {plan.now.startsInDays} day{plan.now.startsInDays === 1 ? "" : "s"}</div>
      ) : plan?.now.state === "finished" ? (
        <div className="cc-water muted">Plan finished. Record the last harvest, then end the crop.</div>
      ) : !c.plantCount ? (
        <form className="form" onSubmit={savePlants}>
          <div className="row2">
            <Field label="Plants on this bed">
              <input type="number" inputMode="numeric" min={1} step={1} required value={plants} onChange={(e) => plantsChanged(e.target.value)} />
            </Field>
            <Field label="Bed area (m²)" hint={`Suggested ${areaPerPlant} m² a plant`}>
              <input type="number" inputMode="decimal" min={0.1} step="any" value={area} onChange={(e) => { setArea(e.target.value); setAreaTouched(true); }} />
            </Field>
          </div>
          <div><button className="btn btn-sm" disabled={!plants}><Droplets size={16} aria-hidden />Show today's water</button></div>
          {saveError && <Notice kind="alert">{saveError}</Notice>}
        </form>
      ) : loaded?.error ? (
        <Notice kind="alert">{loaded.error}</Notice>
      ) : !loaded ? <div className="cc-water muted">Loading…</div> : null}
    </section>
  );
}

/** Today's work across every bed, in one list. A tomato task has no tick yet, so it shows as ongoing. */
function workOf(c: Cycle, l?: Loaded): OrchardJob[] {
  if (l?.orchard) return l.orchard.jobs.filter((j) => j.state === "due" || j.state === "overdue");
  const now = growingNow(l);
  return (now?.tasks ?? []).map((t) => ({
    id: t.text, title: t.text, detail: "", firstDay: t.firstDay, lastDay: t.lastDay, stageN: 0, state: "due",
    confirm: false, measure: false, ongoing: true,
  }));
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

  const key = active.map((c) => `${c.id}:${c.plantCount}:${c.areaM2}`).join();
  const load = useData(async () => new Map(await Promise.all(active.map(async (c) => [c.id, await loadCrop(c)] as const))), [key]);
  const loadedOf = (c: Cycle) => load.data?.get(c.id);

  async function jobDone(c: Cycle, job: string) { await api.orchardJobDone(c.id, job); load.reload(); }
  async function fruit(c: Cycle, mm: number) { await api.orchardFruitSize(c.id, mm); load.reload(); }

  const work = active.flatMap((c) => workOf(c, loadedOf(c)).map((j) => ({ c, j })));
  const water = active.reduce((s, c) => s + waterToday(c, loadedOf(c)), 0);
  const planned = active.some((c) => loadedOf(c)?.plan || loadedOf(c)?.orchard);
  const beds = active.map((c) => loadedOf(c)?.orchard?.conditions ?? condOf.get(c.zone)).filter((b): b is BedConditions => Boolean(b));
  const alerts = beds.flatMap((b) => b.alerts);
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <>
      <PageHead icon={Sun} title="Today" sub={longToday()}
                actions={<Link className="btn btn-sm" to="/cycles?add=true"><Plus size={16} aria-hidden />Add crop</Link>} />
      <main className="main stack">
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}

        {cycles.data !== null && active.length === 0 && (
          <Panel><Empty icon={Sprout}>
            No crop is growing yet.
            <Link className="btn btn-sm" to="/cycles?add=true"><Plus size={16} aria-hidden />Add your first crop</Link>
          </Empty></Panel>
        )}

        {active.length > 0 && (
          <>
            <Kpis items={[
              { k: "Beds growing", v: active.length },
              { k: "Water plan today", v: planned ? litres(water) : "—" },
              { k: "Tasks today", v: planned ? work.length : "—" },
              { k: "Alerts", v: alerts.length === 0 ? "None" : `${alerts.length}${critical ? ` (${critical} critical)` : ""}` },
            ]} />

            {work.length > 0 && (
              <Panel title="Today's tasks" pad={false}>
                <div className="tablewrap">
                  <table className="tbl jobs-t">
                    <JobsHead bed />
                    <tbody>
                      {work.map(({ c, j }) => (
                        <JobRow key={`${c.id}-${j.id}`} j={j} bed={c.bedLabel} fruitMm={loadedOf(c)?.orchard?.fruitMm ?? null}
                                onDone={(id) => jobDone(c, id)} onFruit={(mm) => fruit(c, mm)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            <div className="grid g2">{active.map((c) => (
              <CropCard key={c.id} c={c} onChanged={cycles.reload} cond={condOf.get(c.zone)} loaded={loadedOf(c)}
                        areaPerPlant={crops.data?.find((x) => x.slug === c.crop)?.defaultAreaPerPlantM2 ?? 0.5} />
            ))}</div>
          </>
        )}

        <Panel title="Watering rule" icon={Gauge} pad={false}
               right={<span className="small muted">Advice only · decided 06:00</span>}>
          {(zones.data ?? []).length === 0 ? <Empty icon={Gauge}>No beds set up yet.</Empty> : (
            <div className="tablewrap">
              <table className="tbl rule-t">
                <thead><tr><th>Bed</th><th>Rule</th><th className="r">Moisture %</th><th className="r">Waters below</th><th className="r">Stage target</th><th>Rain</th><th>Reading</th><th className="r">Supply V</th><th className="r">Water pH</th></tr></thead>
                <tbody>
                  {(zones.data ?? []).map((z) => {
                    const d = decisionOf.get(z.zone);
                    const [kind, label] = d ? badge(d) : ["wip", "No decision"];
                    const stage = condOf.get(z.zone)?.stage;
                    return (
                      <tr key={z.zone}>
                        <td className="nowrap"><b>{z.label ?? z.zone}</b></td>
                        <td>{d ? <More label={<Tag kind={kind}>{label}</Tag>}>{d.text}</More> : <Tag kind={kind}>{label}</Tag>}</td>
                        <td className="r">{z.moisturePct === null ? "—" : z.moisturePct.toFixed(0)}</td>
                        <td className="r">{d?.thresholdPct != null ? d.thresholdPct.toFixed(0) : "—"}</td>
                        <td className="r nowrap">{stage ? `${trim(stage.moisture[0])}–${trim(stage.moisture[1])}` : "—"}</td>
                        <td>{z.rain === null ? "—" : z.rain ? "Raining" : "No"}</td>
                        <td className="nowrap">{z.recordedAt === null ? "—" : isStale(z) ? <Tag kind="warn">{ago(z.recordedAt)}</Tag> : <span className="muted">{ago(z.recordedAt)}</span>}</td>
                        <td className="r">{z.supplyVoltage === null ? "—" : z.supplyVoltage.toFixed(2)}</td>
                        <td className="r">{z.waterPh === null ? "—" : z.waterPh.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
    </>
  );
}
