import { Led, Notice, Panel } from "../components/ui";
import { api, loadProblem, type DeviceRow } from "../lib/api";
import { ago, usePoll } from "../lib/usePoll";

const STATUS: Record<DeviceRow["status"], ["ok" | "warn" | "alert" | "idle", string]> = {
  online: ["ok", "online"],
  stale: ["warn", "silent"],
  never: ["alert", "never heard from"],
  not_commissioned: ["idle", "not commissioned"],
};

function statusOf(d: DeviceRow): ["ok" | "warn" | "alert" | "idle", string] {
  if (d.status === "not_commissioned" && d.link) {
    return d.link === "online" ? ["ok", "telemetry online"] : ["idle", "standby"];
  }
  return STATUS[d.status];
}

export default function Devices() {
  const { data, error } = usePoll(api.devices, 10000);
  const rows = data ?? [];

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {error && <Notice kind="alert">{loadProblem(error)}</Notice>}
      <Panel
        title="Field Telemetry & Rover Devices"
        pad={false}
        right={<span className="small muted">Automated heartbeat every 10 min</span>}
      >
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Kind</th>
                <th>Primary Block</th>
                <th>Status</th>
                <th>Last scan</th>
                <th>Firmware</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const [kind, label] = statusOf(d);
                return (
                  <tr key={d.code}>
                    <td><b>{d.code}</b></td>
                    <td>{d.kind.replace(/_/g, " ")}</td>
                    <td>{d.zone ? d.zone.toUpperCase() : "All blocks"}</td>
                    <td><Led kind={kind}>{label}</Led></td>
                    <td>{d.commissioned || d.lastSeenAt ? ago(d.lastSeenAt) : "—"}</td>
                    <td>{d.firmwareVersion ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
