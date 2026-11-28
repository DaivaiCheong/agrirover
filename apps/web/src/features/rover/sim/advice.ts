// The robotic agronomist: a round's findings in, a short list of actions out. Each card says what to do, where,
// how much, by when and why, with its evidence and confidence. Deterministic: the same round always gives the same cards.
// Plain TypeScript so Today and Health can show the same cards later.
//
// Never invents a pesticide, fungicide or fertiliser product or dose: chemical options appear only from the farmer's
// own product list with the label rate they entered, and then the card says "follow the label".

import { AGRONOMY } from "./profile";
import { dripHours, rainAdjusted, refillLitres, tooWetTheta, triggerTheta, waterNowTheta, type Agro } from "./agronomy";
import { HINTS, SIGN_LOOK, type Sign } from "./crop";
import { parsePlantId, type Confidence, type Forecast, type PlantId, type PlantObs, type RoundData } from "./scout";

export type CardKind = "waterNow" | "spreading" | "water" | "tooWet" | "lookAt" | "recheck" | "handCheck" | "noSoil";
/** Card order on the page. */
export const PRIORITY: CardKind[] = ["waterNow", "spreading", "water", "tooWet", "lookAt", "recheck", "handCheck", "noSoil"];
export const MAX_CARDS = 5;
export type Urgency = "now" | "today" | "tomorrow" | "canWait";
export const URGENCY_WORD: Record<Urgency, string> = { now: "Now", today: "Today", tomorrow: "Tomorrow", canWait: "Can wait" };

export interface Evidence { label: string; value: string }
export interface Product { name: string; labelRate: string; for: Sign[] }

export interface AdviceCard {
  id: string; kind: CardKind; urgency: Urgency;
  /** verb first, at most 6 words */ action: string;
  where: { plants: PlantId[]; text: string };
  /** second line: amount, or the likely cause */ detail?: string;
  amount?: { perPlantL: Record<PlantId, number>; eachL: [number, number]; totalL: number; dripH: [number, number]; rain?: string; hold?: boolean };
  diagnosis?: { sign: Sign; likely: string; couldAlso: string; howToTell: string; firstStep: string; ruledOut?: string; products?: Product[] };
  outcome?: "recovered" | "stillDry" | "spreading" | "stillShowing";
  /** one line; the evidence and the rule that fired are behind it */ why: string;
  evidence: Evidence[]; rule: string; confidence: Confidence;
}

export interface Feedback {
  cardId: string; roundId: string; kind: CardKind; plants: PlantId[];
  response: "done" | "later" | "wrong"; answer?: string; at: string;
}

export type PlantStatus = "fine" | "water" | "look" | "unchecked";

export interface Advice {
  roundId: string;
  cards: AdviceCard[];
  canWait: AdviceCard[];
  /** water today against the same dose on every plant */
  value: { waterL: number; plants: number; allL: number; allPlants: number } | null;
  status: Record<PlantId, PlantStatus>;
  counts: Record<PlantStatus, number>;
  outcome: string;
}

export interface AdviceInput {
  round: RoundData;
  previous?: RoundData;
  /** what the farmer did with the previous round's cards */ feedback?: Feedback[];
  forecast?: Forecast;
  products?: Product[];
  agro?: Agro;
}

// ---------------------------------------------------------------- words and numbers in farmer units

export const litres = (x: number) => `${x < 10 ? x.toFixed(1) : Math.round(x)} L`;
export function duration(h: number) {
  const min = Math.round(h * 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}
const range = ([a, b]: [number, number], f: (x: number) => string) => (Math.abs(a - b) < 0.05 ? f(a) : `${f(a).replace(/ .*/, "")}–${f(b)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const theta = (x: number) => x.toFixed(2);

/** "R3-P05 to R3-P10, R3-P12": plants in a row, grouped into runs. */
export function placeText(ids: PlantId[]): string {
  const byRow = new Map<number, number[]>();
  for (const id of ids) { const [r, s] = parsePlantId(id); byRow.set(r, [...(byRow.get(r) ?? []), s]); }
  const parts: string[] = [];
  for (const [r, spots] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const s = [...spots].sort((a, b) => a - b);
    let start = s[0];
    for (let i = 1; i <= s.length; i++) {
      if (i < s.length && s[i] === s[i - 1] + 1) continue;
      const end = s[i - 1], name = (x: number) => `R${r + 1}-P${String(x + 1).padStart(2, "0")}`;
      parts.push(end === start ? name(start) : `${name(start)} to ${name(end)}`);
      start = s[i];
    }
  }
  return parts.join(", ");
}
const rowsText = (rows: number[]) => {
  const r = [...new Set(rows)].sort((a, b) => a - b).map((x) => x + 1);
  return r.length === 1 ? `row ${r[0]}` : r.length === r[r.length - 1] - r[0] + 1 ? `rows ${r[0]}–${r[r.length - 1]}` : `rows ${r.join(", ")}`;
};
const modeRow = (ids: PlantId[]) => {
  const n = new Map<number, number>();
  for (const id of ids) { const r = parsePlantId(id)[0]; n.set(r, (n.get(r) ?? 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};

// ---------------------------------------------------------------- the engine

const trusted = (o: PlantObs) => o.soil.theta !== null && (o.soil.confidence === "high" || o.soil.confidence === "medium");
const confWord: Record<Confidence, string> = { high: "measured", medium: "lane reading", low: "interpolated" };
const SIGN_MIN = 0.5;

export function advise(input: AdviceInput): Advice {
  const { round, previous } = input;
  const a = input.agro ?? AGRONOMY;
  const forecast = input.forecast ?? round.forecast;
  const trig = triggerTheta(a), now = waterNowTheta(a), wet = tooWetTheta(a);
  const prevOf = new Map((previous?.plants ?? []).map((o) => [o.id, o]));
  const cards: AdviceCard[] = [];
  const status: Record<PlantId, PlantStatus> = {};
  for (const o of round.plants) status[o.id] = o.reached && (o.seen > 0 || o.soil.theta !== null) ? "fine" : "unchecked";

  // ---- soil water
  const dry = round.plants.filter((o) => trusted(o) && o.soil.theta! < trig);
  const byRow = (list: PlantObs[]) => {
    const m = new Map<number, PlantObs[]>();
    for (const o of list) m.set(o.row, [...(m.get(o.row) ?? []), o]);
    return [...m.entries()].sort((x, y) => x[0] - y[0]);
  };
  const waterCard = (kind: "waterNow" | "water", row: number, list: PlantObs[]): AdviceCard => {
    const ids = list.map((o) => o.id);
    const per: Record<PlantId, number> = {};
    let rainNote: string | undefined, allHold = true;
    for (const o of list) {
      let v = refillLitres(o.soil.theta!, round.plantM, a);
      if (kind === "water" && forecast && forecast.prob >= a.rainProbMin) {
        const adj = rainAdjusted(v, forecast.rainMm, forecast.prob, round.plantM, a);
        v = adj.hold ? 0 : adj.litres;
        allHold &&= adj.hold;
        rainNote = `rain expected (${forecast.rainMm} mm, ${Math.round(forecast.prob * 100)} %)`;
      } else allHold = false;
      per[o.id] = v;
    }
    const vals = Object.values(per), total = vals.reduce((s, x) => s + x, 0);
    const each: [number, number] = [Math.min(...vals), Math.max(...vals)];
    const drip: [number, number] = [dripHours(each[0], a), dripHours(each[1], a)];
    const thetas = list.map((o) => o.soil.theta!);
    const lo = Math.min(...thetas), conf: Confidence = list.every((o) => o.soil.confidence === "high") ? "high" : "medium";
    const before = list.map((o) => prevOf.get(o.id)).filter((x): x is PlantObs => !!x && trusted(x));
    const twice = before.length === list.length && before.every((x) => x.soil.theta! < trig);
    const hold = kind === "water" && allHold;
    for (const id of ids) status[id] = hold ? status[id] : "water";
    return {
      id: `${kind}:${row}:${ids.join(",")}`, kind, urgency: kind === "waterNow" ? "now" : "today",
      action: hold ? `Hold watering in row ${row + 1}`
        : kind === "waterNow" ? `Water now: ${plural(list.length, "plant")}, row ${row + 1}` : `Water ${plural(list.length, "plant")} in row ${row + 1}`,
      where: { plants: ids, text: placeText(ids) },
      detail: hold ? `Rain should cover it: ${rainNote}`
        : `${range(each, litres)} each, ${litres(total)} total, about ${range(drip, duration)} drip${rainNote ? "; rain expected" : ""}`,
      amount: { perPlantL: per, eachL: each, totalL: total, dripH: drip, rain: rainNote, hold },
      why: kind === "waterNow" ? `Very dry: ${theta(lo)}, water now below ${theta(now)}`
        : twice ? `Dry two rounds in a row (${theta(lo)}, refill point ${theta(trig)})` : `Below the refill point (${theta(lo)} < ${theta(trig)})`,
      evidence: [
        ...list.map((o) => ({ label: o.id, value: `θ ${theta(o.soil.theta!)} (${confWord[o.soil.confidence!]})${prevOf.get(o.id)?.soil.theta != null ? `, last round ${theta(prevOf.get(o.id)!.soil.theta!)}` : ""}` })),
        ...(rainNote ? [{ label: "Forecast", value: rainNote }] : []),
      ],
      rule: kind === "waterNow" ? `θ_root ≤ θ_WP + ${a.waterNowFrac} (θ_trigger − θ_WP) = ${now.toFixed(4)}`
        : `θ_root < θ_trigger = θ_FC − p (θ_FC − θ_WP) = ${theta(trig)}; refill (θ_FC − θ) Z_r A_w / η_a`,
      confidence: conf,
    };
  };
  for (const [row, list] of byRow(dry.filter((o) => o.soil.theta! <= now))) cards.push(waterCard("waterNow", row, list));
  for (const [row, list] of byRow(dry.filter((o) => o.soil.theta! > now))) cards.push(waterCard("water", row, list));

  const tooWet = round.plants.filter((o) => trusted(o) && o.soil.theta! > wet && (() => {
    const pr = prevOf.get(o.id); return !!pr && trusted(pr) && pr.soil.theta! > wet;
  })());
  for (const [row, list] of byRow(tooWet)) {
    const ids = list.map((o) => o.id);
    cards.push({
      id: `tooWet:${row}:${ids.join(",")}`, kind: "tooWet", urgency: "today", action: `Pause watering row ${row + 1}`,
      where: { plants: ids, text: placeText(ids) }, detail: `${plural(ids.length, "plant")} too wet two rounds running`,
      why: `Too wet two rounds in a row (above ${theta(wet)})`,
      evidence: list.map((o) => ({ label: o.id, value: `θ ${theta(o.soil.theta!)}, last round ${theta(prevOf.get(o.id)!.soil.theta!)}` })),
      rule: `θ_root > θ_FC + ${a.tooWetOver} = ${theta(wet)} for two rounds`, confidence: "medium",
    });
  }

  // ---- what the camera saw
  const dryIds = new Set(dry.map((o) => o.id));
  const signed = new Map<Sign, PlantObs[]>();
  for (const o of round.plants) {
    for (const s of o.signs) {
      if (s.p < SIGN_MIN) continue;
      if (s.sign === "wilt" && dryIds.has(o.id)) continue;      // a dry plant droops: that is the water card
      signed.set(s.sign, [...(signed.get(s.sign) ?? []), o]);
    }
  }
  const prevCount = (sign: Sign) => (previous?.plants ?? []).filter((o) => o.signs.some((s) => s.sign === sign && s.p >= SIGN_MIN)).length;
  const pOf = (o: PlantObs, sign: Sign) => o.signs.find((s) => s.sign === sign)!.p;
  for (const [sign, list] of [...signed.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    const hint = HINTS[sign];
    // clusters of neighbouring plants (row ± 1, spot ± 1) with the same sign
    const left = new Set(list.map((o) => o.id)), clusters: PlantObs[][] = [];
    for (const o of list) {
      if (!left.has(o.id)) continue;
      const c: PlantObs[] = [], q = [o];
      left.delete(o.id);
      while (q.length) {
        const x = q.pop()!; c.push(x);
        for (const y of list) if (left.has(y.id) && Math.abs(y.row - x.row) <= 1 && Math.abs(y.spot - x.spot) <= 1) { left.delete(y.id); q.push(y); }
      }
      clusters.push(c.sort((u, v) => u.row - v.row || u.spot - v.spot));
    }
    const growing = previous !== undefined && prevCount(sign) >= 1 && list.length > prevCount(sign);
    for (const c of clusters) {
      const ids = c.map((o) => o.id);
      for (const id of ids) status[id] = "look";
      const products = (input.products ?? []).filter((pr) => pr.for.includes(sign));
      const evidence: Evidence[] = c.map((o) => ({ label: o.id, value: `${SIGN_LOOK[sign].word}, ${Math.round(pOf(o, sign) * 100)} % sure${o.soil.theta !== null ? `; soil θ ${theta(o.soil.theta)}` : ""}` }));
      if (hint.spreads && (c.length >= 3 || growing)) {
        const row = modeRow(ids);
        cards.push({
          id: `spreading:${sign}:${ids.join(",")}`, kind: "spreading", urgency: "today", action: `Spreading in row ${row + 1}`,
          where: { plants: ids, text: placeText(ids) }, detail: `${SIGN_LOOK[sign].word} on ${plural(ids.length, "plant")}. ${hint.likely}`,
          diagnosis: { sign, ...hint, firstStep: `${hint.firstStep}. Ask an agronomist or extension officer; send the round report`,
            products: products.length ? products : undefined },
          why: c.length >= 3 ? `${SIGN_LOOK[sign].word} on ${ids.length} neighbouring plants` : `On more plants than last round (${list.length}, was ${prevCount(sign)})`,
          evidence, rule: "Same sign on 3 or more neighbouring plants, or on more plants than last round", confidence: "medium",
        });
        continue;
      }
      for (const o of c) {
        let likely = hint.likely, couldAlso = hint.couldAlso, ruledOut: string | undefined;
        if (sign === "yellowLower" && trusted(o)) {
          if (o.soil.theta! > wet) { likely = "Likely too much water"; couldAlso = "Low nitrogen; low magnesium"; }
          else { ruledOut = `Too much water ruled out: soil is normal (${theta(o.soil.theta!)})`; couldAlso = "Low magnesium"; }
        }
        if (sign === "wilt") ruledOut = trusted(o) ? `Not water stress: soil is not dry (${theta(o.soil.theta!)})` : "No soil reading: feel the soil by hand";
        cards.push({
          id: `lookAt:${sign}:${o.id}`, kind: "lookAt", urgency: "today", action: `Look at plant ${o.id}`,
          where: { plants: [o.id], text: o.id }, detail: `${SIGN_LOOK[sign].word}. ${likely}`,
          diagnosis: { sign, likely, couldAlso, howToTell: hint.howToTell, firstStep: hint.firstStep, ruledOut, products: products.length ? products : undefined },
          why: `${SIGN_LOOK[sign].word} in one photo, ${Math.round(pOf(o, sign) * 100)} % sure`,
          evidence, rule: `Sign probability ≥ ${SIGN_MIN}`, confidence: "medium",
        });
      }
    }
  }

  // ---- follow-up on what the farmer did last round
  for (const fb of (input.feedback ?? []).filter((x) => x.response === "done" && (!previous || x.roundId === previous.id))) {
    const here = fb.plants.map((id) => round.plants.find((o) => o.id === id)).filter((o): o is PlantObs => !!o);
    if (!here.length) continue;
    const rowWord = rowsText(here.map((o) => o.row));
    let outcome: AdviceCard["outcome"], action: string, why: string, urgency: Urgency = "canWait";
    if (fb.kind === "water" || fb.kind === "waterNow") {
      const read = here.filter(trusted);
      const still = read.filter((o) => o.soil.theta! < trig);
      if (!read.length) { outcome = undefined; action = `Re-check ${rowWord} by hand`; why = "No soil reading this round"; urgency = "today"; }
      else if (still.length) { outcome = "stillDry"; action = `Still dry: ${plural(still.length, "plant")} in ${rowWord}`; why = `Watered last round; still below ${theta(trig)}`; urgency = "today"; }
      else { outcome = "recovered"; action = `Recovered: ${plural(here.length, "plant")} in ${rowWord}`; why = `Watered last round; now ${theta(Math.min(...read.map((o) => o.soil.theta!)))} or wetter`; }
    } else {
      const showing = here.filter((o) => o.signs.some((s) => s.p >= SIGN_MIN));
      const near = round.plants.filter((o) => o.signs.some((s) => s.p >= SIGN_MIN) && here.some((h) => Math.abs(h.row - o.row) <= 1 && Math.abs(h.spot - o.spot) <= 1));
      if (near.length > here.length) { outcome = "spreading"; action = `Spreading after treatment, ${rowWord}`; why = `Now on ${near.length} plants nearby, was ${here.length}`; urgency = "today"; }
      else if (showing.length) { outcome = "stillShowing"; action = `Still showing: ${plural(showing.length, "plant")}`; why = "Treated last round; the sign is still there"; urgency = "today"; }
      else { outcome = "recovered"; action = `Recovered: ${plural(here.length, "plant")} in ${rowWord}`; why = "Treated last round; the sign is gone"; }
    }
    const ids = here.map((o) => o.id);
    cards.push({
      id: `recheck:${fb.cardId}`, kind: "recheck", urgency, action, outcome, where: { plants: ids, text: placeText(ids) },
      why, evidence: here.map((o) => ({ label: o.id, value: o.soil.theta !== null ? `θ ${theta(o.soil.theta)} (${confWord[o.soil.confidence!]})` : "no reading" })),
      rule: "An action marked Done is compared on the next round", confidence: here.every(trusted) ? "high" : "low",
    });
  }

  // ---- what the rover could not tell
  const hand = round.plants.filter((o) => !o.reached || o.seen === 0
    || (o.soil.confidence === "low" && o.soil.theta! < trig));
  if (hand.length) {
    const ids = hand.map((o) => o.id);
    const dryish = hand.some((o) => o.soil.confidence === "low" && o.soil.theta! < trig);
    cards.push({
      id: `handCheck:${ids.join(",")}`, kind: "handCheck", urgency: dryish ? "today" : "canWait",
      action: `Check ${plural(ids.length, "plant")} by hand`, where: { plants: ids, text: placeText(ids) },
      detail: "On the field walk", why: [
        hand.some((o) => !o.reached) && "not reached", hand.some((o) => o.reached && o.seen === 0) && "not photographed",
        dryish && "soil only estimated and maybe dry",
      ].filter(Boolean).join("; ").replace(/^./, (c) => c.toUpperCase()),
      evidence: hand.map((o) => ({ label: o.id, value: !o.reached ? "not reached" : o.seen === 0 ? "no photo" : `θ about ${theta(o.soil.theta!)} (interpolated)` })),
      rule: "Low confidence, plant not reached, or not in the camera's view", confidence: "low",
    });
  }
  const rowsNoSoil = [...new Set(round.plants.map((o) => o.row))].filter((r) => !round.plants.some((o) => o.row === r && trusted(o)));
  if (rowsNoSoil.length) {
    const ids = round.plants.filter((o) => rowsNoSoil.includes(o.row)).map((o) => o.id);
    const hard = round.probes.tooHard > 0;
    const need = round.plants.find((o) => o.soil.needN !== undefined)?.soil;
    cards.push({
      id: `noSoil:${rowsNoSoil.join(",")}`, kind: "noSoil", urgency: "today",
      action: `No soil readings in ${rowsText(rowsNoSoil)}`, where: { plants: ids, text: rowsText(rowsNoSoil) },
      detail: "Check 3 spots by hand", why: hard ? "Soil too hard for the probe. Try after irrigation" : "No probe readings this round",
      evidence: [
        { label: "Probes", value: `${round.probes.ok} of ${round.probes.tried} read, ${round.probes.tooHard} too hard` },
        ...(need?.needN !== undefined ? [{ label: "Push needed", value: `${need.needN.toFixed(0)} N; the rover can push ${need.liftN!.toFixed(1)} N` }] : []),
      ],
      rule: "Probes failed or skipped for a whole row or more", confidence: "high",
    });
  }

  // ---- order, limit, value line
  const order = (c: AdviceCard) => PRIORITY.indexOf(c.kind) * 1000 + (c.where.plants.length ? (() => { const [r, s] = parsePlantId(c.where.plants[0]); return r * 50 + s; })() : 0);
  const sorted = [...cards].sort((x, y) => order(x) - order(y) || x.id.localeCompare(y.id));
  const watering = cards.filter((c) => (c.kind === "water" || c.kind === "waterNow") && !c.amount?.hold);
  const waterL = watering.reduce((s, c) => s + c.amount!.totalL, 0), wPlants = watering.reduce((s, c) => s + c.where.plants.length, 0);
  const counts: Record<PlantStatus, number> = { fine: 0, water: 0, look: 0, unchecked: 0 };
  for (const v of Object.values(status)) counts[v]++;
  const noSoil = round.plants.every((o) => o.soil.theta === null);
  return {
    roundId: round.id, cards: sorted.slice(0, MAX_CARDS), canWait: sorted.slice(MAX_CARDS), status, counts,
    value: wPlants ? { waterL, plants: wPlants, allL: (waterL / wPlants) * round.plantCount, allPlants: round.plantCount } : null,
    outcome: `${round.outcome === "complete" ? "Complete" : `Partial${round.outcomeWhy ? `: ${round.outcomeWhy}` : ""}`}${noSoil ? ", no soil data" : ""}`,
  };
}
