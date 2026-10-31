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

export const api = {
  zones: () => request<unknown[]>("/zones"),
  devices: () => request<unknown[]>("/devices"),
  series: (zone: string, metric = "soil_moisture", hours = 24) =>
    request<{ points: { t: string; v: number }[] }>(
      `/telemetry/${zone}?metric=${metric}&hours=${hours}`),
  manualIrrigation: (zone: string, body: { command: "ON" | "OFF"; channel: number; max_on_seconds: number }) =>
    request(`/zones/${zone}/irrigation`, { method: "POST", body: JSON.stringify(body) }),
};
