import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Field, Metric, Panel } from "../components/ui";
import { api, type WaterPlanResult } from "../lib/api";

const METHODS = [
  { id: "drip", label: "Drip lines", efficiency: 0.9 },
  { id: "sprinkler", label: "Sprinkler", efficiency: 0.75 },
  { id: "hand", label: "Hand watering / furrow", efficiency: 0.6 },
] as const;

const today = () => new Date().toISOString().slice(0, 10);
const m3 = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1));

export default function WaterPlanner() {
  const [plants, setPlants] = useState(100);
  const [area, setArea] = useState(0.5);
  const [plantedOn, setPlantedOn] = useState(today());
  const [et0, setEt0] = useState(4.5);
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("drip");
  const [result, setResult] = useState<WaterPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function calculate() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.waterPlan({
        crop: "tomato", plants, areaPerPlantM2: area, et0MmDay: et0, plantedOn,
        efficiency: METHODS.find((m) => m.id === method)!.efficiency,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { calculate(); }, []);       // first load

  const t = result?.today ?? null;

  return (
    <>
      <div className="crumb"><span className="lbl">HOME &gt; WATER PLANNER</span></div>
      <div className="head">
        <div className="lbl">TOMATO · HOW MUCH WATER, EACH DAY AND FOR THE WHOLE CYCLE</div>
        <h1 className="display d-xl" style={{ marginTop: 8 }}>WATER PLANNER</h1>
      </div>

      <main className="main">
        <div className="grid g32">
          <Panel title="YOUR PLANTING">
            <form className="form" onSubmit={(e) => { e.preventDefault(); calculate(); }}>
              <Field label="HOW MANY PLANTS">
                <input type="number" min={1} step={1} value={plants}
                       onChange={(e) => setPlants(Number(e.target.value))} />
              </Field>
              <Field label="SPACE PER PLANT (m²)" hint="Row spacing × plant spacing. 1.0 m × 0.5 m = 0.5 m².">
                <input type="number" min={0.01} step={0.05} value={area}
                       onChange={(e) => setArea(Number(e.target.value))} />
              </Field>
              <Field label="PLANTING DATE" hint="The planting day is day 1.">
                <input type="date" value={plantedOn} onChange={(e) => setPlantedOn(e.target.value)} />
              </Field>
              <Field label="HOW YOU WATER" hint="Typical efficiency, how much of the water reaches the roots.">
                <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                  {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label} ({Math.round(m.efficiency * 100)}%)</option>)}
                </select>
              </Field>
              <Field label="ET₀ (mm per day)" hint="Assumption: not measured for your farm. Replace it with a local value.">
                <input type="number" min={0.5} max={15} step={0.1} value={et0}
                       onChange={(e) => setEt0(Number(e.target.value))} />
              </Field>
              <button className="btn" disabled={busy}>{busy ? "Calculating…" : "Calculate"}</button>
            </form>
            {error && <p className="mono-sm" style={{ color: "var(--alert)", marginTop: 12 }}>
              Could not calculate: {error}
            </p>}
          </Panel>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <Metric label={t ? `TODAY · DAY ${t.day} · ${t.stage.toUpperCase()}` : "TODAY"}
                    value={t ? Math.round(t.litersTotalGross).toLocaleString() : "—"} unit="L"
                    note={t ? `${t.litersPerPlantGross.toFixed(2)} L per plant`
                            : "Not in the crop cycle on this date."} />
            <Metric label={`WHOLE CYCLE · ${result?.cycleDays ?? "—"} DAYS`}
                    value={result ? m3(result.grossM3) : "—"} unit="m³"
                    note={result ? `${m3(result.netM3)} m³ reaches the plants; the rest is lost` : undefined} />
            <Metric label="BUSIEST DAY"
                    value={result ? Math.round(result.peakLitersPerDay).toLocaleString() : "—"} unit="L / day"
                    note="Size the pump and tank for this." />
          </div>
        </div>

        {result && (
          <>
            <div style={{ marginTop: 14 }}>
              <Panel title="WATER NEEDED EACH DAY (LITRES, ALL PLANTS)">
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <AreaChart data={result.days} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} label={{ value: "day of crop", position: "insideBottom", offset: -2, fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={56} />
                      <Tooltip formatter={(v: number) => [`${Math.round(v)} L`, "water"]} labelFormatter={(d) => `Day ${d}`} />
                      <Area type="monotone" dataKey="litersTotalGross" stroke="var(--bp)" fill="var(--bp)" fillOpacity={0.15} />
                      {t && <ReferenceLine x={t.day} stroke="var(--alert)" label={{ value: "today", fontSize: 11, fill: "var(--alert)" }} />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <div className="grid g2" style={{ marginTop: 14 }}>
              <Panel title="BY STAGE" pad={false}>
                <table className="tbl">
                  <thead><tr><th>STAGE</th><th className="r">DAYS</th><th className="r">WATER (m³)</th></tr></thead>
                  <tbody>
                    {result.stages.map((s) => (
                      <tr key={s.stage}><td>{s.stage}</td><td className="r">{s.days}</td><td className="r"><b>{m3(s.grossM3)}</b></td></tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
              <Panel title="HOW THIS WAS CALCULATED">
                <p className="mono-sm" style={{ lineHeight: 1.7 }}>
                  Each day: crop factor (Kc) × ET₀ = mm of water the plant uses. 1 mm over 1 m² is 1 litre. Then ÷ efficiency.
                </p>
                <p className="mono-sm" style={{ lineHeight: 1.7, marginTop: 10 }}>
                  Rain is not subtracted, so in the wet season you will need less. Stage lengths follow {result.assumptions.stageDays.join(" / ")} days; check them against your variety.
                </p>
                <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 10 }}>{result.source}</p>
              </Panel>
            </div>
          </>
        )}
      </main>
    </>
  );
}
