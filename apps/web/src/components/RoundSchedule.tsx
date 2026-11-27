import { Panel, Tag } from "./ui";
import { minutes, type RoundSlot } from "../lib/rover";

/** Autonomous daily rover schedule per block with scan timing and automation status. */
export default function RoundSchedule({
  plan,
  onPick,
  waiting,
  totalBlocks = plan.length,
}: {
  plan: RoundSlot[];
  onPick?: (zone: string) => void;
  waiting?: string;
  totalBlocks?: number;
}) {
  const total = plan.reduce((s, p) => s + p.seconds, 0);
  return (
    <Panel
      title="Rover schedule"
      pad={false}
      right={
        waiting ? undefined : (
          <span className="small muted">
            Daily at 07:00 AM · {totalBlocks} {totalBlocks === 1 ? "block" : "blocks"} · ~{minutes(total)} autonomous scan
          </span>
        )
      }
    >
      {waiting ? (
        <p className="panel-pad muted">{waiting}</p>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Start</th>
                <th>Block</th>
                <th className="r">Plants scanned</th>
                <th className="r">Est. scan time</th>
                <th>Automation status</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((p) => (
                <tr key={p.zone} className={onPick ? "pickable" : undefined} onClick={onPick ? () => onPick(p.zone) : undefined}>
                  <td className="nowrap"><b>{p.start} AM</b></td>
                  <td><b>{p.label}</b></td>
                  <td className="r">{p.stops}</td>
                  <td className="r nowrap">{minutes(p.seconds)}</td>
                  <td className="nowrap">
                    {p.partial ? (
                      <Tag kind="warn">Stopped early</Tag>
                    ) : p.doneAt ? (
                      <Tag kind="ok">Completed · Automated</Tag>
                    ) : (
                      <Tag kind="info">Scheduled · Automated</Tag>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
