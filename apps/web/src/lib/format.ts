import type { Cycle } from "./api";

/** Today's date where the browser is (not UTC: before 7 am in Cambodia UTC is still yesterday). */
export const todayIso = () => new Date().toLocaleDateString("sv-SE");

const parse = (iso: string) => new Date(`${iso}T00:00:00`);
export const dayMonth = (iso: string) => parse(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const dayMonthYear = (iso: string) =>
  parse(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const longToday = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** "Day 22 · Settling in", or "Starts 15 Nov" for a crop planned but not planted yet. */
export const dayLabel = (c: Cycle) =>
  c.day !== null && c.day > 0 ? `Day ${c.day}${c.stageTitle ? ` · ${c.stageTitle}` : ""}` : `Starts ${dayMonth(c.plantedOn)}`;

/** The bed area to suggest for a plant count: one decimal, never below 0.1. */
export const suggestedArea = (plants: number, areaPerPlantM2: number) =>
  Math.max(0.1, Math.round(plants * areaPerPlantM2 * 10) / 10);

/** Litres, switching to cubic metres when it is a lot of water. */
export function litres(v: number): string {
  return v >= 2000 ? `${(v / 1000).toFixed(1)} m³` : `${Math.round(v).toLocaleString()} L`;
}

/** $12.34, or $0.0738 for small unit prices. */
export function usd(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  const text = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${v < 0 ? "-" : ""}$${text}`;
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
  `${c.bedLabel} · ${c.cropName} · from ${c.plantedOn}${c.status === "closed" ? " (closed)" : ""}`;
