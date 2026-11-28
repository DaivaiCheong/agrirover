// FAO-56 soil-water balance for tomato: a water proposal comes from measured depletion, not a guess.
//   TAW = 1000 (θFC − θWP) Zr   RAW = p TAW   θtrigger = θFC − p (θFC − θWP)
//   V_plant [L] = (θFC − θroot) Zr A_w 1000 / η_a   when θroot < θtrigger      ETc = Kc ET0
//   θ_{t+1} = θ_t + (P + I − Ks ETc) / (1000 Zr),   Ks = clamp((θ − θWP)/(θtrigger − θWP), 0, 1)

import { AGRONOMY } from "./profile";

export type Agro = typeof AGRONOMY;

export const taw = (a: Agro = AGRONOMY) => 1000 * (a.thetaFC - a.thetaWP) * a.rootDepth;
export const raw = (a: Agro = AGRONOMY) => a.p * taw(a);
export const triggerTheta = (a: Agro = AGRONOMY) => a.thetaFC - a.p * (a.thetaFC - a.thetaWP);
export const waterNowTheta = (a: Agro = AGRONOMY) => a.thetaWP + a.waterNowFrac * (triggerTheta(a) - a.thetaWP);
export const tooWetTheta = (a: Agro = AGRONOMY) => a.thetaFC + a.tooWetOver;

/** Wetted area per plant, m²: plant spacing × wetted strip. */
export const wettedArea = (plantM: number, a: Agro = AGRONOMY) => plantM * a.wettedWidth;

/** Litres to refill one plant's wetted root zone to field capacity; 0 above the trigger. */
export function refillLitres(thetaRoot: number, plantM: number, a: Agro = AGRONOMY): number {
  if (thetaRoot >= triggerTheta(a)) return 0;
  return ((a.thetaFC - thetaRoot) * a.rootDepth * wettedArea(plantM, a) * 1000) / a.appEff;
}

/** Litres a plant uses a day: ETc over its own ground (row spacing × plant spacing). */
export const cropUseLitres = (rowM: number, plantM: number, a: Agro = AGRONOMY) => a.kc * a.et0 * rowM * plantM;

/** A forecast's rain credited against a refill: 0.8 × rain (mm) × A_w (m²) litres, when likely enough. */
export function rainAdjusted(litres: number, rainMm: number, prob: number, plantM: number, a: Agro = AGRONOMY) {
  if (prob < a.rainProbMin) return { litres, hold: false };
  const left = Math.max(0, litres - a.rainEff * rainMm * wettedArea(plantM, a));
  return { litres: left, hold: left <= a.holdBelowL };
}
/** Rain (mm) that covers a whole refill. */
export const rainCancelsMm = (litres: number, plantM: number, a: Agro = AGRONOMY) => litres / (a.rainEff * wettedArea(plantM, a));

/** Drip time (h) for a volume at the emitter's flow. */
export const dripHours = (litres: number, a: Agro = AGRONOMY) => litres / a.emitterLph;

/** Water stress coefficient. */
export const ks = (theta: number, a: Agro = AGRONOMY) => Math.max(0, Math.min(1, (theta - a.thetaWP) / (triggerTheta(a) - a.thetaWP)));

/** One update of a cell's root-zone moisture over dtDays, with rain and irrigation in mm. */
export const stepTheta = (theta: number, dtDays: number, rainMm = 0, irrMm = 0, a: Agro = AGRONOMY) =>
  theta + (rainMm + irrMm - ks(theta, a) * a.kc * a.et0 * dtDays) / (1000 * a.rootDepth);
