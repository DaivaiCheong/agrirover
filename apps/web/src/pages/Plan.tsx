import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BookOpen, CalendarDays, CircleCheck, Droplets, Flag, FlaskConical, Scale, Sprout, Sun, SquareDashed, Sparkles,
  Wheat,
} from "lucide-react";
import NewCropForm from "../components/NewCropForm";
import { Empty, Field, Notice, PageHead, Panel } from "../components/ui";
import { api, type CropPlan, type PlanTask } from "../lib/api";
import { dayMonth, dayMonthYear, litres, num, todayIso } from "../lib/format";
import { useData } from "../lib/useData";

const METHODS = [
  { id: "drip", label: "Drip lines", efficiency: 0.9 },
  { id: "sprinkler", label: "Sprinkler", efficiency: 0.75 },
  { id: "hand", label: "Hand or furrow", efficiency: 0.6 },
] as const;

const NEW_BED = "__new__";
const CUSTOM_CROP = "__custom__";

const WHO: Record<string, string> = {
  aomori: "Aomori, Japan", fukushima: "Fukushima, Japan", hiroshima: "Hiroshima, Japan", kumamoto: "Kumamoto, Japan",
  yamaguchi: "Yamaguchi, Japan", rua: "Cambodian trial (RUA)", nasa: "NASA weather", fao56: "FAO-56",
};

/** Where a statement comes from, in two or three words. */
function Basis({ b }: { b: string }) {
  if (b === "practice") return <span className="basis" title="Ordinary growing practice, not taken from a study listed below">Standard practice</span>;
  const key = b.replace("study:", "");
  return <span className="basis basis-study" title="See the sources at the bottom of this page">{WHO[key] ?? key}</span>;
}

function Tasks({ tasks }: { tasks: PlanTask[] }) {
  return (
    <ul className="tasklist">
      {tasks.map((t) => (
        <li key={t.text}>
          <CircleCheck size={18} aria-hidden />
          <span>
            <b className="small muted">{t.firstDay === t.lastDay ? `Day ${t.firstDay}` : `Days ${t.firstDay}–${t.lastDay}`} · {dayMonth(t.startsOn)}</b>
            <br />{t.text} <Basis b={t.basis} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Plan() {
  const [qs] = useSearchParams();
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

  const [plan, setPlan] = useState<CropPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  // the plan follows the form: change a number and it is worked out again
  useEffect(() => {
    const n = Number(plants);
    if (!Number.isInteger(n) || n < 1 || !plantedOn || crop === CUSTOM_CROP) { setPlan(null); setError(null); return; }
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

  // start this crop
  const [bed, setBed] = useState("");
  const [bedName, setBedName] = useState("");
  const [started, setStarted] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const busy = new Set((cycles.data ?? []).filter((c) => c.status === "active").map((c) => c.zone));
  const bedChoice = bed || (beds.data ?? []).find((b) => !busy.has(b.zone))?.zone || NEW_BED;

  async function start() {
    if (!plan) return;
    setStartError(null);
    try {
      let zone = bedChoice;
      if (zone === NEW_BED) zone = (await api.addBed({ label: bedName, areaM2: plan.areaM2 })).name;
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
  const check = plan?.water.check;

  return (
    <>
      <PageHead icon={Sprout} title="Plan a crop"
                sub="Tell us how many plants you have. We work out the water, the feeding and the harvest." />
      <main className="main stack">
        <Panel title="Your planting" icon={Sprout}>
          <div className="form">
            <div className="row2">
              <div className="bignum-input">
                <Field label="How many plants?">
                  <input type="number" inputMode="numeric" min={1} step={1} value={plants} autoFocus
                         onChange={(e) => setPlants(e.target.value)} />
                </Field>
              </div>
              <div className="stack" style={{ gap: 14 }}>
                <Field label="Which crop?">
                  <select value={crop} onChange={(e) => setCrop(e.target.value)}>
                    {waterCrops.length === 0 && <option value="tomato">Tomato</option>}
                    {waterCrops.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    <option value={CUSTOM_CROP}>+ A crop that is not in the list</option>
                  </select>
                </Field>
                <Field label="Planting date" hint="The day you plant is day 1.">
                  <input type="date" value={plantedOn} onChange={(e) => setPlantedOn(e.target.value)} />
                </Field>
              </div>
            </div>
            <div>
              <div className="lbl lbl-ink" style={{ marginBottom: 6 }}>How do you water?</div>
              <div className="seg" role="group" aria-label="How you water">
                {METHODS.map((m) => (
                  <button key={m.id} type="button" className={method === m.id ? "on" : ""} onClick={() => setMethod(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 6 }}>
                Drip puts about 90% of the water on the roots, sprinklers about 75%, hand watering about 60%.
              </p>
            </div>
            <details className="more">
              <summary>More choices (spacing, variety)</summary>
              <div className="row3" style={{ marginTop: 10 }}>
                <Field label="Between rows (cm)" hint={plan?.hasGuide ? "Default 50, as in the Cambodian trial" : undefined}>
                  <input type="number" min={10} value={rowCm} placeholder="50" onChange={(e) => setRowCm(e.target.value)} />
                </Field>
                <Field label="Between plants (cm)" hint={plan?.hasGuide ? "Default 70" : undefined}>
                  <input type="number" min={5} value={plantCm} placeholder="70" onChange={(e) => setPlantCm(e.target.value)} />
                </Field>
                <Field label="Variety (optional)">
                  <input value={variety} onChange={(e) => setVariety(e.target.value)} />
                </Field>
              </div>
            </details>
          </div>
          {error && <div style={{ marginTop: 12 }}><Notice kind="alert">{error}</Notice></div>}
          {crop === CUSTOM_CROP && (
            <div style={{ marginTop: 16 }}><NewCropForm onAdded={(slug) => { crops.reload(); setCrop(slug); }} /></div>
          )}
        </Panel>

        {!plan && !error && crop !== CUSTOM_CROP && <Empty icon={Sparkles}>Enter the number of plants and the plan appears here.</Empty>}

        {plan && (
          <>
            <section className="hero" aria-label="Summary">
              <h2>
                {plan.plants.toLocaleString()} {plan.crop.toLowerCase()} plants need about {num(plan.water.grossM3, 1)} m³ of
                water over {plan.cycleDays} days
              </h2>
              <p>
                That is about {num(plan.water.perPlantWholeCycleL, 0)} litres for each plant, planted {dayMonthYear(plan.plantedOn)}
                {" "}and finished {dayMonthYear(plan.endsOn)}.
              </p>
              <div className="stats">
                <div className="stat"><b>{num(plan.areaM2, 0)} m²</b><span>Space needed ({plan.areaPerPlantM2} m² a plant)</span></div>
                <div className="stat">
                  <b>{litres(growing ? growing.litersToday : first?.litersTotalGross ?? 0)}</b>
                  <span>{growing ? `Water today (day ${growing.day})` : "Water on day 1"}</span>
                </div>
                <div className="stat"><b>{litres(plan.water.peakLitersPerDay)}</b><span>Busiest day: size the pump and tank for this</span></div>
                {plan.harvest && <div className="stat"><b>{dayMonth(plan.harvest.firstPickOn)}</b><span>First picking, about</span></div>}
              </div>
            </section>

            {plan.season.notes.map((n) => (
              <Notice key={n.text} kind={n.kind === "warn" ? "warn" : "info"}>
                {n.text} <Basis b={n.basis} />
              </Notice>
            ))}
            {now?.state === "not_planted" && (
              <Notice>Planting is {now.startsInDays} day{now.startsInDays === 1 ? "" : "s"} away. Water starts the day after planting.</Notice>
            )}

            <Panel title="Water" icon={Droplets}>
              <div style={{ height: 250 }}>
                <ResponsiveContainer>
                  <AreaChart data={plan.water.days} margin={{ top: 8, right: 12, left: 0, bottom: 18 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={28}
                           label={{ value: "day of the crop", position: "insideBottom", offset: -8, fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={52} />
                    <Tooltip formatter={(v: number) => [`${Math.round(v)} L`, "water for all plants"]} labelFormatter={(d) => `Day ${d}`} />
                    <Area type="monotone" dataKey="litersTotalGross" stroke="#2563A8" strokeWidth={2} fill="#2563A8" fillOpacity={0.14}
                          isAnimationActive={false} />
                    {growing && <ReferenceLine x={growing.day} stroke="var(--alert)" label={{ value: "today", fontSize: 12, fill: "var(--alert)" }} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>
                Litres per day for all {plan.plants.toLocaleString()} plants. It rises as the plants grow and follows the
                weather of the months the crop lives through.
              </p>

              {plan.water.howTo && (
                <ul className="tasklist" style={{ marginTop: 14 }}>
                  {plan.water.howTo.map((h) => (
                    <li key={h.text}><Droplets size={18} aria-hidden style={{ color: "var(--water)" }} />
                      <span>{h.text} <Basis b={h.basis} /></span></li>
                  ))}
                </ul>
              )}

              {check && (
                <div style={{ marginTop: 14 }}>
                  <Notice kind={check.verdict === "outside" ? "warn" : "info"}>
                    <b>Checked against Japanese growers.</b> This plan's busiest day is {check.ourPeakMmDay} mm of water a day.
                    Aomori's best growers watered {check.japanMmDayRange[0]}–{check.japanMmDayRange[1]} mm a day at their
                    busiest ({check.japanLitersPerPlantPeak[0]}–{check.japanLitersPerPlantPeak[1]} litres a plant).{" "}
                    {check.verdict === "inside" && "The plan sits inside that range."}
                    {check.verdict === "close" && "The plan is just outside that range, so the two agree closely."}
                    {check.verdict === "outside" && "The plan is well outside that range: treat the numbers with care and watch the soil."}
                    {" "}That is a greenhouse in a cool climate, so it supports the size of the numbers, not every detail.
                  </Notice>
                </div>
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
                <p className="small muted" style={{ marginTop: 8 }}>{plan.water.et0Source} Rain is not taken off the water plan.</p>
              </details>
            </Panel>

            <Panel title="Stage by stage" icon={CalendarDays} pad={false}>
              {plan.stages.map((s) => (
                <div className="stagecard" key={s.stage}>
                  <h3>{s.title}
                    <span className="chip">Days {s.firstDay}–{s.lastDay} · {dayMonth(s.startsOn)} to {dayMonth(s.endsOn)}</span>
                    <span className="chip chip-water"><Droplets size={14} aria-hidden />{num(s.avgLitersPerPlantPerDay, 2)} L a plant a day</span>
                  </h3>
                  {s.plain && <p>{s.plain}</p>}
                  {s.tasks.length > 0 && <Tasks tasks={s.tasks} />}
                  {s.watch && <Notice kind={s.watchBasis?.startsWith("study") ? "warn" : "info"}>{s.watch} {s.watchBasis && <Basis b={s.watchBasis} />}</Notice>}
                </div>
              ))}
            </Panel>

            {plan.feed && (
              <Panel title="Feeding" icon={FlaskConical}>
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

            {plan.harvest && (
              <Panel title="Harvest" icon={Wheat}>
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

            {!plan.hasGuide && (
              <Notice>
                {plan.crop} has water numbers but no growing guide yet, so there are no feeding or harvest notes.
                Only tomato has been researched so far.
              </Notice>
            )}

            <Panel title="Start this crop" icon={Flag}>
              {started ? (
                <div className="stack">
                  <Notice kind="ok">Started. Today now shows this crop's water and jobs.</Notice>
                  <div className="rowflex">
                    <Link className="btn" to="/">Go to Today</Link>
                    <Link className="btn btn-ghost" to="/cycles">See My crops</Link>
                  </div>
                </div>
              ) : (
                <div className="form" style={{ maxWidth: 520 }}>
                  <p className="muted">
                    Saves this plan as a crop on one of your beds, so costs, harvest and the cost per kg can be recorded against it.
                  </p>
                  <Field label="Which bed?">
                    <select value={bedChoice} onChange={(e) => setBed(e.target.value)}>
                      {(beds.data ?? []).map((b) => (
                        <option key={b.zone} value={b.zone} disabled={busy.has(b.zone)}>
                          {b.label ?? b.zone}{busy.has(b.zone) ? " (already has a crop)" : ""}
                        </option>
                      ))}
                      <option value={NEW_BED}>+ A new bed</option>
                    </select>
                  </Field>
                  {bedChoice === NEW_BED && (
                    <Field label="Name of the new bed" hint={`It will be ${num(plan.areaM2, 0)} m², from your plant count.`}>
                      <input value={bedName} onChange={(e) => setBedName(e.target.value)} />
                    </Field>
                  )}
                  <div>
                    <button className="btn" disabled={bedChoice === NEW_BED && !bedName.trim()} onClick={start}>
                      <Sprout size={18} aria-hidden />Start this crop
                    </button>
                  </div>
                  {startError && <Notice kind="alert">{startError}</Notice>}
                </div>
              )}
            </Panel>

            <Panel title="Where this comes from" icon={BookOpen}>
              <p className="muted" style={{ marginBottom: 6 }}>
                Water uses the FAO-56 method with Siem Reap's own weather. Japanese prefectural trials are used to check
                it and to guide when and how to water. Most of the tomato research is from greenhouses in Japan's cooler
                climate, so treat it as a guide for Cambodia, not a promise.
              </p>
              <details className="more">
                <summary><Scale size={17} aria-hidden /> Sources and how much of each was read</summary>
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
              </details>
            </Panel>
          </>
        )}
      </main>
    </>
  );
}
