import { useState } from "react";
import { Panel, Tag } from "../components/ui";
import { api } from "../lib/api";

export default function Irrigation() {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function send(command: "ON" | "OFF") {
    setPending(true);
    setNote(null);
    try {
      await api.manualIrrigation("zone-a", { command, channel: 1, max_on_seconds: 60 });
      // Deliberately NOT "valve is now open" — the device reports state, we do not assume it.
      setNote("Command accepted — awaiting state report from ESP-FIELD-01.");
    } catch (e) {
      setNote(`Command failed: ${(e as Error).message}. Valve state unchanged.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="crumb"><span className="lbl">HOME &gt; IRRIGATION</span></div>
      <div className="head">
        <div className="lbl">THE BED · LETTUCE · 12 m² · ESP-FIELD-01</div>
        <h1 className="display d-xl" style={{ marginTop: 8 }}>IRRIGATION CONTROL</h1>
      </div>

      <main className="main">
        <div className="grid g3">
          <Panel title="VALVE STATE — REPORTED BY DEVICE">
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{
                width: 84, height: 84, border: "3px solid var(--alert)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span className="display" style={{ fontSize: 15, color: "var(--alert)" }}>OPEN</span>
              </div>
              <div className="mono-sm" style={{ lineHeight: 2 }}>
                REASON&nbsp; <b>auto_threshold</b><br />
                ELAPSED&nbsp; <b>00:42</b> / 01:30
              </div>
            </div>
            <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 14 }}>
              The dashboard shows the relay position the controller reports, never the command that was sent.
            </p>
          </Panel>

          <Panel title="AUTOMATIC RULE" right={<Tag kind="ok">ENABLED</Tag>}>
            <table className="tbl">
              <tbody>
                <tr><td>Trigger below</td><td className="r"><b>30.0 %</b></td></tr>
                <tr><td>Max run time</td><td className="r"><b>90 s</b></td></tr>
                <tr><td>Cooldown</td><td className="r"><b>30 min</b></td></tr>
                <tr><td>Rain lockout</td><td className="r"><b>ON</b></td></tr>
                <tr><td>Daylight only</td><td className="r"><b>06:00–17:00</b></td></tr>
              </tbody>
            </table>
          </Panel>

          <Panel title="MANUAL OVERRIDE">
            <p className="mono-sm" style={{ color: "var(--ink-muted)", marginBottom: 14 }}>
              Suspends the automatic rule for a bounded window, then local control resumes by itself.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" disabled={pending} onClick={() => send("ON")}>Open valve</button>
              <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => send("OFF")}>Close valve</button>
            </div>
            {note && <p className="mono-sm" style={{ marginTop: 12 }}>{note}</p>}
            <p className="mono-sm" style={{ color: "var(--alert)", marginTop: 12 }}>
              The firmware run-time limit always outranks a manual command.
            </p>
          </Panel>
        </div>
      </main>
    </>
  );
}
