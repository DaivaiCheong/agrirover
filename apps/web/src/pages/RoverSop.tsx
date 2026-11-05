import { Fragment } from "react";
import { Panel } from "../components/ui";
import { STOPS } from "../lib/rover";

type Step = { what: string; pass: string };

const PHASES: { phase: string; steps: Step[] }[] = [
  { phase: "Before, every morning", steps: [
    { what: "Check the weather and the rain reading", pass: "No rain, soil not waterlogged" },
    { what: "Charge the battery", pass: "Full pack. The rover stops itself at 11.1 V" },
    { what: "Clean the camera and the probe tip", pass: "No soil on the probe: old soil gives false readings" },
    { what: "Check the probe in water and in dry soil", pass: "Moisture reads high and low as expected" },
    { what: "Walk the rows", pass: "No people, animals, hoses, ladders or fruit crates" },
    { what: "Put the rover at the first tree", pass: "Row 1, tree 1, facing along row 1" },
    { what: "Test the e-stop, the power cut and the bumper", pass: "Each stops the wheels. Then release" },
  ] },
  { phase: "During the round", steps: [
    { what: "Choose the block; tick the checks; start", pass: "Rover shows On its round" },
    { what: "Stay in sight, with the e-stop in reach", pass: "Stop at once if anything enters the rows" },
    { what: "Watch the map and the battery", pass: "Rover stops at each tree and readings appear" },
  ] },
  { phase: "After the round", steps: [
    { what: "Read how it ended", pass: "Completed, or stopped with a reason. A stopped round is partial" },
    { what: "Hand-check three trees it marked dry", pass: "Soil feels dry. If not, recalibrate before trusting it" },
    { what: "Give the water on Today", pass: "A person decides. The rover never waters" },
    { what: "Feed only if Today says feed", pass: "If it says hold, do not feed: EC is already high" },
    { what: "Go and look at each marked tree", pass: "Use Check a photo. A flag is not a diagnosis" },
    { what: "Note the minutes spent", pass: "Compare with walking the rows: that is the proof" },
    { what: "Clean, charge, store dry", pass: "Ready for tomorrow" },
  ] },
  { phase: "Every cycle", steps: [
    { what: "Send a leaf sample at the end of the flush", pass: "Lab result compared with the leaf ranges. This, not the probe's N, P, K, changes a dose" },
    { what: "Calibrate moisture on your own soil", pass: "Probe readings compared with a sample weighed wet and dry" },
  ] },
];

export default function RoverSop() {
  let n = 0;
  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      <Panel title="Daily round" pad={false} right={<span className="small muted">Draft: not yet run on a real rover</span>}>
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
