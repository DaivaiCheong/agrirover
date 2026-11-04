import type { CondParam, RatingStatus } from "./api";

/** What a farmer reads for the unit the API stores. pH has no unit symbol. */
const UNIT: Record<string, string> = { pct: "%", C: "°C", "mS/cm": "mS/cm", "mg/kg": "mg/kg", pH: "", bool: "", V: "V" };
export const unitText = (u: string) => UNIT[u] ?? u;

/** 6.30, 2.45, 68.2, 130: the number of decimals worth showing for this reading (from the API). */
export const fmtValue = (p: { value: number | null; decimals: number }) =>
  p.value === null ? "—" : p.value.toLocaleString(undefined, { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals });

/** 65, 1.2, 6.8: no trailing zeros. */
export const trim = (n: number) => String(Number(n.toFixed(2)));
export const rangeText = (p: Pick<CondParam, "target">) => (p.target ? `${trim(p.target[0])}–${trim(p.target[1])}` : null);

export const STATUS_WORD: Record<RatingStatus, string> = {
  normal: "Normal", warning: "Warning", critical: "Critical", stale: "Old reading", no_data: "No reading", unrated: "Not rated",
};

/** A CSS-safe class suffix: st-normal, st-warning, st-critical, st-stale, st-nodata, st-unrated. */
export const cls = (s: RatingStatus) => s.replace("_", "");

const RANK: Record<RatingStatus, number> = { critical: 3, warning: 2, normal: 1, stale: 0, no_data: 0, unrated: 0 };
export function worstStatus(list: RatingStatus[]): RatingStatus {
  return list.reduce<RatingStatus>((worst, s) => (RANK[s] > RANK[worst] ? s : worst), list[0] ?? "no_data");
}

/** The sentence behind a cell: for a tooltip and for a screen reader, so colour is never the only message. */
export function explain(p: CondParam): string {
  const u = unitText(p.unit);
  const what = `${p.label} ${fmtValue(p)}${u ? ` ${u}` : ""}`;
  const range = rangeText(p);
  switch (p.status) {
    case "no_data": return `${p.label}: no reading.`;
    case "unrated": return `${what}. Not rated: no targets for this crop yet.`;
    case "stale": return `${what}. Old reading, not rated.`;
    case "normal": return `${what}. Normal${range ? `, target ${range}` : ""}.`;
    default: return `${what}. ${STATUS_WORD[p.status]}${p.direction ? `: ${p.direction === "low" ? "below" : "above"} target` : ""}${range ? ` ${range}` : ""}.`;
  }
}

/** The seven cells of the ribbon: N, P and K share one because they are read together. */
export const RIBBON_CELLS: { key: string; metrics: string[] }[] = [
  { key: "moisture", metrics: ["soil_moisture"] },
  { key: "ph", metrics: ["soil_ph"] },
  { key: "ec", metrics: ["soil_ec"] },
  { key: "soilt", metrics: ["soil_temperature"] },
  { key: "npk", metrics: ["nitrogen", "phosphorus", "potassium"] },
  { key: "airt", metrics: ["air_temperature"] },
  { key: "rh", metrics: ["air_humidity"] },
];
