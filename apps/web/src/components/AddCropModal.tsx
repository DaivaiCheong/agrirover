import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EF, FormModal, Kpis, Modal, failMsg, type FormMsg } from "./ui";
import type { Cycle } from "../lib/api";
import { useFarmFocus } from "../lib/farmContext";
import { dayMonth, num, todayIso, usd } from "../lib/format";
import { useAddCycle, useCrops, useCycles, useSetups, useWorkbook, useZones } from "../lib/queries";

const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
};

/** Start a tomato crop on a free bed. The setups, the harvest days and the yield come from the server and the workbook. */
export default function AddCropModal({ isOpen, onClose, onAdded, zone }: {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (cycle: Cycle) => void;
  zone?: string | null;
}) {
  const beds = useZones();
  const cycles = useCycles();
  const crops = useCrops();
  const workbook = useWorkbook();
  const add = useAddCycle();
  const { setFocus } = useFarmFocus();

  const bedList = beds.data ?? [];
  const busy = new Set((cycles.data ?? []).filter((c) => c.status === "active").map((c) => c.zone));
  const free = bedList.filter((b) => !busy.has(b.zone));

  const [bed, setBed] = useState("");
  const chosen = bed || (zone && !busy.has(zone) ? zone : "") || free[0]?.zone || "";
  const area = bedList.find((b) => b.zone === chosen)?.areaM2 ?? null;
  const setups = useSetups("tomato", area);
  const [setupId, setSetupId] = useState("");
  const setup = setups.data?.find((s) => s.id === setupId) ?? setups.data?.[0];
  const [plants, setPlants] = useState("");
  const [variety, setVariety] = useState("Roma Tomato");
  const [started, setStarted] = useState(todayIso());
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const [made, setMade] = useState<Cycle | null>(null);

  useEffect(() => { if (zone) setBed(zone); }, [zone]);
  // suggest the plants the setup fits on this bed, until the farmer types a number
  const suggested = setup?.plantsForArea ?? null;
  const plantText = plants || (suggested ? String(suggested) : "");

  if (!isOpen) return null;
  const tomato = crops.data?.find((c) => c.slug === "tomato");
  const [h0, h1] = tomato?.harvestDays ?? [85, 110];
  const yieldKg = workbook.data?.yieldKgPerPlant ?? 4.5;
  const priceNum = Number(price || workbook.data?.sellingPricePerKg || 0);

  function close() {
    setMade(null);
    setMsg(null);
    onClose();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!chosen) {
      setMsg({ kind: "alert", text: "Every bed has a crop. Close one first, or add a bed in Farm › Beds." });
      return;
    }
    try {
      const cycle = await add.mutateAsync({
        zone: chosen,
        crop: "tomato",
        plantedOn: started,
        plantCount: Number(plantText),
        areaM2: area ?? undefined,
        variety: variety.trim() || undefined,
        setup: setup?.id,
        expectedPriceUsdPerKg: priceNum > 0 ? priceNum : undefined,
      });
      setMade(cycle);
      setFocus(cycle.zone);
      onAdded?.(cycle);
    } catch (err) {
      setMsg(failMsg(err));
    }
  }

  if (made) {
    return (
      <Modal title="Tomato crop started" onClose={close} width={480}>
        <div className="modal-body-erp">
          <div className="erp-section">
            <Kpis
              items={[
                { k: "Block", v: made.bedLabel },
                { k: "Plants", v: made.plantCount ?? "—" },
                { k: "Harvest window", v: `${dayMonth(addDays(made.plantedOn, h0))} – ${dayMonth(addDays(made.plantedOn, h1))}` },
              ]}
            />
            <p className="small muted" style={{ marginTop: 10 }}>
              It now shows on Today, Plan, Rover and Finance. Its budget comes from the Finance workbook.
            </p>
          </div>
        </div>
        <div className="modal-foot-erp">
          <div className="erp-foot-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={close}>Close</button>
            <Link className="btn btn-sm" to={`/cycles/${made.id}/tomato`} onClick={close}>Open the crop</Link>
          </div>
        </div>
      </Modal>
    );
  }

  const n = Number(plantText) || 0;
  const estKg = n * yieldKg;

  return (
    <FormModal title="Start a tomato crop" submit="Start crop" msg={msg} onClose={close} onSubmit={save} width={580} busy={add.isPending}>
      <div className="erp-form">
        <div className="erp-grid-2">
          <EF label="Bed" req>
            <select className="erp-select" value={chosen} onChange={(e) => { setBed(e.target.value); setPlants(""); }} required>
              {free.length === 0 && <option value="">No free bed</option>}
              {bedList.map((b) => (
                <option key={b.zone} value={b.zone} disabled={busy.has(b.zone)}>
                  {b.label ?? b.zone}{busy.has(b.zone) ? " (growing)" : ""}
                </option>
              ))}
            </select>
          </EF>
          <EF label="Bed setup" hint={setup ? `${setup.spacingBasis} · ${setup.rowCm} × ${setup.plantCm} cm` : undefined}>
            <select className="erp-select" value={setup?.id ?? ""} onChange={(e) => { setSetupId(e.target.value); setPlants(""); }}>
              {(setups.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </EF>
          <EF label="Plants" req hint={area ? `${num(area, 0)} m² bed${suggested ? `: the setup fits about ${suggested}` : ""}` : undefined}>
            <input className="erp-input" type="number" min={1} required value={plantText} onChange={(e) => setPlants(e.target.value)} />
          </EF>
          <EF label="Variety">
            <input className="erp-input" placeholder="Roma Tomato, Cherry Belle" value={variety} onChange={(e) => setVariety(e.target.value)} />
          </EF>
          <EF label="Transplant date" req>
            <input className="erp-input" type="date" required value={started} onChange={(e) => setStarted(e.target.value)} />
          </EF>
          <EF label="Expected price (USD / kg)" hint={`Finance workbook uses $${(workbook.data?.sellingPricePerKg ?? 0).toFixed(2)}`}>
            <input className="erp-input" inputMode="decimal" placeholder={String(workbook.data?.sellingPricePerKg ?? "")} value={price} onChange={(e) => setPrice(e.target.value)} />
          </EF>
        </div>
        {n > 0 && (
          <Kpis
            items={[
              { k: "Expected yield", v: `${num(estKg, 1)} kg`, d: `${yieldKg} kg a plant (workbook)` },
              { k: "Projected revenue", v: usd(estKg * priceNum, 2) },
              { k: "First harvest", v: dayMonth(addDays(started, h0)) },
            ]}
          />
        )}
      </div>
    </FormModal>
  );
}
