import { useSyncExternalStore } from "react";

/** Small, app-wide notices: "Harvest saved", "Cannot reach the farm server". One store, any page can add to it. */
export type Toast = { id: number; kind: "ok" | "alert" | "info"; text: string };

let items: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(kind: Toast["kind"], text: string, ms = kind === "alert" ? 7000 : 4000) {
  const id = nextId++;
  // the same text twice in a row (a retried request) shows once
  if (items.some((t) => t.text === text && t.kind === kind)) return id;
  items = [...items.slice(-3), { id, kind, text }];
  emit();
  window.setTimeout(() => dismiss(id), ms);
  return id;
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  ok: (text: string) => push("ok", text),
  error: (text: string) => push("alert", text),
  info: (text: string) => push("info", text),
};

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => items,
    () => items,
  );
}
