import { useState } from "react";
import { Link } from "react-router-dom";
import { Empty, Field, Notice, PageHead, Panel, Tag } from "../components/ui";
import { api } from "../lib/api";
import { todayIso } from "../lib/format";
import { useData } from "../lib/useData";

const NEW_BED = "__new__";

export default function Cycles() {
  const cycles = useData(api.cycles);
  const beds = useData(api.zones);
  const crops = useData(api.crops);

  const [bed, setBed] = useState("");
  const [bedLabel, setBedLabel] = useState("");
  const [crop, setCrop] = useState("");
  const [plantedOn, setPlantedOn] = useState(todayIso());
  const [plants, setPlants] = useState("");
  const [area, setArea] = useState("");
  const [variety, setVariety] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  // fix the plant count and area of a cycle that is already running
  const [editing, setEditing] = useState<string | null>(null);
  const [ePlants, setEPlants] = useState("");
  const [eArea, setEArea] = useState("");

  const [cName, setCName] = useState("");
  const [kc, setKc] = useState({ ini: "", mid: "", end: "" });
  const [stages, setStages] = useState(["", "", "", ""]);
  const [cMsg, setCMsg] = useState<{ kind: "ok" | "alert"; text: string } | null>(null);

  const beingAdded = bed === NEW_BED || (bed === "" && (beds.data ?? []).length === 0);
  const num = (v: string) => (v === "" ? undefined : Number(v));

  async function start(e: React.FormEvent) {
    e.preventDefault();
    try {
      let zone = bed;
      if (beingAdded) {
        zone = (await api.addBed({ label: bedLabel, areaM2: num(area) })).name;
      }
      await api.addCycle({ zone, crop: crop || (crops.data?.[0]?.slug ?? ""), plantedOn, plantCount: num(plants),
                           areaM2: num(area), variety: variety || undefined });
      setMsg({ kind: "ok", text: "Cycle started." });
      setBedLabel(""); setPlants(""); setVariety("");
      cycles.reload(); beds.reload();
    } catch (err) {
      setMsg({ kind: "alert", text: (err as Error).message });
    }
  }

  async function close(id: string, label: string) {
    if (!window.confirm(`Close the cycle on ${label} today? Costs and harvest stay; you can still read the report.`)) return;
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
      setCMsg({ kind: "ok", text: `${made.name} added.` });
      setCName(""); setKc({ ini: "", mid: "", end: "" }); setStages(["", "", "", ""]);
      crops.reload();
    } catch (err) {
      setCMsg({ kind: "alert", text: (err as Error).message });
    }
  }

  const rows = cycles.data ?? [];

  return (
    <>
      <PageHead crumb="CROP CYCLES" kicker="ONE CROP, ONE BED, FROM PLANTING TO LAST HARVEST" title="CROP CYCLES" />
      <main className="main stack">
        {cycles.error && <Notice kind="alert">Cannot reach the farm server ({cycles.error}).</Notice>}

        <Panel title="CYCLES" pad={false}>
          {rows.length === 0 ? <Empty>No crop cycle yet. Start one below.</Empty> : (
            <table className="tbl">
              <thead><tr><th>BED</th><th>CROP</th><th>PLANTED</th><th>STATUS</th><th className="r">PLANTS</th>
                <th className="r">AREA m²</th><th /></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.bedLabel}</b>{c.trialArm && <> <Tag kind="info">{c.trialArm}</Tag></>}</td>
                    <td>{c.cropName}{c.variety ? ` (${c.variety})` : ""}</td>
                    <td>{c.plantedOn}</td>
                    <td>{c.status === "active" ? <Tag kind="ok">DAY {c.day}</Tag> : <Tag>CLOSED {c.endedOn}</Tag>}</td>
                    <td className="r">{editing === c.id
                      ? <input className="cell-input" type="number" min={1} value={ePlants} onChange={(e) => setEPlants(e.target.value)} aria-label="Plants" />
                      : c.plantCount ?? "—"}</td>
                    <td className="r">{editing === c.id
                      ? <input className="cell-input" type="number" min={0} step="any" value={eArea} onChange={(e) => setEArea(e.target.value)} aria-label="Area" />
                      : c.areaM2 ?? "—"}</td>
                    <td className="act">
                      {editing === c.id ? (
                        <><button className="linkbtn" onClick={() => saveEdit(c.id)}>Save</button> · <button className="linkbtn" onClick={() => setEditing(null)}>Cancel</button></>
                      ) : (
                        <><button className="linkbtn" onClick={() => { setEditing(c.id); setEPlants(c.plantCount?.toString() ?? ""); setEArea(c.areaM2?.toString() ?? ""); }}>Edit</button> · </>
                      )}
                      <Link to={`/cycles/${c.id}`} className="linkbtn">Cost report</Link>
                      {c.status === "active" && <> · <button className="linkbtn" onClick={() => close(c.id, c.bedLabel)}>Close</button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div className="grid g2">
          <Panel title="START A CYCLE">
            <form className="form" onSubmit={start}>
              <Field label="BED">
                <select value={beingAdded ? NEW_BED : bed} onChange={(e) => setBed(e.target.value)}>
                  {(beds.data ?? []).length > 0 && <option value="">Choose a bed…</option>}
                  {(beds.data ?? []).map((b) => <option key={b.zone} value={b.zone}>{b.label ?? b.zone}</option>)}
                  <option value={NEW_BED}>+ A new bed</option>
                </select>
              </Field>
              {beingAdded && <Field label="NAME OF THE NEW BED"><input required value={bedLabel} onChange={(e) => setBedLabel(e.target.value)} /></Field>}
              <Field label="CROP">
                <select value={crop || (crops.data?.[0]?.slug ?? "")} onChange={(e) => setCrop(e.target.value)}>
                  {(crops.data ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </Field>
              <div className="row2">
                <Field label="PLANTING DATE"><input type="date" required value={plantedOn} onChange={(e) => setPlantedOn(e.target.value)} /></Field>
                <Field label="VARIETY (OPTIONAL)"><input value={variety} onChange={(e) => setVariety(e.target.value)} /></Field>
              </div>
              <div className="row2">
                <Field label="HOW MANY PLANTS"><input type="number" min={1} value={plants} onChange={(e) => setPlants(e.target.value)} /></Field>
                <Field label="AREA (m²)"><input type="number" min={0} step="any" value={area} onChange={(e) => setArea(e.target.value)} /></Field>
              </div>
              <div><button className="btn">Start cycle</button></div>
            </form>
            {msg && <div style={{ marginTop: 12 }}><Notice kind={msg.kind}>{msg.text}</Notice></div>}
            <p className="mono-sm" style={{ color: "var(--ink-muted)", marginTop: 12 }}>
              Without a plant count and area the report cannot show cost per plant or per m², and says so.
            </p>
          </Panel>

          <Panel title="ADD A CROP">
            <p className="mono-sm" style={{ color: "var(--ink-muted)", marginBottom: 12 }}>
              Any crop works. Its water numbers (crop factor and stage lengths) feed the water planner.
              Numbers you enter are marked "entered by the farmer, not checked".
            </p>
            <form className="form" onSubmit={addCrop}>
              <Field label="CROP NAME"><input required value={cName} onChange={(e) => setCName(e.target.value)} /></Field>
              <div className="row3">
                {(["ini", "mid", "end"] as const).map((k) => (
                  <Field key={k} label={`Kc ${k.toUpperCase()}`}>
                    <input type="number" step="any" min={0.01} max={2} required value={kc[k]}
                           onChange={(e) => setKc({ ...kc, [k]: e.target.value })} />
                  </Field>
                ))}
              </div>
              <div className="row2">
                {["INITIAL", "DEVELOPMENT", "MID-SEASON", "LATE"].map((name, i) => (
                  <Field key={name} label={`${name} (DAYS)`}>
                    <input type="number" min={1} max={400} required value={stages[i]}
                           onChange={(e) => setStages(stages.map((s, j) => (j === i ? e.target.value : s)))} />
                  </Field>
                ))}
              </div>
              <div><button className="btn btn-ghost">Add crop</button></div>
            </form>
            {cMsg && <div style={{ marginTop: 12 }}><Notice kind={cMsg.kind}>{cMsg.text}</Notice></div>}
          </Panel>
        </div>
      </main>
    </>
  );
}
