import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Camera, Download, ImagePlus, Images, Upload } from "lucide-react";
import { EF, Empty, ErrorNotice, FormModal, Kpis, Panel, Tag, failMsg, type FormMsg } from "../components/ui";
import { api, photoExportUrl, photoImageUrl, type PhotoResult, type SavedPhoto } from "../lib/api";
import { useFarmFocus } from "../lib/farmContext";
import { errorText, useConfirmPhoto, useDeletePhoto, usePhotoLabels, usePhotos, useSavePhoto, useZones } from "../lib/queries";
import { ago } from "../lib/usePoll";

type Status = "all" | "to_confirm" | "confirmed";

/** Photos the farmer takes of a plant, labelled by them and confirmed by an expert: the training set for a model. */
export default function Photos() {
  const [status, setStatus] = useState<Status>("all");
  const photos = usePhotos(status);
  const labels = usePhotoLabels();
  const del = useDeletePhoto();
  const [confirming, setConfirming] = useState<SavedPhoto | null>(null);
  const lib = photos.data;
  const titleOf = new Map((labels.data?.labels ?? []).map((l) => [l.id, l.title]));

  return (
    <main className="main stack">
      {photos.error && <ErrorNotice error={errorText(photos.error)} onRetry={() => photos.refetch()} />}
      <Kpis
        loading={photos.isPending}
        items={[
          { k: "Saved", icon: Images, v: lib?.saved ?? 0, d: "Photos on the farm server" },
          { k: "To confirm", tone: lib?.toConfirm ? "warn" : undefined, v: lib?.toConfirm ?? 0, d: "Waiting for an expert's label" },
          { k: "Confirmed", icon: BadgeCheck, tone: "ok", v: lib?.confirmed ?? 0, d: `Aim: ${lib?.targetPhotos ?? 25} a problem over ${lib?.targetDays ?? 14} days` },
          { k: "Photo model", icon: Camera, v: labels.data?.online ? "Configured" : "Not set up",
            d: labels.data?.online ? "Checks run on the server" : "Photos are labelled by people for now" },
        ]}
      />

      <div className="grid g32">
        <UploadPanel />
        <Panel title="Towards a model" pad={false} right={<a className="linkbtn small" href={photoExportUrl("confirmed")}><Download size={13} aria-hidden /> Export confirmed</a>}>
          <table className="tbl">
            <thead><tr><th>Problem</th><th className="r">Photos</th><th className="r">Days</th><th /></tr></thead>
            <tbody>
              {(lib?.progress ?? []).map((p) => (
                <tr key={p.label}>
                  <td>{p.title}</td>
                  <td className="r">{p.photos} / {lib?.targetPhotos}</td>
                  <td className="r">{p.days}</td>
                  <td>{p.ready ? <Tag kind="ok">Enough</Tag> : <Tag>Collecting</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel
        title="Photo library"
        icon={Images}
        pad={false}
        right={
          <div className="seg" role="group" aria-label="Show">
            {(["all", "to_confirm", "confirmed"] as Status[]).map((s) => (
              <button key={s} type="button" className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
                {s === "all" ? "All" : s === "to_confirm" ? "To confirm" : "Confirmed"}
              </button>
            ))}
          </div>
        }
      >
        {(lib?.photos ?? []).length === 0 ? (
          <Empty icon={Images}>{photos.isPending ? "Loading…" : "No photo here yet. Take one of a plant that looks wrong, and save it above."}</Empty>
        ) : (
          <div className="photo-grid">
            {lib!.photos.map((p) => (
              <article key={p.id} className="photo-card">
                <img src={photoImageUrl(p.id)} alt={`${p.zoneLabel ?? p.zone} ${p.tree ?? ""} ${p.part}`} loading="lazy" />
                <div className="pc-body">
                  <div className="row-between">
                    <b>{p.zoneLabel ?? p.zone}{p.tree ? ` · ${p.tree}` : ""}</b>
                    {p.expertLabel ? <Tag kind="ok">{titleOf.get(p.expertLabel) ?? p.expertLabel}</Tag> : <Tag kind="warn">To confirm</Tag>}
                  </div>
                  <span className="muted">{p.part} · {ago(p.takenAt)}{p.cropDay ? ` · day ${p.cropDay}` : ""}</span>
                  {p.farmerLabel && <span>Farmer: {titleOf.get(p.farmerLabel) ?? p.farmerLabel}</span>}
                  {p.expertName && <span className="muted">Confirmed by {p.expertName}{p.expertNote ? `: ${p.expertNote}` : ""}</span>}
                  {p.note && <span className="muted">{p.note}</span>}
                  <div className="rowflex" style={{ gap: 10 }}>
                    <button type="button" className="linkbtn small" onClick={() => setConfirming(p)}>{p.expertLabel ? "Change label" : "Confirm"}</button>
                    <button type="button" className="linkbtn linkbtn-alert small" disabled={del.isPending}
                            onClick={() => window.confirm("Delete this photo from the server?") && del.mutate(p.id)}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
      {confirming && <ConfirmDialog photo={confirming} onClose={() => setConfirming(null)} />}
    </main>
  );
}

function UploadPanel() {
  const zones = useZones();
  const labels = usePhotoLabels();
  const save = useSavePhoto();
  const focus = useFarmFocus();
  const [zone, setZone] = useState(focus.zone ?? "");
  const [row, setRow] = useState("");
  const [col, setCol] = useState("");
  const [part, setPart] = useState("leaf");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [check, setCheck] = useState<PhotoResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<FormMsg>(null);
  const bed = zone || zones.data?.[0]?.zone || "";

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const tree = row && col ? { row: Number(row) - 1, col: Number(col) - 1 } : undefined;

  async function runCheck() {
    if (!file) return;
    setChecking(true);
    setMsg(null);
    try {
      setCheck(await api.checkPhoto(file, bed, tree));
    } catch (err) {
      setMsg(failMsg(err));
    } finally {
      setChecking(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) { setMsg({ kind: "alert", text: "Choose a photo first." }); return; }
    try {
      await save.mutateAsync({ file, input: { zone: bed, part, row: tree?.row, col: tree?.col, label: label || undefined, note: note || undefined } });
      setMsg({ kind: "ok", text: "Saved. It is waiting for an expert to confirm it." });
      setFile(null); setCheck(null); setNote(""); setLabel("");
    } catch (err) {
      setMsg(failMsg(err));
    }
  }

  return (
    <Panel title="Add a photo" icon={ImagePlus}>
      <form className="erp-form" onSubmit={submit}>
        <div className="erp-grid-3">
          <EF label="Bed" req>
            <select className="erp-select" value={bed} onChange={(e) => { setZone(e.target.value); setCheck(null); }}>
              {(zones.data ?? []).map((z) => <option key={z.zone} value={z.zone}>{z.label ?? z.zone}</option>)}
            </select>
          </EF>
          <EF label="Row" hint="Optional"><input className="erp-input" type="number" min={1} value={row} onChange={(e) => setRow(e.target.value)} /></EF>
          <EF label="Plant in the row"><input className="erp-input" type="number" min={1} value={col} onChange={(e) => setCol(e.target.value)} /></EF>
        </div>
        <div className="erp-grid-2">
          <EF label="Part">
            <select className="erp-select" value={part} onChange={(e) => setPart(e.target.value)}>
              {(labels.data?.parts ?? ["leaf", "fruit", "stem", "whole"]).map((p) => <option key={p}>{p}</option>)}
            </select>
          </EF>
          <EF label="What you think it is">
            <select className="erp-select" value={label} onChange={(e) => setLabel(e.target.value)}>
              <option value="">Not sure</option>
              {(labels.data?.labels ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </EF>
        </div>
        <label className="dropzone">
          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                 onChange={(e) => { setFile(e.target.files?.[0] ?? null); setCheck(null); }} />
          <Upload size={18} aria-hidden /> {file ? file.name : "Choose or take a photo (up to 8 MB)"}
          {preview && <div><img src={preview} alt="Chosen photo" /></div>}
        </label>
        <EF label="Note"><input className="erp-input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where on the plant, since when…" /></EF>
        {check && (
          <div className="notice notice-info">
            <span>
              <b>{check.label ? `${check.label} (${Math.round((check.confidence ?? 0) * 100)}%)` : "No verdict."}</b> {check.note}
              {check.tree?.found && (
                <span style={{ display: "block", marginTop: 4 }}>
                  {check.tree.name} in the last round: {check.tree.readings.filter((r) => r.state && r.state !== "ok").map((r) => `${r.label} ${r.state}`).join(", ") || "soil in range"}.
                  {check.tree.soil && ` ${check.tree.soil.text} ${check.tree.soil.action ?? ""}`}
                </span>
              )}
            </span>
          </div>
        )}
        <div className="row-between">
          {msg ? <span className={`erp-msg erp-msg-${msg.kind}`} role="status">{msg.text}</span> : <span />}
          <span className="rowflex" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm btn-ghost" disabled={!file || checking} onClick={runCheck}>{checking ? "Checking…" : "Check"}</button>
            <button className="btn btn-sm" disabled={!file || save.isPending}>{save.isPending ? "Saving…" : "Save photo"}</button>
          </span>
        </div>
      </form>
    </Panel>
  );
}

function ConfirmDialog({ photo, onClose }: { photo: SavedPhoto; onClose: () => void }) {
  const labels = usePhotoLabels();
  const confirm = useConfirmPhoto();
  const [label, setLabel] = useState(photo.expertLabel ?? photo.farmerLabel ?? "");
  const [name, setName] = useState(photo.expertName ?? "");
  const [note, setNote] = useState(photo.expertNote ?? "");
  const [msg, setMsg] = useState<FormMsg>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await confirm.mutateAsync({ id: photo.id, body: { label, name, note: note || null } });
      onClose();
    } catch (err) {
      setMsg(failMsg(err));
    }
  }
  return (
    <FormModal title="Confirm the label" submit="Confirm" msg={msg} onClose={onClose} onSubmit={save} busy={confirm.isPending} width={480}>
      <div className="erp-form">
        <img src={photoImageUrl(photo.id)} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8 }} />
        <EF label="What it is" req>
          <select className="erp-select" required value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {(labels.data?.labels ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </EF>
        <div className="erp-grid-2">
          <EF label="Your name" req><input className="erp-input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></EF>
          <EF label="Note"><input className="erp-input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></EF>
        </div>
      </div>
    </FormModal>
  );
}
