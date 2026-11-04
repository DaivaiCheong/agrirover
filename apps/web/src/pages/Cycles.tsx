import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, Sprout } from "lucide-react";
import { Empty, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, type Cycle } from "../lib/api";
import { dayLabel, dayMonthYear, suggestedArea } from "../lib/format";
import { useData } from "../lib/useData";

/** Links in a row, with a dot between each. */
const Dotted = ({ items }: { items: ReactNode[] }) => (
  <>{items.map((x, i) => <Fragment key={i}>{i > 0 && " · "}{x}</Fragment>)}</>
);

export default function Cycles() {
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
      <PageHead icon={Sprout} title="My crops" sub="Every crop you are growing or have grown, one bed at a time."
                actions={<Link className="btn" to="/plan"><Plus size={18} aria-hidden />Plan a new crop</Link>} />
      <main className="main stack">
        {cycles.error && <Notice kind="alert">Cannot reach the farm server ({cycles.error}).</Notice>}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

        <Panel title="Crops" icon={Sprout} pad={false}>
          {rows.length === 0 ? (
            <Empty icon={Sprout}>
              No crop yet. Plan one: tell us how many plants and we do the rest.
              <Link className="btn" to="/plan" style={{ marginTop: 6 }}><Plus size={18} aria-hidden />Plan your first crop</Link>
            </Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Bed</th><th>Crop</th><th>Planted</th><th>Status</th><th className="r">Plants</th>
                  <th className="r">Area m²</th><th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.bedLabel}</b>{c.trialArm && <> <Tag kind="info">{c.trialArm}</Tag></>}</td>
                      <td>{c.cropName}{c.variety ? ` (${c.variety})` : ""}</td>
                      <td>{dayMonthYear(c.plantedOn)}</td>
                      <td>{c.status === "active" ? <Tag kind="ok">{dayLabel(c)}</Tag> : <Tag>Closed {c.endedOn}</Tag>}</td>
                      <td className="r">{editing === c.id
                        ? <input className="cell-input" type="number" min={1} value={ePlants} autoFocus
                                 onChange={(e) => plantsChanged(c, e.target.value)} aria-label="Plants" />
                        : c.plantCount ?? <span className="muted">not set</span>}</td>
                      <td className="r">{editing === c.id
                        ? <input className="cell-input" type="number" min={0} step="any" value={eArea}
                                 onChange={(e) => { setEArea(e.target.value); setAreaTouched(true); }} aria-label="Area" />
                        : c.areaM2 ?? <span className="muted">not set</span>}</td>
                      <td className="act">
                        {/* while editing, only Save and Cancel: nothing else can be pressed by mistake */}
                        {editing === c.id ? (
                          <Dotted items={[
                            <button className="linkbtn" onClick={() => saveEdit(c.id)}>Save</button>,
                            <button className="linkbtn" onClick={() => setEditing(null)}>Cancel</button>,
                          ]} />
                        ) : (
                          <Dotted items={[
                            <button className="linkbtn" onClick={() => startEdit(c)}>Set plants and area</button>,
                            ...(c.plantCount ? [<Link to={planLink(c)} className="linkbtn">Water plan</Link>] : []),
                            <Link to={`/cycles/${c.id}`} className="linkbtn">Cost report</Link>,
                            ...(c.status === "active"
                              ? [<button className="linkbtn linkbtn-alert" onClick={() => end(c.id, c.bedLabel)}>End crop</button>] : []),
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
        {rows.some((c) => c.status === "active" && !c.plantCount) && (
          <Notice kind="warn">
            A crop without a plant count has no water plan, and its report cannot show cost per plant. Press "Set plants and
            area". The area fills in from the plant count; change it if your bed is a different size.
          </Notice>
        )}
        <p className="small muted">
          To grow something that is not on the list, choose "A crop that is not in the list" in Plan a crop.
        </p>
      </main>
    </>
  );
}
