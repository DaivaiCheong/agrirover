import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calculator, Droplets, Pencil, Plus, Sprout, Square, X } from "lucide-react";
import { Empty, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, type Cycle } from "../lib/api";
import { dayLabel, dayMonthYear, suggestedArea } from "../lib/format";
import { useData } from "../lib/useData";
import RowMenu from "../components/RowMenu";
import AddCropModal from "../components/AddCropModal";

export default function Cycles() {
  const [qs, setQs] = useSearchParams();
  const [showAdd, setShowAdd] = useState(qs.get("add") === "true");
  const cycles = useData(api.cycles);
  const crops = useData(api.crops);

  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  // fix the plant count and area of a crop that is already running
  const [editing, setEditing] = useState<string | null>(null);
  const [ePlants, setEPlants] = useState("");
  const [eArea, setEArea] = useState("");
  const [areaTouched, setAreaTouched] = useState(false);

  const perPlant = (c: Cycle) => (crops.data ?? []).find((x) => x.slug === c.crop)?.defaultAreaPerPlantM2 ?? 0.5;

  function startEdit(c: Cycle) {
    setEditing(c.id); setAreaTouched(c.areaM2 !== null);
    setEPlants(c.plantCount?.toString() ?? ""); setEArea(c.areaM2?.toString() ?? "");
  }

  // typing the plant count suggests the bed area until the farmer types an area of their own
  function plantsChanged(c: Cycle, v: string) {
    setEPlants(v);
    const n = Number(v);
    if (!areaTouched && Number.isInteger(n) && n > 0) setEArea(String(suggestedArea(n, perPlant(c))));
  }

  async function end(id: string, label: string) {
    if (!window.confirm(`End the crop on ${label} today? Its costs and harvest stay, and you can still read its cost report.`)) return;
    try { await api.closeCycle(id); cycles.reload(); } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  async function saveEdit(id: string) {
    try {
      await api.updateCycle(id, { plantCount: ePlants === "" ? undefined : Number(ePlants),
                                  areaM2: eArea === "" ? undefined : Number(eArea) });
      setEditing(null);
      cycles.reload();
    } catch (err) {
      setMsg({ kind: "alert", text: (err as Error).message });
    }
  }

  const planLink = (c: Cycle) =>
    `/plan?${new URLSearchParams({ crop: c.crop, plants: String(c.plantCount ?? ""), date: c.plantedOn })}`;
  const rows = cycles.data ?? [];

  return (
    <>
      <PageHead icon={Sprout} title="My crops"
                actions={<button className="btn" onClick={() => setShowAdd(true)}><Plus size={18} aria-hidden />Add crop</button>} />
      <main className="main stack">
        {cycles.error && <Notice kind="alert">Cannot reach the farm server ({cycles.error}).</Notice>}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

        <Panel title="Crops" icon={Sprout} pad={false}>
          {rows.length === 0 ? (
            <Empty icon={Sprout}>
              No crop yet.
              <button className="btn" onClick={() => setShowAdd(true)} style={{ marginTop: 6 }}><Plus size={18} aria-hidden />Add your first crop</button>
            </Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl crops">
                <thead><tr><th>Bed</th><th>Crop</th><th className="nowrap">Planted</th><th>Status</th><th className="r nowrap">Plants</th>
                  <th className="r nowrap">Area m²</th><th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.bedLabel}</b>{c.trialArm && <> <Tag kind="info">{c.trialArm}</Tag></>}</td>
                      <td data-label="Crop">{c.cropName}{c.variety ? ` (${c.variety})` : ""}
                        {c.setupLabel && <div className="mono-sm muted">{c.setupLabel}</div>}</td>
                      <td data-label="Planted" className="nowrap">{dayMonthYear(c.plantedOn)}</td>
                      <td data-label="Status" className="nowrap">{c.status === "active" ? <Tag kind="ok">{dayLabel(c)}</Tag> : <Tag>Closed {c.endedOn}</Tag>}</td>
                      <td data-label="Plants" className="r nowrap">{editing === c.id
                        ? <input className="cell-input" type="number" min={1} value={ePlants} autoFocus
                                 onChange={(e) => plantsChanged(c, e.target.value)} aria-label="Plants" />
                        : c.plantCount ?? <Tag kind="warn">Add plants</Tag>}</td>
                      <td data-label="Area m²" className="r nowrap">{editing === c.id
                        ? <input className="cell-input" type="number" min={0} step="any" value={eArea}
                                 onChange={(e) => { setEArea(e.target.value); setAreaTouched(true); }} aria-label="Area" />
                        : c.areaM2 ?? <span className="muted">—</span>}</td>
                      <td className="act">
                        {/* while editing, only Save and Cancel: nothing else can be pressed by mistake */}
                        {editing === c.id ? (
                          <div className="rowactions">
                            <button className="btn btn-sm" onClick={() => saveEdit(c.id)}>Save</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}><X size={15} aria-hidden />Cancel</button>
                          </div>
                        ) : (
                          <RowMenu items={[
                            { label: "Plants and area", icon: Pencil, onSelect: () => startEdit(c) },
                            c.plantCount ? { label: "Water plan", icon: Droplets, to: planLink(c) } : null,
                            { label: "Cost report", icon: Calculator, to: `/cycles/${c.id}` },
                            c.status === "active" && "separator",
                            c.status === "active" && { label: "End crop", icon: Square, danger: true, onSelect: () => end(c.id, c.bedLabel) },
                          ]} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
      <AddCropModal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setQs({}, { replace: true }); }}
        onAdded={() => cycles.reload()}
      />
    </>
  );
}
