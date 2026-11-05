import { mockOn } from "./mockMode";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api/v1";

/** An error from the API with the message a farmer can read. */
export class ApiError extends Error {}

/** What to tell the farmer when a page could not load: the network and the server fail differently. */
export const loadProblem = (error: string) =>
  error === "Failed to fetch" ? "Cannot reach the farm server. Check that it is running." : `The farm server had a problem: ${error}`;

function readableDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const d = detail[0] as { msg?: string; loc?: (string | number)[] };
    const field = d.loc && d.loc.length ? String(d.loc[d.loc.length - 1]) : "";
    return field ? `${field}: ${d.msg ?? "invalid"}` : d.msg ?? fallback;
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (mockOn) {                                      // sample data: answered in the browser, the server is never called
    const { mockRequest } = await import("../mock/server");
    return mockRequest<T>(path, init);
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail: unknown;
    try { detail = (await res.json()).detail; } catch { /* no body */ }
    throw new ApiError(readableDetail(detail, `${res.status} ${res.statusText}`));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const send = <T,>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

// ------------------------------------------------------------------ operate

export type ZoneDecision = {
  zone: string; decision: string; text: string; durationSeconds: number;
  reason: string; moisturePct: number | null; thresholdPct: number | null; decisionAt: string;
};

// ---- conditions: every reading rated against the crop's stage (advice only; nothing here opens a valve)

export type RatingStatus = "normal" | "warning" | "critical" | "stale" | "no_data" | "unrated";

export type CondParam = {
  metric: string; label: string; short: string; unit: string; decimals: number; value: number | null;
  recordedAt: string | null; status: RatingStatus; direction: "low" | "high" | null; target: [number, number] | null;
};
export type CondAlert = { id: string; severity: "critical" | "warning"; title: string; message: string; metrics: string[] };
export type CondStage = {
  n: number; key: string; title: string; firstDay: number; lastDay: number; day: number; extended: boolean;
  moisture: [number, number]; ec: [number, number]; focus: string;
};
export type BedConditions = {
  zone: string; label: string | null; areaM2: number | null; crop: string | null; cropName: string | null;
  variety: string | null; day: number | null; recordedAt: string | null; rated: boolean; status: RatingStatus;
  basis: string; source: string; stage: CondStage | null; params: CondParam[]; alerts: CondAlert[];
};

export type TelemetrySeries = {
  zone: string; hours: number; bucketSeconds: number; from: string; to: string;
  series: Record<string, { t: string; v: number }[]>;
};

// ---- growing setups and the yield forecast

export type SetupInfo = {
  id: string; label: string; method: string | null; plantsForArea: number | null;
  density: [number, number]; kgPerPlant: [number, number]; referenceBedM2: number;
  plantsPerReferenceBed: [number, number]; kgPerReferenceBed: [number, number];
  rowCm: number; plantCm: number; spacingPlantsPerM2: number; basis: string; spacingBasis: string;
  orchard?: OrchardPreset;                           // tree crops only
};

/** What an orchard setup adds. Yields are per tree per YEAR, not per cycle. */
export type OrchardPreset = {
  letter: string; cultivars: string; treesPerHa: [number, number]; firstBearing: string; tPerHa: [number, number];
  kgPer50m2: [number, number]; npk: string; drip: string; emitterLphPerTree: number; priceUsd: [number, number];
  docIssue: string | null;                           // where the document's own table does not add up
};

/** A tree crop's cycle: the tree outlives the cycle, so its age and the cycle's day are separate things. */
export type Perennial = {
  treesPlantedOn: string; treeAgeYears: number; regulation: string; regulationLabel: string; stress: boolean;
  harvestFrom: string; harvestTo: string; rainyHarvest: boolean;
};

export type OrchardStage = {
  n: number; key: string; short: string; title: string; firstDay: number; lastDay: number;
  moisture: [number, number]; ec: [number, number]; kc: number | null; etcPct: [number, number] | null;
  water: string; feed: string; actions: string;
};

export type OrchardJob = {
  id: string; title: string; detail: string; firstDay: number; lastDay: number; stageN: number;
  state: "due" | "done" | "overdue" | "later" | "past";
  confirm: boolean;                                  // a chemical dose: confirm with an agronomist before using it
  measure: boolean;                                  // needs a fruit size typed in
  ongoing: boolean;                                  // lasts its whole window: nothing to tick off
};

export type FertigationPlan = {
  stageN: number; aim: string; nitrogen: string;
  tanks: { name: string; products: string[] }[];
  clash: string | null;                              // products that must not share a tank
  phases: { label: string; pct: number; what: string }[];
  foliar: { text: string; confirm: boolean }[];
  soil: string | null; waterPh: string;
};

export type DocIssue = { n: number; title: string; detail: string };
export type OrchardParamRule = { label: string; target: string; critical: string; note: string };

/** Everything the cycle page needs, for any day of the cycle. The contract for the real endpoint. */
export type OrchardCycle = {
  cycle: Cycle; day: number; actualDay: number; sample: boolean; stages: OrchardStage[]; stage: OrchardStage;
  conditions: BedConditions; jobs: OrchardJob[]; fertigation: FertigationPlan; rules: OrchardParamRule[];
  water: { litresPerTree: number; litresTotal: number; hoursPerRun: number; emitterLphPerTree: number; firmwareLimitSeconds: number };
  fruitMm: number | null; bagged: boolean; setup: SetupInfo | null; docIssues: DocIssue[];
};
export type Forecast = {
  setup: string; label: string; plants: number; kgLow: number; kgHigh: number; kgMid: number;
  pricePerKgUsd: number | null; revenueLowUsd: number | null; revenueHighUsd: number | null; basis: string;
};

// ---- a symptom set against live readings

export type Symptom = { id: string; title: string };
export type Evidence = {
  metric: string; label: string; unit: string; decimals: number; op: "<" | ">"; limit: number;
  value: number | null; ageSeconds: number | null; stale: boolean; met: boolean | null;
};
export type Correlation = {
  symptom: string; title: string; verdict: "supported" | "not_supported" | "no_data"; evidence: Evidence[];
  explanation: string | null; basis: "spec" | "practice" | "guava_doc" | null; caveat: string | null;
  looksLike?: string | null;                         // the visual signs to compare with the plant
  stage: { key: string; title: string; day: number } | null; zone: string; label: string | null;
  source: "named" | "photo";
};

export type ZoneNow = {
  zone: string; label: string | null; areaM2?: number | null; moisturePct: number | null; rain: boolean | null;
  supplyVoltage: number | null; waterPh: number | null; recordedAt: string | null;
};

export type DeviceRow = {
  code: string; kind: string; zone: string | null; commissioned: boolean;
  status: "online" | "stale" | "never" | "not_commissioned";
  lastSeenAt: string | null; firmwareVersion: string | null;
};

export type PlanTask = {
  text: string; firstDay: number; lastDay: number; startsOn: string; endsOn: string; basis: string;
};

export type PlanNow =
  | { state: "not_planted"; startsInDays: number }
  | { state: "finished"; daysAgo: number }
  | {
      state: "growing"; day: number; daysLeft: number; stage: string; stageTitle?: string; stagePlain?: string;
      litersToday: number; litersPerPlant: number; ifCloudy: number; ifRainy: number;
      tasks: PlanTask[]; next: (PlanTask & { inDays: number }) | null;
    };

export type PlanStage = {
  stage: string; title: string; plain: string | null; watch: string | null; watchBasis: string | null;
  firstDay: number; lastDay: number; startsOn: string; endsOn: string; days: number; grossM3: number;
  avgLitersPerPlantPerDay: number; tasks: PlanTask[];
};

export type PlanSource = { key: string; label: string; url: string; read: string; supports: string };

export type CropPlan = {
  crop: string; slug: string; hasGuide: boolean; plants: number; plantedOn: string; endsOn: string; cycleDays: number;
  areaPerPlantM2: number; areaM2: number; now: PlanNow;
  water: {
    grossM3: number; netM3: number; efficiency: number; perPlantWholeCycleL: number; peakLitersPerDay: number;
    avgEt0MmDay: number; et0Source: string; rainIgnored: boolean;
    days: { day: number; stage: string; et0Mm: number; litersTotalGross: number; litersPerPlantGross: number }[];
    weeks: { week: number; startsOn: string; firstDay: number; stage: string; litersPerDay: number;
             litersPerPlantPerDay: number; et0MmDay: number }[];
    check: { ourPeakMmDay: number; japanMmDayRange: [number, number]; verdict: "inside" | "close" | "outside";
             japanLitersPerPlantPeak: [number, number] };
    howTo?: { text: string; basis: string }[];
  };
  stages: PlanStage[];
  season: {
    hotDays: number; rainyDays: number; notes: { kind: "warn" | "note"; text: string; basis: string }[];
    months: { month: number; days: number; et0MmDay: number; avgHighC: number; rainMmDay: number }[];
  };
  kcSource: string;
  feed?: {
    rows: { when: string; what: string; nitrogenG: number; urea46G: number; compostKg?: number; phosphateG?: number;
            tspG?: number; potashG?: number; mopG?: number }[];
    totalsForAllPlants: { compostKg: number; mulchKg: number; ureaKg: number; tspKg: number; mopKg: number };
    note: string; basis: string;
  };
  harvest?: {
    firstPickDay: number; firstPickOn: string; lastDay: number; lastOn: string; basis: string;
    benchmark: { label: string; caution: string;
                 rows: { label: string; tPer10a: number; kgPerPlant: number; kgForYourPlants: number }[] };
  };
  tasks?: PlanTask[];
  sources: PlanSource[];
};

export type CropPlanQuery = {
  crop: string; plants: number; plantedOn: string; efficiency?: number; rowCm?: number; plantCm?: number;
};

export type PhotoResult = {
  status: "ok" | "uncertain"; label: string | null; confidence: number | null; note: string;
  symptom: string | null; correlation: Correlation | null;
};

async function checkPhoto(file: File, zone?: string): Promise<PhotoResult> {
  if (mockOn) throw new ApiError("disease model not installed");   // the same answer the real server gives today
  const body = new FormData();
  body.append("photo", file);                       // multipart: the browser sets the content type
  const res = await fetch(`${BASE}/photos/check${zone ? `?${new URLSearchParams({ zone })}` : ""}`, { method: "POST", body });
  if (!res.ok) {
    let detail: unknown;
    try { detail = (await res.json()).detail; } catch { /* keep status */ }
    throw new ApiError(readableDetail(detail, `${res.status} ${res.statusText}`));
  }
  return res.json() as Promise<PhotoResult>;
}

// ------------------------------------------------------------------ manage

export type Settings = {
  khrPerUsd: number; rateConfirmed: boolean; familyWageUsdPerDay: number | null; waterCostPerM3Usd: number | null;
  landRentUsdPerHaYear: number | null; irrigationEfficiency: number;
};

export type Crop = {
  slug: string; name: string; hasWaterData: boolean; defaultAreaPerPlantM2: number; kc: { ini: number; mid: number; end: number } | null;
  stageDays: number[] | null; source: string | null;
  perennial?: boolean;                               // a tree: planted once, cycles repeat
  regulationMethods?: { id: string; label: string; note: string }[];
  harvestDays?: [number, number];                    // cycle days when picking happens
  rainyMonths?: number[];
};

export type Cycle = {
  id: string; zone: string; bedLabel: string; trialArm: string | null; crop: string; cropName: string;
  variety: string | null; plantedOn: string; endedOn: string | null; status: "active" | "closed";
  day: number | null; stage: string | null; stageTitle: string | null; plantCount: number | null; areaM2: number | null;
  setup: string | null; setupLabel: string | null; expectedPriceUsdPerKg: number | null; forecast: Forecast | null;
  perennial?: Perennial | null;
};

export type CostEntry = {
  id: string; plantingId: string | null; date: string; category: string; description: string | null;
  qty: number | null; unit: string | null; unitPrice: number | null; amount: number; currency: "USD" | "KHR";
  amountUsd: number; rateUsed: number | null; source: string;
};

export type StockItem = {
  id: string; name: string; category: string; unit: string; qtyOnHand: number; avgUnitCostUsd: number; valueUsd: number;
};

export type StockMove = { id: string; date: string; kind: "in" | "out"; qty: number; unitCostUsd: number; plantingId: string | null };

export type Asset = {
  id: string; name: string; costUsd: number; boughtOn: string; lifeYears: number; salvageUsd: number;
  retiredOn: string | null; dailyDepreciationUsd: number; status: "in_service" | "retired" | "worn_out";
};

export type Harvest = { id: string; date: string; kgTotal: number; kgMarketable: number; kgHome: number; kgLost: number; note: string | null };
export type Sale = { id: string; date: string; kg: number; pricePerKg: number; currency: "USD" | "KHR"; amountUsd: number; buyer: string | null };

export type Cop = {
  cycle: Cycle; currency: "USD"; khrPerUsd: number | null;
  lines: { category: string; label: string; amountUsd: number; sharePct: number; estimate: boolean }[];
  totalCostUsd: number; days: number; open: boolean;
  kgTotal: number; kgMarketable: number; kgHome: number; kgLost: number;
  revenueUsd: number; marginUsd: number | null; copPerKg: number | null; breakEvenPricePerKg: number | null;
  costPerPlant: number | null; costPerM2: number | null; kgPerM3Water: number | null; waterM3: number | null;
  costPerKgIfBenchmark: { atLowYield: number; atHighYield: number } | null;
  flags: string[];
};

export type CostInput = {
  plantingId: string | null; date: string; category: string; description?: string;
  qty?: number; unit?: string; unitPrice?: number; amount?: number; currency: "USD" | "KHR";
};

export const api = {
  // operate
  zones: () => request<ZoneNow[]>("/zones"),
  devices: () => request<DeviceRow[]>("/devices"),
  decisionsToday: () => request<ZoneDecision[]>("/decisions/today"),
  conditions: () => request<BedConditions[]>("/conditions"),
  telemetry: (zone: string, metrics: string[], hours: number) =>
    request<TelemetrySeries>(`/telemetry/${encodeURIComponent(zone)}?${new URLSearchParams({ metrics: metrics.join(","), hours: String(hours), points: "240" })}`),
  setups: (crop: string, areaM2?: number) =>
    request<SetupInfo[]>(`/setups?${new URLSearchParams({ crop, ...(areaM2 ? { area: String(areaM2) } : {}) })}`),
  symptoms: () => request<Symptom[]>("/diagnosis/symptoms"),
  diagnose: (zone: string, symptom: string) =>
    request<Correlation>(`/diagnosis?${new URLSearchParams({ zone, symptom })}`),
  checkPhoto,
  cropPlan: (q: CropPlanQuery) => {
    const qs = new URLSearchParams({ crop: q.crop, plants: String(q.plants), plantedOn: q.plantedOn });
    if (q.efficiency !== undefined) qs.set("efficiency", String(q.efficiency));
    if (q.rowCm && q.plantCm) { qs.set("rowCm", String(q.rowCm)); qs.set("plantCm", String(q.plantCm)); }
    return request<CropPlan>(`/crop-plan?${qs}`);
  },
  cyclePlan: (id: string) => request<CropPlan>(`/cycles/${id}/plan`),
  orchardCycle: (id: string, day?: number) => request<OrchardCycle>(`/cycles/${id}/orchard${day ? `?day=${day}` : ""}`),
  orchardJobDone: (id: string, job: string) => send<OrchardCycle>("POST", `/cycles/${id}/orchard/jobs/${job}/done`, {}),
  orchardFruitSize: (id: string, mm: number) => send<OrchardCycle>("POST", `/cycles/${id}/orchard/fruit`, { mm }),

  // farm
  settings: () => request<Settings>("/farm/settings"),
  saveSettings: (patch: Partial<Settings>) => send<Settings>("PUT", "/farm/settings", patch),
  crops: () => request<Crop[]>("/crops"),
  addCrop: (b: { name: string; kc: { ini: number; mid: number; end: number }; stageDays: number[]; source?: string }) =>
    send<Crop>("POST", "/crops", b),
  addBed: (b: { label: string; areaM2?: number }) => send<{ name: string; label: string }>("POST", "/zones", b),

  // cycles
  cycles: () => request<Cycle[]>("/cycles"),
  addCycle: (b: { zone: string; crop: string; plantedOn: string; plantCount?: number; areaM2?: number; variety?: string;
                  setup?: string; expectedPriceUsdPerKg?: number; treesPlantedOn?: string; regulation?: string }) =>
    send<Cycle>("POST", "/cycles", b),
  updateCycle: (id: string, b: { plantCount?: number; areaM2?: number; variety?: string; plantedOn?: string;
                                 setup?: string; expectedPriceUsdPerKg?: number }) =>
    send<Cycle>("PATCH", `/cycles/${id}`, b),
  closeCycle: (id: string, endedOn?: string) => send<Cycle>("POST", `/cycles/${id}/close`, { endedOn }),
  cop: (id: string) => request<Cop>(`/cycles/${id}/cop`),
  compare: (a: string, b: string) =>
    request<{ a: Cop; b: Cop; copPerKgDifference: number | null }>(`/reports/compare?a=${a}&b=${b}`),

  // costs
  costs: (cycleId?: string) => request<CostEntry[]>(`/costs${cycleId ? `?cycle=${cycleId}` : ""}`),
  addCost: (b: CostInput) => send<CostEntry>("POST", "/costs", b),
  deleteCost: (id: string) => send<void>("DELETE", `/costs/${id}`),
  costsCsvUrl: mockOn ? "#sample-data-has-no-export" : `${BASE}/export/costs.csv`,
  copCsvUrl: mockOn ? "#sample-data-has-no-export" : `${BASE}/export/cop.csv`,

  // stock
  stockItems: () => request<StockItem[]>("/stock/items"),
  addStockItem: (b: { name: string; category: string; unit: string }) => send<StockItem>("POST", "/stock/items", b),
  stockIn: (id: string, b: { date: string; qty: number; unitPrice: number; currency: "USD" | "KHR" }) =>
    send<StockItem>("POST", `/stock/items/${id}/in`, b),
  stockUse: (id: string, b: { date: string; qty: number; plantingId: string }) =>
    send<{ item: StockItem }>("POST", `/stock/items/${id}/use`, b),
  stockMoves: (id: string) => request<StockMove[]>(`/stock/items/${id}/moves`),
  undoStockUse: (moveId: string) => send<void>("DELETE", `/stock/moves/${moveId}`),

  // equipment
  assets: () => request<Asset[]>("/assets"),
  addAsset: (b: { name: string; costUsd: number; boughtOn: string; lifeYears: number; salvageUsd?: number }) =>
    send<Asset>("POST", "/assets", b),
  retireAsset: (id: string) => send<Asset>("PATCH", `/assets/${id}/retire`, {}),
  deleteAsset: (id: string) => send<void>("DELETE", `/assets/${id}`),

  // harvest and sales
  harvests: (cycleId: string) => request<Harvest[]>(`/cycles/${cycleId}/harvests`),
  addHarvest: (cycleId: string, b: { date: string; kgTotal: number; kgMarketable: number; kgHome?: number; note?: string }) =>
    send<Harvest>("POST", `/cycles/${cycleId}/harvests`, b),
  deleteHarvest: (id: string) => send<void>("DELETE", `/harvests/${id}`),
  sales: (cycleId: string) => request<Sale[]>(`/cycles/${cycleId}/sales`),
  addSale: (cycleId: string, b: { date: string; kg: number; pricePerKg: number; currency: "USD" | "KHR"; buyer?: string }) =>
    send<Sale>("POST", `/cycles/${cycleId}/sales`, b),
  deleteSale: (id: string) => send<void>("DELETE", `/sales/${id}`),
};
