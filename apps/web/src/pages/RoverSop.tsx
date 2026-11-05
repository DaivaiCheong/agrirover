import { Fragment } from "react";
import { Panel } from "../components/ui";
import { STOPS } from "../lib/rover";

type Step = { what: string; pass: string };

const PHASES: { phase: string; steps: Step[] }[] = [
  { phase: "Before", steps: [
    { what: "Check the weather and the rain reading", pass: "No rain, soil not waterlogged" },
    { what: "Charge the battery", pass: "Full pack. The rover stops itself at 11.1 V" },
    { what: "Clean the lens; fit the hood and light", pass: "Even light on the soil" },
    { what: "New soil type: calibrate", pass: "Photos of saturated and dry soil set the two references" },
    { what: "Walk the bed", pass: "No people, animals, hoses or tools in the path" },
    { what: "Put the rover on the start corner", pass: "Row 1, column 1, facing along row 1" },
    { what: "Test the e-stop and the bumper", pass: "Both stop the wheels. Then release" },
  ] },
  { phase: "During", steps: [
    { what: "Choose the bed and grid; tick the checks; start", pass: "Rover shows Surveying" },
    { what: "Stay in sight, with the e-stop in reach", pass: "Stop at once if anything enters the bed" },
    { what: "Watch the map and the battery", pass: "Rover moves cell by cell along the path" },
  ] },
  { phase: "After", steps: [
    { what: "Read how it ended", pass: "Completed, or stopped with a reason. A stopped survey is partial" },
    { what: "Spot-check three cells it marked as dry, by hand", pass: "Soil feels dry. If not, recalibrate before trusting it" },
    { what: "Water the marked plants", pass: "A person decides. The rover never waters" },
    { what: "Look at each yellowing cell", pass: "Use Disease check. A flag is not a diagnosis" },
    { what: "Note the minutes spent", pass: "Compare with walking the bed: that is the proof" },
    { what: "Clean, charge, store dry", pass: "Ready for the next survey" },
  ] },
];

export default function RoverSop() {
  let n = 0;
  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      <Panel title="Survey procedure" pad={false} right={<span className="small muted">Draft: not yet run on a real rover</span>}>
        <div className="tablewrap">
          <table className="tbl sop">
            <thead><tr><th className="r">#</th><th>Step</th><th>Pass when</th></tr></thead>
            <tbody>
              {PHASES.map((p) => (
                <Fragment key={p.phase}>
                  <tr className="sop-phase"><td colSpan={3}>{p.phase}</td></tr>
                  {p.steps.map((s) => <tr key={s.what}><td className="r">{++n}</td><td><b>{s.what}</b></td><td>{s.pass}</td></tr>)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="When it stops" pad={false}>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Reason</th><th>What the rover does</th><th>What you do</th></tr></thead>
            <tbody>
              {STOPS.map((s) => <tr key={s.key}><td className="nowrap"><b>{s.label}</b></td><td>{s.does}</td><td>{s.next}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
