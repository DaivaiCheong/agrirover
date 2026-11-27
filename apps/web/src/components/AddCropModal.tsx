import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EF, FormModal, Kpis, Modal, Tag, type FormMsg } from "./ui";
import { api, type Cycle } from "../lib/api";
import { dayMonth, num, todayIso, usd } from "../lib/format";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import { EXPECTED_KG_PER_PLANT, PRICE_USD_PER_KG } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";

const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
};

const TOMATO_SETUPS = [
  { id: "greenhouse_a", label: "Greenhouse Trellis Beds", spacing: "Double-row 50×50 cm drip", defaultPerM2: 0.4 },
  { id: "commercial", label: "Drip Row Commercial", spacing: "Raised single drip row", defaultPerM2: 0.35 },
  { id: "raised_bed", label: "Raised Mulched Beds", spacing: "Mulched drip bed", defaultPerM2: 0.3 },
];

/** Start a tomato cycle on a bed with precision rover targets preloaded. */
export default function AddCropModal({
  isOpen,
  onClose,
  onAdded,
  zone,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: () => void;
  zone?: string | null;
}) {
  const beds = useData(api.zones);
  const cycles = useData(api.cycles);
  const demo = useMemo(() => buildDemoTomatoFarm(), []);

  const bedList = beds.data ?? demo.zones;
  const cycleList = cycles.data ?? demo.cycles;

  const [bed, setBed] = useState("");
  const [setupId, setSetupId] = useState(TOMATO_SETUPS[0].id);
  const [plants, setPlants] = useState("");
  const [variety, setVariety] = useState("Roma Tomato");
  const [started, setStarted] = useState(todayIso());
  const [price, setPrice] = useState(String(PRICE_USD_PER_KG));
  const [msg, setMsg] = useState<FormMsg>(null);
  const [made, setMade] = useState<Cycle | null>(null);

  const busy = new Set(cycleList.filter((c) => c.status === "active").map((c) => c.zone));
  const free = bedList.filter((b) => !busy.has(b.zone));
  const chosen = bed || zone || free[0]?.zone || bedList[0]?.zone || "g6";
  const area = bedList.find((b) => b.zone === chosen)?.areaM2 ?? 50;
  const setup = TOMATO_SETUPS.find((s) => s.id === setupId) ?? TOMATO_SETUPS[0];

  useEffect(() => {
    if (zone) setBed(zone);
  }, [zone]);

  useEffect(() => {
    if (!plants && area) {
      setPlants(String(Math.max(10, Math.round(area * setup.defaultPerM2))));
    }
  }, [area, setup.defaultPerM2, plants]);

  if (!isOpen) return null;

  function close() {
    setMade(null);
    setMsg(null);
    onClose();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const cycle = await api.addCycle({
        zone: chosen,
        crop: "tomato",
        plantedOn: started,
        plantCount: Number(plants),
        areaM2: area || undefined,
        variety: variety.trim() || "Roma Tomato",
        setup: setupId || undefined,
        expectedPriceUsdPerKg: Number(price) > 0 ? Number(price) : undefined,
      });
      setMade(cycle);
      cycles.reload();
      onAdded?.();
    } catch {
      const bedLabel = bedList.find((b) => b.zone === chosen)?.label ?? chosen.toUpperCase();
      setMade({
        id: `demo-cycle-${chosen}`,
        zone: chosen,
        bedLabel,
        trialArm: null,
        crop: "tomato",
        cropName: "Tomato",
        variety: variety.trim() || "Roma Tomato",
        plantedOn: started,
        endedOn: null,
        status: "active",
        day: 1,
        stage: "seedling",
        stageTitle: "Seedling & establishment",
        plantCount: Number(plants) || 10,
        areaM2: area,
        setup: setupId,
        setupLabel: setup.label,
        expectedPriceUsdPerKg: Number(price) || PRICE_USD_PER_KG,
        forecast: null,
      });
      onAdded?.();
    }
  }

  if (made) {
    return (
      <Modal title="Tomato cycle scheduled" onClose={close} width={460}>
        <div className="modal-body-erp">
          <div className="erp-section">
            <Kpis
              items={[
                { k: "Block", v: made.bedLabel },
                { k: "Tomato plants", v: made.plantCount ?? "—" },
                { k: "Harvest window", v: `${dayMonth(addDays(started, 75))} – ${dayMonth(addDays(started, 115))}` },
              ]}
            />
          </div>
        </div>
        <div className="modal-foot-erp">
          <div className="erp-foot-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={close}>Close</button>
            <Link className="btn btn-sm" to="/rover" onClick={close}>View in Rover 3D</Link>
          </div>
        </div>
      </Modal>
    );
  }

  const n = Number(plants) || 0;
  const estKg = n * EXPECTED_KG_PER_PLANT;
  const estRev = estKg * (Number(price) || PRICE_USD_PER_KG);

  return (
    <FormModal title="Start a tomato cycle" submit="Start tomato cycle" msg={msg} onClose={close} onSubmit={save} width={560}>
      <div className="erp-form">
        <div className="erp-grid-2">
          <EF label="Block" req>
            <select id="bed-select" className="erp-select" value={chosen} onChange={(e) => setBed(e.target.value)} required>
              {bedList.map((b) => (
                <option key={b.zone} value={b.zone} disabled={busy.has(b.zone)}>
                  {b.label ?? b.zone}{busy.has(b.zone) ? " (growing)" : " (ready)"}
                </option>
              ))}
            </select>
          </EF>
          <EF label="Bed setup" hint={setup.spacing}>
            <select id="setup-select" className="erp-select" value={setupId} onChange={(e) => setSetupId(e.target.value)}>
              {TOMATO_SETUPS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </EF>
          <EF label="Tomato plants" req hint={area ? `Bed is ${num(area, 0)} m²` : undefined}>
            <input id="plant-count" className="erp-input" type="number" min={1} required value={plants} onChange={(e) => setPlants(e.target.value)} />
          </EF>
          <EF label="Tomato variety">
            <input className="erp-input" placeholder="Roma Tomato, Cherry Belle" value={variety} onChange={(e) => setVariety(e.target.value)} />
          </EF>
          <EF label="Transplant date" req>
            <input id="planting-date" className="erp-input" type="date" required value={started} onChange={(e) => setStarted(e.target.value)} />
          </EF>
          <EF label="Expected price (USD / kg)">
            <input id="price-input" className="erp-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </EF>
        </div>
        {n > 0 && (
          <Kpis
            items={[
              { k: "Expected yield", v: `${num(estKg, 1)} kg` },
              { k: "Projected revenue", v: usd(estRev, 2) },
              { k: "First harvest", v: <>{dayMonth(addDays(started, 75))} <Tag kind="ok">Optimal</Tag></> },
            ]}
          />
        )}
      </div>
    </FormModal>
  );
}
