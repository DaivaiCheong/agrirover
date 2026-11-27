import { useEffect, useMemo, useState } from "react";
import { Calculator, RotateCcw, ShieldCheck, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import { SyncBadge } from "../components/SampleNotice";
import { Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import {
  convertToRiel,
  createDefaultSpreadsheetInputs,
  evaluateSpreadsheet,
  PLANT_PRESETS,
  rescaleSpreadsheetByPlants,
  type LedgerRowId,
  type SpreadsheetInputs,
} from "../lib/financeSpreadsheet";
import { num } from "../lib/format";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import { buildAllBlockEconomics, computeFinanceView } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";

type ActiveCellInfo = {
  ref: string;
  formula: string;
  preview: string;
};

function parsePositiveFloat(raw: string, fallback: number): number {
  if (raw.trim() === "") return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export default function Finance() {
  const zones = useData(api.zones);
  const cycles = useData(api.cycles);
  const conditions = useData(api.conditions);
  const surveys = useData(api.surveys);

  const previewMode = Boolean((zones.error && zones.data === null) || (cycles.error && cycles.data === null));
  const demo = useMemo(() => buildDemoTomatoFarm(), []);

  const activeZones = previewMode ? demo.zones : (zones.data ?? demo.zones);
  const activeCycles = previewMode ? demo.cycles : (cycles.data ?? demo.cycles);
  const activeConds = previewMode ? demo.conditions : (conditions.data ?? demo.conditions);
  const surveyList = previewMode ? demo.surveys : (surveys.data ?? []);

  const liveRoundIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of surveyList) {
      if ((s.status === "completed" || s.status === "aborted") && !map.has(s.zone)) {
        map.set(s.zone, s.id);
      }
    }
    return map;
  }, [surveyList]);

  const roundKey = [...liveRoundIds.values()].join(",");
  const fetchedRounds = useData(async () => {
    if (previewMode || !roundKey) return new Map();
    const pairs = await Promise.all([...liveRoundIds.entries()].map(async ([z, id]) => [z, await api.survey(id)] as const));
    return new Map(pairs);
  }, [previewMode, roundKey]);

  const roundsByZone = useMemo(() => {
    if (previewMode) return demo.roundsByZone;
    const map = new Map(demo.roundsByZone);
    fetchedRounds.data?.forEach((v, k) => map.set(k, v));
    return map;
  }, [previewMode, demo.roundsByZone, fetchedRounds.data]);

  const { blocks, allRows } = useMemo(
    () =>
      buildAllBlockEconomics({
        cycles: activeCycles,
        zones: activeZones,
        conditions: activeConds,
        roundsByZone,
      }),
    [activeCycles, activeZones, activeConds, roundsByZone],
  );

  const farmReport = useMemo(
    () => computeFinanceView({ scale: "farm", selectedZone: "g1", blocks, allRows }),
    [blocks, allRows],
  );

  const syncedRiskUsd = farmReport.preventedLossUsd;
  const syncedAlertCount = farmReport.visionAlertCount;

  const [sheet, setSheet] = useState<SpreadsheetInputs>(() => createDefaultSpreadsheetInputs(syncedRiskUsd));

  // Keep synced risk value fresh if API round finishes loading (while user has not manually modified riskProtectedUsd)
  const [riskTouched, setRiskTouched] = useState(false);
  useEffect(() => {
    if (!riskTouched && Math.abs(sheet.riskProtectedUsd - syncedRiskUsd) > 0.001) {
      setSheet((prev) => ({ ...prev, riskProtectedUsd: syncedRiskUsd }));
    }
  }, [syncedRiskUsd, riskTouched, sheet.riskProtectedUsd]);

  const calc = useMemo(() => evaluateSpreadsheet(sheet), [sheet]);

  const [selectedRef, setSelectedRef] = useState<string>("E8");

  const activeCell: ActiveCellInfo = useMemo(() => {
    const rielStr = (u: number) => `~${convertToRiel(u, sheet.exchangeRate).toLocaleString()} ៛`;
    // Header parameters Row 1
    if (selectedRef === "B1") {
      return { ref: "B1", formula: String(sheet.plants), preview: `${sheet.plants} Active Tomato Plants` };
    }
    if (selectedRef === "D1") {
      return { ref: "D1", formula: String(sheet.cycleDays), preview: `${sheet.cycleDays} days per crop cycle` };
    }
    if (selectedRef === "F1") {
      return { ref: "F1", formula: String(sheet.exchangeRate), preview: `${sheet.exchangeRate.toLocaleString()} ៛ per $1 USD` };
    }

    // Sheet 1 Rows 2..7
    const rowMatch = calc.rows.find((r) => selectedRef.endsWith(String(r.rowNum)) && ["A", "B", "C", "D", "E", "F", "G"].includes(selectedRef[0]));
    if (rowMatch) {
      const col = selectedRef[0];
      const n = rowMatch.rowNum;
      if (col === "B") return { ref: selectedRef, formula: String(rowMatch.roverQty), preview: `AgriRover Qty: ${rowMatch.roverQty} ${rowMatch.unit}` };
      if (col === "C") return { ref: selectedRef, formula: String(rowMatch.stdQty), preview: `Standard Qty: ${rowMatch.stdQty} ${rowMatch.unit}` };
      if (col === "D") return { ref: selectedRef, formula: String(rowMatch.unitRateUsd), preview: `$${rowMatch.unitRateUsd.toFixed(2)} / ${rowMatch.unit}` };
      if (col === "E") {
        return {
          ref: selectedRef,
          formula: `=B${n}*D${n}`,
          preview: `${rowMatch.roverQty} × $${rowMatch.unitRateUsd.toFixed(2)} = $${rowMatch.roverCostUsd.toFixed(2)} (${rielStr(rowMatch.roverCostUsd)})`,
        };
      }
      if (col === "F") {
        return {
          ref: selectedRef,
          formula: `=C${n}*D${n}`,
          preview: `${rowMatch.stdQty} × $${rowMatch.unitRateUsd.toFixed(2)} = $${rowMatch.stdCostUsd.toFixed(2)} (${rielStr(rowMatch.stdCostUsd)})`,
        };
      }
      if (col === "G") {
        return {
          ref: selectedRef,
          formula: `=F${n}-E${n}`,
          preview: `$${rowMatch.stdCostUsd.toFixed(2)} - $${rowMatch.roverCostUsd.toFixed(2)} = $${rowMatch.savedUsd.toFixed(2)} (${rowMatch.savedPct}% saved)`,
        };
      }
      return { ref: selectedRef, formula: `"${rowMatch.label}"`, preview: rowMatch.note };
    }

    // Row 8 Totals & Row 9 Unit Cost
    if (selectedRef === "E8") return { ref: "E8", formula: "=SUM(E2:E7)", preview: `$${calc.totalRoverCostUsd.toFixed(2)} (~${calc.totalRoverCostRiel.toLocaleString()} ៛)` };
    if (selectedRef === "F8") return { ref: "F8", formula: "=SUM(F2:F7)", preview: `$${calc.totalStdCostUsd.toFixed(2)} (~${calc.totalStdCostRiel.toLocaleString()} ៛)` };
    if (selectedRef === "G8") return { ref: "G8", formula: "=F8-E8", preview: `$${calc.totalSavedUsd.toFixed(2)} (${calc.totalSavedPct}% OPEX reduction)` };
    if (selectedRef === "E9") return { ref: "E9", formula: "=E8/B1", preview: `$${calc.costPerPlantRoverUsd.toFixed(2)} (~${calc.costPerPlantRoverRiel.toLocaleString()} ៛) / plant` };
    if (selectedRef === "F9") return { ref: "F9", formula: "=F8/B1", preview: `$${calc.costPerPlantStdUsd.toFixed(2)} (~${calc.costPerPlantStdRiel.toLocaleString()} ៛) / plant` };
    if (selectedRef === "G9") return { ref: "G9", formula: "=F9-E9", preview: `$${calc.savedPerPlantUsd.toFixed(2)} (~${calc.savedPerPlantRiel.toLocaleString()} ៛) saved / plant` };

    // Sheet 2 Rows 11..20
    switch (selectedRef) {
      case "B11":
        return { ref: "B11", formula: String(sheet.yieldKgPerPlant), preview: `Expected marketable yield: ${sheet.yieldKgPerPlant} kg / plant` };
      case "B12":
        return { ref: "B12", formula: String(sheet.sellingPricePerKg), preview: `Farm-gate price: $${sheet.sellingPricePerKg.toFixed(2)} / kg (~${Math.round(sheet.sellingPricePerKg * sheet.exchangeRate).toLocaleString()} ៛/kg)` };
      case "B13":
        return { ref: "B13", formula: String(sheet.riskProtectedUsd), preview: `Early-detected Health loss prevented (${syncedAlertCount} live alerts)` };
      case "B14":
        return { ref: "B14", formula: "=B1*B11", preview: `${sheet.plants} × ${sheet.yieldKgPerPlant} kg = ${num(calc.totalHarvestKg, 1)} kg` };
      case "B15":
        return { ref: "B15", formula: "=B14*B12", preview: `${num(calc.totalHarvestKg, 1)} kg × $${sheet.sellingPricePerKg.toFixed(2)} = $${calc.grossRevenueUsd.toFixed(2)} (~${calc.grossRevenueRiel.toLocaleString()} ៛)` };
      case "B16":
        return { ref: "B16", formula: "=B15-E8", preview: `$${calc.grossRevenueUsd.toFixed(2)} - $${calc.totalRoverCostUsd.toFixed(2)} = $${calc.netProfitUsd.toFixed(2)} (~${calc.netProfitRiel.toLocaleString()} ៛)` };
      case "B17":
        return { ref: "B17", formula: "=B16/B15", preview: `${calc.netMarginPct.toFixed(1)}% net operating margin` };
      case "B18":
        return { ref: "B18", formula: "=E8/B14", preview: `$${calc.totalRoverCostUsd.toFixed(2)} / ${num(calc.totalHarvestKg, 1)} kg = $${calc.breakEvenPricePerKg.toFixed(2)}/kg (~${calc.breakEvenPriceRielPerKg.toLocaleString()} ៛/kg)` };
      case "B19":
        return { ref: "B19", formula: "=E8/B12", preview: `$${calc.totalRoverCostUsd.toFixed(2)} / $${sheet.sellingPricePerKg.toFixed(2)} = ${num(calc.breakEvenYieldKg, 1)} kg (${calc.breakEvenYieldPctOfExpected}% of crop)` };
      case "B20":
        return { ref: "B20", formula: "=G8+B13", preview: `$${calc.totalSavedUsd.toFixed(2)} + $${sheet.riskProtectedUsd.toFixed(2)} = $${calc.totalEconomicAdvantageUsd.toFixed(2)} (~${calc.totalEconomicAdvantageRiel.toLocaleString()} ៛)` };
      default:
        return { ref: "E8", formula: "=SUM(E2:E7)", preview: `$${calc.totalRoverCostUsd.toFixed(2)} (~${calc.totalRoverCostRiel.toLocaleString()} ៛)` };
    }
  }, [selectedRef, sheet, calc, syncedAlertCount]);

  function handlePresetPlants(n: number) {
    setSheet((prev) => rescaleSpreadsheetByPlants(prev, n));
    setSelectedRef("B1");
  }

  function handleResetSample() {
    setRiskTouched(false);
    setSheet(createDefaultSpreadsheetInputs(syncedRiskUsd));
    setSelectedRef("E8");
  }

  function updateRowField(id: LedgerRowId, field: "roverQty" | "stdQty" | "unitRateUsd", raw: string) {
    setSheet((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => {
        if (r.id !== id) return r;
        const nextVal = parsePositiveFloat(raw, r[field]);
        return {
          ...r,
          [field]: nextVal,
          customRoverQty: field === "roverQty" ? true : r.customRoverQty,
          customStdQty: field === "stdQty" ? true : r.customStdQty,
        };
      }),
    }));
  }

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      <Panel
        title="Tomato Farm Financial Workbook (Interactive Excel Model)"
        icon={Calculator}
        pad={false}
        right={
          <div className="rv-right">
            <SyncBadge />
            <button type="button" className="btn btn-sm btn-ghost" onClick={handleResetSample}>
              <RotateCcw size={14} aria-hidden />Reset to Sample Farm
            </button>
          </div>
        }
      >
        {/* Top Quick Scale Presets & Legend */}
        <div className="rv-action-bar">
          <div className="seg" role="group" aria-label="Scale farm plant count presets">
            {PLANT_PRESETS.map((p) => (
              <button
                key={p.plants}
                type="button"
                className={sheet.plants === p.plants ? "on" : ""}
                onClick={() => handlePresetPlants(p.plants)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="xl-legend small muted">
            <span className="xl-legend-chip"><i className="xl-dot-input" />Editable input cell</span>
            <span className="xl-legend-chip"><i className="xl-dot-fx" />Auto-calculated formula (=)</span>
          </div>
        </div>

        {/* Interactive Formula Bar */}
        <div className="xl-formula-bar" role="status" aria-label="Excel formula bar">
          <span className="xl-cell-ref" data-testid="formula-ref">{activeCell.ref}</span>
          <span className="xl-fx-badge" aria-hidden>fx</span>
          <code className="xl-fx-code" data-testid="formula-expr">{activeCell.formula}</code>
          <span className="xl-fx-eval" data-testid="formula-eval">{activeCell.preview}</span>
        </div>

        {/* Sheet 1: Operating Cost & Savings Ledger */}
        <div className="xl-sheet-head">
          <span>Sheet 1 · Operating Cost &amp; Savings Ledger</span>
          <span className="small muted">Edit blue input cells directly to test your local farm rates &amp; quantities</span>
        </div>

        <div className="tablewrap">
          <table className="tbl xl-table">
            <thead>
              <tr className="xl-col-letters">
                <th className="xl-row-idx" aria-label="Row" />
                <th>A</th>
                <th className="r">B</th>
                <th className="r">C</th>
                <th className="r">D</th>
                <th className="r">E</th>
                <th className="r">F</th>
                <th className="r">G</th>
              </tr>
              <tr className="xl-param-row">
                <th className="xl-row-idx">1</th>
                <th className="xl-param-lbl">Farm Controls</th>
                <th
                  className={`r${selectedRef === "B1" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B1")}
                >
                  <label className="xl-param-field">
                    <span>Active Plants</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      aria-label="Active Tomato Plants (B1)"
                      className="xl-input xl-input-bold"
                      value={sheet.plants}
                      onFocus={() => setSelectedRef("B1")}
                      onChange={(e) => handlePresetPlants(parsePositiveFloat(e.target.value, sheet.plants))}
                    />
                  </label>
                </th>
                <th className="r xl-param-lbl">Cycle Days</th>
                <th
                  className={`r${selectedRef === "D1" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("D1")}
                >
                  <input
                    type="number"
                    min={1}
                    step={1}
                    aria-label="Cycle Length Days (D1)"
                    className="xl-input"
                    value={sheet.cycleDays}
                    onFocus={() => setSelectedRef("D1")}
                    onChange={(e) =>
                      setSheet((prev) => ({
                        ...prev,
                        cycleDays: Math.max(1, Math.round(parsePositiveFloat(e.target.value, prev.cycleDays))),
                      }))
                    }
                  />
                </th>
                <th className="r xl-param-lbl">Rate (៛/$)</th>
                <th
                  className={`r${selectedRef === "F1" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("F1")}
                >
                  <input
                    type="number"
                    min={100}
                    step={10}
                    aria-label="Exchange Rate KHR per USD (F1)"
                    className="xl-input"
                    value={sheet.exchangeRate}
                    onFocus={() => setSelectedRef("F1")}
                    onChange={(e) =>
                      setSheet((prev) => ({
                        ...prev,
                        exchangeRate: Math.max(100, parsePositiveFloat(e.target.value, prev.exchangeRate)),
                      }))
                    }
                  />
                </th>
                <th className="r">
                  <Link className="linkbtn small" to="/crop">{syncedAlertCount} Health alerts</Link>
                </th>
              </tr>
              <tr>
                <th className="xl-row-idx">#</th>
                <th>Cost Item</th>
                <th className="r">AgriRover Qty / Cycle</th>
                <th className="r">Standard Farming Qty</th>
                <th className="r">Local Unit Rate ($)</th>
                <th className="r">AgriRover Cost (=B*D)</th>
                <th className="r">Standard Cost (=C*D)</th>
                <th className="r">Net Savings (=F-E)</th>
              </tr>
            </thead>
            <tbody>
              {calc.rows.map((r) => {
                const n = r.rowNum;
                return (
                  <tr key={r.id}>
                    <td className="xl-row-idx">{n}</td>
                    <td
                      className={selectedRef === `A${n}` ? "xl-cell-selected" : ""}
                      onClick={() => setSelectedRef(`A${n}`)}
                    >
                      <b>{r.label}</b>
                      <div className="small muted">{r.note}</div>
                    </td>
                    <td
                      className={`r nowrap${selectedRef === `B${n}` ? " xl-cell-selected" : ""}`}
                      onClick={() => setSelectedRef(`B${n}`)}
                    >
                      <div className="xl-edit-wrap">
                        <input
                          type="number"
                          min={0}
                          step={r.qtyDecimals === 0 ? 1 : 0.1}
                          aria-label={`${r.label} AgriRover Qty (B${n})`}
                          className="xl-input"
                          value={r.roverQty}
                          onFocus={() => setSelectedRef(`B${n}`)}
                          onChange={(e) => updateRowField(r.id, "roverQty", e.target.value)}
                        />
                        <span className="xl-unit">{r.unit}</span>
                      </div>
                    </td>
                    <td
                      className={`r nowrap${selectedRef === `C${n}` ? " xl-cell-selected" : ""}`}
                      onClick={() => setSelectedRef(`C${n}`)}
                    >
                      <div className="xl-edit-wrap">
                        <input
                          type="number"
                          min={0}
                          step={r.qtyDecimals === 0 ? 1 : 0.1}
                          aria-label={`${r.label} Standard Qty (C${n})`}
                          className="xl-input"
                          value={r.stdQty}
                          onFocus={() => setSelectedRef(`C${n}`)}
                          onChange={(e) => updateRowField(r.id, "stdQty", e.target.value)}
                        />
                        <span className="xl-unit">{r.unit}</span>
                      </div>
                    </td>
                    <td
                      className={`r nowrap${selectedRef === `D${n}` ? " xl-cell-selected" : ""}`}
                      onClick={() => setSelectedRef(`D${n}`)}
                    >
                      <div className="xl-edit-wrap">
                        <span className="xl-unit">$</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          aria-label={`${r.label} Unit Rate USD (D${n})`}
                          className="xl-input xl-input-rate"
                          value={r.unitRateUsd}
                          onFocus={() => setSelectedRef(`D${n}`)}
                          onChange={(e) => updateRowField(r.id, "unitRateUsd", e.target.value)}
                        />
                      </div>
                    </td>
                    <td
                      className={`r nowrap fin-num xl-fx-cell${selectedRef === `E${n}` ? " xl-cell-selected" : ""}`}
                      onClick={() => setSelectedRef(`E${n}`)}
                    >
                      <div><b>${r.roverCostUsd.toFixed(2)}</b></div>
                      <div className="fin-khr">~{r.roverCostRiel.toLocaleString()} ៛</div>
                    </td>
                    <td
                      className={`r nowrap fin-num xl-fx-cell${selectedRef === `F${n}` ? " xl-cell-selected" : ""}`}
                      onClick={() => setSelectedRef(`F${n}`)}
                    >
                      <div className="muted">${r.stdCostUsd.toFixed(2)}</div>
                      <div className="fin-khr">~{r.stdCostRiel.toLocaleString()} ៛</div>
                    </td>
                    <td
                      className={`r nowrap fin-num xl-fx-cell${selectedRef === `G${n}` ? " xl-cell-selected" : ""}`}
                      onClick={() => setSelectedRef(`G${n}`)}
                    >
                      {r.savedUsd === 0 ? (
                        <>
                          <div className="muted">$0.00 (0%)</div>
                          <div className="fin-khr">Fixed input</div>
                        </>
                      ) : (
                        <>
                          <div>
                            <b className="rv-save-num">${r.savedUsd.toFixed(2)}</b>{" "}
                            <Tag kind={r.savedUsd > 0 ? "ok" : "warn"}>{r.savedPct}%</Tag>
                          </div>
                          <div className="fin-khr">~{r.savedRiel.toLocaleString()} ៛</div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Row 8: TOTAL CYCLE COGS */}
              <tr className="rv-total-row xl-sum-row">
                <td className="xl-row-idx">8</td>
                <td colSpan={4}>
                  <b>TOTAL CYCLE COGS</b>
                  <code className="xl-inline-fx">=SUM(E2:E7)</code>
                </td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "E8" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("E8")}
                >
                  <div><b data-testid="cogs-rover-usd">${calc.totalRoverCostUsd.toFixed(2)}</b></div>
                  <div className="fin-khr">~{calc.totalRoverCostRiel.toLocaleString()} ៛</div>
                </td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "F8" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("F8")}
                >
                  <div><b data-testid="cogs-std-usd">${calc.totalStdCostUsd.toFixed(2)}</b></div>
                  <div className="fin-khr">~{calc.totalStdCostRiel.toLocaleString()} ៛</div>
                </td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "G8" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("G8")}
                >
                  <div>
                    <b className="rv-save-num" data-testid="cogs-saved-usd">${calc.totalSavedUsd.toFixed(2)}</b>{" "}
                    <Tag kind="ok">{calc.totalSavedPct}% OPEX</Tag>
                  </div>
                  <div className="fin-khr">~{calc.totalSavedRiel.toLocaleString()} ៛</div>
                </td>
              </tr>

              {/* Row 9: COST PER TOMATO PLANT */}
              <tr className="xl-unit-row">
                <td className="xl-row-idx">9</td>
                <td colSpan={4}>
                  <b>COST PER TOMATO PLANT</b>
                  <code className="xl-inline-fx">=E8/B1</code>
                  <span className="small muted">({sheet.plants.toLocaleString()} active plants)</span>
                </td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "E9" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("E9")}
                >
                  <div><b data-testid="unit-rover-usd">${calc.costPerPlantRoverUsd.toFixed(2)}</b> / plant</div>
                  <div className="fin-khr">~{calc.costPerPlantRoverRiel.toLocaleString()} ៛</div>
                </td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "F9" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("F9")}
                >
                  <div className="muted">${calc.costPerPlantStdUsd.toFixed(2)} / plant</div>
                  <div className="fin-khr">~{calc.costPerPlantStdRiel.toLocaleString()} ៛</div>
                </td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "G9" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("G9")}
                >
                  <div><b className="rv-save-num">${calc.savedPerPlantUsd.toFixed(2)}</b> / plant saved</div>
                  <div className="fin-khr">~{calc.savedPerPlantRiel.toLocaleString()} ៛</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Sheet 2: Harvest, Revenue & Multi-Metric Business Calculator */}
      <Panel
        title="Sheet 2 · Harvest, Revenue & Break-Even Business Calculator"
        icon={Sprout}
        pad={false}
        right={
          <Link className="linkbtn small rowflex" style={{ gap: 4 }} to="/crop">
            <ShieldCheck size={13} aria-hidden />Health risk alerts ({syncedAlertCount})
          </Link>
        }
      >
        <div className="tablewrap">
          <table className="tbl xl-table xl-sheet2">
            <thead>
              <tr className="xl-col-letters">
                <th className="xl-row-idx" aria-label="Row" />
                <th>A</th>
                <th className="r">B</th>
                <th className="r">C</th>
                <th>D</th>
              </tr>
              <tr>
                <th className="xl-row-idx">#</th>
                <th>Business Parameter / Financial Metric</th>
                <th className="r">Input / Calculated Value</th>
                <th className="r">KHR (៛) / Crop Benchmark</th>
                <th>Live Spreadsheet Formula (fx)</th>
              </tr>
            </thead>
            <tbody>
              {/* Inputs Rows 11..13 */}
              <tr>
                <td className="xl-row-idx">11</td>
                <td>
                  <b>Expected Marketable Yield / Plant</b>
                  <span className="xl-tag-in">Input</span>
                </td>
                <td
                  className={`r nowrap${selectedRef === "B11" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B11")}
                >
                  <div className="xl-edit-wrap">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      aria-label="Expected Yield per Plant kg (B11)"
                      className="xl-input"
                      value={sheet.yieldKgPerPlant}
                      onFocus={() => setSelectedRef("B11")}
                      onChange={(e) =>
                        setSheet((prev) => ({
                          ...prev,
                          yieldKgPerPlant: parsePositiveFloat(e.target.value, prev.yieldKgPerPlant),
                        }))
                      }
                    />
                    <span className="xl-unit">kg / plant</span>
                  </div>
                </td>
                <td className="r muted small">Roma / Cherry avg 4.5 kg</td>
                <td><code className="xl-inline-fx">Editable farm target</code></td>
              </tr>

              <tr>
                <td className="xl-row-idx">12</td>
                <td>
                  <b>Farm-Gate Selling Price ($/kg)</b>
                  <span className="xl-tag-in">Input</span>
                </td>
                <td
                  className={`r nowrap${selectedRef === "B12" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B12")}
                >
                  <div className="xl-edit-wrap">
                    <span className="xl-unit">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      aria-label="Selling Price USD per kg (B12)"
                      className="xl-input xl-input-rate"
                      value={sheet.sellingPricePerKg}
                      onFocus={() => setSelectedRef("B12")}
                      onChange={(e) =>
                        setSheet((prev) => ({
                          ...prev,
                          sellingPricePerKg: parsePositiveFloat(e.target.value, prev.sellingPricePerKg),
                        }))
                      }
                    />
                    <span className="xl-unit">/ kg</span>
                  </div>
                </td>
                <td className="r muted small fin-num">
                  ~{Math.round(sheet.sellingPricePerKg * sheet.exchangeRate).toLocaleString()} ៛/kg
                </td>
                <td><code className="xl-inline-fx">Editable market rate</code></td>
              </tr>

              <tr>
                <td className="xl-row-idx">13</td>
                <td>
                  <b>Early-Detected Risk Value Protected</b>
                  <span className="xl-tag-in">Synced · Editable</span>
                </td>
                <td
                  className={`r nowrap${selectedRef === "B13" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B13")}
                >
                  <div className="xl-edit-wrap">
                    <span className="xl-unit">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      aria-label="Early-Detected Risk Value Protected USD (B13)"
                      className="xl-input xl-input-rate"
                      value={sheet.riskProtectedUsd}
                      onFocus={() => setSelectedRef("B13")}
                      onChange={(e) => {
                        setRiskTouched(true);
                        setSheet((prev) => ({
                          ...prev,
                          riskProtectedUsd: parsePositiveFloat(e.target.value, prev.riskProtectedUsd),
                        }));
                      }}
                    />
                  </div>
                </td>
                <td className="r muted small fin-num">
                  ~{convertToRiel(sheet.riskProtectedUsd, sheet.exchangeRate).toLocaleString()} ៛ ({syncedAlertCount} alerts)
                </td>
                <td><code className="xl-inline-fx">Synced from Health ($3.60/alert)</code></td>
              </tr>

              {/* Calculated Rows 14..20 */}
              <tr>
                <td className="xl-row-idx">14</td>
                <td><b>Total Expected Harvest (kg)</b></td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "B14" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B14")}
                >
                  <b data-testid="total-harvest-kg">{num(calc.totalHarvestKg, 1)} kg</b>
                </td>
                <td className="r muted small fin-num">{sheet.plants.toLocaleString()} plants × {sheet.yieldKgPerPlant} kg</td>
                <td><code className="xl-inline-fx">= B1 * B11</code></td>
              </tr>

              <tr>
                <td className="xl-row-idx">15</td>
                <td><b>Projected Gross Revenue</b></td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "B15" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B15")}
                >
                  <b data-testid="gross-revenue-usd">${calc.grossRevenueUsd.toFixed(2)}</b>
                </td>
                <td className="r fin-num">~{calc.grossRevenueRiel.toLocaleString()} ៛</td>
                <td><code className="xl-inline-fx">= B14 * B12</code></td>
              </tr>

              <tr className="xl-highlight-profit">
                <td className="xl-row-idx">16</td>
                <td><b>Net Operating Profit (AgriRover)</b></td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "B16" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B16")}
                >
                  <b className="rv-save-num" data-testid="net-profit-usd">${calc.netProfitUsd.toFixed(2)}</b>
                </td>
                <td className="r fin-num">~{calc.netProfitRiel.toLocaleString()} ៛</td>
                <td><code className="xl-inline-fx">= B15 - E8</code></td>
              </tr>

              <tr>
                <td className="xl-row-idx">17</td>
                <td><b>Net Profit Margin (%)</b></td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "B17" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B17")}
                >
                  <Tag kind={calc.netMarginPct >= 50 ? "ok" : "warn"}>{calc.netMarginPct.toFixed(1)}%</Tag>
                </td>
                <td className="r muted small">Profit share of gross sales</td>
                <td><code className="xl-inline-fx">= B16 / B15</code></td>
              </tr>

              <tr>
                <td className="xl-row-idx">18</td>
                <td><b>Break-Even Selling Price ($/kg)</b></td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "B18" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B18")}
                >
                  <b data-testid="breakeven-price">${calc.breakEvenPricePerKg.toFixed(2)} / kg</b>
                </td>
                <td className="r fin-num muted small">~{calc.breakEvenPriceRielPerKg.toLocaleString()} ៛/kg floor price</td>
                <td><code className="xl-inline-fx">= E8 / B14</code></td>
              </tr>

              <tr>
                <td className="xl-row-idx">19</td>
                <td><b>Break-Even Harvest Yield (kg)</b></td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "B19" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B19")}
                >
                  <b data-testid="breakeven-yield">{num(calc.breakEvenYieldKg, 1)} kg</b>
                </td>
                <td className="r muted small fin-num">{calc.breakEvenYieldPctOfExpected.toFixed(1)}% of expected crop covers all COGS</td>
                <td><code className="xl-inline-fx">= E8 / B12</code></td>
              </tr>

              <tr className="rv-total-row">
                <td className="xl-row-idx">20</td>
                <td><b>Total Economic Advantage (OPEX Saved + Risk Protected)</b></td>
                <td
                  className={`r nowrap fin-num xl-fx-cell${selectedRef === "B20" ? " xl-cell-selected" : ""}`}
                  onClick={() => setSelectedRef("B20")}
                >
                  <b className="rv-save-num" data-testid="total-advantage-usd">${calc.totalEconomicAdvantageUsd.toFixed(2)}</b>
                </td>
                <td className="r fin-num">
                  <b>~{calc.totalEconomicAdvantageRiel.toLocaleString()} ៛</b> / cycle
                </td>
                <td><code className="xl-inline-fx">= G8 + B13</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
