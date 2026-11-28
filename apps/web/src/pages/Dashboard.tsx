import { useMemo, useState } from "react";
import {
  ArrowRight, Bot, CalendarDays, ChevronRight, CloudRain, CloudSun, Droplets,
  FlaskConical, MapPin, ShieldAlert, Sprout, Thermometer, TrendingUp, Wallet,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import farmHeroImg from "../assets/farm-hero.jpg";
import { Empty, ErrorNotice, Panel, Skeleton } from "../components/ui";
import { useFarmFocus } from "../lib/farmContext";
import { litres, longToday, num } from "../lib/format";
import { useFarm, useTelemetry } from "../lib/queries";
import { targetsFromConditions, type PlantSoilRow } from "../lib/soil";
import { usdAndRiel } from "../lib/tomatoFinance";
import { ago } from "../lib/usePoll";
import { evaluateAgronomyAction } from "../utils/agronomyEngine";

const PIN_POSITIONS: [number, number][] = [
  [24, 52],
  [48, 36],
  [70, 44],
  [36, 72],
  [60, 66],
  [82, 32],
];

const CROP_COLORS = ["#8be26e", "#52c46d", "#e5b74a", "#5ea6f2", "#a98cf2"];

function avgOf(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function rateLevel(value: number | null, low: number, high: number): { label: string; warn: boolean } {
  if (value === null) return { label: "—", warn: false };
  if (value < low) return { label: "Low", warn: true };
  if (value > high) return { label: "High", warn: true };
  return { label: "Optimal", warn: false };
}

function shortAxisTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function Dashboard() {
  const farm = useFarm();
  const { setFocus } = useFarmFocus();
  const navigate = useNavigate();
  const { blocks, zones, allRows, advice, conditions, basis, rate } = farm;

  const growing = useMemo(() => blocks.filter((b) => b.plantCount > 0), [blocks]);
  const [selectedZone, setSelectedZone] = useState("");
  const activeZone = selectedZone && blocks.some((b) => b.zone === selectedZone)
    ? selectedZone
    : (growing[0]?.zone ?? zones[0]?.zone ?? "g1");

  const telemetry = useTelemetry(activeZone, ["soil_moisture"], 72, 24);

  const plants = growing.reduce((s, b) => s + b.plantCount, 0);
  const totalArea = growing.reduce((s, b) => s + b.areaM2, 0);
  const lastRound = farm.surveys.find((s) => s.status === "completed" || s.status === "aborted");
  const waterToday = advice.reduce((s, a) => s + a.water.litres, 0);
  const waterFull = advice.reduce((s, a) => s + a.water.fullLitres, 0);
  const waterSavedPct = waterFull > 0 ? Math.round(((waterFull - waterToday) / waterFull) * 100) : null;
  const paused = advice.filter((a) => a.water.paused).map((a) => a.label);
  const budget = growing.reduce((s, b) => s + b.budgetUsd, 0);
  const spent = growing.reduce((s, b) => s + b.spentToDateUsd, 0);

  const activePlants = useMemo(
    () => allRows.filter((r) => r.plant && growing.some((b) => b.zone === r.zone)),
    [allRows, growing],
  );

  const needYou = useMemo(
    () => activePlants
      .filter((r) => r.vision.status === "alert" || r.status === "attention")
      .sort((a, b) => Number(b.vision.status === "alert") - Number(a.vision.status === "alert")),
    [activePlants],
  );

  const visionCount = needYou.filter((r) => r.vision.status === "alert").length;
  const soilWatchCount = needYou.length - visionCount;
  const healthyCount = Math.max(0, activePlants.length - needYou.length);
  const healthScore = activePlants.length > 0
    ? Math.round((healthyCount * 100 + soilWatchCount * 68 + visionCount * 32) / activePlants.length)
    : 0;
  const healthWord = healthScore >= 85 ? "Good" : healthScore >= 65 ? "Fair" : "Attention";

  const healthSlices = useMemo(() => {
    const total = activePlants.length || 1;
    return [
      { name: "Healthy", count: healthyCount, pct: Math.round((healthyCount / total) * 100), color: "#78dc67" },
      { name: "Soil watch", count: soilWatchCount, pct: Math.round((soilWatchCount / total) * 100), color: "#e5b74a" },
      { name: "Camera alert", count: visionCount, pct: Math.round((visionCount / total) * 100), color: "#f06d5b" },
    ];
  }, [activePlants.length, healthyCount, soilWatchCount, visionCount]);

  const rowsByZone = useMemo(() => {
    const map = new Map<string, PlantSoilRow[]>();
    for (const r of allRows) map.set(r.zone, [...(map.get(r.zone) ?? []), r]);
    return map;
  }, [allRows]);

  const condOf = useMemo(() => new Map(conditions.map((c) => [c.zone, c])), [conditions]);
  const adviceOf = useMemo(() => new Map(advice.map((a) => [a.zone, a])), [advice]);
  const labelOf = useMemo(() => new Map(blocks.map((b) => [b.zone, b.label])), [blocks]);

  const tasks = useMemo(
    () => needYou.slice(0, 4).flatMap((p) => {
      const card = evaluateAgronomyAction(p, targetsFromConditions(condOf.get(p.zone)), {
        blockPlants: rowsByZone.get(p.zone),
        blockLabel: labelOf.get(p.zone) ?? p.zone,
      });
      return card ? [{ p, card }] : [];
    }),
    [needYou, condOf, rowsByZone, labelOf],
  );

  const activeBlock = blocks.find((b) => b.zone === activeZone) ?? growing[0];
  const activeCond = condOf.get(activeZone) ?? conditions.find((c) => c.params.some((p) => p.value !== null));
  const paramVal = (metric: string) => activeCond?.params.find((p) => p.metric === metric)?.value ?? null;
  const airTemp = paramVal("air_temperature");
  const airHumidity = paramVal("air_humidity");
  const soilTemp = paramVal("soil_temperature");
  const soilEc = paramVal("soil_ec");
  const isRaining = zones.find((z) => z.zone === activeZone)?.rain ?? false;

  const avgN = avgOf(activePlants.map((r) => r.readings.n));
  const avgP = avgOf(activePlants.map((r) => r.readings.p));
  const avgK = avgOf(activePlants.map((r) => r.readings.k));
  const nRate = rateLevel(avgN, 80, 160);
  const pRate = rateLevel(avgP, 40, 90);
  const kRate = rateLevel(avgK, 150, 250);
  const avgOm = avgOf(zones.map((z) => z.soilProfile?.organicMatterPct));

  const moistureTrend = useMemo(() => {
    const pts = telemetry.data?.series?.soil_moisture ?? [];
    if (pts.length <= 12) return pts.map((p) => ({ label: shortAxisTime(p.t), value: Number(p.v.toFixed(1)) }));
    const step = Math.ceil(pts.length / 10);
    return pts
      .filter((_, idx) => idx % step === 0 || idx === pts.length - 1)
      .map((p) => ({ label: shortAxisTime(p.t), value: Number(p.v.toFixed(1)) }));
  }, [telemetry.data]);

  const latestMoisture = moistureTrend.length ? moistureTrend[moistureTrend.length - 1].value : paramVal("soil_moisture");

  const cropDist = useMemo(() => {
    const map = new Map<string, { area: number; plants: number }>();
    for (const b of growing) {
      const key = b.variety ?? "Tomato";
      const prev = map.get(key) ?? { area: 0, plants: 0 };
      map.set(key, { area: prev.area + b.areaM2, plants: prev.plants + b.plantCount });
    }
    return [...map.entries()].map(([name, v], idx) => ({
      name,
      area: Math.round(v.area),
      plants: v.plants,
      pct: totalArea > 0 ? Math.round((v.area / totalArea) * 100) : 0,
      color: CROP_COLORS[idx % CROP_COLORS.length],
    }));
  }, [growing, totalArea]);

  const openPlant = (p: PlantSoilRow) => {
    setFocus(p.zone, p.name);
    navigate(`/rover?zone=${encodeURIComponent(p.zone)}&plant=${encodeURIComponent(p.name)}`);
  };

  return (
    <div className="dash-wrap">
      {farm.error && <ErrorNotice error={farm.error} onRetry={farm.refetch} />}

      <section className="dash-hero" style={{ backgroundImage: `url(${farmHeroImg})` }}>
        <div className="dash-welcome">
          <div>
            <h1>Today on the Farm</h1>
            <p>
              {farm.loading
                ? longToday()
                : `${longToday()} · ${growing.length} active blocks · ${plants} tomato plants across ${Math.round(totalArea)} m²`}
            </p>
          </div>
          <div className="dash-actions">
            <Link className="btn btn-sm btn-ghost" to="/plan"><CalendarDays size={15} aria-hidden />Plan</Link>
            <Link className="btn btn-sm" to="/rover"><Bot size={15} aria-hidden />Open rover</Link>
          </div>
        </div>

        <div className="dash-bento">
          <div className="dash-left">
            <div className="dash-kpis">
              <div className="dash-glass dash-kpi">
                <div className="dash-kpi-top">
                  <span className="dash-kpi-ico"><Sprout size={17} aria-hidden /></span>
                  <span className="dash-kpi-lbl">Active Blocks</span>
                </div>
                <div className="dash-kpi-val">
                  {farm.loading ? <Skeleton w="60%" h={26} /> : <>{growing.length}<small>/ {blocks.length}</small></>}
                </div>
                <div className="dash-kpi-sub good">{plants} plants · {Math.round(totalArea)} m²</div>
              </div>

              <div className="dash-glass dash-kpi">
                <div className="dash-kpi-top">
                  <span className="dash-kpi-ico water"><Droplets size={17} aria-hidden /></span>
                  <span className="dash-kpi-lbl">Drip Water Today</span>
                </div>
                <div className="dash-kpi-val">
                  {farm.loading ? <Skeleton w="60%" h={26} /> : litres(waterToday)}
                </div>
                <div className="dash-kpi-sub good">
                  {paused.length ? `Paused: ${paused.join(", ")}` : waterSavedPct !== null ? `${waterSavedPct}% saved vs blanket` : "Needs rover round"}
                </div>
              </div>

              <div className="dash-glass dash-kpi">
                <div className="dash-kpi-top">
                  <span className="dash-kpi-ico warn"><ShieldAlert size={17} aria-hidden /></span>
                  <span className="dash-kpi-lbl">Plants to Check</span>
                </div>
                <div className="dash-kpi-val">
                  {farm.loading ? <Skeleton w="50%" h={26} /> : needYou.length}
                </div>
                <div className="dash-kpi-sub">{visionCount} camera · {soilWatchCount} soil</div>
              </div>

              <div className="dash-glass dash-kpi">
                <div className="dash-kpi-top">
                  <span className="dash-kpi-ico"><Wallet size={17} aria-hidden /></span>
                  <span className="dash-kpi-lbl">Budget / Plant</span>
                </div>
                <div className="dash-kpi-val">
                  {farm.loading ? <Skeleton w="70%" h={26} /> : (basis ? `$${num(basis.roverPerPlantUsd, 2)}` : "—")}
                  {!farm.loading && basis && <small>{usdAndRiel(basis.roverPerPlantUsd, rate).replace(/^\$[\d.,]+\s*/, "")}</small>}
                </div>
                <div className="dash-kpi-sub">
                  <Link to="/costs">Spent ${num(spent, 2)} of ${num(budget, 2)} →</Link>
                </div>
              </div>
            </div>

            <div className="dash-stage-row">
              <div className="dash-glass">
                <div className="dash-card-head">
                  <div>
                    <div className="dash-card-title">Field Health Overview</div>
                    <div className="dash-card-sub">Rover vision &amp; soil scan</div>
                  </div>
                </div>
                {farm.loading || farm.roundsLoading ? (
                  <Skeleton h={132} />
                ) : (
                  <>
                    <div className="dash-donut-row">
                      <div className="dash-donut-box">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={healthSlices} dataKey="count" innerRadius={42} outerRadius={58} stroke="none" paddingAngle={2}>
                              {healthSlices.map((s) => <Cell key={s.name} fill={s.color} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="dash-donut-center">
                          <b>{healthScore}</b>
                          <span>{healthWord}</span>
                        </div>
                      </div>
                      <div className="dash-legend">
                        {healthSlices.map((s) => (
                          <div key={s.name} className="dash-legend-item">
                            <span className="dash-legend-k"><i style={{ background: s.color }} />{s.name}</span>
                            <b>{s.pct}%</b>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="dash-trend-foot">
                      <TrendingUp size={14} aria-hidden />
                      <span>
                        {lastRound ? `Last scan ${ago(lastRound.finishedAt ?? lastRound.startedAt)} · ${lastRound.cellsScanned ?? 0} plants` : "No rover scan yet"}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="dash-map-zone">
                {growing.slice(0, PIN_POSITIONS.length).map((b, idx) => {
                  const [x, y] = PIN_POSITIONS[idx];
                  const hasAlert = b.visionAlertCount > 0 || b.soilAttentionCount > 0;
                  const on = b.zone === activeZone;
                  return (
                    <button
                      key={b.zone}
                      type="button"
                      className={`dash-pin${hasAlert ? " warn" : ""}${on ? " on" : ""}`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                      onClick={() => setSelectedZone(b.zone)}
                      title={`${b.label} (${b.variety ?? "Tomato"})`}
                    >
                      <MapPin size={15} aria-hidden />
                    </button>
                  );
                })}
                {activeBlock && (
                  <Link
                    to={`/rover?zone=${encodeURIComponent(activeBlock.zone)}`}
                    className="dash-pin-pop"
                    onClick={() => setFocus(activeBlock.zone)}
                  >
                    <div className="dash-pin-pop-top">
                      <span>{activeBlock.label}</span>
                      <ChevronRight size={15} aria-hidden />
                    </div>
                    <div className="dash-pin-pop-meta">
                      {activeBlock.variety ?? "Tomato"} · {activeBlock.plantCount} plants · Day {activeBlock.day}
                    </div>
                    <div className="dash-pin-pop-score">
                      <span>
                        {activeBlock.visionAlertCount + activeBlock.soilAttentionCount > 0
                          ? `${activeBlock.visionAlertCount + activeBlock.soilAttentionCount} flagged`
                          : "All plants healthy"}
                      </span>
                      <span>{litres(activeBlock.waterTodayL)}</span>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="dash-right">
            <div className="dash-glass">
              <div className="dash-card-head">
                <div>
                  <div className="dash-card-title">Ambient Today</div>
                  <div className="dash-card-sub">{activeBlock?.label ?? activeZone.toUpperCase()}</div>
                </div>
              </div>
              <div className="dash-weather-main">
                <div>
                  <div className="dash-weather-temp">{airTemp !== null ? `${airTemp.toFixed(1)}°C` : "—"}</div>
                  <div className="dash-weather-desc">{isRaining ? "Rain detected · Drip paused" : "Dry · Normal greenhouse"}</div>
                </div>
                <span className="dash-weather-ico">
                  {isRaining ? <CloudRain size={24} aria-hidden /> : <CloudSun size={24} aria-hidden />}
                </span>
              </div>
              <div className="dash-weather-stats">
                <div className="dash-weather-stat">
                  <span><Droplets size={11} aria-hidden />Humidity</span>
                  <b>{airHumidity !== null ? `${Math.round(airHumidity)}%` : "—"}</b>
                </div>
                <div className="dash-weather-stat">
                  <span><Thermometer size={11} aria-hidden />Soil °C</span>
                  <b>{soilTemp !== null ? `${soilTemp.toFixed(1)}°` : "—"}</b>
                </div>
                <div className="dash-weather-stat">
                  <span><FlaskConical size={11} aria-hidden />Soil EC</span>
                  <b>{soilEc !== null ? `${soilEc.toFixed(2)}` : "—"}</b>
                </div>
              </div>
              <div className="dash-zone-strip">
                {growing.slice(0, 5).map((b) => {
                  const m = condOf.get(b.zone)?.params.find((p) => p.metric === "soil_moisture")?.value;
                  return (
                    <button
                      key={b.zone}
                      type="button"
                      className={`dash-zone-pill${b.zone === activeZone ? " on" : ""}`}
                      onClick={() => setSelectedZone(b.zone)}
                    >
                      <span>{b.zone.toUpperCase()}</span>
                      <b>{m != null ? `${Math.round(m)}%` : "—"}</b>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="dash-glass">
              <div className="dash-card-title">Soil Health Summary</div>
              <div className="dash-card-sub">Average across active blocks</div>
              <div className="dash-npk">
                <div className="dash-npk-item" title={avgN !== null ? `${Math.round(avgN)} mg/kg` : "No reading"}>
                  <span className={`dash-npk-badge${nRate.warn ? " warn" : ""}`}>N</span>
                  <div><span>Nitrogen</span><b>{nRate.label}</b></div>
                </div>
                <div className="dash-npk-item" title={avgP !== null ? `${Math.round(avgP)} mg/kg` : "No reading"}>
                  <span className={`dash-npk-badge${pRate.warn ? " warn" : ""}`}>P</span>
                  <div><span>Phosphorus</span><b>{pRate.label}</b></div>
                </div>
                <div className="dash-npk-item" title={avgK !== null ? `${Math.round(avgK)} mg/kg` : "No reading"}>
                  <span className={`dash-npk-badge${kRate.warn ? " warn" : ""}`}>K</span>
                  <div><span>Potassium</span><b>{kRate.label}</b></div>
                </div>
              </div>
              <div className="dash-om-head">
                <span>Soil Organic Matter</span>
                <b>{avgOm !== null ? `${avgOm.toFixed(1)}%` : "—"}</b>
              </div>
              <div className="dash-om-bar">
                <i style={{ width: `${avgOm !== null ? Math.min(100, Math.round((avgOm / 5) * 100)) : 0}%` }} />
              </div>
              <div className="dash-om-note">{avgOm !== null && avgOm >= 2.5 ? "Good level for tomatoes" : "Monitor organic matter"}</div>
            </div>
          </div>
        </div>

        <div className="dash-bottom">
          <div className="dash-glass">
            <div className="dash-card-head">
              <div>
                <div className="dash-card-title">Upcoming Tasks</div>
                <div className="dash-card-sub">Priority plant treatments today</div>
              </div>
              <Link className="linkbtn small" to="/crop">Gallery →</Link>
            </div>
            {tasks.length === 0 ? (
              <Empty icon={Sprout}>{farm.loading ? "Working it out…" : "No treatment due today."}</Empty>
            ) : (
              <div className="dash-task-list">
                {tasks.map(({ p, card }) => (
                  <button key={`${p.zone}-${p.name}`} type="button" className="dash-task-row" onClick={() => openPlant(p)}>
                    <div className="dash-task-main">
                      <span className="dash-task-ico"><ShieldAlert size={15} aria-hidden /></span>
                      <div className="dash-task-text">
                        <b>{card.title} · {p.name}</b>
                        <span>{labelOf.get(p.zone) ?? p.zone} · {card.doNowSteps[0]}</span>
                      </div>
                    </div>
                    <span className={`dash-task-badge${p.vision.severity === "High" ? " warn" : ""}`}>Due today</span>
                  </button>
                ))}
              </div>
            )}
            <Link to="/plan" className="dash-card-btn">View All Tasks</Link>
          </div>

          <div className="dash-glass">
            <div className="dash-card-head">
              <div>
                <div className="dash-card-title">Soil Moisture Trend</div>
                <div className="dash-card-sub">{activeBlock?.label ?? activeZone.toUpperCase()} · Last 72h</div>
              </div>
              {latestMoisture !== null && <span className="dash-chart-badge">{latestMoisture.toFixed(1)}%</span>}
            </div>
            <div className="dash-chart-box">
              {moistureTrend.length === 0 ? (
                <Empty icon={Droplets}>No moisture telemetry yet.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={moistureTrend} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="moistureGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8be26e" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#8be26e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(154,224,175,.1)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#9eb7a6", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#9eb7a6", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#0f2419", border: "1px solid rgba(154,224,175,.3)", borderRadius: 10, color: "#fff", fontSize: 12 }}
                      formatter={(v: number) => [`${v}%`, "Moisture"]}
                    />
                    <Area type="monotone" dataKey="value" stroke="#a6f07e" strokeWidth={2.5} fill="url(#moistureGlow)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="dash-glass">
            <div className="dash-card-head">
              <div>
                <div className="dash-card-title">Crop Distribution</div>
                <div className="dash-card-sub">By growing area</div>
              </div>
            </div>
            {cropDist.length === 0 ? (
              <Empty icon={Sprout}>No active crops.</Empty>
            ) : (
              <div className="dash-donut-row">
                <div className="dash-donut-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={cropDist} dataKey="area" innerRadius={42} outerRadius={58} stroke="none" paddingAngle={2}>
                        {cropDist.map((c) => <Cell key={c.name} fill={c.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="dash-donut-center">
                    <b>{Math.round(totalArea)} m²</b>
                    <span>{plants} plants</span>
                  </div>
                </div>
                <div className="dash-legend">
                  {cropDist.map((c) => (
                    <div key={c.name} className="dash-legend-item">
                      <span className="dash-legend-k"><i style={{ background: c.color }} />{c.name}</span>
                      <b>{c.area} m² · {c.pct}%</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Link to="/cycles" className="dash-card-btn">View Details</Link>
          </div>
        </div>
      </section>

      <Panel title="Growing Blocks" icon={Sprout} right={<Link className="linkbtn small" to="/cycles">All crops →</Link>}>
        {farm.loading ? (
          <div className="blk-grid"><Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} /></div>
        ) : growing.length === 0 ? (
          <Empty icon={Sprout}>No crop is growing. <Link to="/cycles?add=true">Start a tomato crop</Link></Empty>
        ) : (
          <div className="blk-grid">
            {growing.map((b) => {
              const cond = condOf.get(b.zone);
              const adv = adviceOf.get(b.zone);
              const pct = b.budgetUsd > 0 ? Math.round((b.spentToDateUsd / b.budgetUsd) * 100) : 0;
              const getParam = (metric: string) => cond?.params.find((p) => p.metric === metric);
              const moisture = getParam("soil_moisture");
              const ph = getParam("soil_ph");
              const ec = getParam("soil_ec");
              const soilTemp = getParam("soil_temperature");
              const airTemp = getParam("air_temperature");
              const airRh = getParam("air_humidity");
              const n = getParam("nitrogen");
              const pVal = getParam("phosphorus");
              const k = getParam("potassium");
              const totalFlags = b.visionAlertCount + b.soilAttentionCount;
              const statusTone = cond?.status === "critical" ? "alert" : (totalFlags > 0 || cond?.status === "warning") ? "warn" : "ok";
              const statusText = cond?.status === "critical" ? "Critical" : totalFlags > 0 ? `${totalFlags} to check` : cond?.status === "warning" ? "Warning" : "Healthy";
              const metricTone = (s?: string) => (s === "warning" || s === "critical" ? ` ${s}` : "");

              return (
                <article key={b.zone} className="blk-card">
                  <div className="blk-head">
                    <div style={{ minWidth: 0 }}>
                      <h3>{b.label}</h3>
                      <p className="blk-sub">
                        {b.variety ?? "Tomato"} · {b.plantCount} plants · Day {b.day}{cond?.stage ? ` · ${cond.stage.title}` : ""}
                      </p>
                    </div>
                    <span className={`blk-badge ${statusTone}`}>{statusText}</span>
                  </div>

                  <div className="blk-metrics">
                    <div className={`blk-stat${metricTone(moisture?.status)}`}>
                      <span>Moisture</span>
                      <b>{moisture?.value != null ? `${moisture.value.toFixed(1)}%` : "—"}</b>
                    </div>
                    <div className={`blk-stat${metricTone(ph?.status)}`}>
                      <span>Soil pH</span>
                      <b>{ph?.value != null ? ph.value.toFixed(2) : "—"}</b>
                    </div>
                    <div className={`blk-stat${metricTone(ec?.status)}`}>
                      <span>Soil EC</span>
                      <b>{ec?.value != null ? ec.value.toFixed(2) : "—"}</b>
                    </div>
                    <div className="blk-stat">
                      <span>Water</span>
                      <b>{adv ? (adv.water.paused ? "Paused" : litres(adv.water.litres)) : "—"}</b>
                    </div>
                  </div>

                  {(cond?.alerts?.length ?? 0) > 0 && (
                    <div className="blk-alerts">
                      {cond!.alerts.map((a) => (
                        <span key={a.id} className={`blk-alert ${a.severity}`} title={a.message}>{a.title}</span>
                      ))}
                    </div>
                  )}

                  {cond && cond.params.some((p) => p.value != null) && (
                    <details className="blk-more">
                      <summary>
                        <span>More soil &amp; air readings</span>
                        <span>{cond.recordedAt ? ago(cond.recordedAt) : ""}</span>
                      </summary>
                      <div className="blk-extra">
                        <div>
                          <span>N · P · K</span>
                          <b>{n?.value != null ? Math.round(n.value) : "—"} · {pVal?.value != null ? Math.round(pVal.value) : "—"} · {k?.value != null ? Math.round(k.value) : "—"}</b>
                        </div>
                        <div>
                          <span>Soil °C</span>
                          <b>{soilTemp?.value != null ? `${soilTemp.value.toFixed(1)}°` : "—"}</b>
                        </div>
                        <div>
                          <span>Air °C</span>
                          <b>{airTemp?.value != null ? `${airTemp.value.toFixed(1)}°` : "—"}</b>
                        </div>
                        <div>
                          <span>Humidity</span>
                          <b>{airRh?.value != null ? `${Math.round(airRh.value)}%` : "—"}</b>
                        </div>
                      </div>
                    </details>
                  )}

                  <div className="meter">
                    <div className="meter-head"><span>Spent / budget</span><b>${num(b.spentToDateUsd, 2)} / ${num(b.budgetUsd, 2)}</b></div>
                    <div className={`bar${pct > 100 ? " bar-over" : ""}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
                  </div>

                  <div className="blk-foot">
                    <span className="blk-foot-meta">
                      <Droplets size={13} aria-hidden />
                      {adv ? (adv.water.paused ? "Drip paused (rain)" : `Drip ${litres(adv.water.litres)} today`) : "No schedule"}
                    </span>
                    {b.cycleId && (
                      <Link className="blk-open" to={`/cycles/${b.cycleId}/tomato`} onClick={() => setFocus(b.zone)}>
                        Open Block <ArrowRight size={13} aria-hidden />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
