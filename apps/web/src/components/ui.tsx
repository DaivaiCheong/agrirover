import type { ReactNode } from "react";

type LedKind = "ok" | "warn" | "alert" | "idle";

export const Led = ({ kind, children }: { kind: LedKind; children: ReactNode }) => (
  <span className={`led led-${kind}`}><i /><span>{children}</span></span>
);

export const Tag = ({ kind, children }: { kind?: string; children: ReactNode }) => (
  <span className={`tag${kind ? ` tag-${kind}` : ""}`}>{children}</span>
);

export const Panel = ({ title, right, children, pad = true }:
  { title?: string; right?: ReactNode; children: ReactNode; pad?: boolean }) => (
  <section className="panel">
    {title && (
      <div className="panel-head">
        <span className="lbl lbl-ink">{title}</span>
        {right}
      </div>
    )}
    <div className={pad ? "panel-pad" : ""}>{children}</div>
  </section>
);

export const Metric = ({ label, value, unit, note }:
  { label: string; value: string; unit?: string; note?: ReactNode }) => (
  <div className="panel panel-pad metric reg">
    <div className="lbl">{label}</div>
    <div style={{ marginTop: 9 }}>
      <span className="v">{value}</span>{unit && <span className="u">{unit}</span>}
    </div>
    {note && <div className="d">{note}</div>}
  </div>
);
