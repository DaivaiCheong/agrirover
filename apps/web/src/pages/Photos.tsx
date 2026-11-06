import { useState, type FormEvent } from "react";
import { Camera, Download, Images } from "lucide-react";
import { Link } from "react-router-dom";
import { EF, Empty, FormModal, Kpis, More, Notice, Panel, Tag, Toolbar, type FormMsg } from "../components/ui";
import { api, loadProblem, photoExportUrl, photoImageUrl, type SavedPhoto } from "../lib/api";
import { useData } from "../lib/useData";

const STATUS = [{ id: "to_confirm", label: "To confirm" }, { id: "confirmed", label: "Confirmed" }, { id: "all", label: "All" }] as const;

export default function Photos() {
  const [status, setStatus] = useState<(typeof STATUS)[number]["id"]>("to_confirm");
  const lib = useData(() => api.photos(status), [status]);
  const labels = useData(api.photoLabels);
  const [open, setOpen] = useState<SavedPhoto | null>(null);
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<FormMsg>(null);
  const [listError, setListError] = useState<string | null>(null);

  const titles = new Map((labels.data?.labels ?? []).map((l) => [l.id, l.title]));
  const titleOf = (id: string | null) => (id ? titles.get(id) ?? id : "—");
  const rows = lib.data?.photos ?? [];
  const progress = lib.data?.progress ?? [];

  function openFor(p: SavedPhoto) {
    setOpen(p); setLabel(p.expertLabel ?? p.farmerLabel ?? ""); setNote(p.expertNote ?? ""); setMsg(null);
    if (p.expertName) setName(p.expertName);
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!open) return;
    try {
      await api.confirmPhoto(open.id, { label, name, note: note || null });
      setOpen(null);
      lib.reload();
    } catch (err) { setMsg({ kind: "alert", text: (err as Error).message }); }
  }

  async function remove(p: SavedPhoto) {
    if (!window.confirm("Delete this photo and what it was labelled? This cannot be undone.")) return;
    try { await api.deletePhoto(p.id); setListError(null); lib.reload(); }
    catch (err) { setListError((err as Error).message); }
  }

  return (
    <>
      <Toolbar>
        <select className="erp-select toolbar-select" aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <a className="btn btn-sm btn-ghost" href={photoExportUrl("to_confirm")}><Download size={16} aria-hidden />To confirm</a>
        <a className="btn btn-sm btn-ghost" href={photoExportUrl("confirmed")}><Download size={16} aria-hidden />Confirmed</a>
        <Link className="btn btn-sm" to="/crop"><Camera size={16} aria-hidden />Add a photo</Link>
      </Toolbar>
      <main className="main stack">
        {lib.error && <Notice kind="alert">{loadProblem(lib.error)}</Notice>}
        {listError && <Notice kind="alert">{listError}</Notice>}

        <Kpis items={[
          { k: "Saved", v: lib.data?.saved ?? "—" },
          { k: "To confirm", v: lib.data?.toConfirm ?? "—" },
          { k: "Confirmed", v: lib.data?.confirmed ?? "—" },
          { k: "Problems ready to test", v: `${progress.filter((p) => p.ready).length} of ${progress.length}` },
        ]} />

        <Panel title="Photos" pad={false} right={<span className="small muted">Only a confirmed label can train a model</span>}>
          {rows.length === 0 ? (
            <Empty icon={Images}>{status === "to_confirm" ? "Nothing waiting to be confirmed." : "No photos here yet."}</Empty>
          ) : (
            <div className="tablewrap">
              <table className="tbl fold photo-t">
                <thead><tr><th>Photo</th><th>Block</th><th>Taken</th><th>Farmer</th><th>Model</th><th>Expert</th><th /></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td><img className="photo-thumb" loading="lazy" src={photoImageUrl(p.id)} alt={`${p.part} from ${p.zoneLabel ?? "a block"}`} /></td>
                      <td data-label="Block"><b>{p.zoneLabel ?? "—"}</b>{p.tree && <div className="small muted">{p.tree} · {p.part}</div>}{!p.tree && <div className="small muted">{p.part}</div>}</td>
                      <td data-label="Taken" className="nowrap">{p.takenOn}{p.cropDay !== null && <div className="small muted">Day {p.cropDay}</div>}</td>
                      <td data-label="Farmer">{titleOf(p.farmerLabel)}</td>
                      <td data-label="Model">{p.modelSeen ? <More label={p.modelLabel === "problem" ? "Something wrong" : p.modelLabel === "healthy" ? "Looks healthy" : titleOf(p.modelLabel)}>{p.modelSeen}</More> : "—"}</td>
                      <td data-label="Expert">{p.expertLabel ? <><Tag kind="ok">{titleOf(p.expertLabel)}</Tag><div className="small muted">{p.expertName}</div></> : "—"}</td>
                      <td className="act nowrap">
                        <button className="linkbtn" onClick={() => openFor(p)}>{p.expertLabel ? "Change" : "Confirm"}</button>{" "}
                        <button className="linkbtn" onClick={() => remove(p)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Ready to test a model" pad={false} right={<span className="small muted">Our target: {lib.data?.targetPhotos ?? "—"} photos over {lib.data?.targetDays ?? "—"} days</span>}>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Problem</th><th className="r">Confirmed</th><th className="r">Days</th><th>Status</th></tr></thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.label}><td>{p.title}</td><td className="r">{p.photos}</td><td className="r">{p.days}</td><td>{p.ready ? <Tag kind="ok">Ready</Tag> : <span className="muted">Not yet</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>

      {open && (
        <FormModal title="Confirm what this shows" submit="Confirm" onClose={() => setOpen(null)} onSubmit={confirm} msg={msg} width={560}>
          <img className="photo-big" src={photoImageUrl(open.id)} alt="the photo to confirm" />
          <p className="small muted">{open.zoneLabel}{open.tree ? ` · ${open.tree}` : ""} · {open.part} · {open.takenOn}{open.farmerLabel ? ` · farmer says ${titleOf(open.farmerLabel).toLowerCase()}` : ""}</p>
          {open.note && <p className="small">{open.note}</p>}
          <EF label="This photo shows" req>
            <select className="erp-select" value={label} required onChange={(e) => setLabel(e.target.value)}>
              <option value="">Choose</option>
              {(labels.data?.labels ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </EF>
          <EF label="Confirmed by" req hint="The person who judged it">
            <input className="erp-input" value={name} required maxLength={80} onChange={(e) => setName(e.target.value)} />
          </EF>
          <EF label="Note"><input className="erp-input" value={note} onChange={(e) => setNote(e.target.value)} /></EF>
        </FormModal>
      )}
    </>
  );
}
