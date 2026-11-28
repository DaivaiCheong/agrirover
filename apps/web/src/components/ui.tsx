import { useEffect, type FormEvent, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { errorText } from "../lib/queries";

type LedKind = "ok" | "warn" | "alert" | "idle";

export const Led = ({ kind, children }: { kind: LedKind; children: ReactNode }) => (
  <span className={`led led-${kind}`}><i /><span>{children}</span></span>
);

export const Tag = ({ kind, className, children }: { kind?: string; className?: string; children: ReactNode }) => (
  <span className={`tag${kind ? ` tag-${kind}` : ""}${className ? ` ${className}` : ""}`}>{children}</span>
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

export const Toolbar = ({ children }: { children: ReactNode }) => <div className="toolbar">{children}</div>;

const NOTICE_ICON = { info: Info, ok: CircleCheck, warn: TriangleAlert, alert: CircleAlert } as const;

export const Notice = ({ kind = "info", children }: { kind?: "info" | "ok" | "warn" | "alert"; children: ReactNode }) => {
  const Icon = NOTICE_ICON[kind];
  return <p className={`notice notice-${kind}`}><Icon size={18} aria-hidden /><span>{children}</span></p>;
};

export const Empty = ({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) => (
  <div className="empty">{Icon && <Icon size={34} aria-hidden />}<div className="empty-body">{children}</div></div>
);

type Kpi = { k: string; v: ReactNode; d?: ReactNode; icon?: LucideIcon; tone?: "ok" | "warn" | "alert" | "info" };

export const Kpis = ({ items, loading = false }: { items: Kpi[]; loading?: boolean }) => (
  <div className="erp-summary-banner">
    {items.map((i) => (
      <div key={i.k} className={`erp-summary-item${i.tone ? ` kpi-${i.tone}` : ""}`}>
        <div className="kpi-head">
          {i.icon && <span className="kpi-ico"><i.icon size={16} aria-hidden /></span>}
          <span className="k">{i.k}</span>
        </div>
        <span className="v">{loading ? <Skeleton w="60%" h={24} /> : i.v}</span>
        {i.d && <span className="small muted">{loading ? <Skeleton w="80%" h={12} /> : i.d}</span>}
      </div>
    ))}
  </div>
);

export const Skeleton = ({ w = "100%", h = 14, r }: { w?: number | string; h?: number | string; r?: number }) => (
  <span className="skel" style={{ width: w, height: h, borderRadius: r }} aria-hidden />
);

export const PageSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <main className="main stack" aria-busy="true" aria-label="Loading">
    <div className="erp-summary-banner">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="erp-summary-item"><Skeleton w="50%" h={12} /><Skeleton w="70%" h={24} /><Skeleton w="85%" h={12} /></div>
      ))}
    </div>
    {Array.from({ length: rows }, (_, i) => (
      <section key={i} className="panel panel-pad stack"><Skeleton w="30%" h={14} /><Skeleton h={12} /><Skeleton w="90%" h={12} /><Skeleton w="75%" h={12} /></section>
    ))}
  </main>
);

export const ErrorNotice = ({ error, onRetry }: { error: string; onRetry?: () => void }) => (
  <p className="notice notice-alert" role="alert">
    <CircleAlert size={18} aria-hidden />
    <span>{error}{onRetry && <> <button type="button" className="linkbtn" onClick={onRetry}>Try again</button></>}</span>
  </p>
);

export const More = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <details className="xp"><summary>{label}</summary><div className="xp-body">{children}</div></details>
);

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

export function FormModal({ title, submit, onClose, onSubmit, msg, width, busy = false, danger = false, children }:
  { title: string; submit: string; onClose: () => void; onSubmit: (e: FormEvent) => void; msg?: FormMsg; width?: number;
    busy?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <Modal title={title} onClose={onClose} width={width ?? 520}>
      <form onSubmit={onSubmit}>
        <div className="modal-body-erp"><div className="erp-section">{children}</div></div>
        <div className="modal-foot-erp">
          {msg && <span className={`erp-msg erp-msg-${msg.kind}`} role="status">{msg.text}</span>}
          <div className="erp-foot-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
            <button type="submit" className={`btn btn-sm${danger ? " btn-alert" : ""}`} disabled={busy}>{busy ? "Saving…" : submit}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export const failMsg = (err: unknown): FormMsg => ({ kind: "alert", text: errorText(err) });

export const EF = ({ label, hint, children, req }: { label: string; hint?: ReactNode; req?: boolean; children: ReactNode }) => (
  <label className="erp-field">
    <span className="erp-label">{label}{req && <span className="req" aria-hidden>*</span>}</span>
    {children}
    {hint && <span className="erp-hint">{hint}</span>}
  </label>
);
