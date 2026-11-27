import { useEffect, useState } from "react";
import { api, type Inspection } from "./api";

/** A block's newest Plant Inspection, refreshed every `ms` (the photo checks arrive one by one while a round runs).
 *  Follows `zone`; empty zone: nothing. Keeps the last good report if a refresh fails. */
export function useInspection(zone: string | null | undefined, ms = 3000) {
  const [data, setData] = useState<Inspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    if (!zone) return;
    let alive = true;
    const load = () => api.inspection(zone)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, ms);
    return () => { alive = false; clearInterval(id); };
  }, [zone, ms]);
  return { data, error };
}
