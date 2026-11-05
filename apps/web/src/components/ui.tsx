import { useEffect, type FormEvent, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";

type LedKind = "ok" | "warn" | "alert" | "idle";

export const Led = ({ kind, children }: { kind: LedKind; children: ReactNode }) => (
  <span className={`led led-${kind}`}><i /><span>{children}</span></span>
);

export const Tag = ({ kind, children }: { kind?: string; children: ReactNode }) => (
  <span className={`tag${kind ? ` tag-${kind}` : ""}`}>{children}</span>
);

export const Panel = ({ title, icon: Icon, right, children, pad = true }:
  { title?: string; icon?: LucideIcon; right?: ReactNode; children: ReactNode; pad?: boolean }) => (
  <section className="panel">
    {title && (
      <div className="panel-head">
        <span className="lbl lbl-ink">{Icon && <Icon size={18} aria-hidden />}{title}</span>
        {right}
      </div>
    )}
    <div className={pad ? "panel-pad" : ""}>{children}</div>
  </section>
);

export const Metric = ({ label, value, unit, note, icon: Icon }:
  { label: string; value: string; unit?: string; note?: ReactNode; icon?: LucideIcon }) => (
  <div className="panel panel-pad metric">
    <div className="lbl">{Icon && <Icon size={16} aria-hidden />}{label}</div>
    <div style={{ marginTop: 10 }}>
      <span className="v">{value}</span>{unit && <span className="u">{unit}</span>}
    </div>
    {note && <div className="d">{note}</div>}
  </div>
);

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="field">
    <span className="lbl lbl-ink">{label}</span>
    {children}
    {hint && <span className="hint">{hint}</span>}
  </label>
);

/** Title of a page: an icon, a short name and, for a record, what the record is. */
export const PageHead = ({ icon: Icon, title, sub, actions }:
  { icon: LucideIcon; title: string; sub?: string; actions?: ReactNode }) => (
  <div className="head head-row">
    <div className="ph">
      <Icon size={20} className="ph-ico" aria-hidden />
      <div>
        <h1 className="display d-xl">{title}</h1>
        {sub && <p className="ph-sub">{sub}</p>}
      </div>
    </div>
    {actions && <div className="head-actions">{actions}</div>}
  </div>
);

/** The actions of a page that sits under a section's tabs. */
export const Toolbar = ({ children }: { children: ReactNode }) => <div className="toolbar">{children}</div>;

const NOTICE_ICON = { info: Info, ok: CircleCheck, warn: TriangleAlert, alert: CircleAlert } as const;

export const Notice = ({ kind = "info", children }: { kind?: "info" | "ok" | "warn" | "alert"; children: ReactNode }) => {
  const Icon = NOTICE_ICON[kind];
  return <p className={`notice notice-${kind}`}><Icon size={18} aria-hidden /><span>{children}</span></p>;
};

export const Empty = ({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) => (
  <div className="empty">{Icon && <Icon size={34} aria-hidden />}<div className="empty-body">{children}</div></div>
);

/** The key figures of a list or record, in one row. */
export const Kpis = ({ items }: { items: { k: string; v: ReactNode }[] }) => (
  <div className="erp-summary-banner">
    {items.map((i) => <div key={i.k} className="erp-summary-item"><span className="k">{i.k}</span><span className="v">{i.v}</span></div>)}
  </div>
);

/** A short label that opens to the sentence behind it, so explanations cost nothing until they are wanted. */
export const More = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <details className="xp"><summary>{label}</summary><div className="xp-body">{children}</div></details>
);

/** A dialog: closes on Escape, on the backdrop and on its close button. */
export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card erp-dialog" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal="true" aria-label={title}
           onClick={(e) => e.stopPropagation()}>
        <div className="modal-head-erp">
          <h2 className="erp-head-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={18} aria-hidden /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type FormMsg = { kind: "ok" | "alert"; text: string } | null;

/** A dialog with one form. It stays open after a save, so a run of entries needs no reopening. */
export function FormModal({ title, submit, onClose, onSubmit, msg, width, children }:
  { title: string; submit: string; onClose: () => void; onSubmit: (e: FormEvent) => void; msg?: FormMsg; width?: number; children: ReactNode }) {
  return (
    <Modal title={title} onClose={onClose} width={width ?? 520}>
      <form onSubmit={onSubmit}>
        <div className="modal-body-erp"><div className="erp-section">{children}</div></div>
        <div className="modal-foot-erp">
          {msg && <span className={`erp-msg erp-msg-${msg.kind}`} role="status">{msg.text}</span>}
          <div className="erp-foot-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
            <button type="submit" className="btn btn-sm">{submit}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** A compact labelled input for a dialog. */
export const EF = ({ label, hint, children, req }: { label: string; hint?: ReactNode; req?: boolean; children: ReactNode }) => (
  <label className="erp-field">
    <span className="erp-label">{label}{req && <span className="req" aria-hidden>*</span>}</span>
    {children}
    {hint && <span className="erp-hint">{hint}</span>}
  </label>
);
