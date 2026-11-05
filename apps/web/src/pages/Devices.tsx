import { Notice, Panel, Led } from "../components/ui";
import { api, loadProblem, type DeviceRow } from "../lib/api";
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
      <main className="main stack" style={{ paddingTop: 12 }}>
        {error && <Notice kind="alert">{loadProblem(error)}</Notice>}
        <Panel title="Devices" pad={false} right={<span className="small muted">Silent after 3 missed reports</span>}>
          <div className="tablewrap"><table className="tbl">
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
          </table></div>
        </Panel>
      </main>
    </>
  );
}
