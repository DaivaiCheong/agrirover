import { useState } from "react";
import { OctagonX, Play, ShieldCheck } from "lucide-react";
import type { RoverLive } from "../lib/api";
import { useEstop, useStartRound } from "../lib/queries";
import { estimate, minutes, ROVER, STATUS_WORD, stopInfo } from "../lib/rover";
import { ago } from "../lib/usePoll";
import { Led, Tag } from "./ui";

type Scenario = "normal" | "rain" | "low_battery";

/**
 * The rover's controls for one block: start a round, engage or release the e-stop, and watch it go.
 * The round and the e-stop go to the rover over MQTT; what shows here is what the rover reports back.
 */
export default function RoverControl({ zone, label, grid, live, blockLabels }: {
  zone: string;
  label: string;
  grid: { rows: number; cols: number; rowM: number; treeM: number };
  live: RoverLive | undefined;
  blockLabels: Map<string, string>;
}) {
  const start = useStartRound();
  const estop = useEstop();
  const [scenario, setScenario] = useState<Scenario>("normal");

  const rover = live?.rover;
  const m = live?.mission ?? null;
  const going = m?.status === "queued" || m?.status === "running";
  const elsewhere = going && m?.zoneId !== zone;
  const est = estimate(grid.rows, grid.cols, grid.rowM, grid.treeM);
  const pct = m && m.cellsTotal ? Math.round((m.cellsScanned / m.cellsTotal) * 100) : 0;
  const [tagKind, word] = m ? STATUS_WORD[m.status] ?? [undefined, m.status] : [undefined, ""];
  const stop = m && !going ? stopInfo(m.reason) : null;
  const roverLed: "ok" | "alert" | "idle" =
    !rover ? "idle" : rover.estop ? "alert" : rover.status === "online" ? "ok" : rover.status === "offline" ? "alert" : "idle";
  const why = rover?.estop ? "Release the e-stop first."
    : going ? "The rover is on a round."
    : rover?.status === "offline" ? "The rover is offline."
    : null;

  function run() {
    start.mutate({ zoneId: zone, rows: grid.rows, cols: grid.cols, cellM: grid.treeM, rowM: grid.rowM, simulate: scenario });
  }

  return (
    <section className="panel">
      <div className="rover-bar">
        <div className="statline">
          <Led kind={roverLed}>
            {rover?.estop ? "E-stop engaged" : `Rover ${rover?.status ?? "…"}`}
          </Led>
          <span>{rover?.lastSeenAt ? `heard ${ago(rover.lastSeenAt)}` : "not heard from since the server started"}</span>
          {m && (
            <span>
              Last round: <Tag kind={tagKind}>{word}</Tag> {blockLabels.get(m.zoneId) ?? m.zoneId}
              {m.status === "completed" || m.status === "aborted" ? ` · ${m.cellsScanned}/${m.cellsTotal} plants` : ""}
            </span>
          )}
        </div>
        <div className="rowflex" style={{ gap: 8 }}>
          {rover?.estop ? (
            <button type="button" className="btn btn-sm btn-ghost" disabled={estop.isPending} onClick={() => estop.mutate(false)}>
              <ShieldCheck size={15} aria-hidden />Release e-stop
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-estop" disabled={estop.isPending} onClick={() => estop.mutate(true)}>
              <OctagonX size={15} aria-hidden />E-stop
            </button>
          )}
          <select className="erp-select toolbar-select" style={{ minWidth: 150 }} value={scenario} aria-label="What the simulated rover meets"
                  title="Only the simulated rover reads this; a real rover meets the real weather"
                  onChange={(e) => setScenario(e.target.value as Scenario)}>
            <option value="normal">Normal round</option>
            <option value="rain">Sim: rain halfway</option>
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
        {grid.rows} rows × {grid.cols} plants · {est.distanceM.toFixed(0)} m · real rover about {minutes(est.seconds)},
        the simulator about {minutes(est.seconds / ROVER.simSpeedup)}
      </div>
    </section>
  );
}
