// The twin's state for the UI: simulated rounds per block and what the farmer did with each card.
// Kept on this device (localStorage) until rounds come from the farm server. A tiny external store, no library.

import { useSyncExternalStore } from "react";
import { advise, type Advice, type Feedback } from "./sim/advice";
import { runScenario, scenario } from "./sim/scenarios";
import type { RoundData } from "./sim/scout";

const KEY = "agrirover.twin.v1";
const KEEP = 12;                                   // rounds kept per block

export interface TwinState { rounds: Record<string, RoundData[]>; feedback: Feedback[] }

function load(): TwinState {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (x && typeof x === "object" && x.rounds && Array.isArray(x.feedback)) return x as TwinState;
  } catch { /* a broken entry starts over */ }
  return { rounds: {}, feedback: [] };
}

let state: TwinState = load();
const listeners = new Set<() => void>();
function set(next: TwinState) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full: keep in memory */ }
  listeners.forEach((l) => l());
}

export const useTwin = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);

/** Run a simulated round of a scenario on its block. Each new round takes the next seed, so noise differs round to round
 *  while a replay of the same seed gives the same round. */
export function runRound(scenarioId: string): RoundData {
  const s = scenario(scenarioId);
  const block = "t1";
  const list = state.rounds[block] ?? [];
  const seed = 42 + list.length;
  const at = new Date().toISOString();
  const round = runScenario(s, seed, at, `${block}-${Date.parse(at)}`);
  set({ ...state, rounds: { ...state.rounds, [block]: [...list, round].slice(-KEEP) } });
  return round;
}

export function respond(fb: Omit<Feedback, "at">) {
  const rest = state.feedback.filter((x) => !(x.cardId === fb.cardId && x.roundId === fb.roundId));
  set({ ...state, feedback: [...rest, { ...fb, at: new Date().toISOString() }] });
}
export function undoResponse(cardId: string, roundId: string) {
  set({ ...state, feedback: state.feedback.filter((x) => !(x.cardId === cardId && x.roundId === roundId)) });
}
export function clearRounds(block: string) {
  const ids = new Set((state.rounds[block] ?? []).map((r) => r.id));
  set({ rounds: { ...state.rounds, [block]: [] }, feedback: state.feedback.filter((f) => !ids.has(f.roundId)) });
}

/** The advice for one round: the round before it and what was done with that round's cards feed the re-checks. */
export function adviceFor(s: TwinState, block: string, roundId: string): Advice | null {
  const list = s.rounds[block] ?? [];
  const i = list.findIndex((r) => r.id === roundId);
  if (i < 0) return null;
  const previous = list[i - 1];
  return advise({ round: list[i], previous, feedback: previous ? s.feedback.filter((f) => f.roundId === previous.id) : [] });
}
