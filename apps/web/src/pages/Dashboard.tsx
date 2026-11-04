import { Led, Metric, Panel, Tag } from "../components/ui";
import { api, type ZoneDecision, type ZoneNow } from "../lib/api";
import { ago, usePoll } from "../lib/usePoll";

const STALE_AFTER_S = 300;

function badge(d: ZoneDecision): [string, string] {
  if (d.decision === "irrigate") return ["warn", "WATER"];
  if (d.decision === "hold_in_range") return d.reason === "no_reading" ? ["wip", "NO DATA"] : ["ok", "IN RANGE"];
  return ["info", d.decision.replace(/^(defer|hold|suppress)_/, "").replace(/_/g, " ").toUpperCase()];
}

function isStale(z: ZoneNow) {
  return z.recordedAt !== null && Date.now() - new Date(z.recordedAt).getTime() > STALE_AFTER_S * 1000;
}

export default function Dashboard() {
  const decisions = usePoll(api.decisionsToday);
  const zones = usePoll(api.zones);
  const error = decisions.error ?? zones.error;

  return (
    <>
      <div className="crumb"><span className="lbl">HOME &gt; DASHBOARD</span></div>
      <div className="head">
        <div className="lbl">TODAY'S PLAN · DECIDED AT 06:00 FARM TIME · LIVE READINGS</div>
        <h1 className="display d-xl" style={{ marginTop: 8 }}>FARM OVERVIEW</h1>
      </div>

      <main className="main">
        {error && (
          <p className="mono-sm" style={{ color: "var(--alert)", marginBottom: 14 }}>
            Cannot reach the farm server ({error}). Showing the last data received, if any.
          </p>
        )}

        <div className="grid g3">
          {(zones.data ?? []).map((z) => (
            <Metric key={z.zone} label={`SOIL MOISTURE · ${(z.label ?? z.zone).toUpperCase()}`}
                    value={z.moisturePct === null ? "—" : z.moisturePct.toFixed(1)} unit="%"
                    note={z.recordedAt === null
                      ? "NO READING YET"
                      : <span style={{ color: isStale(z) ? "var(--alert)" : "var(--ok)" }}>
                          {isStale(z) ? "STALE · " : ""}{ago(z.recordedAt).toUpperCase()}
                        </span>} />
          ))}
        </div>

        <div className="grid g32" style={{ marginTop: 14 }}>
          <Panel title="TODAY'S DECISIONS" right={<span className="lbl">RULE ENGINE</span>}>
            {decisions.data === null && !error && <p className="mono-sm">Loading…</p>}
            {decisions.data?.length === 0 && (
              <p className="mono-sm">No zones configured yet.</p>
            )}
            {(decisions.data ?? []).map((d, i, all) => {
              const [kind, label] = badge(d);
              return (
                <div key={d.zone} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                  padding: "9px 0", borderBottom: i === all.length - 1 ? "none" : "1px solid var(--line)",
                }}>
                  <span className="mono-sm"><b>{d.text}</b></span>
                  <Tag kind={kind}>{label}</Tag>
                </div>
              );
            })}
            <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 14 }}>
              Proposals only. Approve or skip in Telegram — nothing opens a valve from here.
            </p>
          </Panel>

          <Panel title="FIELD STATE">
            {(zones.data ?? []).map((z, i, all) => (
              <div key={z.zone} style={{
                padding: "9px 0", borderBottom: i === all.length - 1 ? "none" : "1px solid var(--line)",
              }}>
                <div className="lbl lbl-ink">{(z.label ?? z.zone).toUpperCase()}</div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
                  <Led kind={z.rain === null ? "idle" : z.rain ? "alert" : "ok"}>
                    {z.rain === null ? "rain —" : z.rain ? "raining" : "dry"}
                  </Led>
                  <span className="mono-sm">SUPPLY {z.supplyVoltage === null ? "—" : `${z.supplyVoltage.toFixed(2)} V`}</span>
                  <span className="mono-sm">pH {z.waterPh === null ? "—" : z.waterPh.toFixed(1)}</span>
                </div>
              </div>
            ))}
            {zones.data?.length === 0 && <p className="mono-sm">No zones configured yet.</p>}
          </Panel>
        </div>
      </main>
    </>
  );
}
