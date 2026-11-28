import { useState, type FormEvent } from "react";
import type { Cycle } from "../lib/api";
import { todayIso } from "../lib/format";
import { useCloseCycle, useSetups, useUpdateCycle } from "../lib/queries";
import { EF, FormModal, failMsg, type FormMsg } from "./ui";

/** Correct a crop's plant count, area, variety, date, setup or price. Its budget and forecast follow. */
export function EditCropDialog({ cycle, onClose }: { cycle: Cycle; onClose: () => void }) {
  const update = useUpdateCycle();
  const setups = useSetups("tomato", cycle.areaM2 ?? null);
  const [plants, setPlants] = useState(String(cycle.plantCount ?? ""));
  const [area, setArea] = useState(String(cycle.areaM2 ?? ""));
  const [variety, setVariety] = useState(cycle.variety ?? "");
  const [plantedOn, setPlantedOn] = useState(cycle.plantedOn);
  const [setup, setSetup] = useState(cycle.setup ?? "");
  const [price, setPrice] = useState(String(cycle.expectedPriceUsdPerKg ?? ""));
  const [msg, setMsg] = useState<FormMsg>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: cycle.id,
        patch: {
          plantCount: plants ? Number(plants) : undefined,
          areaM2: area ? Number(area) : undefined,
          variety: variety.trim() || undefined,
          plantedOn,
          setup: setup || undefined,
          expectedPriceUsdPerKg: price ? Number(price) : undefined,
        },
      });
      setMsg({ kind: "ok", text: "Saved. Budget, forecast and plan are updated." });
    } catch (err) {
      setMsg(failMsg(err));
    }
  }

  return (
    <FormModal title={`Edit ${cycle.bedLabel}`} submit="Save changes" msg={msg} onClose={onClose} onSubmit={save} busy={update.isPending}>
      <div className="erp-form">
        <div className="erp-grid-2">
          <EF label="Plants" req><input className="erp-input" type="number" min={1} required value={plants} onChange={(e) => setPlants(e.target.value)} /></EF>
          <EF label="Area (m²)"><input className="erp-input" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} /></EF>
          <EF label="Variety"><input className="erp-input" value={variety} maxLength={80} onChange={(e) => setVariety(e.target.value)} /></EF>
          <EF label="Transplanted on" req><input className="erp-input" type="date" required value={plantedOn} onChange={(e) => setPlantedOn(e.target.value)} /></EF>
          <EF label="Setup">
            <select className="erp-select" value={setup} onChange={(e) => setSetup(e.target.value)}>
              {(setups.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </EF>
          <EF label="Expected price (USD / kg)"><input className="erp-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></EF>
        </div>
      </div>
    </FormModal>
  );
}

/** End a crop: its cost report becomes final and the bed is free for the next one. */
export function CloseCropDialog({ cycle, onClose }: { cycle: Cycle; onClose: () => void }) {
  const close = useCloseCycle();
  const [endedOn, setEndedOn] = useState(todayIso());
  const [msg, setMsg] = useState<FormMsg>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await close.mutateAsync({ id: cycle.id, endedOn });
      onClose();
    } catch (err) {
      setMsg(failMsg(err));
    }
  }

  return (
    <FormModal title={`Close ${cycle.bedLabel}`} submit="Close crop" danger msg={msg} onClose={onClose} onSubmit={save} busy={close.isPending} width={460}>
      <div className="erp-form">
        <p className="small">
          Closing ends the crop on the date below. Its costs, harvests and sales stay, its cost report becomes final, and
          {" "}{cycle.bedLabel} is free for the next planting. Harvests and sales can still be added afterwards.
        </p>
        <EF label="Last day of the crop" req>
          <input className="erp-input" type="date" required min={cycle.plantedOn} value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />
        </EF>
      </div>
    </FormModal>
  );
}
