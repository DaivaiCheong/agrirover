// The farmer's log, kept on this device until the farm server stores it. The planned endpoints are in
// docs/architecture/backend.md ("Planned for the Rover page"). Same pattern as features/rover/store.ts.

import { useSyncExternalStore } from "react";
import type { PlantEntry, SoilEntry } from "./model";

const KEY = "agrirover.fieldlog.v1";

export interface FieldLog { soil: SoilEntry[]; plants: PlantEntry[] }

function load(): FieldLog {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (x && Array.isArray(x.soil) && Array.isArray(x.plants)) return x as FieldLog;
  } catch { /* a broken entry starts again */ }
  return { soil: [], plants: [] };
}

let state: FieldLog = load();
const listeners = new Set<() => void>();

function set(next: FieldLog) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full: keep it in memory for this visit */ }
  listeners.forEach((l) => l());
}

export const useFieldLog = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function addSoil(e: SoilEntry) { set({ ...state, soil: [e, ...state.soil] }); }
export function addPlant(e: PlantEntry) { set({ ...state, plants: [e, ...state.plants] }); }
