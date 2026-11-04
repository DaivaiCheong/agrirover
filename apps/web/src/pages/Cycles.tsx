import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Sprout } from "lucide-react";
import { Empty, Field, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api, type Cycle } from "../lib/api";
import { dayLabel, dayMonthYear } from "../lib/format";
import { useData } from "../lib/useData";

export default function Cycles() {
  const cycles = useData(api.cycles);
  const crops = useData(api.crops);

  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  // fix the plant count and area of a crop that is already running
  const [editing, setEditing] = useState<string | null>(null);
  const [ePlants, setEPlants] = useState("");
  const [eArea, setEArea] = useState("");

  const [cName, setCName] = useState("");
  const [kc, setKc] = useState({ ini: "", mid: "", end: "" });
  const [stages, setStages] = useState(["", "", "", ""]);
  const [cMsg, setCMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  async function close(id: string, label: string) {
    if (!window.confirm(`Close the crop on ${label} today? Costs and harvest stay; you can still read the report.`)) return;
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

  async function addCrop(e: React.FormEvent) {
    e.preventDefault();
    try {
      const made = await api.addCrop({ name: cName, kc: { ini: Number(kc.ini), mid: Number(kc.mid), end: Number(kc.end) },
                                       stageDays: stages.map(Number) });
      setCMsg({ kind: "ok", text: `${made.name} added. It now shows in Plan a crop.` });
      setCName(""); setKc({ ini: "", mid: "", end: "" }); setStages(["", "", "", ""]);
      crops.reload();
    } catch (err) {
      setCMsg({ kind: "alert", text: (err as Error).message });
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
                        ? <input className="cell-input" type="number" min={1} value={ePlants} onChange={(e) => setEPlants(e.target.value)} aria-label="Plants" />
                        : c.plantCount ?? <span className="muted">not set</span>}</td>
                      <td className="r">{editing === c.id
                        ? <input className="cell-input" type="number" min={0} step="any" value={eArea} onChange={(e) => setEArea(e.target.value)} aria-label="Area" />
                        : c.areaM2 ?? <span className="muted">not set</span>}</td>
                      <td className="act">
                        {editing === c.id ? (
                          <><button className="linkbtn" onClick={() => saveEdit(c.id)}>Save</button> · <button className="linkbtn" onClick={() => setEditing(null)}>Cancel</button></>
                        ) : (
                          <><button className="linkbtn" onClick={() => { setEditing(c.id); setEPlants(c.plantCount?.toString() ?? ""); setEArea(c.areaM2?.toString() ?? ""); }}>Set plants</button> · </>
                        )}
                        {c.plantCount && <><Link to={planLink(c)} className="linkbtn">Water plan</Link> · </>}
                        <Link to={`/cycles/${c.id}`} className="linkbtn">Cost report</Link>
                        {c.status === "active" && <> · <button className="linkbtn" onClick={() => close(c.id, c.bedLabel)}>Close</button></>}
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
            A crop without a plant count has no water plan, and its report cannot show cost per plant. Press "Set plants".
          </Notice>
        )}

        <Panel>
          <details className="more">
            <summary><Plus size={17} aria-hidden /> Grow something that is not in the list</summary>
            <p className="small muted" style={{ margin: "10px 0 12px" }}>
              Tomato comes with a researched growing guide. Any other crop needs its water numbers (crop factor and stage
              lengths), which an agronomist or the FAO-56 tables can give you. What you enter is marked "entered by the farmer, not checked".
            </p>
            <form className="form" onSubmit={addCrop} style={{ maxWidth: 560 }}>
              <Field label="Crop name"><input required value={cName} onChange={(e) => setCName(e.target.value)} /></Field>
              <div className="row3">
                {(["ini", "mid", "end"] as const).map((k) => (
                  <Field key={k} label={`Kc ${k}`}>
                    <input type="number" step="any" min={0.01} max={2} required value={kc[k]}
                           onChange={(e) => setKc({ ...kc, [k]: e.target.value })} />
                  </Field>
                ))}
              </div>
              <div className="row2">
                {["Initial", "Development", "Mid-season", "Late"].map((name, i) => (
                  <Field key={name} label={`${name} stage (days)`}>
                    <input type="number" min={1} max={400} required value={stages[i]}
                           onChange={(e) => setStages(stages.map((s, j) => (j === i ? e.target.value : s)))} />
                  </Field>
                ))}
              </div>
              <div><button className="btn btn-ghost">Add crop</button></div>
            </form>
            {cMsg && <div style={{ marginTop: 12 }}><Notice kind={cMsg.kind}>{cMsg.text}</Notice></div>}
          </details>
        </Panel>
      </main>
    </>
  );
}
