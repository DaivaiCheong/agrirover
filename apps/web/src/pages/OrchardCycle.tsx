import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Calculator, Camera, Sprout } from "lucide-react";
import EnvRibbon from "../components/EnvRibbon";
import { Empty, Kpis, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, loadProblem } from "../lib/api";
import { litres, num } from "../lib/format";
import { buildAllBlockEconomics, usdAndRiel } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";
import { useLatestRoundsByZone } from "../lib/useLatestRounds";

/** Detailed view of a single tomato block cycle, live from MongoDB. */
export default function OrchardCycle() {
  const { id = "" } = useParams();
  const cycles = useData(api.cycles);
  const zones = useData(api.zones);
  const conditions = useData(api.conditions);
  const adviceRes = useData(api.advice);
  const surveys = useData(api.surveys);

  const activeCycles = cycles.data ?? [];
  const activeZones = zones.data ?? [];
  const activeConds = conditions.data ?? [];
  const activeAdvice = adviceRes.data ?? [];
  const { roundsByZone } = useLatestRoundsByZone(surveys.data ?? []);

  const cycle = activeCycles.find((c) => c.id === id || c.zone === id) ?? null;
  const cond = cycle ? activeConds.find((c) => c.zone === cycle.zone) : undefined;
  const advice = cycle ? activeAdvice.find((a) => a.zone === cycle.zone) : undefined;

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
  const blockFin = cycle ? blocks.find((b) => b.zone === cycle.zone) : undefined;
  const plants = cycle ? allRows.filter((r) => r.zone === cycle.zone && r.plant) : [];
  const pageError = cycles.error ?? zones.error ?? conditions.error;

  if (!cycle) {
    return (
      <main className="main stack">
        {pageError ? <Notice kind="alert">{loadProblem(pageError)}</Notice> : <Empty>Loading tomato block…</Empty>}
      </main>
    );
  }

  return (
    <>
      <PageHead
        icon={Sprout}
        title={cycle.bedLabel}
        sub={`Tomato (${cycle.variety ?? "Roma Tomato"}) · ${blockFin?.plantCount ?? cycle.plantCount ?? 0} plants · ${cycle.setupLabel ?? "Drip bed"}`}
        actions={
          <>
            <Link className="btn btn-ghost btn-sm" to="/rover">
              <Bot size={15} aria-hidden />Open Rover 3D
            </Link>
            <Link className="btn btn-ghost btn-sm" to={`/cycles/${cycle.id}`}>
              <Calculator size={15} aria-hidden />Cost report
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/cycles">
              <ArrowLeft size={15} aria-hidden />All crop cycles
            </Link>
          </>
        }
      />
      <main className="main stack">
        {pageError && <Notice kind="alert">{loadProblem(pageError)}</Notice>}
        <Kpis
          items={[
            { k: "Cycle stage", v: `Day ${cycle.day ?? 1}`, d: cycle.stageTitle ?? "Growing" },
            { k: "Active tomato plants", v: plants.length, d: `${blockFin?.visionAlertCount ?? 0} vision alerts` },
            { k: "Drip water today", v: advice ? litres(advice.water.litres) : "—", d: advice ? `${advice.treesWatered} plants irrigated` : "" },
            { k: "Cycle spend / budget", v: blockFin ? `$${blockFin.spentToDateUsd.toFixed(2)} / $${blockFin.budgetUsd.toFixed(2)}` : "—", d: blockFin ? usdAndRiel(blockFin.spentToDateUsd, blockFin.spentToDateRiel) : "" },
          ]}
        />

        <div className="grid g2">
          {cond && <EnvRibbon bed={cond} />}
          <Panel
            title="Live Vision & Soil Summary"
            right={
              <Link className="linkbtn small rowflex" style={{ gap: 4 }} to="/crop">
                <Camera size={13} aria-hidden />View gallery
              </Link>
            }
          >
            <table className="tbl kv">
              <tbody>
                <tr>
                  <th scope="row">Nutrient status</th>
                  <td>{advice?.feed.reason ?? "Soil nutrients monitored by Rover probe"}</td>
                </tr>
                <tr>
                  <th scope="row">Expected harvest</th>
                  <td>{blockFin ? `${num(blockFin.expectedYieldKg, 1)} kg · ${usdAndRiel(blockFin.projectedRevenueUsd, blockFin.projectedRevenueRiel)}` : "—"}</td>
                </tr>
                <tr>
                  <th scope="row">Prevented crop loss</th>
                  <td>{blockFin ? usdAndRiel(blockFin.preventedLossUsd, blockFin.preventedLossRiel) : "$0.00"}</td>
                </tr>
              </tbody>
            </table>
          </Panel>
        </div>

        <Panel title={`Tomato plants in ${cycle.bedLabel}`} pad={false}>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Plant</th>
                  <th>Plant condition (AI Vision)</th>
                  <th className="r">Soil pH</th>
                  <th className="r">Moisture</th>
                  <th className="r">Water today</th>
                </tr>
              </thead>
              <tbody>
                {plants.map((p) => (
                  <tr key={p.name}>
                    <td><b>{p.name}</b></td>
                    <td><Tag kind={p.vision.status === "healthy" ? "ok" : "warn"}>{p.vision.badgeLabel}</Tag></td>
                    <td className="r">{p.readings.ph !== null ? p.readings.ph.toFixed(2) : "—"}</td>
                    <td className="r">{p.readings.moisture !== null ? `${p.readings.moisture.toFixed(1)}%` : "—"}</td>
                    <td className="r">{p.waterLitres !== null ? `${p.waterLitres} L` : "0 L"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>
    </>
  );
}
