// The block a rover page is showing, from the address (?zone=…): its crop, grid and trees. Shared by the Soil, History and
// Setup tabs so they always agree.
import { useSearchParams } from "react-router-dom";
import { api } from "../../../../lib/api";
import { useData } from "../../../../lib/useData";
import { layoutOf, treesOf } from "./model";

export function useBlock() {
  const [search, setSearch] = useSearchParams();
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const maps = useData(api.plantMaps);

  const beds = zones.data ?? [];
  const growing = (cycles.data ?? []).filter((c) => c.status === "active");
  // a block named in the address must exist; once the blocks have loaded, an unknown one falls back to the first
  const requested = search.get("zone");
  const zone = requested && (beds.length === 0 || beds.some((b) => b.zone === requested))
    ? requested : growing[0]?.zone || beds[0]?.zone || "";
  const cycle = growing.find((c) => c.zone === zone);
  const pm = (maps.data ?? []).find((m) => m.zone === zone) ?? null;
  const layout = layoutOf(pm, cycle);
  const bed = beds.find((b) => b.zone === zone);

  return {
    search, setSearch, zones, maps, zone, cycle, pm, layout,
    trees: treesOf(pm, layout),
    label: bed?.label ?? cycle?.bedLabel ?? zone,
    crop: pm?.crop ?? cycle?.cropName ?? null,
    options: beds.map((b) => ({ zone: b.zone, label: b.label ?? b.zone })),
    setZone: (z: string) => setSearch({ zone: z }),
  };
}
