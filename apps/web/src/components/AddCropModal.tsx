import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Droplets, Loader2, TriangleAlert, X } from "lucide-react";
import { Notice } from "./ui";
import { api, type CropPlan, type Cycle } from "../lib/api";
import { litres, num, riel, todayIso, usd } from "../lib/format";
import { useData } from "../lib/useData";

const METHODS = [
  { id: "drip", label: "Drip", efficiency: 0.9 },
  { id: "sprinkler", label: "Sprinkler", efficiency: 0.75 },
  { id: "hand", label: "Hand Watering", efficiency: 0.6 },
] as const;

const NEW_BED = "__new__";

const tomorrowIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("sv-SE");
};

function nextBedName(labels: string[]) {
  let n = labels.length + 1;
  while (labels.includes(`Bed ${n}`)) n++;
  return `Bed ${n}`;
}

export default function AddCropModal({
  isOpen,
  onClose,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const crops = useData(api.crops);
  const beds = useData(api.zones);
  const cycles = useData(api.cycles);
  const settings = useData(api.settings);

  const [crop, setCrop] = useState("tomato");
  const [plants, setPlants] = useState("100");
  const [plantedOn, setPlantedOn] = useState(todayIso());
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("drip");
  const [bed, setBed] = useState("");
  const [bedName, setBedName] = useState("");
  const [variety, setVariety] = useState("");
  const [rowCm, setRowCm] = useState("");
  const [plantCm, setPlantCm] = useState("");
  const [setupId, setSetupId] = useState("");
  const [price, setPrice] = useState("");
  const [treesPlanted, setTreesPlanted] = useState(todayIso());
  const [regulation, setRegulation] = useState("pruning");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ zone: string; bedLabel: string; plan: CropPlan; cycle: Cycle } | null>(null);

  const busy = new Set((cycles.data ?? []).filter((c) => c.status === "active").map((c) => c.zone));
  const bedChoice = bed || (beds.data ?? []).find((b) => !busy.has(b.zone))?.zone || NEW_BED;
  const autoName = nextBedName((beds.data ?? []).map((b) => b.label ?? b.zone));

  // the growing setups of this crop; with the bed's area known, each says how many plants the bed takes
  const bedArea = (beds.data ?? []).find((b) => b.zone === bedChoice)?.areaM2 ?? undefined;
  const setups = useData(() => api.setups(crop, bedArea || undefined), [crop, bedArea]);
  const setupList = setups.data ?? [];
  const setup = setupList.find((s) => s.id === setupId);

  const waterCrops = (crops.data ?? []).filter((c) => c.hasWaterData);
  const availableCrops = waterCrops.length > 0 ? waterCrops : (crops.data ?? []);

  // Ensure selected crop exists in available list
  useEffect(() => {
    if (availableCrops.length > 0 && !availableCrops.some((c) => c.slug === crop)) {
      setCrop(availableCrops[0].slug);
    }
  }, [availableCrops, crop]);

  // a tree crop starts from a handful of trees, not a hundred plants
  useEffect(() => {
    if ((crops.data ?? []).find((c) => c.slug === crop)?.perennial) setPlants((p) => (p === "100" ? "5" : p));
  }, [crop, crops.data]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setError(null);
      setLoading(false);
      setPlantedOn(todayIso());
      setSetupId("");
      setPrice("");
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  function handleClose() {
    setResult(null);
    onClose();
  }

  // Live calculations
  const selectedCrop = (crops.data ?? []).find((c) => c.slug === crop);
  const defaultPerPlant = selectedCrop?.defaultAreaPerPlantM2 ?? 0.5;
  // a tree crop is spaced in metres, a bed crop in centimetres; the plan always gets centimetres
  const perennial = Boolean(selectedCrop?.perennial);
  const noun = perennial ? "Trees" : "Plants";
  const toCm = perennial ? 100 : 1;
  const rCm = Number(rowCm) * toCm;
  const pCm = Number(plantCm) * toCm;
  const areaPerPlant = rCm > 0 && pCm > 0 ? (rCm * pCm) / 10000 : defaultPerPlant;
  const plantCountNum = Number(plants) || 0;
  const projectedArea = plantCountNum > 0 ? plantCountNum * areaPerPlant : 0;
  const density = areaPerPlant > 0 ? 1 / areaPerPlant : 0;
  const activeMethod = METHODS.find((m) => m.id === method) ?? METHODS[0];

  // the setup's benchmark for this many plants (low = lowest yield per plant, high = highest)
  const priceNum = Number(price) > 0 ? Number(price) : 0;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const kgLow = setup ? round1(plantCountNum * setup.kgPerPlant[0]) : 0;
  const kgHigh = setup ? round1(plantCountNum * setup.kgPerPlant[1]) : 0;
  const densityRoom = setup ? setup.density[1] * 0.02 : 0;
  const outsideDensity = setup && density > 0 && (density < setup.density[0] - densityRoom || density > setup.density[1] + densityRoom);
  const showDensity = (d: number) => (perennial ? `${Math.round(d * 10000).toLocaleString()} / ha` : `${d.toFixed(1)} / m²`);

  // when the picking falls, from the cycle's start date
  const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return d; };
  const harvest = selectedCrop?.harvestDays ? [addDays(plantedOn, selectedCrop.harvestDays[0] - 1), addDays(plantedOn, selectedCrop.harvestDays[1] - 1)] : null;
  // judged by the middle of the picking: a few days into May is not a rainy-season crop
  const harvestMid = harvest ? new Date((harvest[0].getTime() + harvest[1].getTime()) / 2) : null;
  const rainyHarvest = Boolean(harvestMid && selectedCrop?.rainyMonths?.includes(harvestMid.getMonth() + 1));
  const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  function pickSetup(id: string) {
    setSetupId(id);
    const s = setupList.find((x) => x.id === id);
    if (!s) return;
    setRowCm(String(s.rowCm / toCm));                   // the setup's own spacing
    setPlantCm(String(s.plantCm / toCm));
    if (s.plantsForArea) setPlants(String(s.plantsForArea));   // a bed of known size takes this many
    if (s.orchard) setPrice(String(s.orchard.priceUsd[0]));    // the document's price for this setup
  }

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const n = Number(plants);
    if (!Number.isInteger(n) || n < 1) {
      setError(`Please enter a valid number of ${noun.toLowerCase()}.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const plan = await api.cropPlan({
        crop,
        plants: n,
        plantedOn,
        efficiency: activeMethod.efficiency,
        rowCm: rCm || undefined,
        plantCm: pCm || undefined,
      });

      let zone = bedChoice;
      let bedLabel = (beds.data ?? []).find((b) => b.zone === zone)?.label ?? zone;
      if (zone === NEW_BED) {
        const newBed = await api.addBed({
          label: bedName.trim() || autoName,
          areaM2: plan.areaM2,
        });
        zone = newBed.name;
        bedLabel = newBed.label || newBed.name;
      }

      const cycle = await api.addCycle({
        zone,
        crop,
        plantedOn,
        plantCount: plan.plants,
        areaM2: plan.areaM2,
        variety: variety.trim() || undefined,
        setup: setupId || undefined,
        expectedPriceUsdPerKg: setupId && priceNum > 0 ? priceNum : undefined,
        ...(perennial ? { treesPlantedOn: treesPlanted, regulation } : {}),
      });

      setResult({ zone, bedLabel, plan, cycle });
      beds.reload();
      cycles.reload();
      if (onAdded) onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-card erp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-head-erp">
          <h2 id="erp-dialog-title" className="erp-head-title">
            {result ? "Cycle Created" : "New Crop Cycle"}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        {result ? (
          <>
            <div className="modal-body-erp">
              <Notice kind="ok">
                <b>Cycle Created:</b> Added {result.plan.crop} ({result.plan.plants.toLocaleString()} plants) to {result.bedLabel}.
              </Notice>

              <div className="erp-receipt-card" style={{ marginTop: 10 }}>
                <div className="erp-receipt-head">
                  <span className="lbl lbl-ink">Summary</span>
                  <span className="mono-sm muted">{result.zone}</span>
                </div>
                <div className="erp-receipt-grid">
                  <div className="erp-receipt-row">
                    <span className="label">Bed</span>
                    <span className="val">{result.bedLabel}</span>
                  </div>
                  <div className="erp-receipt-row">
                    <span className="label">Crop</span>
                    <span className="val">
                      {result.plan.crop}
                      {variety ? ` (${variety})` : ""}
                    </span>
                  </div>
                  <div className="erp-receipt-row">
                    <span className="label">{noun}</span>
                    <span className="val">{result.plan.plants.toLocaleString()}</span>
                  </div>
                  {result.cycle.forecast && (
                    <>
                      <div className="erp-receipt-row">
                        <span className="label">Setup</span>
                        <span className="val">{result.cycle.setupLabel}</span>
                      </div>
                      <div className="erp-receipt-row">
                        <span className="label">Expected harvest</span>
                        <span className="val">{num(result.cycle.forecast.kgLow, 0)}–{num(result.cycle.forecast.kgHigh, 0)} kg</span>
                      </div>
                    </>
                  )}
                  <div className="erp-receipt-row">
                    <span className="label">Area</span>
                    <span className="val">{num(result.plan.areaM2, 1)} m²</span>
                  </div>
                  <div className="erp-receipt-row">
                    <span className="label">{perennial ? "Cycle starts" : "Planted"}</span>
                    <span className="val">{result.plan.plantedOn}</span>
                  </div>
                  <div className="erp-receipt-row">
                    <span className="label">Duration</span>
                    <span className="val">{result.plan.cycleDays} days</span>
                  </div>
                  <div className="erp-receipt-row">
                    <span className="label">Method</span>
                    <span className="val">
                      {activeMethod.label} ({Math.round(activeMethod.efficiency * 100)}%)
                    </span>
                  </div>
                  <div className="erp-receipt-row">
                    <span className="label">Day 1 Water</span>
                    <span className="val">
                      {litres(result.plan.water.days[0]?.litersTotalGross ?? 0)}
                    </span>
                  </div>
                  <div className="erp-receipt-row">
                    <span className="label">Peak Water</span>
                    <span className="val">
                      {litres(result.plan.water.peakLitersPerDay)} / day
                    </span>
                  </div>
                  <div className="erp-receipt-row">
                    <span className="label">Total Water</span>
                    <span className="val">
                      {num(result.plan.water.grossM3, 1)} m³
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-foot-erp">
              <div className="erp-foot-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={handleClose}
                >
                  Done
                </button>
                <Link
                  className="btn btn-sm"
                  to={result.cycle.perennial ? `/cycles/${result.cycle.id}/orchard` : `/plan?${new URLSearchParams({
                    crop: result.plan.slug,
                    plants: String(result.plan.plants),
                    date: result.plan.plantedOn,
                  })}`}
                >
                  <Droplets size={15} aria-hidden />
                  {result.cycle.perennial ? "Open this cycle" : "Water Plan"}
                </Link>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="modal-body-erp">
              {error && (
                <div style={{ marginBottom: 10 }}>
                  <Notice kind="alert">{error}</Notice>
                </div>
              )}

              {/* Section 1: Crop & Bed */}
              <div className="erp-section">
                <div className="erp-section-header">
                  <span className="erp-section-title">Crop & Location</span>
                </div>

                <div className="erp-grid-2">
                  <div className="erp-field">
                    <label className="erp-label" htmlFor="crop-select">
                      Crop <span className="req">*</span>
                    </label>
                    <select
                      id="crop-select"
                      className="erp-select"
                      value={crop}
                      onChange={(e) => { setCrop(e.target.value); setSetupId(""); }}
                      disabled={loading}
                    >
                      {availableCrops.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                      {availableCrops.length === 0 && (
                        <option value="tomato">Tomato</option>
                      )}
                    </select>
                  </div>

                  <div className="erp-field">
                    <label className="erp-label" htmlFor="variety-input">
                      Variety
                    </label>
                    <input
                      id="variety-input"
                      type="text"
                      className="erp-input"
                      value={variety}
                      placeholder={perennial ? "e.g. Kimju" : "e.g. Roma VF"}
                      maxLength={80}
                      onChange={(e) => setVariety(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="erp-field" style={{ marginTop: 10 }}>
                  <label className="erp-label" htmlFor="bed-select">
                    Bed <span className="req">*</span>
                  </label>
                  <select
                    id="bed-select"
                    className="erp-select"
                    value={bedChoice}
                    onChange={(e) => setBed(e.target.value)}
                    disabled={loading}
                  >
                    <optgroup label="Available">
                      {(beds.data ?? [])
                        .filter((b) => !busy.has(b.zone))
                        .map((b) => (
                          <option key={b.zone} value={b.zone}>
                            {b.label ?? b.zone}
                          </option>
                        ))}
                    </optgroup>
                    {(beds.data ?? []).some((b) => busy.has(b.zone)) && (
                      <optgroup label="Busy">
                        {(beds.data ?? [])
                          .filter((b) => busy.has(b.zone))
                          .map((b) => (
                            <option key={b.zone} value={b.zone} disabled>
                              {b.label ?? b.zone} (Busy)
                            </option>
                          ))}
                      </optgroup>
                    )}
                    <optgroup label="Actions">
                      <option value={NEW_BED}>+ New Bed...</option>
                    </optgroup>
                  </select>
                </div>

                {bedChoice === NEW_BED && (
                  <div className="erp-nested-panel">
                    <div className="erp-grid-2">
                      <div className="erp-field">
                        <label className="erp-label" htmlFor="new-bed-name">
                          Bed Name <span className="req">*</span>
                        </label>
                        <input
                          id="new-bed-name"
                          type="text"
                          className="erp-input"
                          value={bedName}
                          placeholder={autoName}
                          maxLength={80}
                          onChange={(e) => setBedName(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <div className="erp-field">
                        <label className="erp-label">
                          Area
                        </label>
                        <div className="erp-input-group">
                          <input
                            type="text"
                            className="erp-input"
                            value={
                              projectedArea > 0
                                ? `${Math.round(projectedArea * 10) / 10}`
                                : "—"
                            }
                            readOnly
                            disabled
                          />
                          <span className="erp-input-addon">m²</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Growing setup: fills the spacing and projects the harvest. Only crops that have setups show it. */}
              {setupList.length > 0 && (
                <div className="erp-section">
                  <div className="erp-section-header">
                    <span className="erp-section-title">Growing Setup</span>
                  </div>
                  <div className="erp-grid-2">
                    <div className="erp-field">
                      <label className="erp-label" htmlFor="setup-select">Setup</label>
                      <select id="setup-select" className="erp-select" value={setupId}
                              onChange={(e) => pickSetup(e.target.value)} disabled={loading}>
                        <option value="">Not chosen: set spacing myself</option>
                        {setupList.map((s) => (
                          <option key={s.id} value={s.id}>{s.orchard ? s.label : `${s.label} · ${s.density[0]}–${s.density[1]}/m²`}</option>
                        ))}
                      </select>
                      {setup?.method && <span className="erp-hint">{setup.method}</span>}
                      {setup?.orchard && <span className="erp-hint">{setup.orchard.cultivars}. First harvest {setup.orchard.firstBearing.toLowerCase()}.</span>}
                    </div>
                    <div className="erp-field">
                      <label className="erp-label" htmlFor="price-input">Expected price</label>
                      <div className="erp-input-group">
                        <input id="price-input" type="number" className="erp-input" min={0} step="any" placeholder="e.g. 1.20"
                               value={price} onChange={(e) => setPrice(e.target.value)} disabled={loading || !setup} />
                        <span className="erp-input-addon">USD / kg</span>
                      </div>
                      {priceNum > 0 && settings.data && <span className="erp-hint">{riel(priceNum, settings.data.khrPerUsd)} a kg</span>}
                    </div>
                  </div>
                  {setup && plantCountNum > 0 && (
                    <div className="erp-summary-banner erp-forecast" aria-label="Expected harvest">
                      <div className="erp-summary-item">
                        <span className="k">Expected harvest{perennial ? " a year" : ""}</span>
                        <span className="v">{num(kgLow, 0)}–{num(kgHigh, 0)} kg</span>
                      </div>
                      <div className="erp-summary-item">
                        <span className="k">Per {perennial ? "tree" : "plant"}</span>
                        <span className="v">{setup.kgPerPlant[0]}–{setup.kgPerPlant[1]} kg</span>
                      </div>
                      <div className="erp-summary-item">
                        <span className="k">Setup density</span>
                        <span className="v">{perennial
                          ? (setup.density[0] === setup.density[1]
                              ? showDensity(setup.density[0])
                              : `${Math.round(setup.density[0] * 10000).toLocaleString()}–${Math.round(setup.density[1] * 10000).toLocaleString()} / ha`)
                          : `${setup.density[0]}–${setup.density[1]} / m²`}</span>
                      </div>
                      <div className="erp-summary-item">
                        <span className="k">Revenue</span>
                        <span className="v">{priceNum > 0 ? `${usd(kgLow * priceNum, 0)}–${usd(kgHigh * priceNum, 0)}` : "Add a price"}</span>
                      </div>
                    </div>
                  )}
                  {setup?.orchard?.docIssue && (
                    <div className="erp-flag">
                      <TriangleAlert size={14} aria-hidden />
                      <span><b>To settle:</b> {setup.orchard.docIssue}</span>
                    </div>
                  )}
                  {setup && outsideDensity && (
                    <div className="erp-flag">
                      <TriangleAlert size={14} aria-hidden />
                      <span>
                        {showDensity(density)} is {density < setup.density[0] ? "below" : "above"} this setup's
                        {" "}{showDensity(setup.density[0])} to {showDensity(setup.density[1])}. The yield figures may not hold.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Section 2: Quantity & Schedule */}
              <div className="erp-section">
                <div className="erp-section-header">
                  <span className="erp-section-title">Schedule & Quantity</span>
                </div>

                <div className="erp-grid-2">
                  <div className="erp-field">
                    <label className="erp-label" htmlFor="plant-count">
                      {noun} <span className="req">*</span>
                    </label>
                    <div className="erp-input-group">
                      <input
                        id="plant-count"
                        type="number"
                        className="erp-input"
                        inputMode="numeric"
                        min={1}
                        max={1000000}
                        step={1}
                        required
                        value={plants}
                        onChange={(e) => setPlants(e.target.value)}
                        disabled={loading}
                        placeholder="100"
                      />
                      <span className="erp-input-addon">{noun.toLowerCase()}</span>
                    </div>
                  </div>

                  <div className="erp-field">
                    <div className="erp-label-row">
                      <label className="erp-label" htmlFor="planting-date">
                        {perennial ? "This Cycle Starts" : "Planting Date"} <span className="req">*</span>
                      </label>
                      <div className="erp-quick-actions">
                        <button
                          type="button"
                          className="erp-quick-link"
                          onClick={() => setPlantedOn(todayIso())}
                          disabled={loading}
                        >
                          Today
                        </button>
                        <span className="erp-sep">•</span>
                        <button
                          type="button"
                          className="erp-quick-link"
                          onClick={() => setPlantedOn(tomorrowIso())}
                          disabled={loading}
                        >
                          Tomorrow
                        </button>
                      </div>
                    </div>
                    <input
                      id="planting-date"
                      type="date"
                      className="erp-input"
                      required
                      value={plantedOn}
                      onChange={(e) => setPlantedOn(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              {/* A tree outlives its cycle: its age and how the cycle is started are separate questions */}
              {perennial && selectedCrop?.regulationMethods && (
                <div className="erp-section">
                  <div className="erp-section-header">
                    <span className="erp-section-title">Orchard</span>
                  </div>
                  <div className="erp-grid-2">
                    <div className="erp-field">
                      <label className="erp-label" htmlFor="trees-planted">Trees Planted</label>
                      <input id="trees-planted" type="date" className="erp-input" value={treesPlanted}
                             onChange={(e) => setTreesPlanted(e.target.value)} disabled={loading} />
                    </div>
                    <div className="erp-field">
                      <label className="erp-label" htmlFor="regulation">How This Cycle Starts</label>
                      <select id="regulation" className="erp-select" value={regulation} onChange={(e) => setRegulation(e.target.value)} disabled={loading}>
                        {selectedCrop.regulationMethods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                      <span className="erp-hint">{selectedCrop.regulationMethods.find((m) => m.id === regulation)?.note}</span>
                    </div>
                  </div>
                  {harvest && (
                    <p className="erp-hint" style={{ marginTop: 8 }}>Harvest about {shortDate(harvest[0])} to {shortDate(harvest[1])}.</p>
                  )}
                  {rainyHarvest && (
                    <div className="erp-flag">
                      <TriangleAlert size={14} aria-hidden />
                      <span>This harvest falls in the rainy months: expect watery fruit, lower sugar and more fruit flies.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Section 3: Irrigation & Spacing */}
              <div className="erp-section">
                <div className="erp-section-header">
                  <span className="erp-section-title">Irrigation & Spacing</span>
                </div>

                <div className="erp-field" style={{ marginBottom: 10 }}>
                  <label className="erp-label" htmlFor="irrigation-method">
                    Watering Method <span className="req">*</span>
                  </label>
                  <select
                    id="irrigation-method"
                    className="erp-select"
                    value={method}
                    onChange={(e) =>
                      setMethod(e.target.value as (typeof METHODS)[number]["id"])
                    }
                    disabled={loading}
                  >
                    {METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({Math.round(m.efficiency * 100)}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="erp-grid-2">
                  <div className="erp-field">
                    <label className="erp-label" htmlFor="row-spacing">
                      Row Spacing
                    </label>
                    <div className="erp-input-group">
                      <input
                        id="row-spacing"
                        type="number"
                        className="erp-input"
                        min={perennial ? 0.5 : 10}
                        max={perennial ? 20 : 500}
                        step="any"
                        placeholder={perennial ? "3" : "50"}
                        value={rowCm}
                        onChange={(e) => setRowCm(e.target.value)}
                        disabled={loading}
                      />
                      <span className="erp-input-addon">{perennial ? "m" : "cm"}</span>
                    </div>
                  </div>

                  <div className="erp-field">
                    <label className="erp-label" htmlFor="plant-spacing">
                      Plant Spacing
                    </label>
                    <div className="erp-input-group">
                      <input
                        id="plant-spacing"
                        type="number"
                        className="erp-input"
                        min={perennial ? 0.3 : 5}
                        max={perennial ? 20 : 500}
                        step="any"
                        placeholder={perennial ? "3.5" : "70"}
                        value={plantCm}
                        onChange={(e) => setPlantCm(e.target.value)}
                        disabled={loading}
                      />
                      <span className="erp-input-addon">{perennial ? "m" : "cm"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Projection Ribbon */}
              <div className="erp-summary-banner">
                <div className="erp-summary-item">
                  <span className="k">{noun}</span>
                  <span className="v">
                    {plantCountNum > 0 ? `${plantCountNum.toLocaleString()}` : "0"}
                  </span>
                </div>
                <div className="erp-summary-item">
                  <span className="k">Est. Area</span>
                  <span className="v">
                    {projectedArea > 0 ? `${Math.round(projectedArea * 10) / 10} m²` : "—"}
                  </span>
                </div>
                <div className="erp-summary-item">
                  <span className="k">Density</span>
                  <span className="v">
                    {density > 0 ? showDensity(density) : "—"}
                  </span>
                </div>
                <div className="erp-summary-item">
                  <span className="k">Efficiency</span>
                  <span className="v">
                    {Math.round(activeMethod.efficiency * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-foot-erp">
              <div className="erp-foot-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 size={15} className="spin" aria-hidden />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={15} aria-hidden />
                      Add Crop
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
