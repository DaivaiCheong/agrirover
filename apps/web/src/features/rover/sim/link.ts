// The Wi-Fi link: a low antenna loses signal fast. Dual-slope path loss with a breakpoint, foliage loss
// (Weissberger) and a fixed loss for a PCB antenna low on the chassis.
//   d_b = 4 h_ap h_r / λ;  PL = 20 log10(4π d/λ) up to d_b, then PL(d_b) + 40 log10(d/d_b)
//   L_fol = 0.45 f^0.284 d_f (d_f ≤ 14 m);  RSSI = P_tx + G_tx + G_rx − PL − L_fol − L_extra

import { LINK, type RoverProfile } from "./profile";

const C = 299_792_458;
export type Link = typeof LINK;

export const wavelength = (l: Link = LINK) => C / (l.freqGHz * 1e9);
export const breakpoint = (p: RoverProfile, l: Link = LINK) => (4 * l.apHeight * p.wifi.antennaHeight) / wavelength(l);

export function pathLoss(p: RoverProfile, d: number, l: Link = LINK): number {
  const lam = wavelength(l), db = breakpoint(p, l);
  const free = (x: number) => 20 * Math.log10((4 * Math.PI * Math.max(x, 0.1)) / lam);
  return d <= db ? free(d) : free(db) + 40 * Math.log10(d / db);
}

export const foliageLoss = (df: number, l: Link = LINK) => 0.45 * l.freqGHz ** 0.284 * Math.min(df, 14);

export const rssi = (p: RoverProfile, d: number, foliageM = LINK.foliageM, l: Link = LINK) =>
  p.wifi.txDbm + l.apGainDbi + l.roverGainDbi - pathLoss(p, d, l) - foliageLoss(foliageM, l) - p.wifi.extraLossDb;

/** Packet loss (%) for telemetry: a logistic step around the telemetry threshold. */
export const lossPct = (p: RoverProfile, dbm: number, l: Link = LINK) => 100 / (1 + Math.exp((dbm - p.wifi.telemetryDbm) / l.lossWidthDb));
