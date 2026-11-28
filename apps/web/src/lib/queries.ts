import {
  keepPreviousData,
  MutationCache,
  QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useMemo } from "react";
import {
  api,
  ApiError,
  type CostInput,
  type FinanceWorkbookDto,
  type LeafResultsIn,
  type LeafSampleIn,
  type SavePhotoInput,
  type Settings,
  type SurveyInput,
  type SurveySummary,
} from "./api";
import type { SpreadsheetInputs } from "./financeSpreadsheet";
import { financeBasis, buildAllBlockEconomics, type RoundDetail } from "./tomatoFinance";
import { toast } from "./toast";

/**
 * The farm's data, shared by every page.
 *
 * Each record type has ONE cache entry (its key below). A page that needs cycles reads the same entry as every other
 * page, so a crop started on Crops shows on Today, Plan and Rover without a reload. A save says which entries it
 * changes (`invalidates`) and those are fetched again, wherever they are shown.
 */

// ---------------------------------------------------------------- keys

export const qk = {
  status: ["status"] as const,
  zones: ["zones"] as const,
  cycles: ["cycles"] as const,
  conditions: ["conditions"] as const,
  advice: ["advice"] as const,
  schedule: (days: number) => ["schedule", days] as const,
  surveys: ["surveys"] as const,
  survey: (id: string) => ["survey", id] as const,
  roverLive: ["rover", "live"] as const,
  roverFrame: (missionId: string, row: number, col: number) => ["rover", "frame", missionId, row, col] as const,
  growth: (zone: string) => ["growth", zone] as const,
  orchard: (id: string) => ["orchard", id] as const,
  telemetry: (zone: string, metrics: string, hours: number, points: number) => ["telemetry", zone, metrics, hours, points] as const,
  workbook: ["finance", "workbook"] as const,
  financeSample: ["finance", "sample"] as const,
  settings: ["settings"] as const,
  crops: ["crops"] as const,
  setups: (crop: string, area: number | null) => ["setups", crop, area] as const,
  costs: ["costs"] as const,
  cop: (id: string) => ["cop", id] as const,
  compare: (a: string, b: string) => ["compare", a, b] as const,
  harvests: (cycleId: string) => ["harvests", cycleId] as const,
  sales: (cycleId: string) => ["sales", cycleId] as const,
  stock: ["stock"] as const,
  stockMoves: (itemId: string) => ["stock", "moves", itemId] as const,
  assets: ["assets"] as const,
  devices: ["devices"] as const,
  photos: (status: string) => ["photos", status] as const,
  photoLabels: ["photoLabels"] as const,
  diseaseGuide: ["diseaseGuide"] as const,
  leafTests: ["leafTests"] as const,
  symptoms: ["symptoms"] as const,
  diagnosis: (zone: string, symptom: string) => ["diagnosis", zone, symptom] as const,
};

/** What changes together. A save invalidates a group; the pages showing any of it refresh. */
const GROUP = {
  crops: [qk.cycles, qk.zones, qk.conditions, qk.advice, ["schedule"], ["orchard"], ["cop"], ["compare"], qk.leafTests, qk.status],
  beds: [qk.zones, qk.conditions, qk.advice, ["schedule"], ["orchard"], ["diagnosis"]],
  money: [qk.costs, ["cop"], ["compare"], qk.financeSample],
  stock: [qk.stock, ["stock", "moves"]],
  rounds: [qk.surveys, qk.conditions, qk.advice, ["schedule"], ["orchard"], ["growth"], ["diagnosis"], qk.devices, qk.status, ["photos"]],
} satisfies Record<string, QueryKey[]>;

type Meta = { invalidates?: QueryKey[]; success?: string | ((data: unknown, vars: unknown) => string); inlineError?: boolean };

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: Meta;
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, gcTime: 15 * 60_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
  mutationCache: new MutationCache({
    onSuccess: async (data, vars, _ctx, mutation) => {
      const meta = mutation.meta;
      if (meta?.invalidates) {
        await Promise.all(meta.invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      }
      const msg = typeof meta?.success === "function" ? meta.success(data, vars) : meta?.success;
      if (msg) toast.ok(msg);
    },
    onError: (err, _vars, _ctx, mutation) => {
      if (!mutation.meta?.inlineError) toast.error(errorText(err));
    },
  }),
});

/** The sentence to show for a failed request. */
export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "Failed to fetch" || msg.startsWith("NetworkError")) return "Cannot reach the farm server. Check that it is running.";
  return err instanceof ApiError ? msg : `The farm server had a problem: ${msg}`;
}

// ---------------------------------------------------------------- reads

export const useStatus = () => useQuery({ queryKey: qk.status, queryFn: api.status, refetchInterval: 10_000, retry: 0 });
export const useZones = () => useQuery({ queryKey: qk.zones, queryFn: api.zones });
export const useCycles = () => useQuery({ queryKey: qk.cycles, queryFn: api.cycles });
export const useConditions = () => useQuery({ queryKey: qk.conditions, queryFn: api.conditions, refetchInterval: 60_000 });
export const useAdvice = () => useQuery({ queryKey: qk.advice, queryFn: api.advice, refetchInterval: 60_000 });
export const useSchedule = (days: number) =>
  useQuery({ queryKey: qk.schedule(days), queryFn: () => api.schedule(days), placeholderData: keepPreviousData });
export const useSurveys = () => useQuery({ queryKey: qk.surveys, queryFn: api.surveys });
export const useSurvey = (id: string | null | undefined) =>
  useQuery({ queryKey: qk.survey(id ?? "-"), queryFn: () => api.survey(id as string), enabled: Boolean(id), staleTime: Infinity });
export const useRoverLive = (fast = false) =>
  useQuery({ queryKey: qk.roverLive, queryFn: api.roverLive, refetchInterval: fast ? 1500 : 5000, staleTime: 0 });
export const useRoverFrame = (missionId: string | null | undefined, cell: [number, number] | null) =>
  useQuery({
    queryKey: qk.roverFrame(missionId ?? "-", cell?.[0] ?? -1, cell?.[1] ?? -1),
    queryFn: () => api.roverFrame(cell![0], cell![1]),
    enabled: Boolean(missionId && cell),
  });
export const useGrowth = (zone: string | null) =>
  useQuery({ queryKey: qk.growth(zone ?? "-"), queryFn: () => api.growth(zone as string), enabled: Boolean(zone) });
export const useOrchard = (id: string) => useQuery({ queryKey: qk.orchard(id), queryFn: () => api.orchardCycle(id), enabled: Boolean(id) });
export const useTelemetry = (zone: string, metrics: string[], hours: number, points = 240) =>
  useQuery({
    queryKey: qk.telemetry(zone, metrics.join(","), hours, points),
    queryFn: () => api.telemetry(zone, metrics, hours, points),
    placeholderData: keepPreviousData,
    enabled: metrics.length > 0,
  });
export const useWorkbook = () => useQuery({ queryKey: qk.workbook, queryFn: api.financeWorkbook });
export const useFinanceSample = () => useQuery({ queryKey: qk.financeSample, queryFn: api.financeSample });
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.settings, staleTime: 60_000 });
export const useCrops = () => useQuery({ queryKey: qk.crops, queryFn: api.crops, staleTime: Infinity });
export const useSetups = (crop: string, area: number | null) =>
  useQuery({ queryKey: qk.setups(crop, area), queryFn: () => api.setups(crop, area ?? undefined), staleTime: Infinity });
export const useCosts = () => useQuery({ queryKey: qk.costs, queryFn: () => api.costs() });
export const useCop = (id: string) => useQuery({ queryKey: qk.cop(id), queryFn: () => api.cop(id), enabled: Boolean(id) });
export const useCompare = (a: string, b: string) =>
  useQuery({ queryKey: qk.compare(a, b), queryFn: () => api.compare(a, b), enabled: Boolean(a && b && a !== b) });
export const useHarvests = (cycleId: string) => useQuery({ queryKey: qk.harvests(cycleId), queryFn: () => api.harvests(cycleId) });
export const useSales = (cycleId: string) => useQuery({ queryKey: qk.sales(cycleId), queryFn: () => api.sales(cycleId) });
export const useStock = () => useQuery({ queryKey: qk.stock, queryFn: api.stockItems });
export const useStockMoves = (itemId: string | null) =>
  useQuery({ queryKey: qk.stockMoves(itemId ?? "-"), queryFn: () => api.stockMoves(itemId as string), enabled: Boolean(itemId) });
export const useAssets = () => useQuery({ queryKey: qk.assets, queryFn: api.assets });
export const useDevices = () => useQuery({ queryKey: qk.devices, queryFn: api.devices, refetchInterval: 15_000 });
export const usePhotos = (status: "all" | "confirmed" | "to_confirm" = "all") =>
  useQuery({ queryKey: qk.photos(status), queryFn: () => api.photos(status) });
export const usePhotoLabels = () => useQuery({ queryKey: qk.photoLabels, queryFn: api.photoLabels, staleTime: Infinity });
export const useDiseaseGuide = () => useQuery({ queryKey: qk.diseaseGuide, queryFn: api.diseaseGuide, staleTime: Infinity });
export const useLeafTests = () => useQuery({ queryKey: qk.leafTests, queryFn: api.leafTests });
export const useSymptoms = () => useQuery({ queryKey: qk.symptoms, queryFn: api.symptoms, staleTime: Infinity });
export const useDiagnosis = (zone: string, symptom: string) =>
  useQuery({ queryKey: qk.diagnosis(zone, symptom), queryFn: () => api.diagnose(zone, symptom), enabled: Boolean(zone && symptom) });

/** The harvests and sales of several cycles at once (Harvest page, all blocks). */
export function useHarvestLedger(cycleIds: string[]) {
  return useQueries({
    queries: cycleIds.flatMap((id) => [
      { queryKey: qk.harvests(id), queryFn: () => api.harvests(id) },
      { queryKey: qk.sales(id), queryFn: () => api.sales(id) },
    ]),
    combine: (results) => ({
      loading: results.some((r) => r.isPending),
      error: results.find((r) => r.error)?.error ?? null,
      harvests: new Map(cycleIds.map((id, i) => [id, (results[2 * i]?.data as Awaited<ReturnType<typeof api.harvests>>) ?? []])),
      sales: new Map(cycleIds.map((id, i) => [id, (results[2 * i + 1]?.data as Awaited<ReturnType<typeof api.sales>>) ?? []])),
    }),
  });
}

/** Each bed's newest finished round, with its plants. A finished round never changes, so it is fetched once. */
export function useLatestRounds(surveys: SurveySummary[] | undefined) {
  const latest = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of surveys ?? []) {
      if ((s.status === "completed" || s.status === "aborted") && !map.has(s.zone)) map.set(s.zone, s.id);
    }
    return map;
  }, [surveys]);
  const entries = [...latest.entries()];
  return useQueries({
    queries: entries.map(([, id]) => ({ queryKey: qk.survey(id), queryFn: () => api.survey(id), staleTime: Infinity })),
    combine: (results) => {
      const map = new Map<string, RoundDetail>();
      results.forEach((r, i) => {
        if (r.data) map.set(entries[i][0], r.data as RoundDetail);
      });
      return { roundsByZone: map, loading: results.some((r) => r.isPending) };
    },
  });
}

/**
 * Everything the overview pages share, worked out once per render from the shared cache: the beds, their crops,
 * today's conditions and advice, the newest round per bed, the Finance workbook and what was spent per crop.
 */
export function useFarm() {
  const zones = useZones();
  const cycles = useCycles();
  const conditions = useConditions();
  const advice = useAdvice();
  const surveys = useSurveys();
  const workbook = useWorkbook();
  const settings = useSettings();
  const costs = useCosts();
  const photos = usePhotos("all");
  const { roundsByZone, loading: roundsLoading } = useLatestRounds(surveys.data);

  const rate = settings.data?.khrPerUsd ?? workbook.data?.exchangeRate ?? 4080;
  const basis = useMemo(() => (workbook.data ? financeBasis(workbook.data as SpreadsheetInputs, settings.data?.khrPerUsd) : null), [workbook.data, settings.data]);
  const spentByCycle = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of costs.data ?? []) if (c.plantingId) map.set(c.plantingId, (map.get(c.plantingId) ?? 0) + c.amountUsd);
    return map;
  }, [costs.data]);

  const economics = useMemo(() => {
    if (!basis || !zones.data || !cycles.data) return null;
    return buildAllBlockEconomics({
      cycles: cycles.data,
      zones: zones.data,
      conditions: conditions.data ?? [],
      roundsByZone,
      basis,
      advice: advice.data ?? [],
      savedPhotos: photos.data?.photos ?? [],
      spentByCycle,
    });
  }, [basis, zones.data, cycles.data, conditions.data, roundsByZone, advice.data, photos.data, spentByCycle]);

  const loading = zones.isPending || cycles.isPending || workbook.isPending || conditions.isPending;
  const failed = [zones, cycles, conditions, advice, surveys, workbook].find((q) => q.error);
  return {
    zones: zones.data ?? [],
    cycles: cycles.data ?? [],
    active: (cycles.data ?? []).filter((c) => c.status === "active"),
    conditions: conditions.data ?? [],
    advice: advice.data ?? [],
    surveys: surveys.data ?? [],
    workbook: workbook.data ?? null,
    settings: settings.data ?? null,
    costs: costs.data ?? [],
    photos: photos.data?.photos ?? [],
    roundsByZone,
    basis,
    rate,
    spentByCycle,
    blocks: economics?.blocks ?? [],
    allRows: economics?.allRows ?? [],
    loading,
    roundsLoading,
    error: failed?.error ? errorText(failed.error) : null,
    refetch: () => Promise.all([zones.refetch(), cycles.refetch(), conditions.refetch(), advice.refetch(), surveys.refetch()]),
  };
}

// ---------------------------------------------------------------- writes

function useAction<TVars, TData>(fn: (v: TVars) => Promise<TData>, meta: Meta) {
  return useMutation<TData, Error, TVars>({ mutationFn: fn, meta });
}

type CycleIn = Parameters<typeof api.addCycle>[0];
type CyclePatch = Parameters<typeof api.updateCycle>[1];

export const useAddCycle = () =>
  useAction((b: CycleIn) => api.addCycle(b), { invalidates: GROUP.crops, inlineError: true });
export const useUpdateCycle = () =>
  useAction(({ id, patch }: { id: string; patch: CyclePatch }) => api.updateCycle(id, patch), {
    invalidates: [...GROUP.crops, ...GROUP.money],
    inlineError: true,
  });
export const useCloseCycle = () =>
  useAction(({ id, endedOn }: { id: string; endedOn?: string }) => api.closeCycle(id, endedOn), {
    invalidates: [...GROUP.crops, ...GROUP.money],
    success: "Crop closed. Its cost report is now final.",
  });

export const useAddBed = () =>
  useAction((b: { label: string; areaM2?: number }) => api.addBed(b), { invalidates: GROUP.beds, inlineError: true });
export const useSaveSoilProfile = () =>
  useAction(
    ({ zone, profile }: { zone: string; profile: Parameters<typeof api.saveSoilProfile>[1] }) => api.saveSoilProfile(zone, profile),
    { invalidates: GROUP.beds, inlineError: true },
  );

export const useSaveSettings = () =>
  useAction((patch: Partial<Settings>) => api.saveSettings(patch), {
    invalidates: [qk.settings, ...GROUP.money],
    success: "Settings saved. Riel amounts use the new rate.",
    inlineError: true,
  });

export function useSaveWorkbook() {
  const qc = useQueryClient();
  return useMutation<FinanceWorkbookDto, Error, FinanceWorkbookDto>({
    mutationFn: (wb) => api.saveFinanceWorkbook(wb),
    onMutate: (wb) => {
      qc.setQueryData(qk.workbook, wb);                 // every page sees the edit at once
    },
    meta: { invalidates: [["cop"], ["compare"]], inlineError: true },
  });
}
export const useResetWorkbook = () =>
  useAction(() => api.resetFinanceWorkbook(), { invalidates: [qk.workbook, ["cop"], ["compare"]], success: "Workbook reset to the farm baseline." });

export const useAddCost = () => useAction((b: CostInput) => api.addCost(b), { invalidates: GROUP.money, inlineError: true });
export const useDeleteCost = () =>
  useAction((id: string) => api.deleteCost(id), { invalidates: GROUP.money, success: "Cost deleted." });
export const useRemoveFinanceSample = () =>
  useAction(() => api.removeFinanceSample(), {
    invalidates: [...GROUP.money, ["harvests"], ["sales"]],
    success: "Sample entries removed.",
  });

export const useAddStockItem = () =>
  useAction((b: Parameters<typeof api.addStockItem>[0]) => api.addStockItem(b), { invalidates: GROUP.stock, inlineError: true });
export const useStockIn = () =>
  useAction(({ id, body }: { id: string; body: Parameters<typeof api.stockIn>[1] }) => api.stockIn(id, body), {
    invalidates: GROUP.stock,
    inlineError: true,
  });
export const useStockUse = () =>
  useAction(({ id, body }: { id: string; body: Parameters<typeof api.stockUse>[1] }) => api.stockUse(id, body), {
    invalidates: [...GROUP.stock, ...GROUP.money],
    inlineError: true,
  });
export const useUndoStockMove = () =>
  useAction((moveId: string) => api.undoStockUse(moveId), {
    invalidates: [...GROUP.stock, ...GROUP.money],
    success: "Undone. The stock and the crop's costs are back as they were.",
  });

export const useAddAsset = () =>
  useAction((b: Parameters<typeof api.addAsset>[0]) => api.addAsset(b), { invalidates: [qk.assets, ["cop"], ["compare"]], inlineError: true });
export const useRetireAsset = () =>
  useAction((id: string) => api.retireAsset(id), { invalidates: [qk.assets, ["cop"], ["compare"]], success: "Equipment retired." });
export const useDeleteAsset = () =>
  useAction((id: string) => api.deleteAsset(id), { invalidates: [qk.assets, ["cop"], ["compare"]], success: "Equipment removed." });

export const useAddHarvest = () =>
  useAction(({ cycleId, body }: { cycleId: string; body: Parameters<typeof api.addHarvest>[1] }) => api.addHarvest(cycleId, body), {
    invalidates: [["harvests"], ...GROUP.money],
    inlineError: true,
  });
export const useDeleteHarvest = () =>
  useAction((id: string) => api.deleteHarvest(id), { invalidates: [["harvests"], ...GROUP.money], success: "Harvest deleted." });
export const useAddSale = () =>
  useAction(({ cycleId, body }: { cycleId: string; body: Parameters<typeof api.addSale>[1] }) => api.addSale(cycleId, body), {
    invalidates: [["sales"], ...GROUP.money],
    inlineError: true,
  });
export const useDeleteSale = () =>
  useAction((id: string) => api.deleteSale(id), { invalidates: [["sales"], ...GROUP.money], success: "Sale deleted." });

export const useStartRound = () =>
  useAction((b: SurveyInput) => api.startSurvey(b), {
    invalidates: [qk.roverLive, qk.status],
    success: "Round sent to the rover.",
  });
export const useEstop = () =>
  useAction((engaged: boolean) => api.roverEstop(engaged), {
    invalidates: [qk.roverLive, qk.status],
    success: (data) => ((data as { estop: boolean }).estop ? "E-stop engaged: the rover stops." : "E-stop released."),
  });

export function useJobToggle(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ job, done }: { job: string; done: boolean }) => (done ? api.orchardJobDone(cycleId, job) : api.orchardJobUndo(cycleId, job)),
    onSuccess: (data) => qc.setQueryData(qk.orchard(cycleId), data),
    meta: { invalidates: [["schedule"]] },
  });
}
export function useFruitSize(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mm: number) => api.orchardFruitSize(cycleId, mm),
    onSuccess: (data) => qc.setQueryData(qk.orchard(cycleId), data),
    meta: { success: "Fruit size saved.", inlineError: true },
  });
}

export const useAddLeafSample = () =>
  useAction((b: LeafSampleIn) => api.addLeafSample(b), { invalidates: [qk.leafTests], inlineError: true });
export const useSaveLeafResults = () =>
  useAction(({ id, body }: { id: string; body: LeafResultsIn }) => api.saveLeafResults(id, body), {
    invalidates: [qk.leafTests],
    inlineError: true,
  });
export const useDeleteLeafSample = () =>
  useAction((id: string) => api.deleteLeafSample(id), { invalidates: [qk.leafTests], success: "Leaf sample deleted." });

export const useSavePhoto = () =>
  useAction(({ file, input }: { file: File; input: SavePhotoInput }) => api.savePhoto(file, input), {
    invalidates: [["photos"]],
    inlineError: true,
  });
export const useConfirmPhoto = () =>
  useAction(
    ({ id, body }: { id: string; body: { label: string; name: string; note: string | null } }) => api.confirmPhoto(id, body),
    { invalidates: [["photos"]], inlineError: true },
  );
export const useDeletePhoto = () =>
  useAction((id: string) => api.deletePhoto(id), { invalidates: [["photos"]], success: "Photo deleted." });

/**
 * After a round ends, everything built from rounds is fetched again (conditions, advice, plan, history).
 * Only a change seen in this session counts: a round that was already over when the app opened says nothing.
 */
const roundStates = new Map<string, string>();
export function noteRoundState(qc: QueryClient, missionId: string | null | undefined, status: string | null | undefined,
                               label?: string, reason?: string | null) {
  if (!missionId || !status) return;
  const before = roundStates.get(missionId);
  roundStates.set(missionId, status);
  const wasGoing = before === "queued" || before === "running";
  if (!wasGoing || status === "queued" || status === "running") return;
  GROUP.rounds.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  const where = label ? ` on ${label}` : "";
  if (status === "completed") toast.ok(`Rover round${where} finished. Conditions and advice are updated.`);
  else if (status === "aborted") toast.info(`Rover round${where} stopped early${reason ? ` (${reason.replace(/_/g, " ")})` : ""}. The plants it reached are saved.`);
  else toast.error(`Rover round${where} did not run: ${reason ?? status}.`);
}
