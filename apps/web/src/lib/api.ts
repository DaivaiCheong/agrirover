const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("aaf_token");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type ZoneDecision = {
  zone: string;
  decision: string;
  text: string;
  durationSeconds: number;
  reason: string;
  moisturePct: number | null;
  decisionAt: string;
};

export type ZoneNow = {
  zone: string;
  label: string | null;
  moisturePct: number | null;
  rain: boolean | null;
  supplyVoltage: number | null;
  waterPh: number | null;
  recordedAt: string | null;
};

export type DeviceRow = {
  code: string;
  kind: string;
  zone: string | null;
  commissioned: boolean;
  status: "online" | "stale" | "never" | "not_commissioned";
  lastSeenAt: string | null;
  firmwareVersion: string | null;
};

export type WaterDay = {
  day: number;
  stage: string;
  kc: number;
  etcMm: number;
  litersPerPlantNet: number;
  litersPerPlantGross: number;
  litersTotalGross: number;
};

export type WaterPlanResult = {
  crop: string;
  source: string;
  cycleDays: number;
  netM3: number;
  grossM3: number;
  peakLitersPerDay: number;
  today: WaterDay | null;
  stages: { stage: string; days: number; grossM3: number }[];
  assumptions: { plants: number; areaPerPlantM2: number; et0MmDay: number; efficiency: number; stageDays: number[]; rainIgnored: boolean };
  days: WaterDay[];
};

export type WaterPlanRequest = {
  crop: string;
  plants: number;
  areaPerPlantM2: number;
  et0MmDay: number;
  efficiency: number;
  plantedOn?: string;
};

export type PhotoResult = {
  status: "ok" | "uncertain";
  label: string | null;
  confidence: number | null;
  note: string;
};

/** Photo upload: multipart, so no JSON content-type (the browser sets the boundary). */
async function checkPhoto(file: File): Promise<PhotoResult> {
  const body = new FormData();
  body.append("photo", file);
  const res = await fetch(`${BASE}/photos/check`, { method: "POST", body });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch { /* keep the status text */ }
    throw new Error(detail);
  }
  return res.json() as Promise<PhotoResult>;
}

export const api = {
  zones: () => request<ZoneNow[]>("/zones"),
  devices: () => request<DeviceRow[]>("/devices"),
  decisionsToday: () => request<ZoneDecision[]>("/decisions/today"),
  checkPhoto,
  waterPlan: (body: WaterPlanRequest) =>
    request<WaterPlanResult>("/water-plan", { method: "POST", body: JSON.stringify(body) }),
  series: (zone: string, metric = "soil_moisture", hours = 24) =>
    request<{ points: { t: string; v: number }[] }>(
      `/telemetry/${zone}?metric=${metric}&hours=${hours}`),
  manualIrrigation: (zone: string, body: { command: "ON" | "OFF"; channel: number; max_on_seconds: number }) =>
    request(`/zones/${zone}/irrigation`, { method: "POST", body: JSON.stringify(body) }),
};
