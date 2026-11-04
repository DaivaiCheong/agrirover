import { useCallback, useEffect, useState } from "react";

/** Load once, and again when `reload()` is called (after a save). Keeps the last data on error. */
export function useData<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return fn()
      .then((d) => { setData(d); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, deps);

  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}
