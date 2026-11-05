/**
 * Guava, from the guava document pasted on 2026-11-05 ("Precision Pomology ... Commercial Guava"). The pasted text
 * lists no sources, so every number here is "guava document, not checked". Pure data and pure rules, no React and
 * no network: this is the specification for the real engine. Where the document says something that does not
 * add up, or that needed a choice, DOC_ISSUES says so and the screen shows it.
 */
import type {
  BedConditions, CondAlert, CondParam, Correlation, DocIssue, Evidence, FertigationPlan, OrchardJob, OrchardParamRule,
  OrchardStage, RatingStatus, SetupInfo,
} from "../lib/api";

export const SOURCE = "Guava document (pasted 2026-11-05). It lists no sources; these numbers were not checked against a study.";

// ------------------------------------------------------------------ stages

export const STAGES: OrchardStage[] = [
  { n: 1, key: "induction", short: "Stress", title: "Induction stress and pruning", firstDay: 1, lastDay: 45,
    moisture: [20, 30], ec: [0.8, 1.2], kc: null, etcPct: null,
    water: "Withhold water. Then two priming irrigations 3 days apart.",
    feed: "No nitrogen during stress. Basal manure and biologicals 15 days before re-watering.",
    actions: "Raise the C:N ratio. Prune 50-75 % of shoot length, or bend branches." },
  { n: 2, key: "flush", short: "Flush", title: "Bud break and vegetative flush", firstDay: 46, lastDay: 75,
    moisture: [60, 70], ec: [1.2, 1.8], kc: 0.75, etcPct: [80, 100],
    water: "Drip pulses 2-3 times a week.",
    feed: "High nitrogen, balanced P and K, soil micronutrients.",
    actions: "Pinch shoots at 30-35 cm once they have 4-5 leaf pairs." },
  { n: 3, key: "bloom", short: "Bloom", title: "Flowering and fruit set", firstDay: 76, lastDay: 105,
    moisture: [65, 75], ec: [1.5, 2.2], kc: 0.93, etcPct: [100, 100],
    water: "Full demand. Moisture must stay above 55 %.",
    feed: "Low nitrogen; high P, K, calcium and boron.",
    actions: "No water deficit at bloom. Foliar zinc and boron, potassium at fruit set." },
  { n: 4, key: "bulking", short: "Bulking", title: "Fruit bulking and bagging", firstDay: 106, lastDay: 145,
    moisture: [60, 75], ec: [1.8, 2.5], kc: 1.03, etcPct: [100, 100],
    water: "Full demand, with mulch.",
    feed: "High K, calcium and magnesium.",
    actions: "Bag every fruit at 3-4 cm: foam net plus plastic bag." },
  { n: 5, key: "maturation", short: "Harvest", title: "Maturation and harvest", firstDay: 146, lastDay: 180,
    moisture: [50, 60], ec: [2.0, 2.7], kc: 1.1, etcPct: [60, 80],
    water: "Taper the water: a controlled deficit raises sugar and avoids splitting.",
    feed: "No nitrogen. High K and boron.",
    actions: "Stop nitrogen 30-40 days before harvest. Pick crisp-mature." },
];

export const CYCLE_DAYS = 180;
export const HARVEST_DAYS: [number, number] = [146, 180];
export const RAINY_MONTHS = [5, 6, 7, 8, 9, 10];
export const FLOWERING_FLOOR = 55;

export const stageOf = (day: number): OrchardStage =>
  STAGES.find((s) => day >= s.firstDay && day <= s.lastDay) ?? (day < 1 ? STAGES[0] : STAGES[STAGES.length - 1]);

// ------------------------------------------------------------------ regulation

export const METHODS = [
  { id: "withhold", label: "Withhold water (60-90 days)", note: "For well-drained sandy loam. Soil is held at 20-30 % until leaves drop." },
  { id: "bending", label: "Branch bending", note: "Trees 2-8 years old at wide spacing. No water stress needed." },
  { id: "pruning", label: "Shoot pruning", note: "High-density planting. Removes 50-75 % of this season's shoot length." },
  { id: "chemical", label: "Chemical deblossoming", note: "Confirm the product and dose with an agronomist first." },
];

// ------------------------------------------------------------------ orchard setups

function setup(s: {
  id: string; letter: string; label: string; method: string; cultivars: string; rowM: number; plantM: number;
  treesPerHa: [number, number]; firstBearing: string; kgPerTree: [number, number]; tPerHa: [number, number];
  trees50: [number, number]; kg50: [number, number]; npk: string; drip: string; lph: number; price: [number, number];
  docIssue: string | null;
}): SetupInfo {
  return {
    id: s.id, label: s.label, method: s.method, plantsForArea: null,
    density: [s.treesPerHa[0] / 10000, s.treesPerHa[1] / 10000], kgPerPlant: s.kgPerTree, referenceBedM2: 50,
    plantsPerReferenceBed: s.trees50, kgPerReferenceBed: s.kg50, rowCm: s.rowM * 100, plantCm: s.plantM * 100,
    spacingPlantsPerM2: 1 / (s.rowM * s.plantM), basis: "guava_doc", spacingBasis: "guava_doc",
    orchard: {
      letter: s.letter, cultivars: s.cultivars, treesPerHa: s.treesPerHa, firstBearing: s.firstBearing, tPerHa: s.tPerHa,
      kgPer50m2: s.kg50, npk: s.npk, drip: s.drip, emitterLphPerTree: s.lph, priceUsd: s.price, docIssue: s.docIssue,
    },
  };
}

export const SETUPS: SetupInfo[] = [
  setup({ id: "wide", letter: "A", label: "A. Traditional wide orchard", method: "5 x 5 m. Branch bending works here. Long-lived trees.",
    cultivars: "Sardar (L-49), Allahabad Safeda, local Khmer", rowM: 5, plantM: 5, treesPerHa: [278, 400], firstBearing: "Year 3-4",
    kgPerTree: [25, 46.9], tPerHa: [12, 20], trees50: [2, 2], kg50: [60, 90], npk: "600-800 : 300-600 : 600 g per tree a year",
    drip: "2-4 emitters a tree, 4-8 L/h each", lph: 16, price: [0.75, 0.75],
    docIssue: "Trees x yield gives 7-19 t/ha and 50-94 kg per 50 m². The document says 12-20 t/ha and 60-90 kg." }),
  setup({ id: "commercial", letter: "B", label: "B. Southeast Asian commercial", method: "3 x 3.5 m. The Kimju and Taiwan Pearl standard.",
    cultivars: "Kimju, Taiwan Pearl, Kaohsiung Pearl", rowM: 3, plantM: 3.5, treesPerHa: [714, 952], firstBearing: "Year 1-2",
    kgPerTree: [30, 35], tPerHa: [22, 33], trees50: [5, 5], kg50: [150, 175], npk: "300-400 g NPK plus 10-12 kg organic per tree",
    drip: "2 emitters a tree, 4 L/h each", lph: 8, price: [1.1, 1.25], docIssue: null }),
  setup({ id: "hedgerow", letter: "C", label: "C. Intensive lowland hedgerow", method: "3 x 2 m. High density on small holdings.",
    cultivars: "Kimju, Crystal Guava, Pearl", rowM: 3, plantM: 2, treesPerHa: [1667, 2000], firstBearing: "Year 1-2",
    kgPerTree: [15, 22], tPerHa: [25, 38], trees50: [8, 10], kg50: [150, 200], npk: "300 : 175 : 175 g per tree",
    drip: "2 inline emitters a tree, 4 L/h", lph: 8, price: [1.1, 1.25],
    docIssue: "3 x 2 m is 1,667 trees/ha; 2,000 needs closer spacing. Trees x yield gives 25-44 t/ha and 120-220 kg per 50 m². The document says 25-38 t/ha and 150-200 kg." }),
  setup({ id: "meadow", letter: "D", label: "D. Meadow orchard (ultra-high density)", method: "2 x 1 m. Single-trunk hedge. Fits a 50 m² pilot bed.",
    cultivars: "Lalit, Allahabad Safeda, dwarf Kimju", rowM: 2, plantM: 1, treesPerHa: [5000, 5000], firstBearing: "Year 1",
    kgPerTree: [6, 10], tPerHa: [29.5, 50], trees50: [25, 25], kg50: [150, 250], npk: "400 : 200 : 200 g per tree (135 : 60 : 60 g in year 2)",
    drip: "Inline drip tape, 2-4 L/h at 0.5-1.0 m", lph: 4, price: [1.0, 1.2], docIssue: null }),
];

/** Recompute a setup's table from trees x yield, to compare with what the document printed. */
export function recompute(s: SetupInfo) {
  const o = s.orchard!;
  const tPerHa: [number, number] = [o.treesPerHa[0] * s.kgPerPlant[0] / 1000, o.treesPerHa[1] * s.kgPerPlant[1] / 1000];
  const kg50: [number, number] = [s.plantsPerReferenceBed[0] * s.kgPerPlant[0], s.plantsPerReferenceBed[1] * s.kgPerPlant[1]];
  const off = (got: number, printed: number) => Math.abs(got - printed) / printed > 0.1;
  return { tPerHa, kg50, disagrees: off(tPerHa[0], o.tPerHa[0]) || off(tPerHa[1], o.tPerHa[1]) || off(kg50[0], o.kgPer50m2[0]) || off(kg50[1], o.kgPer50m2[1]) };
}

export const treesForArea = (s: SetupInfo, areaM2: number) =>
  Math.max(1, Math.round(areaM2 / ((s.rowCm / 100) * (s.plantCm / 100))));

// ------------------------------------------------------------------ what each reading should be

type Band = { lo: number; hi: number; critLo?: number; critHi?: number };

const META: Record<string, { label: string; short: string; unit: string; decimals: number }> = {
  soil_moisture: { label: "Soil moisture", short: "Moisture", unit: "pct", decimals: 1 },
  soil_ph: { label: "Soil pH", short: "pH", unit: "pH", decimals: 2 },
  soil_ec: { label: "Soil EC", short: "EC", unit: "mS/cm", decimals: 2 },
  soil_temperature: { label: "Soil temperature", short: "Soil °C", unit: "C", decimals: 1 },
  nitrogen: { label: "Nitrogen", short: "N", unit: "mg/kg", decimals: 0 },
  phosphorus: { label: "Phosphorus", short: "P", unit: "mg/kg", decimals: 0 },
  potassium: { label: "Potassium", short: "K", unit: "mg/kg", decimals: 0 },
  air_temperature: { label: "Air temperature", short: "Air °C", unit: "C", decimals: 1 },
  air_humidity: { label: "Air humidity", short: "RH", unit: "pct", decimals: 1 },
};
export const METRIC_ORDER = Object.keys(META);
export const metricMeta = META;

/** With a method other than withholding water the document gives no stage 1 moisture, so its general range applies. */
const GENERAL_MOISTURE: [number, number] = [55, 75];

function bands(stage: OrchardStage, stress: boolean): Record<string, Band | null> {
  const moisture = stage.n === 1 && !stress ? GENERAL_MOISTURE : stage.moisture;
  return {
    // bloom has its own low limit: 45 % is critical and the 55 % floor is an alert
    soil_moisture: { lo: moisture[0], hi: moisture[1], critHi: 85, ...(stage.n === 3 ? { critLo: 45 } : {}) },
    soil_ph: { lo: 5.5, hi: 7.0, critLo: 4.5, critHi: 7.5 },
    soil_ec: { lo: stage.ec[0], hi: stage.ec[1], critHi: 3.0 },
    soil_temperature: { lo: 20, hi: 28, critHi: 32 },
    nitrogen: null, phosphorus: null, potassium: null,     // the document gives removal ratios, no soil targets
    air_temperature: { lo: 23, hi: 28, critLo: 15, critHi: 35 },
    // during stress, humid air is a threat to the stress (an alert), not yet a fungal emergency: there is no fruit to rot
    air_humidity: { lo: 60, hi: 80, ...(stage.n === 1 && stress ? {} : { critHi: 85 }) },
  };
}

export const PARAM_RULES: OrchardParamRule[] = [
  { label: "Soil moisture", target: "Follows the stage, 20-75 %", critical: "Above 85 % (saturation). Below 45 % at bloom", note: "Probe at 15-30 cm, inside the wet bulb" },
  { label: "Soil pH", target: "5.5-7.0", critical: "Below 4.5, above 7.5", note: "Dolomite 1 kg a tree below 5.0; acidifying feed above 7.2" },
  { label: "Soil EC (dS/m = mS/cm)", target: "Follows the stage, 0.8-2.7", critical: "Above 3.0 (document: 2.78-3.0). Below 0.8 is a warning here", note: "High: leaching flush. Low: more feed" },
  { label: "Soil temperature", target: "20-28 °C", critical: "Above 32 °C", note: "Suggest mulch" },
  { label: "N, P, K", target: "No soil target in the document", critical: "None", note: "It gives removal per tonne: 7-8 N, 2-3 P2O5, 8-10 K2O kg" },
  { label: "Air temperature", target: "23-28 °C. Spray window 18-25 °C", critical: "Below 15 °C, above 35 °C (sun-scald)", note: "Above 30 °C spray evaporates" },
  { label: "Air humidity", target: "60-80 %", critical: "Above 85 % (fungal)", note: "Below 50 % spray dries too fast" },
];

// ------------------------------------------------------------------ a scripted cycle: normal days and events

export type Readings = Record<string, number>;

/** Things that go wrong on the way through the cycle, so walking the days shows every alert. */
export const EVENTS: { from: number; to: number; set: Readings }[] = [
  { from: 26, to: 32, set: { air_humidity: 88 } },                           // humid spell during stress
  { from: 58, to: 63, set: { soil_ec: 0.7 } },                               // the flush outruns the feed
  { from: 88, to: 92, set: { soil_moisture: 52 } },                          // a dry spell at bloom
  { from: 118, to: 124, set: { air_temperature: 29.5, air_humidity: 76 } },  // warm and humid: fruit fly weather
  { from: 150, to: 152, set: { soil_ph: 7.4 } },                             // alkaline water
  { from: 163, to: 164, set: { soil_moisture: 33 } },                        // the dry days before the storm
  { from: 165, to: 167, set: { soil_moisture: 82 } },                        // heavy rain on dry soil: cracking
];

/** The readings of a bed on a crop day. `hour` adds the swing of a day, for the history charts. */
export function readingsFor(day: number, stress: boolean, hour = 12): Readings {
  const stage = stageOf(day);
  const [mLo, mHi] = stage.n === 1 && !stress ? GENERAL_MOISTURE : stage.moisture;
  const wave = Math.sin(day / 3.3);
  const sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const out: Readings = {
    soil_moisture: (mLo + mHi) / 2 + wave * (mHi - mLo) * 0.15,
    soil_ph: 6.3 + 0.1 * Math.sin(day / 7),
    soil_ec: (stage.ec[0] + stage.ec[1]) / 2 + 0.05 * wave,
    soil_temperature: 24 + 1.5 * sun,
    nitrogen: [70, 130, 95, 85, 60][stage.n - 1],
    phosphorus: [55, 70, 95, 80, 65][stage.n - 1],
    potassium: [140, 170, 200, 235, 250][stage.n - 1],
    air_temperature: 24.5 + 3 * sun,
    air_humidity: 73 - 7 * sun,
  };
  for (const e of EVENTS) if (day >= e.from && day <= e.to) Object.assign(out, e.set);
  return out;
}

// ------------------------------------------------------------------ the rules

function rate(value: number, b: Band): [RatingStatus, "low" | "high" | null] {
  if (b.critHi !== undefined && value > b.critHi) return ["critical", "high"];
  if (b.critLo !== undefined && value < b.critLo) return ["critical", "low"];
  if (value < b.lo) return ["warning", "low"];
  if (value > b.hi) return ["warning", "high"];
  return ["normal", null];
}

type Hit = [metric: string, direction: "low" | "high"];
type RawAlert = CondAlert & { hits: Hit[] };

export function alertsFor(r: Readings, day: number, opts: { stress: boolean; recentMinMoisture: number; fruitMm: number | null; bagged: boolean }): RawAlert[] {
  const stage = stageOf(day);
  const out: RawAlert[] = [];
  const add = (id: string, severity: "critical" | "warning", title: string, message: string, hits: Hit[]) =>
    out.push({ id, severity, title, message, metrics: hits.map((h) => h[0]), hits });
  const m = r.soil_moisture, ph = r.soil_ph, ec = r.soil_ec, soil = r.soil_temperature, air = r.air_temperature, rh = r.air_humidity;

  if (opts.stress && stage.n === 1 && rh > 85) add("stress_humidity", "warning", "Humid air may stop the stress working",
    `Humidity ${rh.toFixed(0)} %. Trees may not shed leaves. If they do not, consider pruning or deblossoming instead.`, [["air_humidity", "high"]]);
  if (opts.stress && stage.n === 1 && m > 30) add("stress_leak", "warning", "Soil is too wet for stress",
    `Soil moisture ${m.toFixed(1)} % is above the 30 % stress ceiling.`, [["soil_moisture", "high"]]);
  if (m > 85) add("saturation", "critical", "Saturated soil, wilt risk",
    `Soil moisture ${m.toFixed(1)} % is above 85 %. Stop watering: wet soil speeds Fusarium wilt.`, [["soil_moisture", "high"]]);
  if (stage.n === 3 && m < FLOWERING_FLOOR) add("bloom_floor", "critical", "Moisture below the bloom floor",
    `Soil moisture ${m.toFixed(1)} % is below ${FLOWERING_FLOOR} %. A deficit at bloom makes flowers drop.`, [["soil_moisture", "low"]]);
  if (stage.n >= 4 && m > 80 && opts.recentMinMoisture < 35) add("cracking", "critical", "Fruit cracking risk",
    `Moisture jumped from ${opts.recentMinMoisture.toFixed(0)} % to ${m.toFixed(0)} %. Sudden water after a dry spell splits fruit. Water little and often; boron and calcium sprays help.`, [["soil_moisture", "high"]]);
  if (ph < 4.5) add("acid", "critical", "Very acid soil", `Soil pH ${ph.toFixed(2)} is below 4.5: aluminium and manganese toxicity. Dolomite 1 kg a tree.`, [["soil_ph", "low"]]);
  if (ph > 7.5) add("alkaline", "critical", "Alkaline soil", `Soil pH ${ph.toFixed(2)} is above 7.5: iron, zinc and boron lock up.`, [["soil_ph", "high"]]);
  else if (ph > 7.2) add("alkaline_feed", "warning", "Soil turning alkaline", `Soil pH ${ph.toFixed(2)} is above 7.2. Use an acidifying feed (MAP) and keep feed water below pH 6.5.`, [["soil_ph", "high"]]);
  if (ec > 3.0) add("salinity", "critical", "Salt stress", `Soil EC ${ec.toFixed(2)} is above 3.0. Run a leaching flush.`, [["soil_ec", "high"]]);
  if (ec < 0.8 && stage.n > 1) add("low_ec", "warning", "Nutrients running low", `Soil EC ${ec.toFixed(2)} is below 0.8. Raise the feed.`, [["soil_ec", "low"]]);
  if (soil > 32) add("root_heat", "critical", "Hot root zone", `Soil ${soil.toFixed(1)} °C is above 32 °C. Mulch the bed.`, [["soil_temperature", "high"]]);
  if (air > 35) add("sun_scald", "critical", "Fruit sun-scald", `Air ${air.toFixed(1)} °C is above 35 °C.`, [["air_temperature", "high"]]);
  if (!(opts.stress && stage.n === 1) && rh > 85) add("fungal", "critical", "Fungal risk (anthracnose)", `Humidity ${rh.toFixed(0)} % is above 85 %. Thin the canopy, avoid wetting the leaves.`, [["air_humidity", "high"]]);
  if (stage.n === 4 && !opts.bagged && opts.fruitMm !== null && opts.fruitMm >= 30) add("bag_now", "critical", "Bag the fruit now",
    `Fruit is ${opts.fruitMm} mm. Bag at 30-40 mm: foam net plus plastic bag, before fruit flies lay.`, []);
  if (stage.n >= 4 && !opts.bagged && air >= 25 && air <= 32 && rh > 70) add("fruit_fly", "warning", "Fruit fly weather",
    `Air ${air.toFixed(1)} °C and humidity ${rh.toFixed(0)} %, and the fruit is not bagged yet.`, []);
  return out;
}

const RANK: Record<RatingStatus, number> = { critical: 3, warning: 2, normal: 1, stale: 0, no_data: 0, unrated: 0 };

export function rateBed(r: Readings, day: number, opts: { stress: boolean; recentMinMoisture: number; fruitMm: number | null; bagged: boolean },
  at: string): Pick<BedConditions, "status" | "stage" | "params" | "alerts" | "basis" | "source" | "rated"> {
  const stage = stageOf(day);
  const b = bands(stage, opts.stress);
  const raw = alertsFor(r, day, opts);
  const params: CondParam[] = METRIC_ORDER.map((metric) => {
    const band = b[metric];
    const value = Math.round(r[metric] * 1000) / 1000;
    let status: RatingStatus = "unrated";
    let direction: "low" | "high" | null = null;
    if (band) [status, direction] = rate(value, band);
    for (const a of raw) for (const [hit, dir] of a.hits) {
      if (hit === metric && RANK[a.severity] > RANK[status]) { status = a.severity; direction = dir; }
    }
    return { metric, ...META[metric], value, recordedAt: at, status, direction, target: band ? [band.lo, band.hi] : null };
  });
  const alerts: CondAlert[] = raw.map(({ hits: _hits, ...a }) => a);
  const worst: RatingStatus = [...params.map((p) => p.status), ...alerts.map((a) => a.severity as RatingStatus)]
    .reduce<RatingStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "no_data");
  return {
    status: worst, rated: true, basis: "guava_doc", source: SOURCE, params, alerts,
    stage: { n: stage.n, key: stage.key, title: stage.title, firstDay: stage.firstDay, lastDay: stage.lastDay, day,
             extended: day > CYCLE_DAYS, moisture: stage.moisture, ec: stage.ec, focus: stage.actions },
  };
}

// ------------------------------------------------------------------ jobs

type JobDef = Omit<OrchardJob, "state" | "stageN" | "ongoing"> & { only?: string; ongoing?: boolean };

export const JOBS: JobDef[] = [
  { id: "prune", firstDay: 1, lastDay: 7, confirm: false, measure: false, title: "Prune or bend", detail: "Remove 50-75 % of this season's shoot length, or bend 8-10 upright branches to horizontal." },
  { id: "hold", ongoing: true, firstDay: 1, lastDay: 45, confirm: false, measure: false, only: "withhold", title: "Hold the water", detail: "Keep soil at 20-30 %. Check that leaves are turning yellow and dropping." },
  { id: "basal", firstDay: 31, lastDay: 35, confirm: false, measure: false, title: "Basal feed, 15 days before re-watering", detail: "Per tree: manure 10-50 kg, mycorrhiza 200 g, PSB 100-200 g, Azotobacter 20-25 g." },
  { id: "priming", firstDay: 46, lastDay: 49, confirm: false, measure: false, title: "Two priming irrigations", detail: "Water on day 46 and again on day 49, then start the drip pulses." },
  { id: "micronutrients", firstDay: 46, lastDay: 60, confirm: false, measure: false, title: "Soil micronutrients", detail: "Per tree: zinc sulphate 25-40 g, borax 15-20 g, iron sulphate 25 g." },
  { id: "pinch", firstDay: 60, lastDay: 72, confirm: false, measure: false, title: "Pinch new shoots", detail: "When shoots have 4-5 leaf pairs, pinch at 30-35 cm." },
  { id: "zn_b", firstDay: 76, lastDay: 85, confirm: true, measure: false, title: "Foliar zinc and boron", detail: "Zinc sulphate 0.5 % plus boric acid 0.2 %. Spray at 18-25 °C." },
  { id: "k_set", firstDay: 95, lastDay: 105, confirm: true, measure: false, title: "Foliar potassium at fruit set", detail: "Potassium sulphate 1.0 %, to hold more fruit on the tree." },
  { id: "bag", firstDay: 106, lastDay: 125, confirm: false, measure: true, title: "Bag the fruit at 3-4 cm", detail: "Measure a few fruit. At 30-40 mm: inner foam net, outer plastic bag." },
  { id: "mg_fe", firstDay: 110, lastDay: 135, confirm: true, measure: false, title: "Foliar magnesium and iron", detail: "Magnesium sulphate 1.0 % plus iron sulphate 0.5 %. The document adds GA3 100 ppm." },
  { id: "stop_n", firstDay: 140, lastDay: 150, confirm: false, measure: false, title: "Stop nitrogen", detail: "No nitrogen in the last 30-40 days before harvest." },
  { id: "boron", firstDay: 150, lastDay: 165, confirm: true, measure: false, title: "Foliar boron", detail: "Boron 0.2 %, to prevent skin cracking." },
  { id: "pick", ongoing: true, firstDay: 165, lastDay: 180, confirm: false, measure: false, title: "Pick crisp-mature", detail: "Record each picking in Harvest and sales." },
];

export function jobsFor(day: number, actualDay: number, done: Set<string>, regulation: string): OrchardJob[] {
  return JOBS.filter((j) => !j.only || j.only === regulation).map(({ only: _only, ...j }) => {
    const state: OrchardJob["state"] = done.has(j.id) ? "done"
      : day < j.firstDay ? "later"
      : day > j.lastDay ? (actualDay > j.lastDay && !j.ongoing ? "overdue" : "past")
      : "due";
    return { ...j, ongoing: Boolean(j.ongoing), stageN: stageOf(j.firstDay).n, state };
  });
}

// ------------------------------------------------------------------ fertigation

const PHASES = [
  { label: "Clean water", pct: 25, what: "Wet the root zone first" },
  { label: "Feed", pct: 50, what: "Inject the fertilizer" },
  { label: "Clean water", pct: 25, what: "Flush the lines" },
];
const WATER_PH = "Keep feed water below pH 6.5 when injecting phosphate or micronutrients.";
const CLASH = "Calcium nitrate must not share a tank with sulphates or phosphates: it precipitates and blocks emitters.";

export const FERTIGATION: Omit<FertigationPlan, "phases" | "waterPh">[] = [
  { stageN: 1, aim: "No feed during stress", nitrogen: "None", tanks: [], clash: null, foliar: [], soil: "Basal manure and biologicals before re-watering. Dolomite 1 kg a tree if pH is below 5.0." },
  { stageN: 2, aim: "Build the canopy", nitrogen: "High",
    tanks: [{ name: "Tank A", products: ["Calcium nitrate"] }, { name: "Tank B", products: ["Urea", "19:19:19"] }], clash: CLASH, foliar: [],
    soil: "Zinc sulphate 25-40 g, borax 15-20 g, iron sulphate 25 g per tree." },
  { stageN: 3, aim: "Flowers and fruit set", nitrogen: "Low",
    tanks: [{ name: "Tank A", products: ["MAP 12:61:0", "Potassium nitrate 13:0:45"] }], clash: null,
    foliar: [{ text: "Zinc sulphate 0.5 % plus boric acid 0.2 %", confirm: true }, { text: "Potassium sulphate 1.0 % at fruit set", confirm: true }], soil: null },
  { stageN: 4, aim: "Fill the fruit", nitrogen: "Medium",
    tanks: [{ name: "Tank A", products: ["Calcium nitrate"] }, { name: "Tank B", products: ["SOP 0:0:50", "Magnesium sulphate"] }], clash: CLASH,
    foliar: [{ text: "Magnesium sulphate 1.0 % plus iron sulphate 0.5 %", confirm: true }, { text: "GA3 100 ppm", confirm: true }], soil: null },
  { stageN: 5, aim: "Sugar and skin", nitrogen: "None",
    tanks: [{ name: "Tank A", products: ["SOP 0:0:50"] }], clash: null, foliar: [{ text: "Boron 0.2 %", confirm: true }], soil: null },
];

export const fertigationFor = (stageN: number): FertigationPlan => ({
  ...FERTIGATION[stageN - 1],
  phases: stageN === 1 ? [] : PHASES,
  waterPh: WATER_PH,
});

// ------------------------------------------------------------------ the guava symptom rows

type Check = { label: string; metric: string; unit: string; decimals: number; op: "<" | ">"; limit: number; value: (r: Readings, recentMin: number) => number };
const check = (metric: string, op: "<" | ">", limit: number): Check => ({ ...META[metric], metric, op, limit, value: (r) => r[metric] });

export const SYMPTOMS: { id: string; title: string; looksLike: string; checks: Check[]; explanation: string; caveat: string | null }[] = [
  { id: "guava_decline", title: "Guava decline and wilt",
    looksLike: "Older leaves yellow, shoots stunted, fast wilting, one side of a branch dies, galls on the roots.",
    checks: [check("soil_moisture", ">", 80), check("soil_ph", "<", 5.5)],
    explanation: "Wet, acid soil favours Fusarium and root-knot nematode. Stop over-watering, add mycorrhiza (200 g a tree) and Trichoderma, and dolomite (1 kg a tree) to raise pH.",
    caveat: "Sensors cannot see nematodes. Dig up some feeder roots and look for galls." },
  { id: "fruit_fly", title: "Fruit fly and mealybug",
    looksLike: "Puncture marks on the skin, oozing sap, larvae and soft rot inside, white waxy clusters at the calyx.",
    checks: [check("air_temperature", ">", 25), check("air_humidity", ">", 70)],
    explanation: "Warm, humid weather suits them. Bag fruit at 3-4 cm: foam net plus plastic bag.", caveat: null },
  { id: "anthracnose", title: "Anthracnose and fruit rot",
    looksLike: "Dark sunken patches on ripening fruit, often with pink spore masses. Young shoots die back.",
    checks: [check("air_humidity", ">", 85)],
    explanation: "Humid air and dense canopy. Thin the canopy, avoid wetting the leaves. A protective copper or bio-fungicide spray before bagging: confirm the product with an agronomist.", caveat: null },
  { id: "cracking", title: "Fruit cracking",
    looksLike: "Splits running along or across the crisp skin of ripening fruit.",
    checks: [
      { label: "Lowest moisture, last 3 days", metric: "soil_moisture_min", unit: "pct", decimals: 1, op: "<", limit: 35, value: (_r, min) => min },
      check("soil_moisture", ">", 80), check("soil_ph", ">", 7.5)],
    explanation: "A sudden jump in water after a dry spell, or high pH locking up boron and calcium. Keep moisture steady at 50-60 % with short drip pulses. Boron and calcium sprays help: confirm doses with an agronomist.", caveat: null },
  { id: "chlorosis", title: "Micronutrient chlorosis",
    looksLike: "Iron: youngest leaves yellow. Magnesium: yellow between veins on older leaves. Zinc: small, narrow rosette leaves.",
    checks: [check("soil_ph", ">", 7.2)],
    explanation: "Alkaline soil locks up iron and zinc. Acidify the feed water below pH 6.5. Foliar magnesium, iron and zinc: confirm doses with an agronomist.",
    caveat: "Too much phosphorus causes the same signs, and the sensors cannot tell the two apart. Check what has been fed." },
];

export function correlate(symptomId: string, r: Readings, recentMin: number, ageSeconds: number): Pick<Correlation, "symptom" | "title" | "verdict" | "evidence" | "explanation" | "basis" | "caveat" | "looksLike"> {
  const s = SYMPTOMS.find((x) => x.id === symptomId)!;
  const evidence: Evidence[] = s.checks.map((c) => {
    const value = Math.round(c.value(r, recentMin) * 100) / 100;
    return { metric: c.metric, label: c.label, unit: c.unit, decimals: c.decimals, op: c.op, limit: c.limit, value, ageSeconds,
             stale: false, met: c.op === "<" ? value < c.limit : value > c.limit };
  });
  // fruit fly needs warmth and humidity together; cracking needs the dry spell and the jump, or high pH
  const fits = symptomId === "fruit_fly" ? evidence.every((e) => e.met)
    : symptomId === "cracking" ? (evidence[0].met && evidence[1].met) || Boolean(evidence[2].met)
    : evidence.some((e) => e.met);
  return { symptom: s.id, title: s.title, verdict: fits ? "supported" : "not_supported", evidence,
           explanation: fits ? s.explanation : null, basis: fits ? "guava_doc" : null, caveat: s.caveat, looksLike: s.looksLike };
}

// ------------------------------------------------------------------ what the document leaves open

export const DOC_ISSUES: DocIssue[] = [
  { n: 1, title: "Stress length", detail: "Stage 1 is 45 days, but the stress protocol says withhold water for 60-90 days. The sample uses 45." },
  { n: 2, title: "Bloom timing", detail: "\"Days 65-79 post-flush\" lands around cycle day 111-125 (Stage 4), but flowering is Stage 3 (days 76-105). The sample uses Stage 3." },
  { n: 3, title: "Yield tables", detail: "Setups A and C do not multiply out (trees x yield). B and D do. The setup says where." },
  { n: 4, title: "Year or cycle", detail: "Yields are per year and a cycle is 180 days. The sample assumes one bearing cycle a year." },
  { n: 5, title: "Price", detail: "5,500 riel is $1.38 at 4,000 riel to the dollar, not the $1.25 in the table. The sample uses the table's dollars." },
  { n: 6, title: "Moisture scale", detail: "55-75 % is above what most mineral soils hold by volume. It fits a relative reading from a capacitance probe. Calibrate it first." },
  { n: 7, title: "No sources", detail: "The pasted text lists no references, so nothing here has been checked against a study." },
  { n: 8, title: "Chemical doses", detail: "Foliar and growth-regulator doses are shown as the document gives them. Confirm with an agronomist, and check which products are legal." },
  { n: 9, title: "Stage 1 without stress", detail: "The stage table assumes withheld water. For bending, pruning or chemical methods it gives no moisture target; the sample uses the general 55-75 %." },
  { n: 10, title: "Soil N, P, K", detail: "The document gives nutrient removal per tonne of fruit, not soil targets in mg/kg, so these readings are shown but not rated." },
];

// ------------------------------------------------------------------ Siem Reap's monthly ET0 (docs/TOMATO-RESEARCH.md)

export const ET0_MM_DAY: Record<number, number> = {
  1: 4.47, 2: 5.12, 3: 5.34, 4: 5.44, 5: 4.85, 6: 4.56, 7: 4.07, 8: 4.16, 9: 3.70, 10: 3.65, 11: 3.83, 12: 4.18,
};

/** Litres for one tree on one crop day: ET0 x Kc x share of demand x ground per tree, at drip efficiency. Rain ignored. */
export function litresPerTree(day: number, month: number, areaPerTreeM2: number, efficiency = 0.9): number {
  const s = stageOf(day);
  if (s.kc === null || s.etcPct === null) return 0;
  const share = (s.etcPct[0] + s.etcPct[1]) / 200;
  return (ET0_MM_DAY[month] * s.kc * share * areaPerTreeM2) / efficiency;
}
