import { useMemo } from "react";
import { SyncBadge } from "../components/SampleNotice";
import { Led, Panel } from "../components/ui";
import { api, type DeviceRow } from "../lib/api";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
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
  const demo = useMemo(() => buildDemoTomatoFarm(), []);
  const previewMode = Boolean(error && !data);
  const rows = previewMode ? demo.devices : (data ?? demo.devices);

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      <Panel
        title="Field Telemetry & Rover Devices"
        pad={false}
        right={
          <div className="rv-right">
            {previewMode && <SyncBadge />}
            <span className="small muted">Automated heartbeat every 10 min</span>
          </div>
        }
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
              {rows.length === 0 && (
                <tr><td colSpan={6}>No devices registered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
