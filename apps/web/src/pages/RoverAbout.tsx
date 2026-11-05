import { Panel, Tag } from "../components/ui";

type Row = { job: string; how: string; status: [string | undefined, string] };

const SIM: [string, string] = ["ok", "Works in simulation"];

const DOES: Row[] = [
  { job: "Surveys every cell", how: "Drives the bed row by row at 0.2 m/s and photographs each cell from above", status: SIM },
  { job: "Counts plants, finds gaps", how: "Leaf colour in the photo: a cell with no leaf is a missing plant", status: SIM },
  { job: "Finds dry spots", how: "Brightness of the soil in the photo, and proposes millilitres for that plant", status: ["warn", "Simulation only; soil calibration needed"] },
  { job: "Flags yellowing leaves", how: "Share of yellow leaf above 8 % marks the cell for someone to look at", status: SIM },
  { job: "Names the disease", how: "Leaf model on flagged cells only, reported at 90 % confidence or above", status: [undefined, "Model not installed"] },
  { job: "Stops itself", how: "E-stop, rain, low battery, lost link, bumper, edge of bed", status: ["ok", "Tested in code; not on a chassis"] },
  { job: "Files a report", how: "A map, the cells to check, and how the survey ended", status: SIM },
];

const HELPS: { what: string; why: string }[] = [
  { what: "Less walking", why: "It looks at every plant. People walk only to the cells it marks." },
  { what: "Plant by plant", why: "A soil probe reads one spot in a bed. The rover reads every cell, so it can show one dry end of a drip line." },
  { what: "Earlier warning", why: "Yellowing is marked on the day of the survey, in the same way every time, by plant." },
  { what: "Less wasted water", why: "It proposes water only for the plants that look dry, not the whole bed." },
  { what: "A record", why: "Every survey is kept, so a bed can be compared over time." },
];

const NOT: string[] = [
  "Water, spray or treat. It only looks and reports.",
  "Diagnose. A flag means go and look.",
  "Fields. It covers at most 400 cells a survey: 100 m² at 0.5 m a cell, 400 m² at 1 m.",
  "Trees. The camera looks straight down from under a hood, which suits low bed crops, not a guava canopy.",
  "Run unwatched yet. It steers by timed wheel turns; encoders and an obstacle sensor are still to come.",
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
    </main>
  );
}
