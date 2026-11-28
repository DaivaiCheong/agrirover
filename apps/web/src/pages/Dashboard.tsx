import { useMemo } from "react";
import { ArrowRight, Bot, Calculator, CalendarDays, Droplets, ShieldAlert, Sprout, Sun, Wallet } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import EnvRibbon, { StatusBadge } from "../components/EnvRibbon";
import { Empty, ErrorNotice, Kpis, More, PageHead, Panel, Skeleton, Tag } from "../components/ui";
import { useFarmFocus } from "../lib/farmContext";
import { litres, longToday, num } from "../lib/format";
import { useFarm } from "../lib/queries";
import { targetsFromConditions, type PlantSoilRow } from "../lib/soil";
import { usdAndRiel } from "../lib/tomatoFinance";
import { ago } from "../lib/usePoll";
import { evaluateAgronomyAction } from "../utils/agronomyEngine";

export default function Dashboard() {
  const farm = useFarm();
  const { setFocus } = useFarmFocus();
  const navigate = useNavigate();
  const { blocks, allRows, advice, conditions, basis, rate } = farm;

  const growing = blocks.filter((b) => b.plantCount > 0);
  const plants = growing.reduce((s, b) => s + b.plantCount, 0);
  const lastRound = farm.surveys.find((s) => s.status === "completed" || s.status === "aborted");
  const waterToday = advice.reduce((s, a) => s + a.water.litres, 0);
  const waterFull = advice.reduce((s, a) => s + a.water.fullLitres, 0);
  const waterSavedPct = waterFull > 0 ? Math.round(((waterFull - waterToday) / waterFull) * 100) : null;
  const paused = advice.filter((a) => a.water.paused).map((a) => a.label);
  const budget = growing.reduce((s, b) => s + b.budgetUsd, 0);
  const spent = growing.reduce((s, b) => s + b.spentToDateUsd, 0);

  const needYou = useMemo(
    () => allRows
      .filter((r) => r.plant && growing.some((b) => b.zone === r.zone) && (r.vision.status === "alert" || r.status === "attention"))
      .sort((a, b) => Number(b.vision.status === "alert") - Number(a.vision.status === "alert")),
    [allRows, growing],
  );
  const visionCount = needYou.filter((r) => r.vision.status === "alert").length;
  const prevented = growing.reduce((s, b) => s + b.preventedLossUsd, 0);
  const rowsByZone = useMemo(() => {
    const map = new Map<string, PlantSoilRow[]>();
    for (const r of allRows) map.set(r.zone, [...(map.get(r.zone) ?? []), r]);
    return map;
  }, [allRows]);
  const condOf = new Map(conditions.map((c) => [c.zone, c]));
  const adviceOf = new Map(advice.map((a) => [a.zone, a]));
  const labelOf = new Map(blocks.map((b) => [b.zone, b.label]));

  const openPlant = (p: PlantSoilRow) => {
    setFocus(p.zone, p.name);
    navigate(`/rover?zone=${encodeURIComponent(p.zone)}&plant=${encodeURIComponent(p.name)}`);
  };

  const tasks = needYou.slice(0, 6).flatMap((p) => {
    const card = evaluateAgronomyAction(p, targetsFromConditions(condOf.get(p.zone)), {
      blockPlants: rowsByZone.get(p.zone),
      blockLabel: labelOf.get(p.zone) ?? p.zone,
    });
    return card ? [{ p, card }] : [];
  });

  return (
    <>
      <PageHead
        icon={Sun}
        title="Today"
        sub={farm.loading ? longToday() : `${longToday()} · ${growing.length} growing blocks, ${plants} tomato plants`}
        actions={
          <>
            <Link className="btn btn-sm btn-ghost" to="/plan"><CalendarDays size={15} aria-hidden />Plan</Link>
            <Link className="btn btn-sm" to="/rover"><Bot size={15} aria-hidden />Open rover</Link>
          </>
        }
      />
      <main className="main stack">
        {farm.error && <ErrorNotice error={farm.error} onRetry={farm.refetch} />}
        <Kpis
          loading={farm.loading}
          items={[
            {
              k: "Last rover round", icon: Bot, tone: lastRound?.status === "aborted" ? "warn" : "ok",
              v: lastRound ? ago(lastRound.finishedAt ?? lastRound.startedAt) : "No round yet",
              d: lastRound ? <Link className="linkbtn small" to="/rover">{lastRound.bedLabel} · {lastRound.cellsScanned ?? 0} plants checked →</Link> : "Start one on the Rover page",
            },
            {
              k: "Drip water today", icon: Droplets, tone: paused.length ? "warn" : "info",
              v: litres(waterToday),
              d: paused.length ? `Paused for rain: ${paused.join(", ")}`
                : waterSavedPct !== null ? `${waterSavedPct}% less than a blanket schedule (${litres(waterFull)})` : "Needs a rover round",
            },
            {
              k: "Plants to look at", icon: ShieldAlert, tone: needYou.length ? "warn" : "ok",
              v: `${needYou.length}`,
              d: needYou.length
                ? `${visionCount} camera · ${needYou.length - visionCount} soil · ~${usdAndRiel(prevented, rate)} of crop at stake`
                : "Nothing flagged in the last rounds",
            },
            {
              k: "Budget per plant", icon: Wallet,
              v: basis ? usdAndRiel(basis.roverPerPlantUsd, rate) : "—",
              d: <Link className="linkbtn small" to="/costs">Spent ${num(spent, 2)} of ${num(budget, 2)} budget →</Link>,
            },
          ]}
        />

        <div className="grid g2 stack-md">
          <Panel
            title="Plants that need you"
            icon={ShieldAlert}
            right={<Link className="linkbtn small" to="/crop">Plant gallery →</Link>}
          >
            {farm.loading || farm.roundsLoading ? (
              <div className="stack"><Skeleton h={54} /><Skeleton h={54} /><Skeleton h={54} /></div>
            ) : needYou.length === 0 ? (
              <Empty icon={Sprout}>No plant is flagged in the newest rounds.</Empty>
            ) : (
              <div className="stack">
                {needYou.slice(0, 5).map((p) => (
                  <article key={`${p.zone}-${p.name}`} className={`pc${p.vision.severity === "High" ? " pc-crit" : ""}`}>
                    <div className="pc-top">
                      <span className="pc-sev">{p.vision.status === "alert" ? `Camera · ${p.vision.confidencePct ?? "?"}%` : "Soil"}</span>
                      <span className="pc-block">{labelOf.get(p.zone) ?? p.zone} · {p.name}</span>
                    </div>
                    <h3 className="pc-problem">{p.vision.status === "alert" ? p.vision.condition : p.issues.join(" · ")}</h3>
                    <div className="statline">
                      <span>pH <b>{p.readings.ph?.toFixed(2) ?? "—"}</b></span>
                      <span>Moisture <b>{p.readings.moisture !== null ? `${p.readings.moisture.toFixed(1)}%` : "—"}</b></span>
                      <span>N <b>{p.readings.n !== null ? `${Math.round(p.readings.n)} mg/kg` : "—"}</b></span>
                    </div>
                    <div className="rv-cycle-actions">
                      <button type="button" className="pc-link linkbtn" onClick={() => openPlant(p)}>Open in Rover</button>
                      <Link className="pc-link" to={`/guide?zone=${encodeURIComponent(p.zone)}&plant=${encodeURIComponent(p.name)}`}>Treatment →</Link>
                    </div>
                  </article>
                ))}
                {needYou.length > 5 && <Link className="linkbtn small" to="/crop">and {needYou.length - 5} more in the gallery →</Link>}
              </div>
            )}
          </Panel>

          <Panel title="What to do today" icon={CalendarDays} pad={false} right={<Link className="linkbtn small" to="/plan">Full plan →</Link>}>
            {tasks.length === 0 ? (
              <Empty>{farm.loading ? "Working it out…" : "No treatment is due. Keep the drip schedule."}</Empty>
            ) : (
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th>Plant</th><th>Do this</th><th>Status</th></tr></thead>
                  <tbody>
                    {tasks.map(({ p, card }) => (
                      <tr key={`task-${p.zone}-${p.name}`}>
                        <td className="nowrap"><b>{labelOf.get(p.zone) ?? p.zone}</b><div className="small muted">{p.name} · {card.title}</div></td>
                        <td className="small">
                          <More label={card.doNowSteps[0]}>
                            <div className="stack" style={{ gap: 4 }}>
                              <span><b>Recipe:</b> {card.prescription.recipeSummaryLine}</span>
                              <span><b>Do not mix:</b> {card.doNotMixList[0]}</span>
                              <span><b>Why:</b> {card.whyLine}</span>
                              <span className="mono-sm muted">{card.prescription.formulaMathLine}</span>
                            </div>
                          </More>
                        </td>
                        <td className="nowrap"><Tag kind="warn">Due today</Tag></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Blocks" icon={Sprout} right={<Link className="linkbtn small" to="/cycles">All crops →</Link>}>
          {farm.loading ? (
            <div className="grid g2"><Skeleton h={120} /><Skeleton h={120} /></div>
          ) : growing.length === 0 ? (
            <Empty icon={Sprout}>No crop is growing. <Link to="/cycles?add=true">Start a tomato crop</Link></Empty>
          ) : (
            <div className="grid g2">
              {growing.map((b) => {
                const cond = condOf.get(b.zone);
                const adv = adviceOf.get(b.zone);
                const pct = b.budgetUsd > 0 ? Math.round((b.spentToDateUsd / b.budgetUsd) * 100) : 0;
                return (
                  <section key={b.zone} className="panel cropcard">
                    <div className="cc-top">
                      <div style={{ minWidth: 0 }}>
                        <span className="cc-title">{b.label}</span>
                        <span className="small muted"> {b.variety ?? "Tomato"} · {b.plantCount} plants · day {b.day}</span>
                      </div>
                      {cond ? <StatusBadge status={cond.status} alerts={b.visionAlertCount} /> : <Tag>No readings</Tag>}
                    </div>
                    {cond && <EnvRibbon bed={cond} />}
                    <div className="meter">
                      <div className="meter-head"><span>Spent / budget</span><b>${num(b.spentToDateUsd, 2)} / ${num(b.budgetUsd, 2)}</b></div>
                      <div className={`bar${pct > 100 ? " bar-over" : ""}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    </div>
                    <div className="cc-water">
                      <Droplets size={13} aria-hidden />
                      <span>Today: <b>{adv ? (adv.water.paused ? "paused (rain)" : litres(adv.water.litres)) : "—"}</b></span>
                      <span className="cc-sep" />
                      <span>{b.visionAlertCount + b.soilAttentionCount > 0 ? `${b.visionAlertCount + b.soilAttentionCount} to check` : "Nothing flagged"}</span>
                      {b.cycleId && (
                        <Link className="linkbtn cc-open" to={`/cycles/${b.cycleId}/tomato`} onClick={() => setFocus(b.zone)}>
                          Open <ArrowRight size={13} aria-hidden />
                        </Link>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </Panel>
        <p className="small muted" style={{ textAlign: "right" }}>
          <Calculator size={12} aria-hidden style={{ verticalAlign: -1 }} /> Budget per plant comes from <Link to="/finance">Finance › Unit cost</Link>; spending from the <Link to="/costs">cost ledger</Link>.
        </p>
      </main>
    </>
  );
}
