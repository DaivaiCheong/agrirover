import { useMemo, useState } from "react";
import { Wheat } from "lucide-react";
import { Empty, Kpis, Notice, Panel, Tag } from "../components/ui";
import { api, loadProblem } from "../lib/api";
import { num } from "../lib/format";
import { buildAllBlockEconomics, usdToRiel } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";
import { useLatestRoundsByZone } from "../lib/useLatestRounds";

export default function Harvest() {
  const cycles = useData(api.cycles);
  const zones = useData(api.zones);
  const conditions = useData(api.conditions);
  const surveys = useData(api.surveys);

  const activeCycles = cycles.data ?? [];
  const activeZones = zones.data ?? [];
  const activeConds = conditions.data ?? [];
  const { roundsByZone } = useLatestRoundsByZone(surveys.data ?? []);

  const [selectedZone, setSelectedZone] = useState("all");

  const cycleKey = activeCycles.map((c) => c.id).join(",");
  const ledgerData = useData(async () => {
    if (!activeCycles.length) return { harvests: [], sales: [] };
    const [hLists, sLists] = await Promise.all([
      Promise.all(activeCycles.map(async (c) => ({ cycle: c, items: await api.harvests(c.id) }))),
      Promise.all(activeCycles.map(async (c) => ({ cycle: c, items: await api.sales(c.id) }))),
    ]);
    return { harvests: hLists, sales: sLists };
  }, [cycleKey]);

  const { blocks } = useMemo(
    () =>
      buildAllBlockEconomics({
        cycles: activeCycles,
        zones: activeZones,
        conditions: activeConds,
        roundsByZone,
      }),
    [activeCycles, activeZones, activeConds, roundsByZone],
  );

  const harvestRows = useMemo(() => {
    const out: { zone: string; label: string; variety: string; date: string; kgTotal: number; kgMarketable: number; kgLost: number; note: string | null }[] = [];
    for (const entry of ledgerData.data?.harvests ?? []) {
      const c = entry.cycle;
      if (selectedZone !== "all" && c.zone !== selectedZone) continue;
      for (const h of entry.items) {
        out.push({
          zone: c.zone,
          label: c.bedLabel,
          variety: c.variety ?? "Tomato",
          date: h.date,
          kgTotal: h.kgTotal,
          kgMarketable: h.kgMarketable,
          kgLost: h.kgLost,
          note: h.note,
        });
      }
    }
    return out;
  }, [ledgerData.data, selectedZone]);

  const saleRows = useMemo(() => {
    const out: { zone: string; label: string; date: string; kg: number; pricePerKg: number; amountUsd: number; buyer: string | null }[] = [];
    for (const entry of ledgerData.data?.sales ?? []) {
      const c = entry.cycle;
      if (selectedZone !== "all" && c.zone !== selectedZone) continue;
      for (const s of entry.items) {
        out.push({
          zone: c.zone,
          label: c.bedLabel,
          date: s.date,
          kg: s.kg,
          pricePerKg: s.pricePerKg,
          amountUsd: s.amountUsd,
          buyer: s.buyer,
        });
      }
    }
    return out;
  }, [ledgerData.data, selectedZone]);

  const scopedBlocks = selectedZone === "all" ? blocks : blocks.filter((b) => b.zone === selectedZone);
  const expectedYieldKg = scopedBlocks.reduce((s, b) => s + b.expectedYieldKg, 0);
  const projectedRevenueUsd = scopedBlocks.reduce((s, b) => s + b.projectedRevenueUsd, 0);
  const projectedRevenueRiel = scopedBlocks.reduce((s, b) => s + b.projectedRevenueRiel, 0);
  const harvestedKg = harvestRows.reduce((s, h) => s + h.kgTotal, 0);
  const soldUsd = saleRows.reduce((s, x) => s + x.amountUsd, 0);
  const pageError = cycles.error ?? zones.error ?? ledgerData.error;

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {pageError && <Notice kind="alert">{loadProblem(pageError)}</Notice>}

      <Panel
        title="Tomato Harvest & Revenue"
        icon={Wheat}
        pad={false}
        right={
          <div className="rv-right">
            <select
              className="erp-select toolbar-select"
              aria-label="Filter by tomato block"
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
            >
              <option value="all">All blocks (G1–G6)</option>
              {activeCycles.map((c) => (
                <option key={c.id} value={c.zone}>
                  {c.bedLabel} · {c.variety ?? "Tomato"}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="panel-pad">
          <Kpis
            items={[
              { k: "Expected cycle yield", v: `${num(expectedYieldKg, 1)} kg`, d: "Target ~4.5 kg / tomato plant" },
              { k: "Harvested so far", v: `${num(harvestedKg, 1)} kg`, d: "Logged in MongoDB harvests" },
              { k: "Sales logged", v: `$${soldUsd.toFixed(2)}`, d: `~${usdToRiel(soldUsd).toLocaleString()} ៛` },
              { k: "Projected cycle revenue", v: `$${projectedRevenueUsd.toFixed(2)}`, d: `~${projectedRevenueRiel.toLocaleString()} ៛ (@ $0.80/kg)` },
            ]}
          />
        </div>
      </Panel>

      <div className="grid g2">
        <Panel title="Logged Tomato Harvests" pad={false}>
          {harvestRows.length === 0 ? (
            <Empty>Selected beds have no logged harvests yet.</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold fin-sub-tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Block</th>
                    <th className="r">Picked</th>
                    <th className="r">Marketable</th>
                    <th className="r">Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {harvestRows.map((h, i) => (
                    <tr key={`${h.zone}-${i}`}>
                      <td className="nowrap"><b>{h.date}</b></td>
                      <td data-label="Block" className="fin-col-stage">
                        <b>{h.label}</b>
                        <div className="small muted">{h.variety}{h.note ? ` · ${h.note}` : ""}</div>
                      </td>
                      <td data-label="Picked" className="r nowrap fin-num">{num(h.kgTotal, 1)} kg</td>
                      <td data-label="Marketable" className="r nowrap fin-num"><b>{num(h.kgMarketable, 1)} kg</b></td>
                      <td data-label="Lost" className="r nowrap fin-num"><Tag kind="ok">{num(h.kgLost, 1)} kg</Tag></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Tomato Sales Ledger" pad={false}>
          {saleRows.length === 0 ? (
            <Empty>No sales logged yet for this block selection.</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold fin-sub-tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Block &amp; Buyer</th>
                    <th className="r">Sold kg</th>
                    <th className="r">Price / kg</th>
                    <th className="r">Total ($ / ៛)</th>
                  </tr>
                </thead>
                <tbody>
                  {saleRows.map((s, i) => (
                    <tr key={`${s.zone}-${i}`}>
                      <td className="nowrap"><b>{s.date}</b></td>
                      <td data-label="Block & Buyer" className="fin-col-stage">
                        <b>{s.label}</b>
                        <div className="small muted">{s.buyer ?? "Direct buyer"}</div>
                      </td>
                      <td data-label="Sold kg" className="r nowrap fin-num">{num(s.kg, 1)} kg</td>
                      <td data-label="Price / kg" className="r nowrap fin-num">${s.pricePerKg.toFixed(2)}</td>
                      <td data-label="Total" className="r nowrap fin-num">
                        <b>${s.amountUsd.toFixed(2)}</b>
                        <div className="small muted">~{usdToRiel(s.amountUsd).toLocaleString()} ៛</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
