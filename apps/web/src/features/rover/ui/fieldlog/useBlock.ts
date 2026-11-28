// The block a rover page is showing, from the address (?zone=…) or else the block in focus on the other pages: its crop,
// grid and plants. Shared by the Soil, Day by day and Setup tabs so they always agree; the data comes from the shared cache.
import { useSearchParams } from "react-router-dom";
import { useFarmFocus } from "../../../../lib/farmContext";
import { useCycles, usePlantMaps, useZones } from "../../../../lib/queries";
import { layoutOf, treesOf } from "./model";

export function useBlock() {
  const [search, setSearch] = useSearchParams();
  const focus = useFarmFocus();
  const zones = useZones();
  const cycles = useCycles();
  const maps = usePlantMaps();

  const beds = zones.data ?? [];
  const growing = (cycles.data ?? []).filter((c) => c.status === "active");
  // a block named in the address must exist; once the blocks have loaded, an unknown one falls back to the first
  const requested = search.get("zone") ?? focus.zone;
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
    setZone: (z: string) => { focus.setZone(z); setSearch({ zone: z }); },
  };
}
