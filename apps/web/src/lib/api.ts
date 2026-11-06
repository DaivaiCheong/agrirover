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
  cycle: Cycle; day: number; stages: OrchardStage[]; stage: OrchardStage; conditions: BedConditions; jobs: OrchardJob[];
  fertigation: FertigationPlan; rules: OrchardParamRule[]; leafRanges: { nutrient: string; range: string }[]; advice: Advice | null;
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

// ---- the rover: its real software, with simulated wheels and camera until the chassis is built

export type TreeAdvice = { row: number; col: number; plant: boolean; litres: number; fullLitres: number; notes: string[] };
export type RoverCell = {
  row: number; col: number; plant: boolean; flagged: boolean; readings: Record<string, number>; canopy?: number | null; chlorosis?: number | null;
  disease?: string | null; disease_confidence?: number | null; advice?: TreeAdvice | null;
};
export type LiveMission = {
  missionId: string; zoneId: string; rows: number; cols: number; cellM: number; rowM: number;
  status: "queued" | "running" | "completed" | "aborted" | "failed" | "rejected" | "lost";
  reason: string | null; cell: [number, number] | null; battery: number | null; frame: string | null;
  cellsScanned: number; cellsTotal: number; simulate: string | null; simulated: boolean | null; cells: RoverCell[];
};
export type RoverLive = { rover: { code: string; status: "online" | "offline" | "unknown"; estop: boolean }; mission: LiveMission | null };
export type SurveySummary = {
  id: string; zone: string; bedLabel: string; status: string; abortReason: string | null; simulated: boolean;
  rows: number | null; cols: number | null; cellM: number | null; cellsScanned: number | null; plantsDetected: number | null;
  cellsFlagged: number | null; distanceM: number | null; estDurationS: number | null;
  startedAt: string; finishedAt: string | null;
};
export type SurveyInput = { zoneId: string; rows: number; cols: number; cellM: number; rowM: number; simulate: "normal" | "rain" | "low_battery" };

export type FeedAdvice = {
  action: "feed" | "hold" | "flush" | "wait" | "none"; reason: string; due: boolean; nextDay: number | null; aim: string; nitrogen: string; notes: string[];
  dose: FeedDose | null; plannedDose: FeedDose | null;
};
export type FeedDose = { runs: number; perTree: { n: number; p: number; k: number }; total: { n: number; p: number; k: number } };
/** One bed's day, worked out from its newest fresh round. Advice only. */
export type Advice = {
  zone: string; label: string; cycleId: string; day: number; stage: { n: number; short: string; title: string };
  surveyed: boolean; surveyedAt: string | null; simulated: boolean; partial: boolean; treesSeen: number; treesWatered: number;
  water: { litres: number; fullLitres: number; savedLitres: number; hours: number; emitterLph: number; firmwareLimitSeconds: number; raining: boolean; paused: boolean; et0: number };
  feed: FeedAdvice; trees: TreeAdvice[]; todo: { kind: string; id?: string | null; severity: "critical" | "warn" | "info"; text: string; detail: string | null }[]; source: string;
};
export type Growth = {
  zone: string; label: string; stage: string; rounds: { at: string; canopy: number; yellow: number; simulated: boolean }[];
  summary: { canopyNow: number; changePoints: number; overDays: number; verdict: string; word: string; yellowNow: number } | null;
  trees: { row: number; col: number; first: number; now: number }[];
};

export type ScheduleEvent = {
  zone: string; label: string; date: string; lastDate: string | null; firstDay: number; lastDay: number; kind: string; title: string; detail: string | null;
  state: "due" | "overdue" | "later"; confirm: boolean;
};
export type WaterDay = { date: string; day: number; stage: string; litres: number; kind: "today" | "planned" | "hold" | "priming" };
export type Schedule = {
  start: string; days: number; roundTime: string; dates: string[]; events: ScheduleEvent[];
  blocks: { zone: string; label: string; cycleId: string; trees: number; day: number; stage: string; water: (WaterDay | null)[] }[];
};

export type ZoneNow = {
  zone: string; label: string | null; areaM2?: number | null; moisturePct: number | null; rain: boolean | null;
  supplyVoltage: number | null; waterPh: number | null; recordedAt: string | null;
};

export type DeviceRow = {
  code: string; kind: string; zone: string | null; commissioned: boolean;
  status: "online" | "stale" | "never" | "not_commissioned";
  /** The rover only: its live connection. With no hardware commissioned, what answers on it is the simulator. */
  link: "online" | "offline" | "unknown" | null;
  lastSeenAt: string | null; firmwareVersion: string | null;
};

export type PhotoResult = {
  status: "ok" | "uncertain"; label: string | null; confidence: number | null; seen: string | null; matches: Disease[]; note: string;
  symptom: string | null; correlation: Correlation | null; tree: TreeContext | null;
};
/** One tree as the rover's newest round found it. Row and tree count from 0. */
export type TreeContext = {
  zone: string; name: string; row: number; col: number; found: boolean; roundAt: string | null; simulated: boolean; stage: string | null; flagged: boolean;
  readings: { metric: string; label: string; unit: string; value: number | null; low: number | null; high: number | null; state: "low" | "ok" | "high" | null }[];
  soil: { cause: string; text: string; action: string | null } | null;
};

async function checkPhoto(file: File, zone?: string, tree?: { row: number; col: number }): Promise<PhotoResult> {
  const body = new FormData();
  body.append("photo", file);                       // multipart: the browser sets the content type
  const q = new URLSearchParams();
  if (zone) q.set("zone", zone);
  if (zone && tree) { q.set("row", String(tree.row)); q.set("col", String(tree.col)); }
  const res = await fetch(`${BASE}/photos/check${q.toString() ? `?${q}` : ""}`, { method: "POST", body });
  if (!res.ok) {
    let detail: unknown;
    try { detail = (await res.json()).detail; } catch { /* keep status */ }
    throw new ApiError(readableDetail(detail, `${res.status} ${res.statusText}`));
  }
  return res.json() as Promise<PhotoResult>;
}

export type LeafStatus = "low" | "ok" | "high" | "check" | "none";
export type LeafNutrient = { code: string; name: string; symbol: string; base: string; range: [number, number] | null };
export type LeafResult = { nutrient: string; symbol: string; value: number; unit: string; inBase: number; base: string; status: LeafStatus };
export type LeafSample = {
  id: string; zone: string | null; zoneLabel: string | null; variety: string | null; takenOn: string; cropDay: number; stage: string; atBloom: boolean;
  tree: string | null; leafPairs: number; collectedBy: string | null; note: string | null; lab: string | null; resultsOn: string | null;
  results: LeafResult[]; low: string[]; high: string[]; check: string[];
};
export type LeafCompare = {
  zone: string; label: string; takenOn: string; stage: string; variety: string | null;
  values: Record<string, { inBase: number; status: LeafStatus }>;
};
export type LeafOverview = {
  samples: LeafSample[]; total: number; waiting: number; withResults: number; outOfRange: number; compare: LeafCompare[];
  blocks: { zone: string; label: string; variety: string | null; day: number; stage: string }[];
  nutrients: LeafNutrient[]; units: string[]; rangeSource: string;
};
export type LeafSampleIn = { zone: string; takenOn: string; leafPairs: number; row: number | null; col: number | null; collectedBy: string | null; note: string | null };
export type LeafResultsIn = { lab: string | null; resultsOn: string | null; values: { nutrient: string; value: number; unit: string }[] };

export type SavedPhoto = {
  id: string; shortId: string; zone: string | null; zoneLabel: string | null; tree: string | null; part: string; takenAt: string; takenOn: string; cropDay: number | null;
  readings: { values: Record<string, number>; simulated: boolean } | null; modelName: string | null; modelLabel: string | null; modelSeen: string | null;
  farmerLabel: string | null; note: string | null; expertLabel: string | null; expertName: string | null; expertNote: string | null; expertAt: string | null;
};
export type PhotoLibrary = {
  photos: SavedPhoto[]; saved: number; toConfirm: number; confirmed: number; targetPhotos: number; targetDays: number;
  progress: { label: string; title: string; photos: number; days: number; ready: boolean }[];
};
export type Disease = {
  id: string; title: string; kind: string; leaf: string | null; fruit: string | null; notToConfuse: string | null; favours: string | null; do: string;
  sources: { title: string; url: string }[]; symptom: string | null; thin: boolean;
  /** The entry cut down for the photo result: a few words to look for, and two or three steps. */
  card: { group: "fungus" | "alga" | "insect" | "feed" | "water" | "roots"; signs: string; steps: string[]; askFirst: boolean };
};
export type PhotoLabels = { labels: { id: string; title: string }[]; parts: string[]; online: boolean };
export type SavePhotoInput = { zone: string; part: string; row?: number; col?: number; label?: string; note?: string; modelLabel?: string | null; modelSeen?: string | null };

export const photoImageUrl = (id: string) => `${BASE}/photos/${id}/image`;
export const photoExportUrl = (status: "confirmed" | "to_confirm") => `${BASE}/photos/export.zip?status=${status}`;

async function savePhoto(file: File, input: SavePhotoInput): Promise<SavedPhoto> {
  const body = new FormData();
  body.append("photo", file);
  for (const [k, v] of Object.entries(input)) if (v !== undefined && v !== null && v !== "") body.append(k, String(v));
  const res = await fetch(`${BASE}/photos`, { method: "POST", body });
  if (!res.ok) {
    let detail: unknown;
    try { detail = (await res.json()).detail; } catch { /* keep status */ }
    throw new ApiError(readableDetail(detail, `${res.status} ${res.statusText}`));
  }
  return res.json() as Promise<SavedPhoto>;
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
  grid?: { rows: number; cols: number; rowM: number; treeM: number } | null;
};

export type CostEntry = {
  id: string; plantingId: string | null; date: string; category: string; description: string | null;
  qty: number | null; unit: string | null; unitPrice: number | null; amount: number; currency: "USD" | "KHR";
  amountUsd: number; rateUsed: number | null; source: string; sample: boolean;
};

export type StockItem = {
  id: string; name: string; category: string; unit: string; qtyOnHand: number; avgUnitCostUsd: number; valueUsd: number;
};

export type StockMove = { id: string; date: string; kind: "in" | "out"; qty: number; unitCostUsd: number; plantingId: string | null };

export type Asset = {
  id: string; name: string; costUsd: number; boughtOn: string; lifeYears: number; salvageUsd: number;
  retiredOn: string | null; dailyDepreciationUsd: number; status: "in_service" | "retired" | "worn_out";
};

export type Harvest = { id: string; date: string; kgTotal: number; kgMarketable: number; kgHome: number; kgLost: number; note: string | null; sample: boolean };
export type Sale = { id: string; date: string; kg: number; pricePerKg: number; currency: "USD" | "KHR"; amountUsd: number; buyer: string | null; sample: boolean };

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
  telemetry: (zone: string, metrics: string[], hours: number, points = 240) =>
    request<TelemetrySeries>(`/telemetry/${encodeURIComponent(zone)}?${new URLSearchParams({ metrics: metrics.join(","), hours: String(hours), points: String(points) })}`),
  setups: (crop: string, areaM2?: number) =>
    request<SetupInfo[]>(`/setups?${new URLSearchParams({ crop, ...(areaM2 ? { area: String(areaM2) } : {}) })}`),
  symptoms: () => request<Symptom[]>("/diagnosis/symptoms"),
  diagnose: (zone: string, symptom: string) =>
    request<Correlation>(`/diagnosis?${new URLSearchParams({ zone, symptom })}`),
  checkPhoto,
  savePhoto,
  leafTests: () => request<LeafOverview>("/leaf-tests"),
  addLeafSample: (body: LeafSampleIn) => send<LeafSample>("POST", "/leaf-tests", body),
  saveLeafResults: (id: string, body: LeafResultsIn) => send<LeafSample>("PUT", `/leaf-tests/${id}/results`, body),
  deleteLeafSample: (id: string) => send<void>("DELETE", `/leaf-tests/${id}`),
  photos: (status: string) => request<PhotoLibrary>(`/photos?${new URLSearchParams({ status })}`),
  treeContext: (zone: string, row: number, col: number) =>
    request<TreeContext>(`/photos/tree?${new URLSearchParams({ zone, row: String(row), col: String(col) })}`),
  photoLabels: () => request<PhotoLabels>("/photos/labels"),
  diseaseGuide: () => request<Disease[]>("/photos/guide"),
  confirmPhoto: (id: string, body: { label: string; name: string; note: string | null }) => send<SavedPhoto>("PUT", `/photos/${id}/confirm`, body),
  deletePhoto: (id: string) => send<void>("DELETE", `/photos/${id}`),
  // the rover: its real software, with simulated wheels, camera and probe until the hardware is built
  roverLive: () => request<RoverLive>("/missions/live"),
  roverFrame: (row: number, col: number) => request<{ frame: string | null }>(`/missions/live/frames/${row}/${col}`),
  roverEstop: (engaged: boolean) => send<{ estop: boolean }>("POST", "/missions/estop", { engaged }),
  startSurvey: (body: SurveyInput) => send<{ missionId: string }>("POST", "/missions", body),
  surveys: () => request<SurveySummary[]>("/missions"),
  survey: (id: string) => request<SurveySummary & { cells: RoverCell[] }>(`/missions/${id}`),
  advice: () => request<Advice[]>("/advice"),
  schedule: (days: number) => request<Schedule>(`/schedule?days=${days}`),
  growth: (zone: string) => request<Growth>(`/advice/${zone}/growth`),
  orchardCycle: (id: string) => request<OrchardCycle>(`/cycles/${id}/orchard`),
  orchardJobDone: (id: string, job: string) => send<OrchardCycle>("POST", `/cycles/${id}/orchard/jobs/${job}/done`, {}),
  orchardJobUndo: (id: string, job: string) => send<OrchardCycle>("DELETE", `/cycles/${id}/orchard/jobs/${job}/done`),
  orchardFruitSize: (id: string, mm: number) => send<OrchardCycle>("POST", `/cycles/${id}/orchard/fruit`, { mm }),

  // farm
  settings: () => request<Settings>("/farm/settings"),
  saveSettings: (patch: Partial<Settings>) => send<Settings>("PUT", "/farm/settings", patch),
  crops: () => request<Crop[]>("/crops"),
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
  financeSample: () => request<{ sample: number; real: number }>("/finance/sample"),
  removeFinanceSample: () => send<{ sample: number; real: number }>("DELETE", "/finance/sample"),
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
