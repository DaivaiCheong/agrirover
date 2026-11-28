import { Cpu } from "lucide-react";
import { Empty, ErrorNotice, Led, Panel } from "../components/ui";
import type { DeviceRow } from "../lib/api";
import { errorText, useDevices, useStatus } from "../lib/queries";
import { ago } from "../lib/usePoll";

const STATUS: Record<DeviceRow["status"], ["ok" | "warn" | "alert" | "idle", string]> = {
  online: ["ok", "reporting"],
  stale: ["warn", "silent for 15 min or more"],
  never: ["alert", "never heard from"],
  not_commissioned: ["idle", "not set up"],
};

function statusOf(d: DeviceRow): ["ok" | "warn" | "alert" | "idle", string] {
  if (d.kind === "rover" && d.link) {
    return d.link === "online" ? ["ok", "online"] : d.link === "offline" ? ["alert", "offline"] : ["idle", "not heard from since the server started"];
  }
  return STATUS[d.status];
}

/** The field nodes and the rover, as the server last heard them. Nothing here is set by hand. */
export default function Devices() {
  const devices = useDevices();
  const status = useStatus();
  const rows = devices.data ?? [];

  return (
    <main className="main stack">
      {devices.error && <ErrorNotice error={errorText(devices.error)} onRetry={() => devices.refetch()} />}
      {status.data && !status.data.broker.connected && (
        <ErrorNotice error={`The server is not connected to the farm broker (MQTT), so no device can report. ${status.data.broker.error ?? ""}`} />
      )}
      <Panel title="Devices" icon={Cpu} pad={false} right={<span className="small muted">Refreshes every 15 s</span>}>
        {rows.length === 0 ? (
          <Empty icon={Cpu}>{devices.isPending ? "Loading…" : "No device registered."}</Empty>
        ) : (
          <div className="tablewrap">
            <table className="tbl fold">
              <thead><tr><th>Code</th><th>Kind</th><th>Bed</th><th>Status</th><th>Last heard</th><th>Firmware</th></tr></thead>
              <tbody>
                {rows.map((d) => {
                  const [kind, label] = statusOf(d);
                  return (
                    <tr key={d.code}>
                      <td><b>{d.code}</b></td>
                      <td data-label="Kind">{d.kind.replace(/_/g, " ")}</td>
                      <td data-label="Bed">{d.zone ? d.zone.toUpperCase() : "All beds"}</td>
                      <td data-label="Status"><Led kind={kind}>{label}</Led></td>
                      <td data-label="Last heard">{ago(d.lastSeenAt)}</td>
                      <td data-label="Firmware">{d.firmwareVersion ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
