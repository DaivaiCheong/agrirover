import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowRight, Bot, Calculator, Pencil, Plus, Sprout, Square } from "lucide-react";
import AddCropModal from "../components/AddCropModal";
import { CloseCropDialog, EditCropDialog } from "../components/CropDialogs";
import { Empty, ErrorNotice, Kpis, PageHead, Panel, Skeleton, Tag } from "../components/ui";
import type { Cycle } from "../lib/api";
import { useFarmFocus } from "../lib/farmContext";
import { dayLabel, num } from "../lib/format";
import { useFarm } from "../lib/queries";
import { usdAndRiel } from "../lib/tomatoFinance";

export default function Cycles() {
  const [qs, setQs] = useSearchParams();
  const [showAdd, setShowAdd] = useState(qs.get("add") === "true");
  const [plantOn, setPlantOn] = useState<string | null>(null);
  const [editing, setEditing] = useState<Cycle | null>(null);
  const [closing, setClosing] = useState<Cycle | null>(null);
  const farm = useFarm();
  const { setFocus } = useFarmFocus();
  const { blocks, rate } = farm;

  const cycleOf = new Map(farm.active.map((c) => [c.zone, c]));
  const growing = blocks.filter((b) => b.plantCount > 0);
  const plants = growing.reduce((s, b) => s + b.plantCount, 0);
  const alerts = growing.reduce((s, b) => s + b.visionAlertCount, 0);
  const spent = growing.reduce((s, b) => s + b.spentToDateUsd, 0);
  const budget = growing.reduce((s, b) => s + b.budgetUsd, 0);
  const closed = farm.cycles.filter((c) => c.status === "closed");

  return (
    <>
      <PageHead
        icon={Sprout}
        title="Crops"
        sub="Each bed's tomato crop: where it is in its cycle, what it has cost against its budget, and what it should yield"
        actions={<button className="btn btn-sm" onClick={() => setShowAdd(true)}><Plus size={16} aria-hidden />Start a crop</button>}
      />
      <main className="main stack">
        {farm.error && <ErrorNotice error={farm.error} onRetry={farm.refetch} />}
        <Kpis
          loading={farm.loading}
          items={[
            { k: "Growing", v: `${growing.length} of ${blocks.length} beds`, d: `${blocks.length - growing.length} free for planting` },
            { k: "Plants", v: plants, d: "Checked by the rover each round" },
            { k: "Camera alerts", v: alerts, tone: alerts ? "warn" : "ok", d: <Link className="linkbtn small" to="/crop">Plant gallery →</Link> },
            { k: "Spent / budget", v: `$${spent.toFixed(2)}`, tone: spent > budget ? "warn" : undefined,
              d: `of $${budget.toFixed(2)} (${farm.basis ? usdAndRiel(farm.basis.roverPerPlantUsd, rate) : "—"} a plant)` },
          ]}
        />

        {farm.loading ? (
          <div className="grid g2"><Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} /></div>
        ) : (
          <div className="grid g2">
            {blocks.map((b) => {
              const c = cycleOf.get(b.zone);
              const pct = b.budgetUsd > 0 ? Math.round((b.spentToDateUsd / b.budgetUsd) * 100) : 0;
              const flagged = b.visionAlertCount + b.soilAttentionCount;
              return (
                <Panel
                  key={b.zone}
                  title={b.label}
                  right={!c ? <Tag>Free</Tag> : flagged > 0 ? <Tag kind="warn">{flagged} to check</Tag> : <Tag kind="ok">Nothing flagged</Tag>}
                >
                  {!c ? (
                    <div className="row-between">
                      <span className="small muted">{b.areaM2 ? `${num(b.areaM2, 0)} m² · ` : ""}No crop. Ready for the next planting.</span>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPlantOn(b.zone)}>
                        <Plus size={14} aria-hidden />Plant tomato
                      </button>
                    </div>
                  ) : (
                    <div className="stack">
                      <div className="rv-cycle-meta">
                        <div>
                          <b>{c.variety ?? "Tomato"}</b>
                          <div className="small muted">{dayLabel(c)} · {c.setupLabel ?? "Setup not set"}</div>
                        </div>
                        <div className="r">
                          <b>{b.plantCount} plants</b>
                          <div className="small muted">{num(b.areaM2, 0)} m²</div>
                        </div>
                      </div>
                      <div className="meter">
                        <div className="meter-head"><span>Spent / budget</span><b>${b.spentToDateUsd.toFixed(2)} / ${b.budgetUsd.toFixed(2)}</b></div>
                        <div className={`bar${pct > 100 ? " bar-over" : ""}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        <div className="meter-head">
                          <span>Expected {num(b.expectedYieldKg, 1)} kg · ${b.projectedRevenueUsd.toFixed(2)}</span>
                          <span>{b.waterTodayL > 0 ? `${num(b.waterTodayL, 0)} L water today` : ""}</span>
                        </div>
                      </div>
                      <div className="rv-cycle-actions">
                        <Link className="btn btn-sm" to={`/cycles/${c.id}/tomato`} onClick={() => setFocus(c.zone)}>
                          Open <ArrowRight size={14} aria-hidden />
                        </Link>
                        <Link className="btn btn-sm btn-ghost" to={`/rover?zone=${c.zone}`}><Bot size={14} aria-hidden />Rover</Link>
                        <Link className="btn btn-sm btn-ghost" to={`/cycles/${c.id}`}><Calculator size={14} aria-hidden />Costs</Link>
                        <span style={{ marginLeft: "auto" }} className="rowflex">
                          <button type="button" className="linkbtn" onClick={() => setEditing(c)}><Pencil size={13} aria-hidden /> Edit</button>
                          <button type="button" className="linkbtn linkbtn-alert" onClick={() => setClosing(c)}><Square size={12} aria-hidden /> Close</button>
                        </span>
                      </div>
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>
        )}

        <Panel title="Closed crops" pad={false}>
          {closed.length === 0 ? (
            <Empty>No crop closed yet. A closed crop keeps its final cost report.</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead><tr><th>Bed</th><th>Variety</th><th>Planted</th><th>Closed</th><th className="r">Plants</th><th /></tr></thead>
                <tbody>
                  {closed.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.bedLabel}</b></td>
                      <td data-label="Variety">{c.variety ?? "—"}</td>
                      <td data-label="Planted" className="nowrap">{c.plantedOn}</td>
                      <td data-label="Closed" className="nowrap">{c.endedOn}</td>
                      <td data-label="Plants" className="r">{c.plantCount ?? "—"}</td>
                      <td className="act"><Link className="linkbtn" to={`/cycles/${c.id}`}>Final costs →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
      <AddCropModal
        isOpen={showAdd || Boolean(plantOn)}
        zone={plantOn}
        onClose={() => { setShowAdd(false); setPlantOn(null); setQs({}, { replace: true }); }}
      />
      {editing && <EditCropDialog cycle={editing} onClose={() => setEditing(null)} />}
      {closing && <CloseCropDialog cycle={closing} onClose={() => setClosing(null)} />}
    </>
  );
}
