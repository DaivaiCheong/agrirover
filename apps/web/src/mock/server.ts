/**
 * The sample orchard, answered in the browser: same paths and same shapes as the real API, plus the /orchard paths the
 * real API does not have yet. Changes last until the page reloads. Nothing here reaches the farm server.
 */
import { ApiError } from "../lib/api";
import type {
  Asset, BedConditions, Cop, CostEntry, Crop, CropPlan, Cycle, DeviceRow, Forecast, Harvest, OrchardCycle, Sale, Settings,
  SetupInfo, StockItem, StockMove, TelemetrySeries, ZoneDecision, ZoneNow,
} from "../lib/api";
import {
  CYCLE_DAYS, DOC_ISSUES, HARVEST_DAYS, METHODS, METRIC_ORDER, PARAM_RULES, RAINY_MONTHS, SETUPS, SOURCE, STAGES, SYMPTOMS,
  correlate, fertigationFor, jobsFor, litresPerTree, rateBed, readingsFor, stageOf, treesForArea, type Readings, ET0_MM_DAY, JOBS,
} from "./guava";

const FIRMWARE_LIMIT_S = 90;            // edge/esp8266-field-node: MAX_RUN_MS

const iso = (d: Date) => d.toLocaleDateString("sv-SE");
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysAgo = (n: number) => { const d = today(); d.setDate(d.getDate() - n); return iso(d); };
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const dayOf = (startIso: string) => Math.round((today().getTime() - new Date(`${startIso}T00:00:00`).getTime()) / 86400000) + 1;
const round = (v: number, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const ageSeconds = 40;

// ---------------------------------------------------------------- state

type Bed = { zone: string; label: string; areaM2: number };
type GuavaCycle = {
  id: string; zone: string; setup: string | null; trees: number; variety: string | null; cycleStartedOn: string; treesPlantedOn: string;
  regulation: string; price: number | null; endedOn: string | null; fruitMm: number | null; done: Set<string>;
};

const beds: Bed[] = [
  { zone: "g1", label: "G1 Wide orchard", areaM2: 400 },
  { zone: "g2", label: "G2 Kimju block", areaM2: 105 },
  { zone: "g3", label: "G3 Hedgerow", areaM2: 60 },
  { zone: "g4", label: "G4 Meadow pilot", areaM2: 50 },
  { zone: "g5", label: "G5 Pearl block", areaM2: 105 },
  { zone: "g6", label: "G6 Free plot", areaM2: 50 },
];

function seedDone(day: number, regulation: string, leaveOpen: string[] = []) {
  return new Set(JOBS.filter((j) => j.lastDay < day && (!j.only || j.only === regulation) && !leaveOpen.includes(j.id)).map((j) => j.id));
}

function cycleAt(id: string, zone: string, setup: string, trees: number, variety: string, day: number, plantedYearsAgo: number, regulation: string,
                 price: number, fruitMm: number | null = null, leaveOpen: string[] = []): GuavaCycle {
  return { id, zone, setup, trees, variety, cycleStartedOn: daysAgo(day - 1), treesPlantedOn: daysAgo(Math.round(plantedYearsAgo * 365)),
           regulation, price, endedOn: null, fruitMm, done: seedDone(day, regulation, leaveOpen) };
}

const cycles: GuavaCycle[] = [
  cycleAt("c1", "g1", "wide", 16, "Local Khmer", 30, 6, "withhold", 0.75),
  cycleAt("c2", "g2", "commercial", 10, "Kimju", 60, 3, "pruning", 1.15),
  cycleAt("c3", "g3", "hedgerow", 10, "Crystal Guava", 90, 2.5, "pruning", 1.15, null, ["zn_b"]),
  cycleAt("c4", "g4", "meadow", 25, "Dwarf Kimju", 120, 1.5, "pruning", 1.1, 34),
  cycleAt("c5", "g5", "commercial", 10, "Taiwan Pearl", 165, 4, "bending", 1.15, 42),
];

let nextId = 100;
const newId = (p: string) => `${p}${nextId++}`;

let settings: Settings = { khrPerUsd: 4000, rateConfirmed: true, familyWageUsdPerDay: 3, waterCostPerM3Usd: 0.1, landRentUsdPerHaYear: 300, irrigationEfficiency: 0.9 };

const cost = (id: string, plantingId: string, ago: number, category: string, description: string, amountUsd: number): CostEntry => ({
  id, plantingId, date: daysAgo(ago), category, description, qty: null, unit: null, unitPrice: null, amount: amountUsd, currency: "USD", amountUsd, rateUsed: null, source: "manual" });

// labour is most of the cost, as in the document (above 80 % in its accounts)
const costs: CostEntry[] = [
  cost("k1", "c5", 160, "labour_hired", "Bending branches", 30), cost("k2", "c5", 120, "labour_family", "Weeding and pinching", 42),
  cost("k3", "c5", 60, "labour_hired", "Bagging 10 trees", 48), cost("k4", "c5", 20, "labour_family", "Picking", 36),
  cost("k5", "c5", 100, "fertilizer", "SOP, calcium nitrate", 22), cost("k6", "c5", 62, "materials", "Foam nets and bags", 14),
  cost("k7", "c4", 110, "labour_hired", "Pruning the hedge", 26), cost("k8", "c4", 60, "fertilizer", "MAP, potassium nitrate", 12),
  cost("k9", "c1", 25, "fertilizer", "Manure and mycorrhiza", 40), cost("k10", "c3", 70, "labour_family", "Hedging", 24),
];
const harvests: Record<string, Harvest[]> = {
  c5: [{ id: "h1", date: daysAgo(6), kgTotal: 96, kgMarketable: 84, kgHome: 4, kgLost: 8, note: "First picking" }],
};
const sales: Record<string, Sale[]> = {
  c5: [{ id: "s1", date: daysAgo(5), kg: 80, pricePerKg: 1.15, currency: "USD", amountUsd: 92, buyer: "Siem Reap market" }],
};
const stock: StockItem[] = [
  { id: "i1", name: "Foam nets and bags", category: "materials", unit: "pcs", qtyOnHand: 800, avgUnitCostUsd: 0.02, valueUsd: 16 },
  { id: "i2", name: "SOP 0:0:50", category: "fertilizer", unit: "kg", qtyOnHand: 25, avgUnitCostUsd: 1.1, valueUsd: 27.5 },
  { id: "i3", name: "MAP 12:61:0", category: "fertilizer", unit: "kg", qtyOnHand: 10, avgUnitCostUsd: 1.6, valueUsd: 16 },
];
const assets: Asset[] = [
  { id: "a1", name: "Drip lines and emitters", costUsd: 180, boughtOn: daysAgo(500), lifeYears: 5, salvageUsd: 0, retiredOn: null, dailyDepreciationUsd: 0.1, status: "in_service" },
  { id: "a2", name: "Venturi injector", costUsd: 45, boughtOn: daysAgo(300), lifeYears: 4, salvageUsd: 0, retiredOn: null, dailyDepreciationUsd: 0.03, status: "in_service" },
];

// ---------------------------------------------------------------- views

const setupOf = (id: string | null) => SETUPS.find((s) => s.id === id) ?? null;
const bedOf = (zone: string) => {
  const b = beds.find((x) => x.zone === zone);
  if (!b) throw new ApiError(`unknown bed ${zone}`);
  return b;
};
const openCycleOn = (zone: string) => cycles.find((c) => c.zone === zone && !c.endedOn) ?? null;
const cycleById = (id: string) => {
  const c = cycles.find((x) => x.id === id);
  if (!c) throw new ApiError("cycle not found");
  return c;
};
const isStress = (c: GuavaCycle) => c.regulation === "withhold";
const isBagged = (c: GuavaCycle) => c.done.has("bag");

function forecastOf(c: GuavaCycle): Forecast | null {
  const s = setupOf(c.setup);
  if (!s) return null;
  const lo = round(c.trees * s.kgPerPlant[0], 1), hi = round(c.trees * s.kgPerPlant[1], 1);
  return { setup: s.id, label: s.label, plants: c.trees, kgLow: lo, kgHigh: hi, kgMid: round((lo + hi) / 2, 1), pricePerKgUsd: c.price,
           revenueLowUsd: c.price === null ? null : round(lo * c.price), revenueHighUsd: c.price === null ? null : round(hi * c.price), basis: "guava_doc" };
}

function cycleView(c: GuavaCycle): Cycle {
  const b = bedOf(c.zone);
  const day = c.endedOn ? null : dayOf(c.cycleStartedOn);
  const stage = day !== null && day >= 1 ? stageOf(day) : null;
  const s = setupOf(c.setup);
  const harvestFrom = addDays(c.cycleStartedOn, HARVEST_DAYS[0] - 1), harvestTo = addDays(c.cycleStartedOn, HARVEST_DAYS[1] - 1);
  const midMonth = Number(addDays(c.cycleStartedOn, Math.round((HARVEST_DAYS[0] + HARVEST_DAYS[1]) / 2) - 1).slice(5, 7));
  return {
    id: c.id, zone: c.zone, bedLabel: b.label, trialArm: null, crop: "guava", cropName: "Guava", variety: c.variety,
    plantedOn: c.cycleStartedOn, endedOn: c.endedOn, status: c.endedOn ? "closed" : "active", day,
    stage: stage?.key ?? null, stageTitle: stage?.title ?? null, plantCount: c.trees, areaM2: b.areaM2,
    setup: c.setup, setupLabel: s?.label ?? null, expectedPriceUsdPerKg: c.price, forecast: forecastOf(c),
    perennial: {
      treesPlantedOn: c.treesPlantedOn, treeAgeYears: round((today().getTime() - new Date(`${c.treesPlantedOn}T00:00:00`).getTime()) / (365 * 86400000), 1),
      regulation: c.regulation, regulationLabel: METHODS.find((m) => m.id === c.regulation)?.label ?? c.regulation, stress: isStress(c),
      harvestFrom, harvestTo, rainyHarvest: RAINY_MONTHS.includes(midMonth),
    },
  };
}

function recentMin(day: number, stress: boolean) {
  return Math.min(...[1, 2, 3].map((back) => readingsFor(Math.max(1, day - back), stress).soil_moisture));
}

function conditionsOfDay(c: GuavaCycle, day: number): BedConditions {
  const b = bedOf(c.zone);
  const at = new Date(Date.now() - ageSeconds * 1000).toISOString();
  const rated = rateBed(readingsFor(day, isStress(c)), day, { stress: isStress(c), recentMinMoisture: recentMin(day, isStress(c)), fruitMm: c.fruitMm, bagged: isBagged(c) }, at);
  return { zone: b.zone, label: b.label, areaM2: b.areaM2, crop: "guava", cropName: "Guava", variety: c.variety, day, recordedAt: at, ...rated };
}

function conditionsOfBed(b: Bed): BedConditions {
  const c = openCycleOn(b.zone);
  if (c) return conditionsOfDay(c, dayOf(c.cycleStartedOn));
  return { zone: b.zone, label: b.label, areaM2: b.areaM2, crop: null, cropName: null, variety: null, day: null, recordedAt: null, rated: true,
           status: "no_data", basis: "guava_doc", source: SOURCE, stage: null, alerts: [],
           params: METRIC_ORDER.map((metric) => {
             const base = rateBed(readingsFor(60, false), 60, { stress: false, recentMinMoisture: 60, fruitMm: null, bagged: false }, "").params.find((p) => p.metric === metric)!;
             return { ...base, value: null, recordedAt: null, status: "no_data" as const, direction: null, target: null };
           }) };
}

function orchardView(c: GuavaCycle, wanted?: number): OrchardCycle {
  const actualDay = dayOf(c.cycleStartedOn);
  const day = Math.min(CYCLE_DAYS, Math.max(1, wanted ?? actualDay));
  const s = setupOf(c.setup);
  const b = bedOf(c.zone);
  const areaPerTree = b.areaM2 / c.trees;
  const month = new Date(`${addDays(c.cycleStartedOn, day - 1)}T00:00:00`).getMonth() + 1;
  const stage = stageOf(day);
  const perTree = isStress(c) || stage.n > 1 ? litresPerTree(day, month, areaPerTree, settings.irrigationEfficiency)
    : litresPerTree(50, month, areaPerTree, settings.irrigationEfficiency);       // stage 1 without stress: light watering
  const lph = s?.orchard?.emitterLphPerTree ?? 8;
  return {
    cycle: cycleView(c), day, actualDay, sample: true, stages: STAGES, stage,
    conditions: conditionsOfDay(c, day), jobs: jobsFor(day, actualDay, c.done, c.regulation), fertigation: fertigationFor(stage.n), rules: PARAM_RULES,
    water: { litresPerTree: round(perTree, 1), litresTotal: round(perTree * c.trees, 0), hoursPerRun: round(perTree / lph, 1), emitterLphPerTree: lph, firmwareLimitSeconds: FIRMWARE_LIMIT_S },
    fruitMm: c.fruitMm, bagged: isBagged(c), setup: s, docIssues: DOC_ISSUES,
  };
}

function zoneNow(b: Bed): ZoneNow {
  const c = openCycleOn(b.zone);
  const at = new Date(Date.now() - ageSeconds * 1000).toISOString();
  if (!c) return { zone: b.zone, label: b.label, areaM2: b.areaM2, moisturePct: null, rain: null, supplyVoltage: null, waterPh: null, recordedAt: null };
  const r = readingsFor(dayOf(c.cycleStartedOn), isStress(c));
  return { zone: b.zone, label: b.label, areaM2: b.areaM2, moisturePct: round(r.soil_moisture, 1), rain: false, supplyVoltage: 5.02, waterPh: 6.3, recordedAt: at };
}

function decision(b: Bed): ZoneDecision {
  const c = openCycleOn(b.zone);
  const decisionAt = new Date().toISOString();
  if (!c) return { zone: b.zone, decision: "hold_in_range", text: `${b.label}: skip, no sensor reading`, durationSeconds: 0, reason: "no_reading", moisturePct: null, thresholdPct: null, decisionAt };
  const day = dayOf(c.cycleStartedOn), stage = stageOf(day), m = round(readingsFor(day, isStress(c)).soil_moisture, 1);
  const name = `${b.label} (day ${day})`;
  if (stage.n === 1 && isStress(c)) return { zone: b.zone, decision: "hold_stress", text: `${name}: paused on purpose, Bahar stress`, durationSeconds: 0, reason: "stress_mode", moisturePct: m, thresholdPct: null, decisionAt };
  const threshold = stage.moisture[0];
  return m < threshold
    ? { zone: b.zone, decision: "irrigate", text: `${name}: water today`, durationSeconds: 0, reason: "auto_threshold", moisturePct: m, thresholdPct: threshold, decisionAt }
    : { zone: b.zone, decision: "hold_in_range", text: `${name}: skip, soil is wet enough`, durationSeconds: 0, reason: "within_range", moisturePct: m, thresholdPct: threshold, decisionAt };
}

// ---------------------------------------------------------------- reports

function copOf(c: GuavaCycle): Cop {
  const view = cycleView(c);
  const entries = costs.filter((e) => e.plantingId === c.id);
  const total = entries.reduce((s, e) => s + e.amountUsd, 0);
  const byCat = new Map<string, number>();
  for (const e of entries) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountUsd);
  const LABEL: Record<string, string> = { labour_hired: "Hired labour", labour_family: "Family labour", fertilizer: "Fertilizer", materials: "Materials", seed: "Seeds and seedlings", pesticide: "Pesticide", water_energy: "Water and energy", services: "Services", repairs: "Repairs", interest: "Interest", overhead: "Overhead", other: "Other" };
  const h = harvests[c.id] ?? [], s = sales[c.id] ?? [];
  const kgTotal = h.reduce((v, x) => v + x.kgTotal, 0), kgMarketable = h.reduce((v, x) => v + x.kgMarketable, 0), kgHome = h.reduce((v, x) => v + x.kgHome, 0);
  const revenue = s.reduce((v, x) => v + x.amountUsd, 0);
  const f = view.forecast;
  const area = bedOf(c.zone).areaM2;
  return {
    cycle: view, currency: "USD", khrPerUsd: settings.khrPerUsd,
    lines: [...byCat].map(([category, amountUsd]) => ({ category, label: LABEL[category] ?? category, amountUsd: round(amountUsd), sharePct: total ? round((100 * amountUsd) / total) : 0, estimate: false })),
    totalCostUsd: round(total), days: dayOf(c.cycleStartedOn), open: !c.endedOn,
    kgTotal, kgMarketable, kgHome, kgLost: kgTotal - kgMarketable - kgHome, revenueUsd: round(revenue),
    marginUsd: s.length ? round(revenue - total) : null, copPerKg: kgMarketable > 0 ? round(total / kgMarketable, 3) : null, breakEvenPricePerKg: kgMarketable > 0 ? round(total / kgMarketable, 3) : null,
    costPerPlant: round(total / c.trees, 3), costPerM2: round(total / area, 3), kgPerM3Water: null, waterM3: null,
    costPerKgIfBenchmark: f && total > 0 ? { atLowYield: round(total / f.kgLow, 3), atHighYield: round(total / f.kgHigh, 3) } : null,
    flags: ["sample data: these costs are made up to show the screen", "tree establishment cost is not spread over the orchard's life yet"],
  };
}

// ---------------------------------------------------------------- plan (the water numbers the crop form and cards use)

function planOf(trees: number, areaPerTree: number, startedOn: string, efficiency: number, stress: boolean): CropPlan {
  const days = Array.from({ length: CYCLE_DAYS }, (_, i) => {
    const day = i + 1;
    const month = new Date(`${addDays(startedOn, i)}T00:00:00`).getMonth() + 1;
    const raw = stress || stageOf(day).n > 1 ? litresPerTree(day, month, areaPerTree, efficiency) : litresPerTree(50, month, areaPerTree, efficiency);
    return { day, stage: stageOf(day).key, et0Mm: ET0_MM_DAY[month], litersTotalGross: round(raw * trees, 1), litersPerPlantGross: round(raw, 2) };
  });
  const total = days.reduce((s, d) => s + d.litersTotalGross, 0);
  const day = dayOf(startedOn);
  const row = days[Math.min(day, CYCLE_DAYS) - 1];
  const now: CropPlan["now"] = day < 1 ? { state: "not_planted", startsInDays: 1 - day }
    : day > CYCLE_DAYS ? { state: "finished", daysAgo: day - CYCLE_DAYS }
    : { state: "growing", day, daysLeft: CYCLE_DAYS - day, stage: row.stage, stageTitle: stageOf(day).title, stagePlain: stageOf(day).actions,
        litersToday: row.litersTotalGross, litersPerPlant: row.litersPerPlantGross, ifCloudy: round(row.litersTotalGross * 2 / 3), ifRainy: round(row.litersTotalGross / 3), tasks: [], next: null };
  return {
    crop: "Guava", slug: "guava", hasGuide: true, plants: trees, plantedOn: startedOn, endsOn: addDays(startedOn, CYCLE_DAYS - 1), cycleDays: CYCLE_DAYS,
    areaPerPlantM2: round(areaPerTree, 2), areaM2: round(areaPerTree * trees, 1), now,
    water: { grossM3: round(total / 1000), netM3: round((total * efficiency) / 1000), efficiency, perPlantWholeCycleL: round(total / trees, 0), peakLitersPerDay: round(Math.max(...days.map((d) => d.litersTotalGross)), 0),
             avgEt0MmDay: 4.45, et0Source: "NASA POWER, Siem Reap", rainIgnored: true, days, weeks: [],
             check: { ourPeakMmDay: 0, japanMmDayRange: [0, 0], verdict: "inside", japanLitersPerPlantPeak: [0, 0] } },
    stages: STAGES.map((s) => ({ stage: s.key, title: s.title, plain: s.water, watch: null, watchBasis: null, firstDay: s.firstDay, lastDay: s.lastDay, startsOn: addDays(startedOn, s.firstDay - 1), endsOn: addDays(startedOn, s.lastDay - 1), days: s.lastDay - s.firstDay + 1, grossM3: 0, avgLitersPerPlantPerDay: 0, tasks: [] })),
    season: { hotDays: 0, rainyDays: 0, notes: [], months: [] }, kcSource: SOURCE, sources: [],
  };
}

// ---------------------------------------------------------------- telemetry history

function series(zone: string, metrics: string[], hours: number, points: number): TelemetrySeries {
  const c = openCycleOn(zone);
  const size = Math.max(60, Math.ceil((hours * 3600) / points));
  const to = Date.now(), from = to - hours * 3600 * 1000;
  const out: TelemetrySeries["series"] = Object.fromEntries(metrics.map((m) => [m, []]));
  if (c) {
    const startMs = new Date(`${c.cycleStartedOn}T00:00:00`).getTime();
    for (let b = Math.floor(from / (size * 1000)) * size * 1000; b <= to; b += size * 1000) {
      const day = Math.floor((b - startMs) / 86400000) + 1;
      if (day < 1) continue;
      const hour = new Date(b).getHours() + new Date(b).getMinutes() / 60;
      const r: Readings = readingsFor(Math.min(day, CYCLE_DAYS), isStress(c), hour);
      for (const m of metrics) if (r[m] !== undefined) out[m].push({ t: new Date(b).toISOString(), v: round(r[m], 3) });
    }
  }
  return { zone, hours, bucketSeconds: size, from: new Date(from).toISOString(), to: new Date(to).toISOString(), series: out };
}

// ---------------------------------------------------------------- crop list

const GUAVA: Crop = {
  slug: "guava", name: "Guava", hasWaterData: true, defaultAreaPerPlantM2: 10.5, kc: { ini: 0.75, mid: 0.93, end: 1.1 },
  stageDays: STAGES.map((s) => s.lastDay - s.firstDay + 1), source: SOURCE, perennial: true,
  regulationMethods: METHODS, harvestDays: HARVEST_DAYS, rainyMonths: RAINY_MONTHS,
};

// ---------------------------------------------------------------- the router

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function route(method: string, path: string, q: URLSearchParams, body: any): unknown {
  let m: RegExpMatchArray | null;
  const get = method === "GET", post = method === "POST";

  if (get && path === "/zones") return beds.map(zoneNow);
  if (post && path === "/zones") {
    const name = String(body.label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (beds.some((b) => b.zone === name)) throw new ApiError(`a bed named '${body.label}' already exists`);
    beds.push({ zone: name, label: body.label, areaM2: body.areaM2 ?? 50 });
    return { name, label: body.label, areaM2: body.areaM2 };
  }
  if (get && path === "/devices") return [
    { code: "ESP-FIELD-01", kind: "field_node", zone: "g1", commissioned: true, status: "online", lastSeenAt: new Date().toISOString(), firmwareVersion: "sample" },
  ] satisfies DeviceRow[];
  if (get && path === "/decisions/today") return beds.map(decision);
  if (get && path === "/conditions") return beds.map(conditionsOfBed);
  if (get && (m = path.match(/^\/telemetry\/([^/]+)$/))) {
    return series(decodeURIComponent(m[1]), (q.get("metrics") ?? "").split(","), Number(q.get("hours") ?? 24), Number(q.get("points") ?? 96));
  }
  if (get && path === "/setups") {
    if (q.get("crop") !== "guava") return [];
    const area = Number(q.get("area")) || null;
    return SETUPS.map((s): SetupInfo => ({ ...s, plantsForArea: area ? treesForArea(s, area) : null }));
  }
  if (get && path === "/diagnosis/symptoms") return SYMPTOMS.map((s) => ({ id: s.id, title: s.title }));
  if (get && path === "/diagnosis") {
    const b = bedOf(q.get("zone") ?? "");
    const c = openCycleOn(b.zone);
    const day = c ? dayOf(c.cycleStartedOn) : 60;
    const stress = c ? isStress(c) : false;
    const out = correlate(q.get("symptom") ?? "", readingsFor(day, stress), recentMin(day, stress), ageSeconds);
    if (!c) return { ...out, verdict: "no_data", explanation: null, basis: null, stage: null, zone: b.zone, label: b.label, source: "named",
                     evidence: out.evidence.map((e) => ({ ...e, value: null, met: null, ageSeconds: null })) };
    const st = stageOf(day);
    return { ...out, stage: { key: st.key, title: st.title, day }, zone: b.zone, label: b.label, source: "named" };
  }
  if (get && path === "/crop-plan") {
    const row = Number(q.get("rowCm")) || 300, plant = Number(q.get("plantCm")) || 350;
    return planOf(Number(q.get("plants")), (row * plant) / 10000, q.get("plantedOn") ?? iso(today()), Number(q.get("efficiency") ?? 0.9), false);
  }
  if (get && (m = path.match(/^\/cycles\/([^/]+)\/plan$/))) {
    const c = cycleById(m[1]);
    return planOf(c.trees, bedOf(c.zone).areaM2 / c.trees, c.cycleStartedOn, settings.irrigationEfficiency, isStress(c));
  }
  if (get && (m = path.match(/^\/cycles\/([^/]+)\/orchard$/))) return orchardView(cycleById(m[1]), Number(q.get("day")) || undefined);
  if (post && (m = path.match(/^\/cycles\/([^/]+)\/orchard\/jobs\/([^/]+)\/done$/))) {
    const c = cycleById(m[1]);
    c.done.add(m[2]);
    return orchardView(c);
  }
  if (post && (m = path.match(/^\/cycles\/([^/]+)\/orchard\/fruit$/))) {
    const c = cycleById(m[1]);
    c.fruitMm = Number(body.mm);
    return orchardView(c);
  }

  if (get && path === "/farm/settings") return settings;
  if (method === "PUT" && path === "/farm/settings") { settings = { ...settings, ...body }; return settings; }
  if (get && path === "/crops") return [GUAVA];
  if (post && path === "/crops") throw new ApiError("sample data has guava only");

  if (get && path === "/cycles") return cycles.map(cycleView);
  if (post && path === "/cycles") {
    if (openCycleOn(body.zone)) throw new ApiError("that bed already has an open cycle; end it first");
    const c: GuavaCycle = { id: newId("c"), zone: body.zone, setup: body.setup ?? null, trees: body.plantCount ?? 1, variety: body.variety ?? null,
      cycleStartedOn: body.plantedOn, treesPlantedOn: body.treesPlantedOn ?? body.plantedOn, regulation: body.regulation ?? "pruning",
      price: body.expectedPriceUsdPerKg ?? null, endedOn: null, fruitMm: null, done: new Set() };
    cycles.push(c);
    const b = bedOf(c.zone);
    if (body.areaM2) b.areaM2 = body.areaM2;
    return cycleView(c);
  }
  if (method === "PATCH" && (m = path.match(/^\/cycles\/([^/]+)$/))) {
    const c = cycleById(m[1]);
    if (body.plantCount) c.trees = body.plantCount;
    if (body.areaM2) bedOf(c.zone).areaM2 = body.areaM2;
    return cycleView(c);
  }
  if (post && (m = path.match(/^\/cycles\/([^/]+)\/close$/))) {
    const c = cycleById(m[1]);
    c.endedOn = body.endedOn ?? iso(today());
    return cycleView(c);
  }
  if (get && (m = path.match(/^\/cycles\/([^/]+)\/cop$/))) return copOf(cycleById(m[1]));
  if (get && path === "/reports/compare") {
    const a = copOf(cycleById(q.get("a") ?? "")), b = copOf(cycleById(q.get("b") ?? ""));
    return { a, b, copPerKgDifference: a.copPerKg !== null && b.copPerKg !== null ? round(a.copPerKg - b.copPerKg, 3) : null };
  }

  if (get && path === "/costs") { const id = q.get("cycle"); return costs.filter((e) => !id || e.plantingId === id); }
  if (post && path === "/costs") {
    const amount = body.amount ?? (body.qty ?? 0) * (body.unitPrice ?? 0);
    const amountUsd = body.currency === "KHR" ? round(amount / settings.khrPerUsd) : amount;
    const e: CostEntry = { id: newId("k"), plantingId: body.plantingId, date: body.date, category: body.category, description: body.description ?? null, qty: body.qty ?? null, unit: body.unit ?? null, unitPrice: body.unitPrice ?? null, amount, currency: body.currency, amountUsd, rateUsed: null, source: "manual" };
    costs.push(e);
    return e;
  }
  if (method === "DELETE" && (m = path.match(/^\/costs\/([^/]+)$/))) { const i = costs.findIndex((e) => e.id === m![1]); if (i >= 0) costs.splice(i, 1); return undefined; }

  if (get && path === "/stock/items") return stock;
  if (post && path === "/stock/items") { const s: StockItem = { id: newId("i"), name: body.name, category: body.category, unit: body.unit, qtyOnHand: 0, avgUnitCostUsd: 0, valueUsd: 0 }; stock.push(s); return s; }
  if ((m = path.match(/^\/stock\/items\/([^/]+)\/(in|use|moves)$/))) {
    const s = stock.find((x) => x.id === m![1]);
    if (!s) throw new ApiError("stock item not found");
    if (get) return [] satisfies StockMove[];
    if (m[2] === "in") { s.qtyOnHand += body.qty; s.avgUnitCostUsd = body.unitPrice; s.valueUsd = round(s.qtyOnHand * s.avgUnitCostUsd); return s; }
    s.qtyOnHand -= body.qty; s.valueUsd = round(s.qtyOnHand * s.avgUnitCostUsd);
    return { item: s };
  }
  if (method === "DELETE" && path.startsWith("/stock/moves/")) return undefined;

  if (get && path === "/assets") return assets;
  if (post && path === "/assets") { const a: Asset = { id: newId("a"), name: body.name, costUsd: body.costUsd, boughtOn: body.boughtOn, lifeYears: body.lifeYears, salvageUsd: body.salvageUsd ?? 0, retiredOn: null, dailyDepreciationUsd: round(body.costUsd / body.lifeYears / 365, 3), status: "in_service" }; assets.push(a); return a; }
  if (method === "PATCH" && (m = path.match(/^\/assets\/([^/]+)\/retire$/))) { const a = assets.find((x) => x.id === m![1])!; a.status = "retired"; a.retiredOn = iso(today()); return a; }
  if (method === "DELETE" && (m = path.match(/^\/assets\/([^/]+)$/))) { const i = assets.findIndex((x) => x.id === m![1]); if (i >= 0) assets.splice(i, 1); return undefined; }

  if ((m = path.match(/^\/cycles\/([^/]+)\/harvests$/))) {
    const id = m[1];
    if (get) return harvests[id] ?? [];
    const h: Harvest = { id: newId("h"), date: body.date, kgTotal: body.kgTotal, kgMarketable: body.kgMarketable, kgHome: body.kgHome ?? 0, kgLost: body.kgTotal - body.kgMarketable - (body.kgHome ?? 0), note: body.note ?? null };
    (harvests[id] ??= []).unshift(h);
    return h;
  }
  if ((m = path.match(/^\/cycles\/([^/]+)\/sales$/))) {
    const id = m[1];
    if (get) return sales[id] ?? [];
    const s: Sale = { id: newId("s"), date: body.date, kg: body.kg, pricePerKg: body.pricePerKg, currency: body.currency, amountUsd: round(body.currency === "KHR" ? (body.kg * body.pricePerKg) / settings.khrPerUsd : body.kg * body.pricePerKg), buyer: body.buyer ?? null };
    (sales[id] ??= []).unshift(s);
    return s;
  }
  if (method === "DELETE" && (m = path.match(/^\/harvests\/([^/]+)$/))) { for (const list of Object.values(harvests)) { const i = list.findIndex((x) => x.id === m![1]); if (i >= 0) list.splice(i, 1); } return undefined; }
  if (method === "DELETE" && (m = path.match(/^\/sales\/([^/]+)$/))) { for (const list of Object.values(sales)) { const i = list.findIndex((x) => x.id === m![1]); if (i >= 0) list.splice(i, 1); } return undefined; }

  throw new ApiError(`sample data has no answer for ${method} ${path}`);
}

export async function mockRequest<T>(fullPath: string, init?: RequestInit): Promise<T> {
  const [path, query] = fullPath.split("?");
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  return clone(route(init?.method ?? "GET", path, new URLSearchParams(query ?? ""), body) ?? null) as T;
}
