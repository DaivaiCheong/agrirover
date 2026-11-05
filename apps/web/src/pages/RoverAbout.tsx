import { Panel, Tag } from "../components/ui";

type Row = { job: string; how: string; status: [string | undefined, string] };

const SIM: [string, string] = ["ok", "Works in simulation"];
const TO_BUILD: [string, string] = ["warn", "Software simulated; hardware to build"];

const DOES: Row[] = [
  { job: "Visits every tree, every day", how: "Drives the rows at 0.2 m/s and stops at each tree", status: SIM },
  { job: "Reads the soil at each tree", how: "Lowers a 7-in-1 probe at the drip line: moisture, pH, EC, soil temperature, and N, P, K as a trend", status: TO_BUILD },
  { job: "Reads the air", how: "Temperature and humidity at canopy height, on a mast", status: TO_BUILD },
  { job: "Photographs the tree", how: "Side camera on the mast: leaf cover, yellow leaves", status: TO_BUILD },
  { job: "Tracks growth", how: "Leaf cover round after round, set against what the stage should do", status: SIM },
  { job: "Says what to do", how: "The server turns the round into water per tree, feed, and trees to look at", status: SIM },
  { job: "Names the disease", how: "Leaf model on flagged trees only, reported at 90 % confidence or above", status: [undefined, "Model not installed"] },
  { job: "Stops itself", how: "E-stop, rain, low battery, lost link, bumper, edge of block", status: ["ok", "Tested in code; not on a chassis"] },
];

const HELPS: { what: string; why: string }[] = [
  { what: "Less water", why: "A tree whose soil is in the upper half of its target gets none today, and none in rain. Never above the stage's full demand." },
  { what: "Safer feeding", why: "Each stage has a planned dose, little and often. High EC holds it, so feed cannot pile up and burn the roots." },
  { what: "Better fruit", why: "No nitrogen before harvest, potassium for sugar, no water deficit at bloom. A leaf test finds what is short." },
  { what: "Tree by tree", why: "A fixed probe reads one spot. The rover reads every tree, so it can show one dry end of a drip line." },
  { what: "Less walking", why: "People go to the trees it marks, not along every row." },
  { what: "A record", why: "Every round is kept, so growth and problems can be seen over time." },
];

const NOT: string[] = [
  "Water, feed or spray. It only looks and reports; a person acts.",
  "Set a dose from N, P, K. A low-cost probe cannot measure them well enough. Use a leaf test.",
  "Diagnose. A flag means go and look.",
  "Run unwatched yet. It has no obstacle sensor, and the probe arm and GPS are not built.",
  "Replace the rain sensor. A field node stays fixed for rain and the valves.",
];

const HARDWARE: { part: string; why: string; status: string }[] = [
  { part: "GNSS with LiDAR and IMU", why: "Guava canopy blocks GPS. Chinese orchard robots combine these to steer between trunks", status: "Not fitted" },
  { part: "Mast with side camera and air sensor", why: "A guava canopy is seen from the side, at 1-2 m", status: "Not fitted" },
  { part: "Probe arm with 7-in-1 RS485 probe", why: "Pushes the probe 15-30 cm into the soil at each stop", status: "Not fitted" },
  { part: "Power-cut switch", why: "The on-screen e-stop travels over Wi-Fi: it cannot be the only way to stop", status: "Required first" },
  { part: "Bigger wheels and frame", why: "Drives orchard ground between trees, not a smooth bed", status: "Not fitted" },
];

export default function RoverAbout() {
  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      <Panel title="What it does" pad={false} right={<span className="small muted">Hardware under construction</span>}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>How</th><th>Status today</th></tr></thead>
            <tbody>
              {DOES.map((r) => <tr key={r.job}><td className="nowrap"><b>{r.job}</b></td><td>{r.how}</td><td className="nowrap"><Tag kind={r.status[0]}>{r.status[1]}</Tag></td></tr>)}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid g2">
        <Panel title="How it helps" pad={false} right={<span className="small muted">Not measured in a field yet</span>}>
          <table className="tbl kv"><tbody>
            {HELPS.map((h) => <tr key={h.what}><th scope="row">{h.what}</th><td>{h.why}</td></tr>)}
          </tbody></table>
        </Panel>
        <Panel title="What it does not do" pad={false}>
          <table className="tbl"><tbody>
            {NOT.map((n) => <tr key={n}><td>{n}</td></tr>)}
          </tbody></table>
        </Panel>
      </div>
      <Panel title="What guava needs it to carry" pad={false}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Part</th><th>Why</th><th>Status</th></tr></thead>
            <tbody>{HARDWARE.map((h) => <tr key={h.part}><td className="nowrap"><b>{h.part}</b></td><td>{h.why}</td><td className="nowrap">{h.status}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
