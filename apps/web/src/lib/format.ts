import type { Cycle } from "./api";

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** $12.34, or $0.0738 for small unit prices. */
export function usd(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** The same amount in riel, rounded to the nearest 100. */
export function riel(usdAmount: number | null | undefined, rate: number | null | undefined): string {
  if (usdAmount === null || usdAmount === undefined || !rate) return "";
  return `${(Math.round((usdAmount * rate) / 100) * 100).toLocaleString()} ៛`;
}

export const num = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: digits });

export const CATEGORY_LABELS: Record<string, string> = {
  seed: "Seeds and seedlings", fertilizer: "Fertilizer", pesticide: "Pesticide", materials: "Materials",
  water_energy: "Water and energy", labour_hired: "Hired labour", labour_family: "Family labour",
  services: "Services", repairs: "Repairs", interest: "Interest", overhead: "Overhead", other: "Other",
  depreciation: "Equipment depreciation", land: "Land",
};
export const ENTRY_CATEGORIES = [
  "seed", "fertilizer", "pesticide", "materials", "water_energy", "labour_hired", "labour_family",
  "services", "repairs", "interest", "overhead", "other",
];
export const STOCK_CATEGORIES = ["seed", "fertilizer", "pesticide", "materials"];

/** Remember the last choice on this phone. Never required: storage can be blocked. */
export const remember = {
  get: (k: string): string | null => { try { return localStorage.getItem(`aaf_${k}`); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`aaf_${k}`, v); } catch { /* ignore */ } },
};

export const cycleLabel = (c: Cycle) =>
  `${c.bedLabel} · ${c.cropName} · planted ${c.plantedOn}${c.status === "closed" ? " (closed)" : ""}`;
