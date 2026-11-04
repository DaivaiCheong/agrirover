import type { ReactNode } from "react";
import { Panel, Tag } from "../components/ui";

type Status = "BUILT" | "WAITING" | "DEMO ONLY" | "PLANNED";
const KIND: Record<Status, string> = { BUILT: "ok", WAITING: "warn", "DEMO ONLY": "wip", PLANNED: "info" };

// Honest status: BUILT = in the code and tested, using simulated sensors (no real field data yet).
const FEATURES: { name: string; solves: string; status: Status; note: string }[] = [
  { name: "Daily watering decision, per zone",
    solves: "Not knowing when, or how much, to water",
    status: "BUILT", note: "Same rule engine every day; tested with simulated sensors" },
  { name: "Daily Telegram message: Approve / Skip",
    solves: "Checking a dashboard every day; automation taking control away",
    status: "WAITING", note: "Tested with a mock. Needs the Telegram bot token" },
  { name: "Safety rules: rain, daylight, cooldown, max run time",
    solves: "Wasted water; flat solar battery; a valve stuck open",
    status: "BUILT", note: "The controller enforces its own run limit as well" },
  { name: "Live readings and device status",
    solves: "Is the sensor alive, and what does the soil say now?",
    status: "BUILT", note: "Dashboard and Devices pages" },
  { name: "Disease photo check (phone photo)",
    solves: "Spotting sick plants early",
    status: "WAITING", note: "Screen is built. Needs the model file. Triage, not diagnosis" },
  { name: "Rover survey map",
    solves: "Paying people to walk every row",
    status: "DEMO ONLY", note: "Simulated rover for the CDA demo. Not part of the first product" },
  { name: "Rover findings inside the daily message",
    solves: "Scouting without walking the field",
    status: "PLANNED", note: "Step S7" },
  { name: "Automatic valve opening",
    solves: "The farmer having to go and open the valve",
    status: "PLANNED", note: "Only after the farmer has trusted the decisions for a while" },
  { name: "Drone scouting service",
    solves: "Scouting labour on larger farms",
    status: "PLANNED", note: "Stage 2, and only if scouting labour is the measured bottleneck" },
];

const REMOVED = [
  "Thermal camera: weak in humid climates and costly",
  "NPK / pH soil probe: nobody asked for it",
  "Yield prediction: needs several seasons of data",
  "Watering or spraying from the rover: the rover only looks",
  "RTK GPS: deferred until the rover is a real product",
];

const CONTEXT: { text: string; src: string; href: string }[] = [
  { text: "Young people are leaving farms, so peak-season labour is short and rural wages are rising.",
    src: "MAFF, 2017", href: "https://un-csam.org/sites/default/files/2020-11/2.%20PPT_Cambodia_Saruth%20Chan.pdf" },
  { text: "Hired pesticide spraying costs up to $18–25 per hectare.",
    src: "Future Farming, 2022", href: "https://futurefarming.com/tech-in-focus/drones/spraying-drones-help-cassava-growers-in-cambodia-increase-yield" },
  { text: "Cassava mosaic disease has spread across most main cassava regions and is not always visible, so a camera can only triage.",
    src: "Agronomy, 2022", href: "https://www.mdpi.com/2073-4395/12/7/1658" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ marginTop: 14 }}><Panel title={title}>{children}</Panel></div>;
}

export default function Plan() {
  return (
    <>
      <div className="crumb"><span className="lbl">HOME &gt; PLAN</span></div>
      <div className="head">
        <div className="lbl">AGRIROVER · AI AUTO FARM PLATFORM</div>
        <h1 className="display d-xl" style={{ marginTop: 8 }}>SYSTEM PLAN</h1>
      </div>

      <main className="main">
        <Panel title="THE PROBLEM">
          <p style={{ fontSize: 17, lineHeight: 1.5 }}>
            Farmers find out too late that plants are thirsty or sick, and they pay people to walk every row to find out.
          </p>
          <ul style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.6 }}>
            {CONTEXT.map((c) => (
              <li key={c.src}>{c.text}{" "}
                <a href={c.href} target="_blank" rel="noopener noreferrer" className="mono-sm">[{c.src}]</a>
              </li>
            ))}
          </ul>
          <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 10 }}>
            This is background for the problem. It is not proof for guava, our first crop.
          </p>
        </Panel>

        <Section title="WHAT AGRIROVER DOES">
          <p style={{ fontSize: 17, lineHeight: 1.5 }}>
            One crop, one decision, one message a day. The farmer taps Approve or Skip. The farmer stays in control.
          </p>
          <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 12 }}>Example of the daily message:</p>
          <pre className="mono-sm" style={{ marginTop: 6, padding: 12, border: "1px solid var(--line)", lineHeight: 1.7 }}>
{`AgriRover · Wed 04 Nov
zone-a: water 40 s · soil 20%
zone-b: skip (within_range) · soil 35%
zone-c: skip (rain_lockout) · soil 28%`}
          </pre>
          <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 10 }}>
            A fixed rule engine makes the decision. AI may only propose, and a person always approves.
          </p>
        </Section>

        <Section title="FEATURES AND THE PROBLEM EACH SOLVES">
          <table className="tbl">
            <thead><tr><th>FEATURE</th><th>PROBLEM IT SOLVES</th><th>STATUS</th></tr></thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.name}>
                  <td><b>{f.name}</b><div className="mono-sm" style={{ color: "var(--ink-muted)" }}>{f.note}</div></td>
                  <td>{f.solves}</td>
                  <td><Tag kind={KIND[f.status]}>{f.status}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <div className="grid g2" style={{ marginTop: 14 }}>
          <Panel title="TWO TRACKS">
            <p><b>CDA:</b> the rover stays as the research demo.</p>
            <p style={{ marginTop: 8 }}>
              <b>Business, Stage 1:</b> sell the daily decision, priced per hectare per season, with a free or
              subsidised first season and a real service (install, irrigation) bundled in.
            </p>
            <p style={{ marginTop: 8 }}>
              <b>Stage 2:</b> rover and drone scouting, only once farms pay for Stage 1.
            </p>
          </Panel>

          <Panel title="HOW WE PROVE IT">
            <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Write down today's baseline: how watering is decided, time spent checking, losses.</li>
              <li>Guava block: half sensor-guided, half usual. Compare at 4–6 weeks.</li>
              <li>Interview 10 farmers around Siem Reap: last season's losses, what they pay per hectare, would they pay.</li>
              <li><b>Name one grower within 2 weeks, or drop the disease feature.</b></li>
            </ul>
          </Panel>
        </div>

        <Section title="REMOVED FROM THE FIRST PRODUCT">
          <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
            {REMOVED.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Section>
      </main>
    </>
  );
}
