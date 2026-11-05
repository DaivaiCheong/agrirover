import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowLeft, BookOpen, CalendarDays, CircleCheck, Droplets, FlaskConical, Sprout, Sun, SquareDashed, Sparkles, Wheat,
  type LucideIcon,
} from "lucide-react";
import { Empty, Field, Notice, PageHead, Panel } from "../components/ui";
import { api, type CropPlan, type PlanTask } from "../lib/api";
import { dayMonth, dayMonthYear, litres, num, todayIso } from "../lib/format";
import { useData } from "../lib/useData";

const METHODS = [
  { id: "drip", label: "Drip", efficiency: 0.9 },
  { id: "sprinkler", label: "Sprinkler", efficiency: 0.75 },
  { id: "hand", label: "Hand", efficiency: 0.6 },
] as const;

const NEW_BED = "__new__";
const PLANT_PRESETS = [50, 100, 200, 500, 1000];

const tomorrowIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("sv-SE");
};

/** Where a statement comes from, if needed. */
function Basis({ b }: { b: string }) {
  return null;
}

function Tasks({ tasks }: { tasks: PlanTask[] }) {
  return (
    <ul className="tasklist">
      {[...tasks].sort((a, b) => a.firstDay - b.firstDay || a.lastDay - b.lastDay).map((t) => (
        <li key={t.text}>
          <CircleCheck size={18} aria-hidden />
          <span>
            <b className="small muted">{t.firstDay === t.lastDay ? `Day ${t.firstDay}` : `Days ${t.firstDay}–${t.lastDay}`} · {dayMonth(t.startsOn)}</b>
            <br />{t.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

type TabId = "water" | "jobs" | "feed" | "harvest" | "sources";

/** The next free "Bed N", so a new bed never needs a name typed in. */
function nextBedName(labels: string[]) {
  let n = labels.length + 1;
  while (labels.includes(`Bed ${n}`)) n++;
  return `Bed ${n}`;
}

export default function Plan() {
  const [qs] = useSearchParams();
  if (!qs.get("crop")) {
    return <Navigate to="/cycles?add=true" replace />;
  }

  const crops = useData(api.crops);
  const beds = useData(api.zones);
  const cycles = useData(api.cycles);

  const [crop, setCrop] = useState(qs.get("crop") ?? "tomato");
  const [plants, setPlants] = useState(qs.get("plants") ?? "100");
  const [plantedOn, setPlantedOn] = useState(qs.get("date") ?? todayIso());
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("drip");
  const [rowCm, setRowCm] = useState("");
  const [plantCm, setPlantCm] = useState("");
  const [variety, setVariety] = useState("");
  const [tab, setTab] = useState<TabId>("water");

  const [plan, setPlan] = useState<CropPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  // the plan follows the form: change a number and it is worked out again
  useEffect(() => {
    const n = Number(plants);
    if (!Number.isInteger(n) || n < 1 || !plantedOn) { setPlan(null); setError(null); return; }
    const id = ++latest.current;
    const t = setTimeout(() => {
      api.cropPlan({
        crop, plants: n, plantedOn, efficiency: METHODS.find((m) => m.id === method)!.efficiency,
        rowCm: Number(rowCm) || undefined, plantCm: Number(plantCm) || undefined,
      }).then((p) => { if (id === latest.current) { setPlan(p); setError(null); } })
        .catch((e: Error) => { if (id === latest.current) setError(e.message); });
    }, 300);
    return () => clearTimeout(t);
  }, [crop, plants, plantedOn, method, rowCm, plantCm]);

  // start this crop: a free bed is picked and a new bed is named for you
  const [bed, setBed] = useState("");
  const [bedName, setBedName] = useState("");
  const [started, setStarted] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const busy = new Set((cycles.data ?? []).filter((c) => c.status === "active").map((c) => c.zone));
  const bedChoice = bed || (beds.data ?? []).find((b) => !busy.has(b.zone))?.zone || NEW_BED;
  const autoName = nextBedName((beds.data ?? []).map((b) => b.label ?? b.zone));

  // changing the plan after starting means a new crop, so the Start button comes back
  useEffect(() => { setStarted(null); setStartError(null); }, [crop, plants, plantedOn]);

  async function start() {
    if (!plan) return;
    setStartError(null);
    try {
      let zone = bedChoice;
      if (zone === NEW_BED) zone = (await api.addBed({ label: bedName.trim() || autoName, areaM2: plan.areaM2 })).name;
      await api.addCycle({ zone, crop, plantedOn, plantCount: plan.plants, areaM2: plan.areaM2, variety: variety || undefined });
      setStarted(zone);
      cycles.reload(); beds.reload();
    } catch (e) {
      setStartError((e as Error).message);
    }
  }

  const waterCrops = (crops.data ?? []).filter((c) => c.hasWaterData);
  const now = plan?.now;
  const growing = now?.state === "growing" ? now : null;
  const first = plan?.water.days[0];

  function stepPlants(delta: number) {
    const n = Number(plants) || 0;
    setPlants(String(Math.max(1, n + delta)));
  }

  const tabs: { id: TabId; label: string; icon: LucideIcon }[] = plan ? [
    { id: "water", label: "Water", icon: Droplets },
    { id: "jobs", label: "Jobs by stage", icon: CalendarDays },
    ...(plan.feed ? [{ id: "feed" as const, label: "Feeding", icon: FlaskConical }] : []),
    ...(plan.harvest ? [{ id: "harvest" as const, label: "Harvest", icon: Wheat }] : []),
    { id: "sources", label: "Sources", icon: BookOpen },
  ] : [];
  const shown: TabId = tabs.some((t) => t.id === tab) ? tab : "water";
  const warnings = plan?.season.notes.filter((n) => n.kind === "warn") ?? [];

  return (
    <>
      <PageHead
        icon={Droplets}
        title={`${plan ? plan.crop : "Crop"} Water Plan`}
        actions={<Link className="btn btn-ghost btn-sm" to="/cycles"><ArrowLeft size={16} aria-hidden />My crops</Link>}
      />
      <main className="main plan-grid">
        <aside className="plan-form">
          <Panel>
            <div className="form">
              <Field label="Crop">
                <div className="preset-chips">
                  {waterCrops.length === 0 && (
                    <button
                      type="button"
                      className={`preset-chip${crop === "tomato" ? " active" : ""}`}
                      onClick={() => setCrop("tomato")}
                    >
                      Tomato
                    </button>
                  )}
                  {waterCrops.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      className={`preset-chip${crop === c.slug ? " active" : ""}`}
                      onClick={() => setCrop(c.slug)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Plants">
                <div className="bignum-input-row">
                  <button
                    type="button"
                    className="step-btn"
                    aria-label="Decrease plants"
                    onClick={() => stepPlants(-10)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={plants}
                    onChange={(e) => setPlants(e.target.value)}
                  />
                  <button
                    type="button"
                    className="step-btn"
                    aria-label="Increase plants"
                    onClick={() => stepPlants(10)}
                  >
                    +
                  </button>
                </div>
                <div className="preset-chips" style={{ marginTop: 6 }}>
                  {PLANT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`preset-chip${Number(plants) === p ? " active" : ""}`}
                      onClick={() => setPlants(String(p))}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Planting date">
                <div style={{ display: "grid", gap: 8 }}>
                  <div className="preset-chips">
                    <button
                      type="button"
                      className={`preset-chip${plantedOn === todayIso() ? " active" : ""}`}
                      onClick={() => setPlantedOn(todayIso())}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className={`preset-chip${plantedOn === tomorrowIso() ? " active" : ""}`}
                      onClick={() => setPlantedOn(tomorrowIso())}
                    >
                      Tomorrow
                    </button>
                  </div>
                  <input type="date" value={plantedOn} onChange={(e) => setPlantedOn(e.target.value)} />
                </div>
              </Field>

              <div>
                <div className="lbl lbl-ink" style={{ marginBottom: 6 }}>Watering</div>
                <div className="seg" role="group" aria-label="Watering method">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={method === m.id ? "on" : ""}
                      onClick={() => setMethod(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Bed">
                <div style={{ display: "grid", gap: 8 }}>
                  <div className="preset-chips">
                    {(beds.data ?? []).map((b) => {
                      const isBusy = busy.has(b.zone);
                      return (
                        <button
                          key={b.zone}
                          type="button"
                          disabled={isBusy}
                          title={isBusy ? "Bed has active crop" : undefined}
                          className={`preset-chip${bedChoice === b.zone ? " active" : ""}`}
                          onClick={() => setBed(b.zone)}
                        >
                          {b.label ?? b.zone}{isBusy ? " (busy)" : ""}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`preset-chip${bedChoice === NEW_BED ? " active" : ""}`}
                      onClick={() => setBed(NEW_BED)}
                    >
                      + New bed
                    </button>
                  </div>
                  {bedChoice === NEW_BED && (
                    <input
                      aria-label="Name of the new bed"
                      value={bedName}
                      placeholder={autoName}
                      onChange={(e) => setBedName(e.target.value)}
                    />
                  )}
                </div>
              </Field>

              <details className="more">
                <summary>More options</summary>
                <div className="form" style={{ marginTop: 10 }}>
                  <Field label="Between rows (cm)">
                    <input type="number" min={10} value={rowCm} placeholder="50" onChange={(e) => setRowCm(e.target.value)} />
                  </Field>
                  <Field label="Between plants (cm)">
                    <input type="number" min={5} value={plantCm} placeholder="70" onChange={(e) => setPlantCm(e.target.value)} />
                  </Field>
                  <Field label="Variety">
                    <input value={variety} placeholder="Optional" onChange={(e) => setVariety(e.target.value)} />
                  </Field>
                </div>
              </details>

              {error && <Notice kind="alert">{error}</Notice>}

              {started ? (
                <Notice kind="ok">
                  <div style={{ display: "grid", gap: 8 }}>
                    <span>Started on <b>{started}</b></span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Link className="btn btn-sm" to="/">Go to Today</Link>
                      <Link className="btn btn-sm btn-ghost" to="/cycles">My crops</Link>
                    </div>
                  </div>
                </Notice>
              ) : (
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%", minHeight: 46 }}
                  onClick={start}
                  disabled={!plan}
                >
                  <Sprout size={18} aria-hidden />
                  Start this crop
                </button>
              )}
              {startError && <Notice kind="alert">{startError}</Notice>}
            </div>
          </Panel>
        </aside>

        <div className="stack">
          {!plan && !error && <Empty icon={Sparkles}>Choose crop and plants to view plan</Empty>}

          {plan && (
            <>
              <section className="hero" aria-label="Summary">
                <h2>
                  {plan.plants.toLocaleString()} {plan.crop.toLowerCase()} plants · {num(plan.water.grossM3, 1)} m³ water · {plan.cycleDays} days
                </h2>
                <div className="stats">
                  <div className="stat"><b>{num(plan.areaM2, 0)} m²</b><span>Space needed</span></div>
                  <div className="stat">
                    <b>{litres(growing ? growing.litersToday : first?.litersTotalGross ?? 0)}</b>
                    <span>{growing ? "Water today" : "Water day 1"}</span>
                  </div>
                  <div className="stat"><b>{litres(plan.water.peakLitersPerDay)}</b><span>Peak water / day</span></div>
                  {plan.harvest && <div className="stat"><b>{dayMonth(plan.harvest.firstPickOn)}</b><span>First picking</span></div>}
                </div>

                <div className="startbar">
                  {started ? (
                    <>
                      <span className="startbar-msg"><CircleCheck size={18} aria-hidden /> Started on {started}</span>
                      <Link className="btn btn-sm" to="/">Go to Today</Link>
                      <Link className="btn btn-sm btn-ghost" to="/cycles">My crops</Link>
                    </>
                  ) : (
                    <>
                      <span className="startbar-msg">Bed: <b>{(beds.data ?? []).find((b) => b.zone === bedChoice)?.label ?? (bedChoice === NEW_BED ? (bedName.trim() || autoName) : bedChoice)}</b></span>
                      <button className="btn" onClick={start}><Sprout size={18} aria-hidden />Start this crop</button>
                    </>
                  )}
                </div>
                {startError && <div style={{ marginTop: 10 }}><Notice kind="alert">{startError}</Notice></div>}
              </section>

              {warnings.map((n) => <Notice key={n.text} kind="warn">{n.text}</Notice>)}

              <div className="tabs tabs-in" role="tablist" aria-label="Plan details">
                {tabs.map((t) => (
                  <button key={t.id} role="tab" type="button" aria-selected={shown === t.id}
                          className={`tab${shown === t.id ? " tab-on" : ""}`} onClick={() => setTab(t.id)}>
                    <t.icon size={17} aria-hidden />{t.label}
                  </button>
                ))}
              </div>

              {shown === "water" && (
                <Panel>
                  <div style={{ height: 230 }}>
                    <ResponsiveContainer>
                      <AreaChart data={plan.water.days} margin={{ top: 8, right: 12, left: 0, bottom: 18 }}>
                        <CartesianGrid stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={28}
                               label={{ value: "day of the crop", position: "insideBottom", offset: -8, fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} width={52} />
                        <Tooltip formatter={(v: number) => [`${Math.round(v)} L`, "water for all plants"]} labelFormatter={(d) => `Day ${d}`} />
                        <Area type="monotone" dataKey="litersTotalGross" stroke="#2563A8" strokeWidth={2} fill="#2563A8" fillOpacity={0.14}
                              isAnimationActive={false} />
                        {growing && <ReferenceLine x={growing.day} stroke="var(--ink)" label={{ value: "today", fontSize: 12, fill: "var(--ink)", position: "insideTopRight" }} />}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {plan.water.howTo && (
                    <ul className="tasklist" style={{ marginTop: 14 }}>
                      {plan.water.howTo.map((h) => (
                        <li key={h.text}><Droplets size={18} aria-hidden style={{ color: "var(--water)" }} />
                          <span>{h.text}</span></li>
                      ))}
                    </ul>
                  )}

                  <details className="more" style={{ marginTop: 12 }}>
                    <summary><CalendarDays size={17} aria-hidden /> Week by week</summary>
                    <div className="tablewrap" style={{ marginTop: 8 }}>
                      <table className="tbl">
                        <thead><tr><th>Week</th><th>Starts</th><th>Stage</th><th className="r">Litres a day</th><th className="r">Litres a plant</th></tr></thead>
                        <tbody>
                          {plan.water.weeks.map((w) => (
                            <tr key={w.week}>
                              <td>{w.week}</td><td>{dayMonth(w.startsOn)}</td><td>{w.stage}</td>
                              <td className="r"><b>{Math.round(w.litersPerDay).toLocaleString()}</b></td>
                              <td className="r">{w.litersPerPlantPerDay.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <details className="more" style={{ marginTop: 8 }}>
                    <summary><Sun size={17} aria-hidden /> The weather behind it</summary>
                    <div className="tablewrap" style={{ marginTop: 8 }}>
                      <table className="tbl">
                        <thead><tr><th>Month</th><th className="r">Days of this crop</th><th className="r">Average high °C</th>
                          <th className="r">Water the air takes (mm a day)</th><th className="r">Rain (mm a day)</th></tr></thead>
                        <tbody>
                          {plan.season.months.map((m, i) => (
                            <tr key={i}>
                              <td>{new Date(2000, m.month - 1, 1).toLocaleDateString("en-GB", { month: "long" })}</td>
                              <td className="r">{m.days}</td><td className="r">{m.avgHighC}</td>
                              <td className="r">{m.et0MmDay}</td><td className="r">{m.rainMmDay}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="small muted" style={{ marginTop: 8 }}>{plan.water.et0Source}</p>
                  </details>
                </Panel>
              )}

              {shown === "jobs" && (
                <Panel pad={false}>
                  {!plan.hasGuide && (
                    <div className="panel-pad">
                      <Notice>{plan.crop} has water numbers but no growing guide yet, so there are no jobs, feeding or harvest notes. Only tomato has been researched so far.</Notice>
                    </div>
                  )}
                  {plan.stages.map((s, i) => {
                    const here = growing ? growing.stage === s.stage : i === 0;
                    return (
                      <details className="stagecard" key={s.stage} open={here}>
                        <summary>
                          <b>{s.title}</b>
                          <span className="chip">Days {s.firstDay}–{s.lastDay} · {dayMonth(s.startsOn)} to {dayMonth(s.endsOn)}</span>
                          <span className="chip chip-water"><Droplets size={14} aria-hidden />{num(s.avgLitersPerPlantPerDay, 2)} L a plant a day</span>
                          {here && growing && <span className="chip chip-now">Now</span>}
                        </summary>
                        {s.plain && <p>{s.plain}</p>}
                        {s.tasks.length > 0 && <Tasks tasks={s.tasks} />}
                        {s.watch && <Notice kind={s.watchBasis?.startsWith("study") ? "warn" : "info"}>{s.watch} {s.watchBasis && <Basis b={s.watchBasis} />}</Notice>}
                      </details>
                    );
                  })}
                </Panel>
              )}

              {shown === "feed" && plan.feed && (
                <Panel>
                  <div className="tablewrap">
                    <table className="tbl">
                      <thead><tr><th>When</th><th>What a plant gets</th><th className="r">Nitrogen (g)</th><th className="r">As urea (g)</th></tr></thead>
                      <tbody>
                        {plan.feed.rows.map((r, i) => (
                          <tr key={r.when}>
                            <td><b>{r.when}</b></td>
                            <td>
                              {i === 0
                                ? <>Compost {r.compostKg} kg · phosphate {r.phosphateG} g (as superphosphate {r.tspG} g) · potash {r.potashG} g (as potash fertiliser {r.mopG} g) · plus the nitrogen</>
                                : r.what}
                            </td>
                            <td className="r">{r.nitrogenG}</td><td className="r">{r.urea46G}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ marginTop: 12 }}>
                    <b>Buy for all {plan.plants.toLocaleString()} plants:</b> compost {plan.feed.totalsForAllPlants.compostKg} kg ·
                    urea {plan.feed.totalsForAllPlants.ureaKg} kg · superphosphate {plan.feed.totalsForAllPlants.tspKg} kg ·
                    potash fertiliser {plan.feed.totalsForAllPlants.mopKg} kg · rice straw {plan.feed.totalsForAllPlants.mulchKg} kg.
                    {" "}<Basis b={plan.feed.basis} />
                  </p>
                  <p className="small muted" style={{ marginTop: 8 }}>{plan.feed.note}</p>
                </Panel>
              )}

              {shown === "harvest" && plan.harvest && (
                <Panel>
                  <p>
                    First picking about <b>{dayMonthYear(plan.harvest.firstPickOn)}</b> (day {plan.harvest.firstPickDay}), picking
                    until about <b>{dayMonthYear(plan.harvest.lastOn)}</b>. <Basis b={plan.harvest.basis} />
                  </p>
                  <div className="tablewrap" style={{ marginTop: 12 }}>
                    <table className="tbl">
                      <thead><tr><th>{plan.harvest.benchmark.label}</th><th className="r">kg a plant</th>
                        <th className="r">For your {plan.plants.toLocaleString()} plants (kg)</th></tr></thead>
                      <tbody>
                        {plan.harvest.benchmark.rows.map((r) => (
                          <tr key={r.label}><td>{r.label}</td><td className="r">{r.kgPerPlant}</td>
                            <td className="r"><b>{Math.round(r.kgForYourPlants).toLocaleString()}</b></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 12 }}><Notice kind="warn">{plan.harvest.benchmark.caution}</Notice></div>
                </Panel>
              )}

              {shown === "sources" && (
                <Panel>
                  {plan.sources.map((s) => (
                    <div className="source" key={s.key}>
                      <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                      <div className="small muted"><SquareDashed size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> {s.read}</div>
                      <div className="small">{s.supports}</div>
                    </div>
                  ))}
                  <div className="source">
                    <b>Crop coefficients (Kc) and stage lengths.</b>
                    <div className="small muted">{plan.kcSource}</div>
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
