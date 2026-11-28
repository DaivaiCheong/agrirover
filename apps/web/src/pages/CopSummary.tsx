import { Scale, ShieldCheck, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Empty, ErrorNotice, Kpis, Panel, Tag } from "../components/ui";
import { num } from "../lib/format";
import { useFarm } from "../lib/queries";
import { usdAndRiel, usdToRiel } from "../lib/tomatoFinance";

/** Every block's money side by side: budget from the workbook, spending from the ledger, the expected crop. */
export default function CopSummary() {
  const farm = useFarm();
  const { blocks, rate, basis } = farm;
  const growing = blocks.filter((b) => b.plantCount > 0);
  const plants = growing.reduce((s, b) => s + b.plantCount, 0);
  const spent = growing.reduce((s, b) => s + b.spentToDateUsd, 0);
  const budget = growing.reduce((s, b) => s + b.budgetUsd, 0);
  const saved = growing.reduce((s, b) => s + b.savedTotalUsd, 0);
  const atStake = growing.reduce((s, b) => s + b.preventedLossUsd, 0);

  return (
    <main className="main stack">
      {farm.error && <ErrorNotice error={farm.error} onRetry={farm.refetch} />}
      <Kpis
        loading={farm.loading}
        items={[
          { k: "Plants growing", v: plants, d: `${growing.length} blocks` },
          { k: "Spent / budget", icon: Wallet, v: `$${spent.toFixed(2)}`, tone: spent > budget ? "warn" : undefined,
            d: `of $${budget.toFixed(2)} · ~${usdToRiel(spent, rate).toLocaleString()} ៛` },
          { k: "Saved vs standard farming", tone: "ok", v: `$${saved.toFixed(2)}`,
            d: basis ? `${usdAndRiel(basis.stdPerPlantUsd - basis.roverPerPlantUsd, rate)} a plant (workbook)` : "" },
          { k: "Crop at stake", icon: ShieldCheck, tone: atStake ? "warn" : undefined, v: `$${atStake.toFixed(2)}`,
            d: "Flagged plants × expected kg × price" },
        ]}
      />

      <Panel title="By block" icon={Scale} pad={false}
             right={<span className="small muted">{basis ? `Budget ${usdAndRiel(basis.roverPerPlantUsd, rate)} a plant, from Finance › Unit cost` : ""}</span>}>
        {blocks.length === 0 ? (
          <Empty>{farm.loading ? "Loading…" : "No beds yet."}</Empty>
        ) : (
          <div className="tablewrap">
            <table className="tbl fold">
              <thead>
                <tr>
                  <th>Block</th><th className="r">Plants</th><th>Stage</th><th>Flagged</th><th className="r">Water today</th>
                  <th className="r">Spent / budget</th><th className="r">Saved</th><th className="r">Projected profit</th><th />
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => {
                  const over = b.budgetUsd > 0 && b.spentToDateUsd > b.budgetUsd;
                  return (
                    <tr key={b.zone}>
                      <td><b>{b.label}</b><div className="small muted">{b.variety ?? "No crop"} · {num(b.areaM2, 0)} m²</div></td>
                      <td data-label="Plants" className="r nowrap">{b.plantCount > 0 ? <b>{b.plantCount}</b> : <span className="muted">—</span>}</td>
                      <td data-label="Stage">{b.day > 0 ? <><b>Day {b.day}</b><div className="small muted">{b.stageTitle}</div></> : <span className="muted">Free</span>}</td>
                      <td data-label="Flagged" className="nowrap">
                        {b.plantCount === 0 ? <Tag>Idle</Tag>
                          : b.visionAlertCount + b.soilAttentionCount > 0 ? <Tag kind="warn">{b.visionAlertCount} camera · {b.soilAttentionCount} soil</Tag>
                          : <Tag kind="ok">None</Tag>}
                      </td>
                      <td data-label="Water today" className="r nowrap">{b.plantCount > 0 ? (b.waterPaused ? "Paused" : `${num(b.waterTodayL, 0)} L`) : "—"}</td>
                      <td data-label="Spent / budget" className="r nowrap">
                        {b.plantCount > 0 ? <><b className={over ? "ic-warn" : undefined}>${b.spentToDateUsd.toFixed(2)}</b> / ${b.budgetUsd.toFixed(2)}</> : "—"}
                      </td>
                      <td data-label="Saved" className="r nowrap">{b.plantCount > 0 ? `$${b.savedTotalUsd.toFixed(2)}` : "—"}</td>
                      <td data-label="Projected profit" className="r nowrap">
                        {b.plantCount > 0 ? <><b>${b.projectedProfitUsd.toFixed(2)}</b><div className="small muted">{num(b.expectedYieldKg, 0)} kg × ${b.pricePerKg.toFixed(2)}</div></> : "—"}
                      </td>
                      <td className="act">{b.cycleId && <Link className="linkbtn" to={`/cycles/${b.cycleId}`}>Cost report</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
