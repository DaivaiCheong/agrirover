// What the top bar says about the rover, from what the backend reports. Pure: no React, so it can be tested.
// Order matters: a rover that is offline or e-stopped says so before anything else.

import { stopInfo } from "../../../lib/rover";
import { socAt } from "../sim/battery";
import { ROVER as PACK_PROFILE } from "../sim/profile";

export type StateKind = "ok" | "info" | "warn" | "alert" | "wip";
export interface RoverState { kind: StateKind; word: string }

/** The fields of the backend's live state that the top bar reads (see RoverLive in lib/api.ts). */
export interface LiveInput {
  rover?: { status: "online" | "offline" | "unknown"; estop: boolean } | null;
  mission?: { status: string; reason?: string | null } | null;
}

const STOPPED = new Set(["aborted", "rejected", "lost", "failed"]);
const RUNNING = new Set(["queued", "running"]);

export function roverState({ rover, mission }: LiveInput): RoverState {
  if (!rover) return { kind: "wip", word: "Connecting" };
  if (rover.status === "offline") return { kind: "alert", word: "Offline" };
  if (rover.estop) return { kind: "alert", word: "E-stopped" };
  if (mission && RUNNING.has(mission.status)) return { kind: "info", word: "Scouting" };
  if (mission && STOPPED.has(mission.status)) return { kind: "warn", word: `Stopped: ${stopInfo(mission.reason)?.label ?? "unknown reason"}` };
  if (rover.status === "unknown") return { kind: "wip", word: "Status unknown" };
  return { kind: "ok", word: "Docked" };
}

/** Charge (%) from the pack voltage, at rest: the OCV curve, not a straight line (11.10 V is about 37 %, not 0 %). */
export const chargePct = (volts: number) => Math.round(socAt(volts, 0, PACK_PROFILE.battery));
