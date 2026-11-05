import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

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

/** Title of a top-level page: an icon, a short name and one plain sentence. */
export const PageHead = ({ icon: Icon, title, sub, actions }:
  { icon: LucideIcon; title: string; sub?: string; actions?: ReactNode }) => (
  <div className="head head-row">
    <div className="ph">
      <div className="ph-tile"><Icon size={26} aria-hidden /></div>
      <div>
        <h1 className="display d-xl">{title}</h1>
        {sub && <p className="ph-sub">{sub}</p>}
      </div>
    </div>
    {actions && <div className="head-actions">{actions}</div>}
  </div>
);

/** The one-line explanation at the top of a page that sits under a section's tabs. */
export const PageIntro = ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
  <div className="head head-row" style={{ paddingTop: 18, paddingBottom: 0 }}>
    <p className="ph-sub" style={{ marginTop: 0, maxWidth: 640 }}>{children}</p>
    {actions && <div className="head-actions">{actions}</div>}
  </div>
);

const NOTICE_ICON = { info: Info, ok: CircleCheck, warn: TriangleAlert, alert: CircleAlert } as const;

export const Notice = ({ kind = "info", children }: { kind?: "info" | "ok" | "warn" | "alert"; children: ReactNode }) => {
  const Icon = NOTICE_ICON[kind];
  return <p className={`notice notice-${kind}`}><Icon size={18} aria-hidden /><span>{children}</span></p>;
};

export const Empty = ({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) => (
  <div className="empty">{Icon && <Icon size={34} aria-hidden />}<div className="empty-body">{children}</div></div>
);
