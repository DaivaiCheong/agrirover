import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * The block (and plant) the farmer is looking at, shared by every page: pick G2 on Today and Rover, Health, Plan and
 * Harvest open on G2. Kept for this browser tab only, so two tabs can look at two blocks.
 */
type Focus = { zone: string | null; plant: string | null };
type FarmFocus = Focus & {
  setZone: (zone: string | null) => void;
  setFocus: (zone: string | null, plant?: string | null) => void;
  setPlant: (plant: string | null) => void;
};

const KEY = "agrirover_focus_v1";
const Ctx = createContext<FarmFocus | null>(null);

function load(): Focus {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Focus>) : {};
    return { zone: parsed.zone ?? null, plant: parsed.plant ?? null };
  } catch {
    return { zone: null, plant: null };
  }
}

function save(f: Focus) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* storage blocked: the focus just is not remembered */
  }
}

export function FarmFocusProvider({ children }: { children: ReactNode }) {
  const [focus, setState] = useState<Focus>(load);
  const update = useCallback((next: Focus) => {
    setState((prev) => {
      if (prev.zone === next.zone && prev.plant === next.plant) return prev;
      save(next);
      return next;
    });
  }, []);
  const value = useMemo<FarmFocus>(() => ({
    ...focus,
    setZone: (zone) => update({ zone, plant: zone === focus.zone ? focus.plant : null }),
    setFocus: (zone, plant = null) => update({ zone, plant }),
    setPlant: (plant) => update({ zone: focus.zone, plant }),
  }), [focus, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFarmFocus(): FarmFocus {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFarmFocus needs <FarmFocusProvider>");
  return ctx;
}
