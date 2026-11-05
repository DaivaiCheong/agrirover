import { Fragment } from "react";
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Clock, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { BedConditions, CondParam, RatingStatus } from "../lib/api";
import { RIBBON_CELLS, cls, explain, fmtValue, rangeText, unitText, worstStatus } from "../lib/conditions";
import { ago } from "../lib/usePoll";

const BADGE: Record<RatingStatus, [string, LucideIcon, string]> = {
  normal: ["ok", CircleCheck, "Normal"],
  warning: ["warn", TriangleAlert, "Warning"],
  critical: ["alert", CircleAlert, "Critical"],
  stale: ["wip", Clock, "Old readings"],
  no_data: ["wip", Clock, "No data"],
  unrated: ["info", Info, "Not rated"],
};

/** Normal / Warning / Critical, with its icon: the colour is never the only thing that says it. */
export function StatusBadge({ status, alerts = 0 }: { status: RatingStatus; alerts?: number }) {
  const [kind, Icon, word] = BADGE[status];
  return (
    <span className={`tag tag-${kind}`}>
      <Icon size={13} aria-hidden />{word}{alerts > 0 ? ` · ${alerts} alert${alerts === 1 ? "" : "s"}` : ""}
    </span>
  );
}

const GLYPH: Partial<Record<RatingStatus, LucideIcon>> = { warning: TriangleAlert, critical: CircleAlert, stale: Clock };

function headline(b: BedConditions): string {
  if (b.stage) return `${b.stage.title} · day ${b.stage.day}${b.stage.extended ? " · past the table" : ""}`;
  if (b.crop && !b.rated) return `No targets for ${b.cropName ?? b.crop} yet`;
  if (b.crop) return "Not planted yet · general ranges";
  return "No crop · general ranges";
}

function Cell({ metrics, params }: { metrics: string[]; params: Map<string, CondParam> }) {
  const ps = metrics.map((m) => params.get(m)).filter((p): p is CondParam => Boolean(p));
  if (ps.length === 0) return null;
  const status = worstStatus(ps.map((p) => p.status));
  const multi = ps.length > 1;
  const Glyph = GLYPH[status];
  // under the value: the target range and the unit, so the number itself stays as large as it can
  const target = multi
    ? `${ps.map((p) => rangeText(p)).filter(Boolean).join(" · ")} ${unitText(ps[0].unit)}`.trim()
    : [rangeText(ps[0]), unitText(ps[0].unit)].filter(Boolean).join(" ");
  return (
    <div className={`rb-cell st-${cls(status)}${multi ? " npk" : ""}`} title={ps.map(explain).join("\n")} tabIndex={0}>
      <span className="rb-k">{multi ? "N · P · K" : ps[0].short}</span>
      <span className="rb-v">
        {ps.map((p, i) => (
          <Fragment key={p.metric}>
            {i > 0 && <i className="rb-sep">·</i>}
            <b className={`v-${cls(p.status)}`}>{fmtValue(p)}</b>
            {(p.status === "warning" || p.status === "critical") && p.direction &&
              (p.direction === "low" ? <ArrowDown size={11} aria-hidden /> : <ArrowUp size={11} aria-hidden />)}
          </Fragment>
        ))}
      </span>
      <span className="rb-t">{target || " "}</span>
      {Glyph && <Glyph size={12} className="rb-glyph" aria-hidden />}
      <span className="sr-only">{ps.map(explain).join(" ")}</span>
    </div>
  );
}

/** The seven readings of one bed (moisture, pH, EC, soil temperature, N·P·K, air temperature, humidity),
 *  each rated against the crop's stage today, and the alerts that are on. Advice only. */
export default function EnvRibbon({ bed }: { bed: BedConditions }) {
  const params = new Map(bed.params.map((p) => [p.metric, p]));
  const empty = bed.params.every((p) => p.value === null);
  return (
    <div className="ribbon" role="group" aria-label={`${bed.label ?? bed.zone}: soil and air`}>
      <div className="rb-head">
        <StatusBadge status={bed.status} alerts={bed.alerts.length} />
        <span className="rb-stage" title={`Targets for this stage. ${bed.source}`}>{headline(bed)}</span>
        <span className="rb-age">{bed.recordedAt ? ago(bed.recordedAt) : "no readings yet"}</span>
      </div>
      {empty ? (
        <p className="rb-empty">No readings from this bed yet. They appear here as soon as its field node reports.</p>
      ) : (
        <div className="rb-grid">
          {RIBBON_CELLS.map((c) => <Cell key={c.key} metrics={c.metrics} params={params} />)}
        </div>
      )}
      {bed.alerts.length > 0 && (
        <ul className="rb-alerts">
          {bed.alerts.map((a) => (
            <li key={a.id} className={a.severity === "warning" ? "rb-alert-warn" : undefined}>
              {a.severity === "warning" ? <TriangleAlert size={14} aria-hidden /> : <CircleAlert size={14} aria-hidden />}
              <span><b>{a.title}</b><br />{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
