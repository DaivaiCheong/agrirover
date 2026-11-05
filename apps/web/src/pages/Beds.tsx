import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock, Layers, MapPin, Plus, Sprout, X } from "lucide-react";
import { Empty, Notice, PageIntro, Panel, Tag } from "../components/ui";
import { api, loadProblem, type BedConditions, type CondParam } from "../lib/api";
import { RIBBON_CELLS, cls, explain, fmtValue, rangeText } from "../lib/conditions";
import { num } from "../lib/format";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";
import AddCropModal from "../components/AddCropModal";
import BedTrends, { RANGES } from "../components/BedTrends";
import { StatusBadge } from "../components/EnvRibbon";

/** One reading in the telemetry table: the value, a direction arrow when it is out of range, and its target beneath.
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

function stageText(b: BedConditions) {
  if (!b.crop) return <span className="muted">No crop (idle)</span>;
  return (
    <>
      {b.cropName}{b.variety ? ` (${b.variety})` : ""}
      <div className="mono-sm muted" title={b.stage?.title}>
        {b.stage ? `Day ${b.stage.day} · ${b.stage.key.charAt(0).toUpperCase()}${b.stage.key.slice(1)}` : b.day !== null && b.day < 1 ? "Not planted yet" : "No stage table"}
      </div>
    </>
  );
}

const COLUMNS: { key: string; head: string; unit?: string }[] = [
  { key: "moisture", head: "Moisture", unit: "%" }, { key: "ph", head: "pH" }, { key: "ec", head: "EC", unit: "mS/cm" },
  { key: "soilt", head: "Soil", unit: "°C" }, { key: "npk", head: "N · P · K", unit: "mg/kg" },
  { key: "airt", head: "Air", unit: "°C" }, { key: "rh", head: "Humidity", unit: "%" },
];

export default function Beds() {
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const conditions = usePoll(api.conditions);
  const [openBed, setOpenBed] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(RANGES[0].hours);
  const openCond = (conditions.data ?? []).find((b) => b.zone === openBed);

  const [showAddBed, setShowAddBed] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newArea, setNewArea] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  const [plantingZone, setPlantingZone] = useState<string | null>(null);

  const activeCyclesByZone = new Map(
    (cycles.data ?? []).filter((c) => c.status === "active").map((c) => [c.zone, c])
  );

  const rows = zones.data ?? [];
  const totalArea = rows.reduce((s, z) => s + (z.areaM2 ?? 0), 0);
  const occupiedCount = rows.filter((z) => activeCyclesByZone.has(z.zone)).length;
  const availableCount = rows.length - occupiedCount;

  async function handleAddBed(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      await api.addBed({
        label: newLabel.trim(),
        areaM2: newArea ? Number(newArea) : undefined,
      });
      setNewLabel("");
      setNewArea("");
      setShowAddBed(false);
      setMsg({ kind: "ok", text: `Bed "${newLabel.trim()}" created successfully.` });
      zones.reload();
    } catch (err) {
      setMsg({ kind: "alert", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageIntro
        actions={
          <button className="btn btn-sm" onClick={() => setShowAddBed(true)}>
            <Plus size={16} aria-hidden /> Add bed
          </button>
        }
      >
        Your farm production beds and land allocation. Manage bed dimensions, soil telemetry, and active crops.
      </PageIntro>

      <main className="main stack">
        {zones.error && <Notice kind="alert">{loadProblem(zones.error)}</Notice>}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

        {/* Land Summary Metrics */}
        <div className="erp-summary-banner" style={{ marginTop: 0, padding: "12px 16px" }}>
          <div className="erp-summary-item">
            <span className="k">Total Beds</span>
            <span className="v">{rows.length}</span>
          </div>
          <div className="erp-summary-item">
            <span className="k">Available (Idle)</span>
            <span className="v" style={{ color: "var(--ok)" }}>{availableCount}</span>
          </div>
          <div className="erp-summary-item">
            <span className="k">Occupied</span>
            <span className="v">{occupiedCount}</span>
          </div>
          <div className="erp-summary-item">
            <span className="k">Total Registered Area</span>
            <span className="v">{totalArea > 0 ? `${num(totalArea, 0)} m²` : "—"}</span>
          </div>
        </div>

        {/* Modal to Add New Bed Independently */}
        {showAddBed && (
          <div className="modal-overlay" onClick={() => setShowAddBed(false)}>
            <div
              className="modal-card erp-dialog"
              style={{ maxWidth: 480 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head-erp">
                <h2 className="erp-head-title">Add Production Bed</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowAddBed(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddBed}>
                <div className="modal-body-erp">
                  <div className="erp-section">
                    <div className="erp-field" style={{ marginBottom: 10 }}>
                      <label className="erp-label" htmlFor="bed-label-input">
                        Bed Name / Label <span className="req">*</span>
                      </label>
                      <input
                        id="bed-label-input"
                        type="text"
                        className="erp-input"
                        required
                        autoFocus
                        placeholder="e.g. Bed 3 or West Field"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                      />
                    </div>

                    <div className="erp-field">
                      <label className="erp-label" htmlFor="bed-area-input">
                        Bed Area
                      </label>
                      <div className="erp-input-group">
                        <input
                          id="bed-area-input"
                          type="number"
                          min={1}
                          step="any"
                          className="erp-input"
                          placeholder="e.g. 50"
                          value={newArea}
                          onChange={(e) => setNewArea(e.target.value)}
                        />
                        <span className="erp-input-addon">m²</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-foot-erp">
                  <div className="erp-foot-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setShowAddBed(false)}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-sm" disabled={saving}>
                      {saving ? "Saving..." : "Save Bed"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Beds Table */}
        <Panel title="Production Beds" icon={Layers} pad={false}>
          {zones.data === null ? (
            <p className="panel-pad muted">{zones.error ? "Your beds are safe on the server; they could not be loaded just now." : "Loading…"}</p>
          ) : rows.length === 0 ? (
            <Empty icon={MapPin}>
              No beds registered yet.
              <button
                className="btn btn-sm"
                onClick={() => setShowAddBed(true)}
                style={{ marginTop: 8 }}
              >
                <Plus size={16} aria-hidden /> Add your first bed
              </button>
            </Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Bed / Plot</th>
                    <th className="r">Area</th>
                    <th>Status</th>
                    <th>Active Crop</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((z) => {
                    const activeCycle = activeCyclesByZone.get(z.zone);
                    return (
                      <tr key={z.zone}>
                        <td>
                          <b>{z.label ?? z.zone}</b>
                          <div className="mono-sm muted">{z.zone}</div>
                        </td>
                        <td className="r">
                          {z.areaM2 ? `${num(z.areaM2, 1)} m²` : <span className="muted">—</span>}
                        </td>
                        <td>
                          {activeCycle ? (
                            <Tag kind="ok">In Use</Tag>
                          ) : (
                            <Tag kind="info">Available</Tag>
                          )}
                        </td>
                        <td>
                          {activeCycle ? (
                            <Link to={`/cycles/${activeCycle.id}`}>
                              {activeCycle.cropName}
                              {activeCycle.variety ? ` (${activeCycle.variety})` : ""}
                            </Link>
                          ) : (
                            <span className="muted">None (Idle)</span>
                          )}
                        </td>
                        <td className="act">
                          {!activeCycle ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => setPlantingZone(z.zone)}
                            >
                              <Sprout size={15} aria-hidden /> Plant crop
                            </button>
                          ) : (
                            <Link
                              className="btn btn-sm btn-ghost"
                              to={`/cycles/${activeCycle.id}`}
                            >
                              View report
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Telemetry: the seven readings of every bed, rated against its crop's stage; history opens below the table */}
        <Panel title="Telemetry" icon={Activity} pad={false}
               right={
                 <div className="seg" role="group" aria-label="History period">
                   {RANGES.map((r) => (
                     <button key={r.hours} type="button" className={hours === r.hours ? "on" : ""} onClick={() => setHours(r.hours)}>{r.label}</button>
                   ))}
                 </div>
               }>
          {conditions.error && <div className="panel-pad"><Notice kind="alert">{loadProblem(conditions.error)}</Notice></div>}
          {(conditions.data ?? []).length === 0 && !conditions.error ? (
            <Empty icon={Activity}>No beds to show yet.</Empty>
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
                  {(conditions.data ?? []).map((b) => {
                    const params = new Map(b.params.map((p) => [p.metric, p]));
                    const open = openBed === b.zone;
                    return (
                      <tr key={b.zone} className={`pickable${open ? " open" : ""}`} onClick={() => setOpenBed(open ? null : b.zone)}>
                        <td>
                          <button type="button" className="bedlink" aria-expanded={open} aria-label={`History of ${b.label ?? b.zone}`}>
                            {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}<b>{b.label ?? b.zone}</b>
                          </button>
                          <div className="mono-sm muted" title={b.zone}>{b.recordedAt ? ago(b.recordedAt) : "no readings"}</div>
                        </td>
                        <td className="status">
                          <StatusBadge status={b.status} alerts={b.alerts.length} />
                          {b.alerts.slice(0, 2).map((a) => <div key={a.id} className="mono-sm" style={{ color: "var(--alert)" }}>{a.title}</div>)}
                          {b.alerts.length > 2 && <div className="mono-sm muted">+{b.alerts.length - 2} more</div>}
                        </td>
                        <td className="crop">{stageText(b)}</td>
                        {RIBBON_CELLS.map((c) => (
                          <td key={c.key} className="m">
                            {c.metrics.map((m) => {
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
                <b>{openCond.label ?? openCond.zone} · history</b>
                <button type="button" className="linkbtn" onClick={() => setOpenBed(null)}>Close</button>
              </div>
              <BedTrends zone={openCond.zone} params={openCond.params} hours={hours} />
            </div>
          )}

          <div className="panel-pad" style={{ borderTop: "1px solid var(--line)" }}>
            <p className="small muted">
              Targets follow each crop's stage. Advice only: nothing here opens a valve.
              {" "}{conditions.data?.[0]?.source}
            </p>
          </div>
        </Panel>
      </main>

      {/* If farmer clicks "Plant crop" on an idle bed */}
      <AddCropModal
        isOpen={Boolean(plantingZone)}
        onClose={() => setPlantingZone(null)}
        onAdded={() => {
          zones.reload();
          cycles.reload();
        }}
      />
    </>
  );
}
