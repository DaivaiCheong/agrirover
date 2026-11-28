import { Fragment, useState, type FormEvent } from "react";
import { Activity, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock, Droplets, Layers, MapPin, Package, Plus, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import AddCropModal from "../components/AddCropModal";
import BedTrends, { RANGES } from "../components/BedTrends";
import { StatusBadge } from "../components/EnvRibbon";
import { EF, Empty, ErrorNotice, FormModal, Kpis, Panel, Tag, Toolbar, failMsg, type FormMsg } from "../components/ui";
import type { BedConditions, CondParam, Cycle, ZoneNow } from "../lib/api";
import { RIBBON_CELLS, cls, explain, fmtValue, rangeText } from "../lib/conditions";
import { useFarmFocus } from "../lib/farmContext";
import { litres, num, usd } from "../lib/format";
import { useAddBed, useAdvice, useConditions, useCycles, useSaveSoilProfile, useStock, useZones } from "../lib/queries";
import { DRAINAGE_OPTIONS, TEXTURE_OPTIONS } from "../lib/soil";
import { ago } from "../lib/usePoll";

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
  { key: "moisture", head: "Moisture", unit: "%" },
  { key: "ph", head: "pH" },
  { key: "ec", head: "EC", unit: "mS/cm" },
  { key: "soilt", head: "Soil", unit: "°C" },
  { key: "npk", head: "N · P · K", unit: "mg/kg" },
  { key: "airt", head: "Air", unit: "°C" },
  { key: "rh", head: "Humidity", unit: "%" },
];

function CropCell({ b, c, onPlant }: { b?: BedConditions; c?: Cycle; onPlant: () => void }) {
  if (!c) {
    return (
      <button type="button" className="btn btn-sm btn-ghost crop-plant-btn" onClick={(e) => { e.stopPropagation(); onPlant(); }}>
        <Sprout size={14} aria-hidden />Plant tomato
      </button>
    );
  }
  return (
    <>
      <Link className="crop-link" to={`/cycles/${c.id}/tomato`} onClick={(e) => e.stopPropagation()}>
        {c.variety ?? c.cropName}
      </Link>
      <div className="crop-sub" title={b?.stage?.title}>
        {b?.stage ? `Day ${b.stage.day} · ${b.stage.title}` : c.day ? `Day ${c.day}` : "Planned"}
      </div>
    </>
  );
}

export default function Beds() {
  const zones = useZones();
  const cycles = useCycles();
  const conditions = useConditions();
  const stock = useStock();
  const advice = useAdvice();
  const { setZone } = useFarmFocus();

  const [openBeds, setOpenBeds] = useState<string[]>([]);
  const [hours, setHours] = useState<number>(RANGES[0].hours);
  const [showAddBed, setShowAddBed] = useState(false);
  const [soilOf, setSoilOf] = useState<ZoneNow | null>(null);
  const [plantingZone, setPlantingZone] = useState<string | null>(null);

  const toggleBed = (zone: string) =>
    setOpenBeds((prev) => (prev.includes(zone) ? prev.filter((item) => item !== zone) : [...prev, zone]));

  const rows = zones.data ?? [];
  const cycleOf = new Map((cycles.data ?? []).filter((c) => c.status === "active").map((c) => [c.zone, c]));
  const condOf = new Map((conditions.data ?? []).map((b) => [b.zone, b]));

  const totalArea = rows.reduce((s, z) => s + (z.areaM2 ?? 0), 0);
  const plants = [...cycleOf.values()].reduce((s, c) => s + (c.plantCount ?? 0), 0);
  const occupied = rows.filter((z) => cycleOf.has(z.zone)).length;
  const adv = advice.data ?? [];
  const waterToday = adv.reduce((s, a) => s + a.water.litres, 0);
  const waterFull = adv.reduce((s, a) => s + a.water.fullLitres, 0);
  const noProfile = rows.filter((z) => !z.soilProfile).length;
  const flagged = (conditions.data ?? []).filter((c) => c.status === "warning" || c.status === "critical");
  const pageError = zones.error ?? cycles.error ?? conditions.error;

  return (
    <>
      <Toolbar>
        <button className="btn btn-sm" onClick={() => setShowAddBed(true)}><Plus size={16} aria-hidden />Add bed</button>
      </Toolbar>

      <main className="main stack">
        {pageError && <ErrorNotice error={pageError.message === "Failed to fetch" ? "Cannot reach the farm server." : pageError.message} onRetry={() => { zones.refetch(); conditions.refetch(); }} />}
        <Kpis
          loading={zones.isPending}
          items={[
            { k: "Beds", icon: MapPin, v: rows.length, d: `${occupied} growing · ${rows.length - occupied} free` },
            { k: "Plants", icon: Sprout, v: plants, d: `on ${num(totalArea, 0)} m²` },
            { k: "Soil profiles", icon: Layers, v: `${rows.length - noProfile} of ${rows.length}`, tone: noProfile ? "warn" : "ok",
              d: noProfile ? `${noProfile} bed${noProfile === 1 ? "" : "s"} without a soil profile` : "Every bed described" },
            { k: "Drip water today", icon: Droplets, tone: "info", v: litres(waterToday),
              d: waterFull > 0 ? `${Math.round(((waterFull - waterToday) / waterFull) * 100)}% under a blanket schedule` : "Needs a rover round" },
          ]}
        />

        <Panel
          title="Beds"
          icon={Activity}
          pad={false}
          right={
            <div className="seg" role="group" aria-label="History period">
              {RANGES.map((r) => (
                <button key={r.hours} type="button" className={hours === r.hours ? "on" : ""} onClick={() => setHours(r.hours)}>{r.label}</button>
              ))}
            </div>
          }
        >
          {rows.length === 0 ? (
            <Empty icon={MapPin}>{zones.isPending ? "Loading…" : "No bed yet. Add one to start."}</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl tm">
                <thead>
                  <tr>
                    <th>Bed and soil</th><th>Status</th><th>Crop</th><th className="r">Plants</th>
                    {COLUMNS.map((c) => <th key={c.key}>{c.head}{c.unit && <small> {c.unit}</small>}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((z) => {
                    const b = condOf.get(z.zone);
                    const params = new Map((b?.params ?? []).map((p) => [p.metric, p]));
                    const open = openBeds.includes(z.zone);
                    const c = cycleOf.get(z.zone);
                    const soil = z.soilProfile;
                    return (
                      <Fragment key={z.zone}>
                        <tr className={`pickable${open ? " open" : ""}`} onClick={() => { toggleBed(z.zone); setZone(z.zone); }}>
                          <td className="bed-col">
                            <div className="bed-col-top">
                              <button type="button" className="bedlink" aria-expanded={open} aria-label={`History of ${z.label ?? z.zone}`}>
                                {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                                <b>{z.label ?? z.zone}</b>
                              </button>
                              <button type="button" className="bed-edit-btn" onClick={(e) => { e.stopPropagation(); setSoilOf(z); }}>
                                {soil ? "Edit soil" : "Add soil"}
                              </button>
                            </div>
                            <div className="bed-col-meta">
                              {z.areaM2 ? `${num(z.areaM2, 0)} m² · ` : ""}
                              {soil ? `${soil.texture}, ${soil.rootingDepthCm} cm, ${soil.drainage.toLowerCase()}` : "No soil profile"}
                              {b?.recordedAt ? ` · ${ago(b.recordedAt)}` : ""}
                            </div>
                          </td>
                          <td className="status">{b && c ? <StatusBadge status={b.status} alerts={b.alerts.length} /> : <Tag>{c ? "No readings" : "Free"}</Tag>}</td>
                          <td className="crop"><CropCell b={b} c={c} onPlant={() => setPlantingZone(z.zone)} /></td>
                          <td className="r nowrap">{c?.plantCount ? <b>{c.plantCount}</b> : <span className="muted">0</span>}</td>
                          {RIBBON_CELLS.map((cell) => (
                            <td key={cell.key} className="m">
                              {cell.metrics.map((m) => {
                                const p = params.get(m);
                                return p ? <Reading key={m} p={p} /> : null;
                              })}
                            </td>
                          ))}
                        </tr>
                        {open && (
                          <tr className="bed-expand-row">
                            <td colSpan={4 + COLUMNS.length} className="bed-expand-cell">
                              <div className="trend-section">
                                <div className="trend-section-head">
                                  <b>{z.label ?? z.zone} · history</b>
                                  <button type="button" className="linkbtn" onClick={() => toggleBed(z.zone)}>Close</button>
                                </div>
                                {b ? (
                                  <>
                                    {b.alerts.length > 0 && (
                                      <table className="tbl trend-alerts">
                                        <tbody>
                                          {b.alerts.map((a) => (
                                            <tr key={a.id}>
                                              <td className="nowrap"><span className={`tag tag-${a.severity === "critical" ? "alert" : "warn"}`}>{a.title}</span></td>
                                              <td className="small">{a.message}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                    <BedTrends zone={b.zone} params={b.params} hours={hours} />
                                    <p className="small muted trend-source">Source: {b.source}</p>
                                  </>
                                ) : (
                                  <Empty>No history readings for this bed yet.</Empty>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid g2">
          <Panel title="Out of range today" icon={Activity}>
            {flagged.length === 0 ? (
              <Empty>Every growing bed is inside its targets.</Empty>
            ) : (
              <div className="stack small">
                {flagged.map((c) => (
                  <div key={c.zone}>
                    <b>{c.label}</b>: {c.alerts.map((a) => a.message).join(" ")}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Stock" icon={Package} pad={false} right={<Link className="linkbtn small" to="/stock">All stock →</Link>}>
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Item</th><th className="r">On hand</th><th className="r">Value</th></tr></thead>
                <tbody>
                  {(stock.data ?? []).slice(0, 5).map((s) => (
                    <tr key={s.id}><td><b>{s.name}</b></td><td className="r nowrap">{num(s.qtyOnHand, 1)} {s.unit}</td><td className="r nowrap">{usd(s.valueUsd)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </main>

      {showAddBed && <AddBedDialog onClose={() => setShowAddBed(false)} />}
      {soilOf && <SoilDialog bed={soilOf} onClose={() => setSoilOf(null)} />}
      <AddCropModal isOpen={Boolean(plantingZone)} zone={plantingZone} onClose={() => setPlantingZone(null)} />
    </>
  );
}

function AddBedDialog({ onClose }: { onClose: () => void }) {
  const add = useAddBed();
  const [label, setLabel] = useState("");
  const [area, setArea] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await add.mutateAsync({ label: label.trim(), areaM2: area ? Number(area) : undefined });
      setMsg({ kind: "ok", text: `${label.trim()} added. Describe its soil next.` });
      setLabel(""); setArea("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title="Add a bed" submit="Save bed" msg={msg} onClose={onClose} onSubmit={save} busy={add.isPending} width={440}>
      <div className="erp-grid-2">
        <EF label="Name" req><input className="erp-input" required autoFocus placeholder="G7 Greenhouse East" value={label} onChange={(e) => setLabel(e.target.value)} /></EF>
        <EF label="Area">
          <div className="erp-input-group">
            <input className="erp-input" type="number" min={1} step="any" value={area} onChange={(e) => setArea(e.target.value)} />
            <span className="erp-input-addon">m²</span>
          </div>
        </EF>
      </div>
    </FormModal>
  );
}

function SoilDialog({ bed, onClose }: { bed: ZoneNow; onClose: () => void }) {
  const save = useSaveSoilProfile();
  const p = bed.soilProfile;
  const [texture, setTexture] = useState(p?.texture ?? TEXTURE_OPTIONS[0]);
  const [depth, setDepth] = useState(String(p?.rootingDepthCm ?? ""));
  const [drainage, setDrainage] = useState(p?.drainage ?? DRAINAGE_OPTIONS[0]);
  const [om, setOm] = useState(String(p?.organicMatterPct ?? ""));
  const [msg, setMsg] = useState<FormMsg>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({ zone: bed.zone, profile: { texture, rootingDepthCm: Number(depth), drainage, organicMatterPct: Number(om) } });
      onClose();
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title={`Soil of ${bed.label ?? bed.zone}`} submit="Save soil" msg={msg} onClose={onClose} onSubmit={submit} busy={save.isPending} width={500}>
      <div className="erp-form">
        <p className="small muted">From a soil test or a dug pit. The rover's probe reads moisture, pH and nutrients; this is what it cannot read.</p>
        <div className="erp-grid-2">
          <EF label="Texture" req>
            <select className="erp-select" value={texture} onChange={(e) => setTexture(e.target.value)}>
              {TEXTURE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </EF>
          <EF label="Drainage" req>
            <select className="erp-select" value={drainage} onChange={(e) => setDrainage(e.target.value)}>
              {DRAINAGE_OPTIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </EF>
          <EF label="Rooting depth (cm)" req hint="Tomato wants 60 cm or more">
            <input className="erp-input" required type="number" min={1} max={500} value={depth} onChange={(e) => setDepth(e.target.value)} />
          </EF>
          <EF label="Organic matter (%)" req hint="From the lab report">
            <input className="erp-input" required type="number" min={0} max={100} step="0.1" value={om} onChange={(e) => setOm(e.target.value)} />
          </EF>
        </div>
      </div>
    </FormModal>
  );
}
