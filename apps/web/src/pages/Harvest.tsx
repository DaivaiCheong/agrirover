import { useMemo, useState } from "react";
import { Wheat } from "lucide-react";
import { SyncBadge } from "../components/SampleNotice";
import { Empty, Kpis, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { num } from "../lib/format";
import { buildDemoTomatoFarm } from "../lib/roverDemo";
import { buildAllBlockEconomics, usdToRiel } from "../lib/tomatoFinance";
import { useData } from "../lib/useData";

export default function Harvest() {
  const cycles = useData(api.cycles);
  const zones = useData(api.zones);
  const conditions = useData(api.conditions);
  const previewMode = Boolean((cycles.error && cycles.data === null) || (zones.error && zones.data === null));
  const demo = useMemo(() => buildDemoTomatoFarm(), []);

  const activeCycles = previewMode ? demo.cycles : (cycles.data ?? demo.cycles);
  const activeZones = previewMode ? demo.zones : (zones.data ?? demo.zones);
  const activeConds = previewMode ? demo.conditions : (conditions.data ?? demo.conditions);

  const [selectedZone, setSelectedZone] = useState("all");

  const { blocks } = useMemo(
    () =>
      buildAllBlockEconomics({
        cycles: activeCycles,
        zones: activeZones,
        conditions: activeConds,
        roundsByZone: demo.roundsByZone,
      }),
    [activeCycles, activeZones, activeConds, demo.roundsByZone],
  );

  const harvestRows = useMemo(() => {
    const out: { zone: string; label: string; variety: string; date: string; kgTotal: number; kgMarketable: number; kgLost: number; note: string | null }[] = [];
    for (const c of activeCycles) {
      if (selectedZone !== "all" && c.zone !== selectedZone) continue;
      const hs = demo.harvestsByZone.get(c.zone) ?? [];
      for (const h of hs) {
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
  }, [activeCycles, demo.harvestsByZone, selectedZone]);

  const saleRows = useMemo(() => {
    const out: { zone: string; label: string; date: string; kg: number; pricePerKg: number; amountUsd: number; buyer: string | null }[] = [];
    for (const c of activeCycles) {
      if (selectedZone !== "all" && c.zone !== selectedZone) continue;
      const ss = demo.salesByZone.get(c.zone) ?? [];
      for (const s of ss) {
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
  }, [activeCycles, demo.salesByZone, selectedZone]);

  const scopedBlocks = selectedZone === "all" ? blocks : blocks.filter((b) => b.zone === selectedZone);
  const expectedYieldKg = scopedBlocks.reduce((s, b) => s + b.expectedYieldKg, 0);
  const projectedRevenueUsd = scopedBlocks.reduce((s, b) => s + b.projectedRevenueUsd, 0);
  const projectedRevenueRiel = scopedBlocks.reduce((s, b) => s + b.projectedRevenueRiel, 0);
  const harvestedKg = harvestRows.reduce((s, h) => s + h.kgTotal, 0);
  const soldUsd = saleRows.reduce((s, x) => s + x.amountUsd, 0);

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      <Panel
        title="Tomato Harvest & Revenue"
        icon={Wheat}
        pad={false}
        right={
          <div className="rv-right">
            <SyncBadge />
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
              { k: "Harvested so far", v: `${num(harvestedKg, 1)} kg`, d: "Early ripening flushes (G3–G5)" },
              { k: "Sales logged", v: `$${soldUsd.toFixed(2)}`, d: `~${usdToRiel(soldUsd).toLocaleString()} ៛` },
              { k: "Projected cycle revenue", v: `$${projectedRevenueUsd.toFixed(2)}`, d: `~${projectedRevenueRiel.toLocaleString()} ៛ (@ $0.80/kg)` },
            ]}
          />
        </div>
      </Panel>

      <div className="grid g2">
        <Panel title="Logged Tomato Harvests" pad={false}>
          {harvestRows.length === 0 ? (
            <Empty>Selected beds are in flowering or fruit-sizing stage (no harvest logged yet).</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Block</th>
                    <th className="r">Picked kg</th>
                    <th className="r">Marketable kg</th>
                    <th className="r">Lost kg</th>
                  </tr>
                </thead>
                <tbody>
                  {harvestRows.map((h, i) => (
                    <tr key={`${h.zone}-${i}`}>
                      <td className="nowrap"><b>{h.date}</b></td>
                      <td data-label="Block">
                        <b>{h.label}</b>
                        <div className="small muted">{h.variety}{h.note ? ` · ${h.note}` : ""}</div>
                      </td>
                      <td data-label="Picked kg" className="r">{num(h.kgTotal, 1)}</td>
                      <td data-label="Marketable kg" className="r"><b>{num(h.kgMarketable, 1)}</b></td>
                      <td data-label="Lost kg" className="r"><Tag kind="ok">{num(h.kgLost, 1)} kg</Tag></td>
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
              <table className="tbl fold">
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
                      <td data-label="Block & Buyer">
                        <b>{s.label}</b>
                        <div className="small muted">{s.buyer ?? "Direct buyer"}</div>
                      </td>
                      <td data-label="Sold kg" className="r">{num(s.kg, 1)}</td>
                      <td data-label="Price / kg" className="r">${s.pricePerKg.toFixed(2)}</td>
                      <td data-label="Total" className="r nowrap">
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
