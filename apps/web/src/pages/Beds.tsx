import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock, MapPin, Plus, Sprout } from "lucide-react";
import { EF, Empty, FormModal, Kpis, Notice, Panel, Toolbar, type FormMsg } from "../components/ui";
import { api, loadProblem, type BedConditions, type CondParam, type Cycle } from "../lib/api";
import { RIBBON_CELLS, cls, explain, fmtValue, rangeText } from "../lib/conditions";
import { num } from "../lib/format";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";
import AddCropModal from "../components/AddCropModal";
import BedTrends, { RANGES } from "../components/BedTrends";
import { StatusBadge } from "../components/EnvRibbon";

/** One reading: the value, a direction arrow when it is out of range, and its target beneath.
 *  The unit is in the column header, so the number can stay narrow. */
function Reading({ p }: { p: CondParam }) {
  if (p.value === null) return <span className="rd muted">—</span>;
  const off = p.status === "warning" || p.status === "critical";
  return (
    <span className="rd" title={explain(p)}>
      <span className={`mv v-${cls(p.status)}`}>
        {fmtValue(p)}
        {off && p.direction && (p.direction === "low" ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}
        {p.status === "stale" && <Clock size={12} aria-hidden />}
      </span>
      {rangeText(p) && <span className="mt">{rangeText(p)}</span>}
      <span className="sr-only">{explain(p)}</span>
    </span>
  );
}

const COLUMNS: { key: string; head: string; unit?: string }[] = [
  { key: "moisture", head: "Moisture", unit: "%" }, { key: "ph", head: "pH" }, { key: "ec", head: "EC", unit: "mS/cm" },
  { key: "soilt", head: "Soil", unit: "°C" }, { key: "npk", head: "N · P · K", unit: "mg/kg" },
  { key: "airt", head: "Air", unit: "°C" }, { key: "rh", head: "Humidity", unit: "%" },
];

function CropCell({ b, c, onPlant }: { b?: BedConditions; c?: Cycle; onPlant: () => void }) {
  if (!c) {
    return <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onPlant(); }}><Sprout size={14} aria-hidden />Plant</button>;
  }
  return (
    <>
      <Link to={c.perennial ? `/cycles/${c.id}/orchard` : `/cycles/${c.id}`} onClick={(e) => e.stopPropagation()}>
        {c.cropName}{c.variety ? ` (${c.variety})` : ""}
      </Link>
      <div className="mono-sm muted" title={b?.stage?.title}>
        {b?.stage ? `Day ${b.stage.day} · ${b.stage.key.charAt(0).toUpperCase()}${b.stage.key.slice(1)}` : c.day !== null && c.day < 1 ? "Not planted yet" : "No stage table"}
      </div>
    </>
  );
}

export default function Beds() {
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const conditions = usePoll(api.conditions);
  const [openBed, setOpenBed] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(RANGES[0].hours);

  const [showAddBed, setShowAddBed] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newArea, setNewArea] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const [plantingZone, setPlantingZone] = useState<string | null>(null);

  const activeCyclesByZone = new Map(
    (cycles.data ?? []).filter((c) => c.status === "active").map((c) => [c.zone, c])
  );
  const condOf = new Map((conditions.data ?? []).map((b) => [b.zone, b]));
  const openCond = openBed ? condOf.get(openBed) : undefined;

  const rows = zones.data ?? [];
  const totalArea = rows.reduce((s, z) => s + (z.areaM2 ?? 0), 0);
  const occupied = rows.filter((z) => activeCyclesByZone.has(z.zone)).length;

  async function addBed(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    try {
      await api.addBed({ label: newLabel.trim(), areaM2: newArea ? Number(newArea) : undefined });
      setMsg({ kind: "ok", text: `${newLabel.trim()} added.` });
      setNewLabel(""); setNewArea("");
      zones.reload();
    } catch (err) {
      setMsg({ kind: "alert", text: (err as Error).message });
    }
  }

  return (
    <>
      <Toolbar>
        <button className="btn btn-sm" onClick={() => { setMsg(null); setShowAddBed(true); }}><Plus size={16} aria-hidden />Add bed</button>
      </Toolbar>

      <main className="main stack">
        {zones.error && <Notice kind="alert">{loadProblem(zones.error)}</Notice>}
        {conditions.error && <Notice kind="alert">{loadProblem(conditions.error)}</Notice>}

        <Kpis items={[
          { k: "Beds", v: rows.length },
          { k: "Growing", v: occupied },
          { k: "Free", v: rows.length - occupied },
          { k: "Area", v: totalArea > 0 ? `${num(totalArea, 0)} m²` : "—" },
        ]} />

        <Panel title="Blocks" icon={Activity} pad={false}
               right={
                 <div className="seg" role="group" aria-label="History period">
                   {RANGES.map((r) => (
                     <button key={r.hours} type="button" className={hours === r.hours ? "on" : ""} onClick={() => setHours(r.hours)}>{r.label}</button>
                   ))}
                 </div>
               }>
          {zones.data === null ? (
            <p className="panel-pad muted">{zones.error ? "Could not be loaded just now." : "Loading…"}</p>
          ) : rows.length === 0 ? (
            <Empty icon={MapPin}>
              No beds yet.
              <button className="btn btn-sm" onClick={() => setShowAddBed(true)}><Plus size={16} aria-hidden />Add your first bed</button>
            </Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl tm">
                <thead>
                  <tr>
                    <th>Bed</th><th>Status</th><th>Crop</th>
                    {COLUMNS.map((c) => <th key={c.key}>{c.head}{c.unit && <small> {c.unit}</small>}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((z) => {
                    const b = condOf.get(z.zone);
                    const params = new Map((b?.params ?? []).map((p) => [p.metric, p]));
                    const open = openBed === z.zone;
                    const c = activeCyclesByZone.get(z.zone);
                    return (
                      <tr key={z.zone} className={`pickable${open ? " open" : ""}`} onClick={() => setOpenBed(open ? null : z.zone)}>
                        <td>
                          <button type="button" className="bedlink" aria-expanded={open} aria-label={`History of ${z.label ?? z.zone}`}>
                            {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}<b>{z.label ?? z.zone}</b>
                          </button>
                          <div className="mono-sm muted">{z.areaM2 ? `${num(z.areaM2, 0)} m² · ` : ""}{b?.recordedAt ? ago(b.recordedAt) : "no readings"}</div>
                        </td>
                        <td className="status">{b && <StatusBadge status={b.status} alerts={b.alerts.length} />}</td>
                        <td className="crop"><CropCell b={b} c={c} onPlant={() => setPlantingZone(z.zone)} /></td>
                        {RIBBON_CELLS.map((cell) => (
                          <td key={cell.key} className="m">
                            {cell.metrics.map((m) => {
                              const p = params.get(m);
                              return p ? <Reading key={m} p={p} /> : null;
                            })}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {openCond && (
            <div className="trend-section">
              <div className="trend-section-head">
                <b>{openCond.label ?? openCond.zone}</b>
                <button type="button" className="linkbtn" onClick={() => setOpenBed(null)}>Close</button>
              </div>
              {openCond.alerts.length > 0 && (
                <table className="tbl trend-alerts"><tbody>
                  {openCond.alerts.map((a) => (
                    <tr key={a.id}><td className="nowrap"><span className={`tag tag-${a.severity === "critical" ? "alert" : "warn"}`}>{a.title}</span></td><td className="small">{a.message}</td></tr>
                  ))}
                </tbody></table>
              )}
              <BedTrends zone={openCond.zone} params={openCond.params} hours={hours} />
              <p className="small muted trend-source">Rover's daily average. Advice only. Targets: {openCond.source}</p>
            </div>
          )}
        </Panel>
      </main>

      {showAddBed && (
        <FormModal title="Add bed" submit="Save bed" msg={msg} onClose={() => setShowAddBed(false)} onSubmit={addBed} width={440}>
          <div className="erp-grid-2">
            <EF label="Name" req>
              <input className="erp-input" required autoFocus placeholder="Bed 3" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            </EF>
            <EF label="Area">
              <div className="erp-input-group">
                <input className="erp-input" type="number" min={1} step="any" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
                <span className="erp-input-addon">m²</span>
              </div>
            </EF>
          </div>
        </FormModal>
      )}

      <AddCropModal
        isOpen={Boolean(plantingZone)}
        zone={plantingZone}
        onClose={() => setPlantingZone(null)}
        onAdded={() => { zones.reload(); cycles.reload(); }}
      />
    </>
  );
}
