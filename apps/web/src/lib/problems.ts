import type { Advice, BedConditions, CondAlert, CondParam } from "./api";

/** One problem on one block: what is wrong, the number that shows it, and the one thing to do. */
export type Problem = {
  key: string; zone: string; label: string; severity: "critical" | "warning";
  problem: string;
  evidence: { label: string; value: string; target: string | null; direction: "low" | "high" | null } | null;
  /** when no single reading shows it (fruit size, weather), the measured words */
  evidenceText: string | null;
  action: string;
  link: { to: string; text: string } | null;
};

/** The one thing to do for each alert, cut from the alert's own message. Nothing here goes beyond it. */
const ACTION: Record<string, (a?: Advice) => string> = {
  stress_humidity: () => "If leaves stay on, prune or deblossom instead",
  stress_leak: () => "Keep holding the water",
  saturation: () => "Stop watering",
  bloom_floor: (a) => (a && a.water.litres > 0 ? `Water ${Math.round(a.water.litres)} L today` : "Water today"),
  cracking: () => "Water little and often",
  acid: () => "Lime with dolomite: ask an agronomist",
  alkaline: () => "Acidifying feed: ask an agronomist",
  alkaline_feed: () => "Use an acidifying feed",
  salinity: () => "Run a leaching flush",
  low_ec: () => "Don't skip the next feed · take a leaf test",
  root_heat: () => "Mulch the bed",
  sun_scald: () => "Check the fruit in full sun",
  fungal: () => "Thin the canopy, keep leaves dry",
  bag_now: () => "Bag the fruit today",
  fruit_fly: () => "Bag the fruit",
};

const fmt = (p: CondParam) => (p.value === null ? "—" : `${p.value.toFixed(p.decimals)}${p.unit === "pct" ? " %" : p.unit === "C" ? " °C" : ""}`);
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0].replace(/\.$/, "");

function evidenceOf(bed: BedConditions, metrics: string[]): Problem["evidence"] {
  const p = metrics.map((m) => bed.params.find((x) => x.metric === m)).find(Boolean);
  if (!p) return null;
  return { label: p.label, value: fmt(p), target: p.target ? `${p.target[0]}–${p.target[1]}` : null, direction: p.direction };
}

/** Today's problems, from this morning's readings: critical first, each said once. Yellow leaves the soil explains join
 *  that block's reading (low feed with EC, wet soil with moisture); the rest ask for a photo. */
export function problems(conditions: BedConditions[], advice: Advice[]): Problem[] {
  const adviceOf = new Map(advice.map((a) => [a.zone, a]));
  const out: Problem[] = [];
  for (const bed of conditions) {
    const a = adviceOf.get(bed.zone);
    const label = bed.label ?? bed.zone;
    const yellow = (a?.trees ?? []).filter((t) => t.notes.some((n) => n.startsWith("Yellow leaves") && n !== "Yellow leaves: expected"));
    const feed = yellow.filter((t) => t.notes.includes("Yellow leaves: low feed")).length;
    const wet = yellow.filter((t) => t.notes.includes("Yellow leaves: wet soil")).length;
    const skip = new Set<string>();
    if (yellow.length) {
      const n = yellow.length;
      const trees = `${n} ${n === 1 ? "tree" : "trees"}`;
      const metric = feed ? "soil_ec" : wet ? "soil_moisture" : null;
      if (feed) skip.add("low_ec");
      if (wet) skip.add("saturation");
      out.push({
        key: `${bed.zone}-yellow`, zone: bed.zone, label, severity: "warning",
        problem: feed ? `${trees} hungry: yellow leaves` : wet ? `${trees} with yellow leaves: soil too wet` : `${trees} with yellow leaves`,
        evidence: metric ? evidenceOf(bed, [metric]) : null,
        evidenceText: metric ? null : "Seen on the rover's round; the soil does not explain it",
        action: feed ? "Feed on schedule · leaf test · no fungicide" : wet ? "Stop watering · check the roots" : "Photograph them: feed or disease?",
        link: { to: `/crop?zone=${bed.zone}`, text: "Check a photo" },
      });
    }
    for (const al of bed.alerts as CondAlert[]) {
      if (skip.has(al.id)) continue;
      const evidence = evidenceOf(bed, al.metrics);
      out.push({
        key: `${bed.zone}-${al.id}`, zone: bed.zone, label, severity: al.severity, problem: al.title,
        evidence, evidenceText: evidence ? null : firstSentence(al.message),
        action: (ACTION[al.id] ?? (() => firstSentence(al.message.split(". ").slice(-1)[0])))(a),
        link: a ? { to: `/cycles/${a.cycleId}/orchard`, text: "Open block" } : null,
      });
    }
  }
  return out.sort((x, y) => Number(y.severity === "critical") - Number(x.severity === "critical"));
}
