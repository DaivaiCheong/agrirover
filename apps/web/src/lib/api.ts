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
  reason: string; moisturePct: number | null; decisionAt: string;
};

export type ZoneNow = {
  zone: string; label: string | null; moisturePct: number | null; rain: boolean | null;
  supplyVoltage: number | null; waterPh: number | null; recordedAt: string | null;
};

export type DeviceRow = {
  code: string; kind: string; zone: string | null; commissioned: boolean;
  status: "online" | "stale" | "never" | "not_commissioned";
  lastSeenAt: string | null; firmwareVersion: string | null;
};

export type WaterDay = {
  day: number; stage: string; kc: number; etcMm: number;
  litersPerPlantNet: number; litersPerPlantGross: number; litersTotalGross: number;
};

export type WaterPlanResult = {
  crop: string; source: string; cycleDays: number; netM3: number; grossM3: number; peakLitersPerDay: number;
  today: WaterDay | null; stages: { stage: string; days: number; grossM3: number }[];
  assumptions: { plants: number; areaPerPlantM2: number; et0MmDay: number; efficiency: number; stageDays: number[]; rainIgnored: boolean };
  days: WaterDay[];
};

export type WaterPlanRequest = {
  crop: string; plants: number; areaPerPlantM2: number; et0MmDay: number; efficiency: number; plantedOn?: string;
};

export type PhotoResult = {
  status: "ok" | "uncertain"; label: string | null; confidence: number | null; note: string;
};

async function checkPhoto(file: File): Promise<PhotoResult> {
  const body = new FormData();
  body.append("photo", file);                       // multipart: the browser sets the content type
  const res = await fetch(`${BASE}/photos/check`, { method: "POST", body });
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
  landRentUsdPerHaYear: number | null; et0MmDay: number; irrigationEfficiency: number;
};

export type Crop = {
  slug: string; name: string; hasWaterData: boolean; kc: { ini: number; mid: number; end: number } | null;
  stageDays: number[] | null; source: string | null;
};

export type Cycle = {
  id: string; zone: string; bedLabel: string; trialArm: string | null; crop: string; cropName: string;
  variety: string | null; plantedOn: string; endedOn: string | null; status: "active" | "closed";
  day: number | null; plantCount: number | null; areaM2: number | null;
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
  checkPhoto,
  waterPlan: (body: WaterPlanRequest) => send<WaterPlanResult>("POST", "/water-plan", body),

  // farm
  settings: () => request<Settings>("/farm/settings"),
  saveSettings: (patch: Partial<Settings>) => send<Settings>("PUT", "/farm/settings", patch),
  crops: () => request<Crop[]>("/crops"),
  addCrop: (b: { name: string; kc: { ini: number; mid: number; end: number }; stageDays: number[]; source?: string }) =>
    send<Crop>("POST", "/crops", b),
  addBed: (b: { label: string; areaM2?: number }) => send<{ name: string; label: string }>("POST", "/zones", b),

  // cycles
  cycles: () => request<Cycle[]>("/cycles"),
  addCycle: (b: { zone: string; crop: string; plantedOn: string; plantCount?: number; areaM2?: number; variety?: string }) =>
    send<Cycle>("POST", "/cycles", b),
  updateCycle: (id: string, b: { plantCount?: number; areaM2?: number; variety?: string; plantedOn?: string }) =>
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
