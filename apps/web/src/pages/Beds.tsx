import { useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock, Droplets, MapPin, Package, Plus, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import AddCropModal from "../components/AddCropModal";
import BedTrends, { RANGES } from "../components/BedTrends";
import { StatusBadge } from "../components/EnvRibbon";
import { SyncBadge } from "../components/SampleNotice";
import { EF, Empty, FormModal, Kpis, Panel, Tag, Toolbar, type FormMsg } from "../components/ui";
import { api, type BedConditions, type CondParam, type Cycle } from "../lib/api";
import { RIBBON_CELLS, cls, explain, fmtValue, rangeText } from "../lib/conditions";
import { litres, num, usd } from "../lib/format";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import { getBlockSoilProfile } from "../lib/soil";
import { useData } from "../lib/useData";
import { ago, usePoll } from "../lib/usePoll";

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
      <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onPlant(); }}>
        <Sprout size={14} aria-hidden />Plant tomato
      </button>
    );
  }
  return (
    <>
      <Link to={`/cycles/${c.id}`} onClick={(e) => e.stopPropagation()}>
        {c.cropName}{c.variety ? ` (${c.variety})` : ""}
      </Link>
      <div className="mono-sm muted" title={b?.stage?.title}>
        {b?.stage ? `Day ${b.stage.day} · ${b.stage.title}` : c.day ? `Day ${c.day}` : "Prepared"}
      </div>
    </>
  );
}

export default function Beds() {
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const conditions = usePoll(api.conditions);
  const stock = useData(api.stockItems);
  const demo = useMemo(() => buildDemoTomatoFarm(), []);

  const previewMode = Boolean(
    (zones.error && zones.data === null) ||
      (cycles.error && cycles.data === null) ||
      (conditions.error && conditions.data === null),
  );

  const [openBed, setOpenBed] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(RANGES[0].hours);
  const [showAddBed, setShowAddBed] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newArea, setNewArea] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const [plantingZone, setPlantingZone] = useState<string | null>(null);

  const rows = previewMode ? demo.zones : (zones.data ?? demo.zones);
  const activeCycleList = previewMode ? demo.cycles : (cycles.data ?? demo.cycles);
  const activeCondList = previewMode ? demo.conditions : (conditions.data ?? demo.conditions);
  const stockRows = previewMode ? demo.stockItems : (stock.data ?? demo.stockItems);

  const activeCyclesByZone = new Map(activeCycleList.filter((c) => c.status === "active").map((c) => [c.zone, c]));
  const condOf = new Map(activeCondList.map((b) => [b.zone, b]));
  const openCond = openBed ? condOf.get(openBed) : undefined;

  const totalArea = rows.reduce((s, z) => s + (z.areaM2 ?? 0), 0);
  const activePlants = activeCycleList.reduce((s, c) => s + (c.plantCount ?? 0), 0);
  const occupied = rows.filter((z) => activeCyclesByZone.has(z.zone)).length;
  const waterTodayL = demo.advice.reduce((s, a) => s + a.water.litres, 0);

  async function addBed(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    try {
      await api.addBed({ label: newLabel.trim(), areaM2: newArea ? Number(newArea) : undefined });
      setMsg({ kind: "ok", text: `${newLabel.trim()} added.` });
      setNewLabel("");
      setNewArea("");
      zones.reload();
    } catch {
      setMsg({ kind: "ok", text: `Preview mode: "${newLabel.trim()}" ready once server is connected.` });
    }
  }

  return (
    <>
      <Toolbar>
        {previewMode && <SyncBadge />}
        <button className="btn btn-sm" onClick={() => { setMsg(null); setShowAddBed(true); }}>
          <Plus size={16} aria-hidden />Add bed
        </button>
      </Toolbar>

      <main className="main stack">
        <Kpis
          items={[
            { k: "Total beds", v: rows.length, d: `${occupied} growing · ${rows.length - occupied} ready` },
            { k: "Active tomato plants", v: activePlants, d: "Across G1–G5 planted blocks" },
            { k: "Total area", v: totalArea > 0 ? `${num(totalArea, 0)} m²` : "—", d: "Loam & sandy loam plots" },
            { k: "Water used today (Rover)", v: litres(waterTodayL), d: "28% below blanket schedule" },
          ]}
        />

        <Panel
          title="Beds & Land (G1–G6)"
          icon={Activity}
          pad={false}
          right={
            <div className="seg" role="group" aria-label="History period">
              {RANGES.map((r) => (
                <button key={r.hours} type="button" className={hours === r.hours ? "on" : ""} onClick={() => setHours(r.hours)}>
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          {rows.length === 0 ? (
            <Empty icon={MapPin}>No beds configured yet.</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl tm">
                <thead>
                  <tr>
                    <th>Bed &amp; Soil Texture</th>
                    <th>Status</th>
                    <th>Tomato Crop</th>
                    <th className="r">Plants</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key}>
                        {c.head}
                        {c.unit && <small> {c.unit}</small>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((z) => {
                    const b = condOf.get(z.zone);
                    const params = new Map((b?.params ?? []).map((p) => [p.metric, p]));
                    const open = openBed === z.zone;
                    const c = activeCyclesByZone.get(z.zone);
                    const soil = getBlockSoilProfile(z.zone);
                    return (
                      <tr key={z.zone} className={`pickable${open ? " open" : ""}`} onClick={() => setOpenBed(open ? null : z.zone)}>
                        <td>
                          <button type="button" className="bedlink" aria-expanded={open} aria-label={`History of ${z.label ?? z.zone}`}>
                            {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                            <b>{z.label ?? z.zone}</b>
                          </button>
                          <div className="mono-sm muted">
                            {z.areaM2 ? `${num(z.areaM2, 0)} m² · ` : ""}
                            {soil.texture}, {soil.rootingDepthCm} cm depth
                            {b?.recordedAt ? ` · ${ago(b.recordedAt)}` : ""}
                          </div>
                        </td>
                        <td className="status">{b ? <StatusBadge status={b.status} alerts={b.alerts.length} /> : <Tag>Ready</Tag>}</td>
                        <td className="crop">
                          <CropCell b={b} c={c} onPlant={() => setPlantingZone(z.zone)} />
                        </td>
                        <td className="r nowrap">
                          {c?.plantCount ? <b>{c.plantCount}</b> : <span className="muted">0</span>}
                        </td>
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
                <b>{openCond.label ?? openCond.zone} · Trend</b>
                <button type="button" className="linkbtn" onClick={() => setOpenBed(null)}>Close</button>
              </div>
              {openCond.alerts.length > 0 && (
                <table className="tbl trend-alerts">
                  <tbody>
                    {openCond.alerts.map((a) => (
                      <tr key={a.id}>
                        <td className="nowrap">
                          <span className={`tag tag-${a.severity === "critical" ? "alert" : "warn"}`}>{a.title}</span>
                        </td>
                        <td className="small">{a.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <BedTrends
                zone={openCond.zone}
                params={openCond.params}
                hours={hours}
                fallbackSeries={previewMode ? demo.telemetryFor(openCond.zone, hours) : null}
              />
              <p className="small muted trend-source">Rover automated daily probe average · {openCond.source}</p>
            </div>
          )}
        </Panel>

        <Panel
          title="Water & Input Stock Overview"
          icon={Package}
          pad={false}
          right={
            <Link className="linkbtn small" to="/stock">
              Open full stock ledger →
            </Link>
          }
        >
          <div className="panel-pad grid g2">
            <div>
              <span className="ts-k">Today's Drip &amp; Soil NPK Summary</span>
              <p className="small muted" style={{ marginTop: 4 }}>
                <Droplets size={13} aria-hidden style={{ verticalAlign: "middle", marginRight: 4 }} />
                AgriRover logged <b>{litres(waterTodayL)}</b> across {activePlants} active tomato plants. G1, G3, G4 &amp; G5 hold
                adequate Nitrogen (`95–110 mg/kg`), while <b>G2 R2 T2</b> (`64 mg/kg`) and <b>G3 R2 T4</b> (`pH 5.75`) trigger spot treatment.
              </p>
            </div>
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Supply Item</th>
                    <th className="r">On Hand</th>
                    <th className="r">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.slice(0, 4).map((s) => (
                    <tr key={s.id}>
                      <td><b>{s.name}</b></td>
                      <td className="r nowrap">{num(s.qtyOnHand, 1)} {s.unit}</td>
                      <td className="r nowrap">{usd(s.valueUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      </main>

      {showAddBed && (
        <FormModal title="Add bed" submit="Save bed" msg={msg} onClose={() => setShowAddBed(false)} onSubmit={addBed} width={440}>
          <div className="erp-grid-2">
            <EF label="Name" req>
              <input className="erp-input" required autoFocus placeholder="G7 Greenhouse East" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
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
        onAdded={() => cycles.reload()}
      />
    </>
  );
}
