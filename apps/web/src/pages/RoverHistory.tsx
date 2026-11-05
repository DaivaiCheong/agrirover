import { useState } from "react";
import RoverMap, { RoverLegend } from "../components/RoverMap";
import { TreeTable } from "./Rover";
import { Empty, Notice, Panel, Tag } from "../components/ui";
import { api, type SurveySummary } from "../lib/api";
import { STATUS_WORD, minutes, stopInfo } from "../lib/rover";
import { useData } from "../lib/useData";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function StatusCell({ s }: { s: SurveySummary }) {
  const [kind, word] = STATUS_WORD[s.status] ?? [undefined, s.status];
  return <><Tag kind={kind}>{word}</Tag>{s.abortReason && <span className="small muted"> {stopInfo(s.abortReason)?.label}</span>}</>;
}

export default function RoverHistory() {
  const list = useData(api.surveys);
  const [open, setOpen] = useState<string | null>(null);
  const one = useData(() => (open ? api.survey(open) : Promise.resolve(null)), [open]);
  const rows = list.data ?? [];
  const r = one.data;

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {list.error && <Notice kind="alert">{list.error}</Notice>}
      {one.error && <Notice kind="alert">{one.error}</Notice>}
      <Panel title="Rounds" pad={false} right={<span className="small muted">Photos are not kept</span>}>
        {rows.length === 0 ? <Empty>No rounds saved yet.</Empty> : (
          <div className="tablewrap rc-history">
            <table className="tbl">
              <thead><tr><th>When</th><th>Block</th><th>Source</th><th>Status</th><th className="r">Stops</th><th className="r">Trees</th><th className="r">Yellow</th><th className="r">Real time</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className={`pickable${open === s.id ? " picked" : ""}`} onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <td className="nowrap"><b>{when(s.startedAt)}</b></td>
                    <td className="nowrap">{s.bedLabel}</td>
                    <td>{s.simulated ? <Tag>Simulated</Tag> : <Tag kind="ok">Field</Tag>}</td>
                    <td className="nowrap"><StatusCell s={s} /></td>
                    <td className="r nowrap">{s.cellsScanned ?? 0} of {(s.rows ?? 0) * (s.cols ?? 0)}</td>
                    <td className="r">{s.plantsDetected ?? "—"}</td>
                    <td className="r">{s.cellsFlagged ?? "—"}</td>
                    <td className="r nowrap">{s.estDurationS === null ? "—" : minutes(s.estDurationS)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {open && r && r.rows && r.cols && (
        <>
          <Panel title={`Block map · ${r.bedLabel}`} pad={false} right={r.simulated ? <span className="small muted">Generated orchard, not a real one</span> : undefined}>
            <div className="rm-wrap rm-wrap-sm"><RoverMap rows={r.rows} cols={r.cols} cells={r.cells} /></div>
            <div className="panel-foot rm-foot"><RoverLegend /></div>
          </Panel>
          <TreeTable cells={r.cells} />
        </>
      )}
    </main>
  );
}
