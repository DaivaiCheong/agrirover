import { useMemo } from "react";
import { ArrowRight, Bot, CalendarDays, Camera, Calculator, Droplets, ShieldAlert, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import EnvRibbon from "../components/EnvRibbon";
import { Kpis, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem } from "../lib/api";
import { litres, longToday } from "../lib/format";
import { targetsFromConditions } from "../lib/soil";
import { buildAllBlockEconomics, computeFinanceView, UNIT_SAVED_RIEL, UNIT_SAVED_USD, UNIT_TOTAL_COST_RIEL, UNIT_TOTAL_COST_USD, usdAndRiel } from "../lib/tomatoFinance";
import { matchTreatmentForCondition } from "../lib/treatments";
import { useData } from "../lib/useData";
import { useLatestRoundsByZone } from "../lib/useLatestRounds";
import { usePoll } from "../lib/usePoll";
import { evaluateAgronomyAction } from "../utils/agronomyEngine";

export default function Dashboard() {
  const cycles = useData(api.cycles);
  const advice = usePoll(api.advice, 30000);
  const conditions = usePoll(api.conditions, 30000);
  const zones = useData(api.zones);
  const surveys = useData(api.surveys);

  const activeZones = zones.data ?? [];
  const activeCycles = cycles.data ?? [];
  const activeConds = conditions.data ?? [];
  const activeAdvice = advice.data ?? [];
  const { roundsByZone } = useLatestRoundsByZone(surveys.data ?? []);

  const { blocks, allRows } = useMemo(
    () =>
      buildAllBlockEconomics({
        cycles: activeCycles,
        zones: activeZones,
        conditions: activeConds,
        roundsByZone,
      }),
    [activeCycles, activeZones, activeConds, roundsByZone],
  );

  const farmReport = useMemo(
    () => computeFinanceView({ scale: "farm", selectedZone: "g1", blocks, allRows }),
    [blocks, allRows],
  );

  const pageError = cycles.error ?? zones.error ?? conditions.error ?? advice.error;
  const totalWaterToday = activeAdvice.reduce((s, a) => s + a.water.litres, 0);
  const rowsByZone = useMemo(() => {
    const map = new Map<string, typeof allRows>();
    for (const row of allRows) {
      const list = map.get(row.zone);
      if (list) list.push(row);
      else map.set(row.zone, [row]);
    }
    return map;
  }, [allRows]);
  const alertPlants = allRows.filter((r) => r.plant && (r.vision.status === "alert" || r.status === "attention"));
  const blockMap = new Map(blocks.map((b) => [b.zone, b]));
  const condOf = new Map(activeConds.map((b) => [b.zone, b]));
  const adviceOf = new Map(activeAdvice.map((a) => [a.zone, a]));

  return (
    <>
      <PageHead
        icon={Sun}
        title="Today · Tomato Farm"
        sub={longToday()}
        actions={
          <>
            <Link className="btn btn-sm btn-ghost" to="/rover">
              <Bot size={15} aria-hidden />Rover 3D View
            </Link>
            <Link className="btn btn-sm" to="/finance">
              <Calculator size={15} aria-hidden />Cost Optimizer
            </Link>
          </>
        }
      />
      <main className="main stack">
        {pageError && <Notice kind="alert">{loadProblem(pageError)}</Notice>}
        <Kpis
          items={[
            {
              k: "Rover round today",
              v: `${blocks.filter((b) => b.plantCount > 0).length} blocks · ${farmReport.plantCount} plants`,
              d: <Link className="linkbtn small" to="/rover">Completed 07:15 AM · View 3D →</Link>,
            },
            {
              k: "Precision drip today",
              v: `${litres(totalWaterToday)}`,
              d: <Link className="linkbtn small" to="/finance">28% water saved · Finance →</Link>,
            },
            {
              k: "Vision & soil alerts",
              v: `${farmReport.visionAlertCount} vision · ${alertPlants.length - farmReport.visionAlertCount} soil`,
              d: <Link className="linkbtn small" to="/crop">{usdAndRiel(farmReport.preventedLossUsd, farmReport.preventedLossRiel)} prevented →</Link>,
            },
            {
              k: "Cost per tomato plant",
              v: usdAndRiel(UNIT_TOTAL_COST_USD, UNIT_TOTAL_COST_RIEL),
              d: <Link className="linkbtn small" to="/finance">+${UNIT_SAVED_USD.toFixed(2)} (~{UNIT_SAVED_RIEL.toLocaleString()} ៛) saved / plant →</Link>,
            },
          ]}
        />

        <div className="grid g2">
          <Panel
            title="Active Tomato Vision Alerts"
            icon={ShieldAlert}
            right={
              <Link className="linkbtn small rowflex" style={{ gap: 4 }} to="/crop">
                <Camera size={13} aria-hidden />Open Health <ArrowRight size={13} aria-hidden />
              </Link>
            }
          >
            <div className="stack">
              {alertPlants.slice(0, 4).map((p) => {
                const block = blockMap.get(p.zone);
                const t = matchTreatmentForCondition(p.vision.condition || p.vision.shortLabel);
                const targetGuide = t
                  ? `/crop?tab=guide&zone=${encodeURIComponent(p.zone)}&plant=${encodeURIComponent(p.name)}#${t.id}`
                  : "/crop";
                return (
                  <article key={`${p.zone}-${p.name}`} className={`pc${p.vision.severity === "High" ? " pc-crit" : ""}`}>
                    <div className="pc-top">
                      <span className="pc-sev">{p.vision.status === "alert" ? p.vision.shortLabel : "Soil stress"}</span>
                      <span className="pc-block">{block?.label ?? p.zone} · {p.name}</span>
                    </div>
                    <h3 className="pc-problem">{p.vision.status === "alert" ? p.vision.condition : p.issues.join(" · ")}</h3>
                    <div className="pc-ev">
                      <span className="pc-txt">
                        pH {p.readings.ph?.toFixed(2) ?? "—"} · Moisture {p.readings.moisture?.toFixed(1) ?? "—"}% · Soil N{" "}
                        {p.readings.n !== null ? `${Math.round(p.readings.n)} mg/kg` : "—"}
                      </span>
                    </div>
                    <div className="rv-cycle-actions">
                      <Link className="pc-link" to="/crop">View in Health</Link>
                      {t && <Link className="pc-link" to={targetGuide}>Treatment steps →</Link>}
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Today's Top Care Tasks"
            icon={CalendarDays}
            pad={false}
            right={
              <Link className="linkbtn small rowflex" style={{ gap: 4 }} to="/plan">
                Open Plan <ArrowRight size={13} aria-hidden />
              </Link>
            }
          >
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Block &amp; Plant</th>
                    <th>Fast-Focus Care (Action → Avoid → Why)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {alertPlants.slice(0, 4).map((p) => {
                    const block = blockMap.get(p.zone);
                    const fast = evaluateAgronomyAction(p, targetsFromConditions(condOf.get(p.zone)), {
                      blockPlants: rowsByZone.get(p.zone),
                      blockLabel: block?.label ?? p.zone,
                    });
                    if (!fast) return null;
                    return (
                      <tr key={`task-${p.zone}-${p.name}`}>
                        <td className="nowrap">
                          <b>{block?.label ?? p.zone}</b>
                          <div className="small muted">{p.name}</div>
                        </td>
                        <td className="small">
                          <div><b>⚡ Recipe:</b> {fast.prescription.recipeSummaryLine}</div>
                          <div className="ff-k-avoid" style={{ fontSize: 11.5, marginTop: 2 }}>
                            <b>🚫 Avoid:</b> {fast.doNotMixList[0]}
                          </div>
                          <div className="muted" style={{ fontSize: 11, marginTop: 2, fontFamily: "ui-monospace,monospace" }}>
                            🧮 {fast.prescription.formulaMathLine}
                          </div>
                        </td>
                        <td className="nowrap">
                          <Tag kind="warn">Due today</Tag>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel
          title="Active Tomato Blocks (G1–G6)"
          right={
            <span className="small muted">
              Targets: pH 6.0–6.8 · Moisture 58–72% · EC 0.8–2.5 mS/cm · Temp 18–29 °C
            </span>
          }
        >
          <div className="grid g2">
            {activeCycles.map((c) => {
              const b = blockMap.get(c.zone);
              const cond = condOf.get(c.zone);
              const adv = adviceOf.get(c.zone);
              return (
                <section key={c.id} className="panel cropcard">
                  <div className="cc-top">
                    <div style={{ minWidth: 0 }}>
                      <span className="cc-title">{c.bedLabel}</span>
                      <span className="small muted">
                        {" "}
                        {c.variety ?? "Tomato"} · {b?.plantCount ?? c.plantCount ?? 0} tomato plants · Day {c.day}
                      </span>
                    </div>
                    {b && b.visionAlertCount > 0 ? (
                      <Tag kind="warn">{b.visionAlertCount} alerts</Tag>
                    ) : (
                      <Tag kind="ok">Optimal</Tag>
                    )}
                  </div>
                  {cond && <EnvRibbon bed={cond} />}
                  <div className="cc-water">
                    <Droplets size={13} aria-hidden />
                    <span>
                      Today: <b>{adv ? litres(adv.water.litres) : "—"}</b>
                    </span>
                    <span className="cc-sep" />
                    <span>
                      Cost: <b>${UNIT_TOTAL_COST_USD.toFixed(2)}/plant</b>
                    </span>
                    <Link className="linkbtn cc-open" to={`/cycles/${c.id}/tomato`}>
                      Block details <ArrowRight size={13} aria-hidden />
                    </Link>
                  </div>
                </section>
              );
            })}
          </div>
        </Panel>
      </main>
    </>
  );
}
