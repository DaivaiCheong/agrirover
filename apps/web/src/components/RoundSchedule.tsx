import { Panel, Tag } from "./ui";
import { minutes, type RoundSlot } from "../lib/rover";

/** When each block's round is planned, and which are done today. A person starts each one: the rover cannot run unwatched yet. */
export default function RoundSchedule({ plan, onPick, waiting }: { plan: RoundSlot[]; onPick?: (zone: string) => void; waiting?: string }) {
  const total = plan.reduce((s, p) => s + p.seconds, 0);
  return (
    <Panel title="Rover schedule" pad={false} right={waiting ? undefined : <span className="small muted">Every day · about {minutes(total)} · started by a person</span>}>
      {waiting ? <p className="panel-pad muted">{waiting}</p> : (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Start</th><th>Block</th><th className="r">Stops</th><th className="r">About</th><th>Today</th></tr></thead>
            <tbody>
              {plan.map((p) => (
                <tr key={p.zone} className={onPick ? "pickable" : undefined} onClick={onPick ? () => onPick(p.zone) : undefined}>
                  <td className="nowrap"><b>{p.start}</b></td>
                  <td>{p.label}</td>
                  <td className="r">{p.stops}</td>
                  <td className="r nowrap">{minutes(p.seconds)}</td>
                  <td className="nowrap">{p.partial ? <Tag kind="warn">Stopped early</Tag> : p.doneAt ? <Tag kind="ok">Done</Tag> : <span className="muted">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
