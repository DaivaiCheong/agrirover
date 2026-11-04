import { Notice, PageIntro, Panel, Led } from "../components/ui";
import { api, type DeviceRow } from "../lib/api";
import { ago, usePoll } from "../lib/usePoll";

const STATUS: Record<DeviceRow["status"], ["ok" | "warn" | "alert" | "idle", string]> = {
  online: ["ok", "online"],
  stale: ["warn", "silent"],
  never: ["alert", "never heard from"],
  not_commissioned: ["idle", "not commissioned"],
};

export default function Devices() {
  const { data, error } = usePoll(api.devices, 10000);

  return (
    <>
      <PageIntro>The sensors and the rover on your farm, and when each last reported.</PageIntro>

      <main className="main">
        {error && <Notice kind="alert">Cannot reach the farm server ({error}).</Notice>}
        <Panel title="Devices" pad={false}>
          <table className="tbl">
            <thead>
              <tr><th>Code</th><th>Kind</th><th>Zone</th><th>Status</th><th>Last seen</th><th>Firmware</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((d) => {
                const [kind, label] = STATUS[d.status];
                return (
                  <tr key={d.code}>
                    <td><b>{d.code}</b></td>
                    <td>{d.kind.replace("_", " ")}</td>
                    <td>{d.zone ?? "—"}</td>
                    <td><Led kind={kind}>{label}</Led></td>
                    <td>{d.commissioned ? ago(d.lastSeenAt) : "—"}</td>
                    <td>{d.firmwareVersion ?? "—"}</td>
                  </tr>
                );
              })}
              {data?.length === 0 && <tr><td colSpan={6}>No devices registered.</td></tr>}
            </tbody>
          </table>
        </Panel>
        <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 14 }}>
          A device is "silent" after 3 missed reports. The rover shows as not commissioned until the
          physical rover is in service.
        </p>
      </main>
    </>
  );
}
