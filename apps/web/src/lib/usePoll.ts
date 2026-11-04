import { useEffect, useState } from "react";

/** Load `fn` now and every `ms`. Keeps the last good data if a refresh fails. */
export function usePoll<T>(fn: () => Promise<T>, ms = 15000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fn()
        .then((d) => { if (alive) { setData(d); setError(null); } })
        .catch((e: Error) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, ms);
    return () => { alive = false; clearInterval(id); };
  }, [ms]);

  return { data, error };
}

/** "12 s ago" / "3 min ago" / "never". */
export function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
