import { useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import type { RoverLive } from "../lib/api";
import { savedCamera, savedInspect } from "../features/rover/ui/fieldlog/roundSettings";
import { usePlantMaps, useStartRound } from "../lib/queries";
import { estimate, minutes, ROVER, savedRoute, spotKey, STATUS_WORD, stopInfo } from "../lib/rover";
import { Tag } from "./ui";

type Scenario = "normal" | "rain" | "low_battery";

/**
 * Start a round on one block and watch it go. The round uses the block's Setup (Rover › Setup): its plant map, so the
 * rover stops at the plants only, its route and its camera. The e-stop is in the rover bar above, on every rover tab.
 */
export default function RoverControl({ zone, label, grid, live, blockLabels }: {
  zone: string;
  label: string;
  grid: { rows: number; cols: number; rowM: number; treeM: number };
  live: RoverLive | undefined;
  blockLabels: Map<string, string>;
}) {
  const start = useStartRound();
  const maps = usePlantMaps();
  const [scenario, setScenario] = useState<Scenario>("normal");

  const pm = maps.data?.find((m) => m.zone === zone) ?? null;
  const layout = pm ? { rows: pm.rows, cols: pm.cols, rowM: pm.rowM, treeM: pm.plantM } : grid;
  const plants = pm ? new Set(pm.plants.map(([r, c]) => spotKey(r, c))) : undefined;
  const route = savedRoute(zone);
  const camera = savedCamera(zone);
  const inspect = savedInspect(zone);

  const rover = live?.rover;
  const m = live?.mission ?? null;
  const going = m?.status === "queued" || m?.status === "running";
  const elsewhere = going && m?.zoneId !== zone;
  const est = estimate(layout.rows, layout.cols, layout.rowM, layout.treeM, route, plants);
  const pct = m && m.cellsTotal ? Math.round((m.cellsScanned / m.cellsTotal) * 100) : 0;
  const [tagKind, word] = m ? STATUS_WORD[m.status] ?? [undefined, m.status] : [undefined, ""];
  const stop = m && !going ? stopInfo(m.reason) : null;
  const why = rover?.estop ? "Release the e-stop first (rover bar above)."
    : going ? "The rover is on a round."
    : rover?.status === "offline" ? "The rover is offline."
    : pm && pm.plants.length === 0 ? "The plant map has no plants: place them on Rover › Setup."
    : null;

  function run() {
    start.mutate({
      zoneId: zone, rows: layout.rows, cols: layout.cols, cellM: layout.treeM, rowM: layout.rowM, simulate: scenario,
      start: route.start, along: route.along,
      ...(pm ? { stops: pm.plants } : {}),
      ...(inspect ? { inspect: true } : {}),
      ...(camera !== "side" ? { look: camera } : {}),
    });
  }

  return (
    <section className="panel">
      <div className="rover-bar">
        <div className="statline">
          {m ? (
            <span>
              Last round: <Tag kind={tagKind}>{word}</Tag> {blockLabels.get(m.zoneId) ?? m.zoneId}
              {m.status === "completed" || m.status === "aborted" ? ` · ${m.cellsScanned}/${m.cellsTotal} plants` : ""}
            </span>
          ) : (
            <span>No round since the server started</span>
          )}
          <span>{pm ? `Plant map: ${pm.plants.length} plants` : "No plant map: every spot is a stop"} · <Link to={`/rover/setup?zone=${zone}`}>Setup</Link></span>
        </div>
        <div className="rowflex" style={{ gap: 8 }}>
          <select className="erp-select toolbar-select" style={{ minWidth: 150 }} value={scenario} aria-label="What the simulated rover meets"
                  title="Only the simulated rover reads this; a real rover meets the real weather"
                  onChange={(e) => setScenario(e.target.value as Scenario)}>
            <option value="normal">Normal round</option>
            <option value="rain">Sim: rain on the way</option>
            <option value="low_battery">Sim: low battery</option>
          </select>
          <button type="button" className="btn btn-sm" disabled={Boolean(why) || start.isPending} title={why ?? undefined} onClick={run}>
            <Play size={15} aria-hidden />{start.isPending ? "Sending…" : `Start round on ${label}`}
          </button>
        </div>
      </div>
      {going && (
        <div className="rover-bar" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="statline" style={{ flex: 1 }}>
            <b>{m?.status === "queued" ? "Waiting for the rover to start…" : `Checking ${blockLabels.get(m!.zoneId) ?? m!.zoneId}`}</b>
            <div className="progress" aria-label={`${pct}% of the block checked`}><i style={{ width: `${pct}%` }} /></div>
            <span><b>{m?.cellsScanned ?? 0}</b> of {m?.cellsTotal ?? "?"} plants</span>
            {m?.battery != null && <span>Battery <b>{m.battery.toFixed(2)} V</b></span>}
            {elsewhere && <span>(another block)</span>}
          </div>
        </div>
      )}
      {stop && (
        <div className="rover-bar small" style={{ borderTop: "1px solid var(--line)" }}>
          <span><b>{stop.label}.</b> {stop.does} {stop.next}</span>
        </div>
      )}
      <div className="panel-foot small muted" style={{ justifyContent: "flex-start" }}>
        {est.trees} stops · {est.distanceM.toFixed(0)} m · starts {route.start.toUpperCase()}, {route.along === "rows" ? "along the rows" : "across"}
        {inspect ? " · photo of every plant" : ""} · real rover about {minutes(est.seconds)}, the simulator about {minutes(est.seconds / ROVER.simSpeedup)}
      </div>
    </section>
  );
}
