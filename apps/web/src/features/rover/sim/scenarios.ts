// Scenarios: a seed (default 42) plus a patch. Their outcomes come from the physics and the rules, never from a script.
// The advice scenarios (13–18) check what the farmer would be told. Scenario 1 is "today's rover", which the scout can
// already run; the driven Lab scenarios (2–12) arrive with the engine.

import { ROVER, T1, patch, type DeepPartial, type FieldProfile, type RoverProfile } from "./profile";
import { STRATEGIES } from "./planner";
import { scout, type Forecast, type PlantTruth, type RoundData } from "./scout";
import type { Condition } from "./crop";

export interface Scenario {
  id: string; n: number; label: string; short: string;
  strategy: keyof typeof STRATEGIES;
  profile?: DeepPartial<RoverProfile>;
  field?: Partial<FieldProfile>;
  truths: PlantTruth[];
  soil: "probe" | "given";
  laneTheta?: number;
  forecast?: Forecast;
}

/** Plants by ID, e.g. at(["R3-P05", "R3-P06"], 0.19). */
const plants = (ids: string[], theta: number, condition: Condition = "healthy"): PlantTruth[] =>
  ids.map((id) => { const [r, p] = id.slice(1).split("-P").map(Number); return { row: r - 1, spot: p - 1, theta, condition }; });
const run = (row: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => `R${row}-P${String(from + k).padStart(2, "0")}`);

export const SCENARIOS: Scenario[] = [
  { id: "today", n: 1, label: "Today's rover", short: "Blade probe, packed lanes",
    strategy: "A", truths: plants(["R2-P07"], 0.24, "nitrogen"), soil: "probe", laneTheta: 0.24 },
  { id: "dry-row", n: 13, label: "Dry row", short: "Row 3 drying out",
    strategy: "B", truths: plants(run(3, 5, 10), 0.19), soil: "given" },
  { id: "rain-coming", n: 14, label: "Rain coming", short: "12 mm forecast",
    strategy: "B", truths: plants(run(3, 5, 10), 0.19), soil: "given", forecast: { rainMm: 12, prob: 0.7 } },
  { id: "rain-heavy", n: 14, label: "Heavy rain coming", short: "45 mm forecast",
    strategy: "B", truths: plants(run(3, 5, 10), 0.19), soil: "given", forecast: { rainMm: 45, prob: 0.7 } },
  { id: "yellow-leaves", n: 15, label: "Yellow leaves", short: "One plant yellowing",
    strategy: "B", truths: plants(["R2-P07"], 0.24, "nitrogen"), soil: "given" },
  { id: "spreading", n: 16, label: "Spreading blight", short: "Blight on 4 plants",
    strategy: "B", truths: plants(["R2-P07", "R2-P06", "R2-P08", "R1-P07"], 0.24, "earlyBlight"), soil: "given" },
  { id: "follow-up", n: 17, label: "Next round after watering", short: "Row 3 back at 0.26",
    strategy: "B", truths: plants(run(3, 5, 10), 0.26), soil: "given" },
  { id: "upper-virus", n: 18, label: "Upper-leaf virus", short: "Leaf curl up high",
    strategy: "B", truths: plants(["R4-P12"], 0.24, "leafCurl"), soil: "given" },
];

export const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

export function runScenario(s: Scenario, seed = 42, at?: string, id?: string): RoundData {
  return scout({
    field: { ...T1, ...s.field }, profile: patch(ROVER, s.profile), strategy: STRATEGIES[s.strategy],
    truths: s.truths, seed, soil: s.soil, laneTheta: s.laneTheta, forecast: s.forecast, scenario: s.id, at, id,
  });
}
