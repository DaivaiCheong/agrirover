import { Led, Metric, Panel, Tag } from "../components/ui";

export default function Dashboard() {
  return (
    <>
      <div className="crumb"><span className="lbl">HOME &gt; DASHBOARD</span></div>
      <div className="head">
        <div className="lbl">SOK FARM · KAMPONG SPEU · 1 BED · ESP-FIELD-01</div>
        <h1 className="display d-xl" style={{ marginTop: 8 }}>FARM OVERVIEW</h1>
      </div>

      <main className="main">
        <div className="grid g4">
          <Metric label="SOIL MOISTURE" value="22.4" unit="%"
                  note={<span style={{ color: "var(--alert)" }}>▼ BELOW 30% THRESHOLD</span>} />
          <Metric label="SUPPLY · PUMP BATTERY" value="6.8" unit="V"
                  note={<span style={{ color: "var(--ok)" }}>SOLAR CHARGING</span>} />
          <Metric label="WATER pH · TANK" value="6.4" unit="pH"
                  note={<span style={{ color: "var(--warn)" }}>UNCALIBRATED — EVIDENCE ONLY</span>} />
          <Metric label="WATER USED TODAY" value="18.6" unit="L" note="4 IRRIGATION EVENTS" />
        </div>

        <div className="grid g32" style={{ marginTop: 14 }}>
          <Panel title="SOIL MOISTURE — 24 HOUR" right={<span className="lbl">THRESHOLD 30%</span>}>
            {/* TODO(sprint-2): Recharts line + threshold reference line */}
            <div className="ground ground-fine"
                 style={{ height: 180, border: "1px solid var(--line)" }} />
          </Panel>

          <Panel title="FIELD STATE">
            <Row label="RAIN SENSOR"><Led kind="ok">dry</Led></Row>
            <Row label="INLET SOLENOID"><Led kind="alert">open · 00:42</Led></Row>
            <Row label="PUMP 6V SOLAR"><Led kind="idle">off</Led></Row>
            <Row label="SOLAR SUPPLY"><Led kind="ok">charging</Led></Row>
            <Row label="RAIN LOCKOUT" last><Tag>INACTIVE</Tag></Row>
          </Panel>
        </div>
      </main>
    </>
  );
}

function Row({ label, children, last }:
  { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "9px 0",
      borderBottom: last ? "none" : "1px solid var(--line)",
    }}>
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}
