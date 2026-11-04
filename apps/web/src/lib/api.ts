const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api/v1";

/** An error from the API with the message a farmer can read. */
export class ApiError extends Error {}

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
export type CondAlert = { id: string; severity: "critical"; title: string; message: string; metrics: string[] };
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
  explanation: string | null; basis: "spec" | "practice" | null; caveat: string | null;
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
};

export type Cycle = {
  id: string; zone: string; bedLabel: string; trialArm: string | null; crop: string; cropName: string;
  variety: string | null; plantedOn: string; endedOn: string | null; status: "active" | "closed";
  day: number | null; stage: string | null; stageTitle: string | null; plantCount: number | null; areaM2: number | null;
  setup: string | null; setupLabel: string | null; expectedPriceUsdPerKg: number | null; forecast: Forecast | null;
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
                  setup?: string; expectedPriceUsdPerKg?: number }) =>
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
  costsCsvUrl: `${BASE}/export/costs.csv`,
  copCsvUrl: `${BASE}/export/cop.csv`,

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
