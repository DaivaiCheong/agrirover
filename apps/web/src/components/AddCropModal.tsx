import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EF, FormModal, Kpis, Modal, Tag, type FormMsg } from "./ui";
import { api, type Cycle } from "../lib/api";
import { dayMonth, num, todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };

/** Start a guava cycle on a bed. A setup fills the spacing and, for a bed of known size, the tree count. */
export default function AddCropModal({ isOpen, onClose, onAdded, zone }: { isOpen: boolean; onClose: () => void; onAdded?: () => void; zone?: string | null }) {
  const crops = useData(api.crops);
  const beds = useData(api.zones);
  const cycles = useData(api.cycles);

  const [bed, setBed] = useState("");
  const [setupId, setSetupId] = useState("");
  const [trees, setTrees] = useState("");
  const [variety, setVariety] = useState("");
  const [started, setStarted] = useState(todayIso());
  const [planted, setPlanted] = useState(todayIso());
  const [regulation, setRegulation] = useState("pruning");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const [made, setMade] = useState<Cycle | null>(null);

  const busy = new Set((cycles.data ?? []).filter((c) => c.status === "active").map((c) => c.zone));
  const free = (beds.data ?? []).filter((b) => !busy.has(b.zone));
  const chosen = bed || zone || free[0]?.zone || "";
  const area = (beds.data ?? []).find((b) => b.zone === chosen)?.areaM2 ?? undefined;
  const setups = useData(() => api.setups("guava", area || undefined), [area]);
  const setup = (setups.data ?? []).find((s) => s.id === setupId);
  const crop = crops.data?.[0];

  useEffect(() => { if (zone) setBed(zone); }, [zone]);
  useEffect(() => {
    if (!setup) return;
    if (setup.plantsForArea) setTrees(String(setup.plantsForArea));
    if (setup.orchard) setPrice(String(setup.orchard.priceUsd[0]));
  }, [setupId, setup?.plantsForArea]);

  if (!isOpen) return null;

  function close() { setMade(null); setMsg(null); onClose(); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const cycle = await api.addCycle({
        zone: chosen, crop: "guava", plantedOn: started, plantCount: Number(trees), areaM2: area || undefined, variety: variety.trim() || undefined,
        setup: setupId || undefined, expectedPriceUsdPerKg: Number(price) > 0 ? Number(price) : undefined, treesPlantedOn: planted, regulation,
      });
      setMade(cycle);
      cycles.reload();
      onAdded?.();
    } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  if (made) {
    return (
      <Modal title="Cycle started" onClose={close} width={460}>
        <div className="modal-body-erp"><div className="erp-section">
          <Kpis items={[{ k: "Block", v: made.bedLabel }, { k: "Trees", v: made.plantCount ?? "—" }, { k: "Harvest", v: made.perennial ? `${dayMonth(made.perennial.harvestFrom)} – ${dayMonth(made.perennial.harvestTo)}` : "—" }]} />
        </div></div>
        <div className="modal-foot-erp">
          <div className="erp-foot-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={close}>Close</button>
            <Link className="btn btn-sm" to={`/cycles/${made.id}/orchard`} onClick={close}>Open this cycle</Link>
          </div>
        </div>
      </Modal>
    );
  }

  const n = Number(trees);
  const low = setup ? n * setup.kgPerPlant[0] : 0, high = setup ? n * setup.kgPerPlant[1] : 0;
  const harvestFrom = addDays(started, (crop?.harvestDays?.[0] ?? 146) - 1), harvestTo = addDays(started, (crop?.harvestDays?.[1] ?? 180) - 1);
  const middleMonth = new Date(`${addDays(started, Math.round(((crop?.harvestDays?.[0] ?? 146) + (crop?.harvestDays?.[1] ?? 180)) / 2) - 1)}T00:00:00`).getMonth() + 1;
  const rainy = (crop?.rainyMonths ?? []).includes(middleMonth);

  return (
    <FormModal title="Start a guava cycle" submit="Start cycle" msg={msg} onClose={close} onSubmit={save} width={560}>
      <div className="erp-form">
        <div className="erp-grid-2">
          <EF label="Block" req>
            <select id="bed-select" className="erp-select" value={chosen} onChange={(e) => setBed(e.target.value)} required>
              {(beds.data ?? []).map((b) => <option key={b.zone} value={b.zone} disabled={busy.has(b.zone)}>{b.label ?? b.zone}{busy.has(b.zone) ? " (growing)" : ""}</option>)}
            </select>
          </EF>
          <EF label="Setup" hint={setup ? setup.method : undefined}>
            <select id="setup-select" className="erp-select" value={setupId} onChange={(e) => setSetupId(e.target.value)}>
              <option value="">Choose a setup</option>
              {(setups.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </EF>
          <EF label="Trees" req hint={area ? `Block is ${num(area, 0)} m²` : undefined}><input id="plant-count" className="erp-input" type="number" min={1} required value={trees} onChange={(e) => setTrees(e.target.value)} /></EF>
          <EF label="Cultivar" hint={setup?.orchard?.cultivars}><input className="erp-input" placeholder="Kimju" value={variety} onChange={(e) => setVariety(e.target.value)} /></EF>
          <EF label="This cycle starts" req><input id="planting-date" className="erp-input" type="date" required value={started} onChange={(e) => setStarted(e.target.value)} /></EF>
          <EF label="Trees were planted"><input className="erp-input" type="date" value={planted} onChange={(e) => setPlanted(e.target.value)} /></EF>
          <EF label="How it starts" hint={crop?.regulationMethods?.find((m) => m.id === regulation)?.note}>
            <select id="regulation" className="erp-select" value={regulation} onChange={(e) => setRegulation(e.target.value)}>
              {(crop?.regulationMethods ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </EF>
          <EF label="Price (USD a kg)"><input id="price-input" className="erp-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></EF>
        </div>
        {setup && n > 0 && (
          <Kpis items={[
            { k: "Harvest a year", v: `${num(low, 0)}–${num(high, 0)} kg` },
            { k: "Revenue a year", v: Number(price) > 0 ? `${usd(low * Number(price), 0)}–${usd(high * Number(price), 0)}` : "—" },
            { k: "Harvest", v: <>{dayMonth(harvestFrom)} – {dayMonth(harvestTo)}{rainy && <> <Tag kind="warn">Rainy</Tag></>}</> },
          ]} />
        )}
        {setup?.orchard?.docIssue && <p className="erp-hint">Yield table: {setup.orchard.docIssue}</p>}
      </div>
    </FormModal>
  );
}
