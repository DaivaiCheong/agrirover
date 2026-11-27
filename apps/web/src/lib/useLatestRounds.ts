import { useMemo } from "react";
import { api, type RoverCell, type SurveySummary } from "./api";
import { useData } from "./useData";

export type SurveyDetail = SurveySummary & { cells: RoverCell[] };

/** Fetch the newest completed/aborted rover round detail for each block in parallel from MongoDB. */
export function useLatestRoundsByZone(surveys: SurveySummary[]) {
  const latestByZone = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of surveys) {
      if ((s.status === "completed" || s.status === "aborted") && !map.has(s.zone)) {
        map.set(s.zone, s.id);
      }
    }
    return map;
  }, [surveys]);

  const roundKey = [...latestByZone.values()].join(",");
  const fetched = useData(async () => {
    if (!roundKey) return new Map<string, SurveyDetail>();
    const pairs = await Promise.all([...latestByZone.entries()].map(async ([z, id]) => [z, await api.survey(id)] as const));
    return new Map(pairs);
  }, [roundKey]);

  return {
    roundsByZone: fetched.data ?? new Map<string, SurveyDetail>(),
    loading: fetched.loading,
    error: fetched.error,
  };
}
