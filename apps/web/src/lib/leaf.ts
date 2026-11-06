import type { LeafNutrient, LeafResultsIn, LeafSample } from "./api";

const clean = (n: number) => +n.toFixed(3);

/** A nutrient's range in the unit being typed, so a wrong unit shows before it is saved. */
export function rangeIn(n: LeafNutrient, unit: string): string {
  if (!n.range) return "No range";
  const f = n.base === "g/kg" && unit === "%" ? 0.1 : 1;
  return `${clean(n.range[0] * f)}–${clean(n.range[1] * f)}`;
}

/** The lab's figures to send: what was left blank was not reported. */
export function toValues(nutrients: LeafNutrient[], typed: Record<string, string>, majorUnit: string): LeafResultsIn["values"] {
  return nutrients.flatMap((n) => {
    const raw = (typed[n.code] ?? "").trim();
    return raw === "" ? [] : [{ nutrient: n.code, value: Number(raw), unit: n.base === "g/kg" ? majorUnit : "mg/kg" }];
  });
}

/** One short line for a list: what is out of range, and nothing when all is well. */
export function resultLine(s: LeafSample): string {
  if (s.results.length === 0) return "Waiting for lab";
  const parts = [s.low.length && `Low ${s.low.join(", ")}`, s.high.length && `High ${s.high.join(", ")}`, s.check.length && `Check unit ${s.check.join(", ")}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "In range";
}
