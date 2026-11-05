import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { More, Notice, Tag } from "./ui";
import type { Correlation, Evidence } from "../lib/api";
import { trim, unitText } from "../lib/conditions";
import { ago } from "../lib/usePoll";

const VERDICT: Record<Correlation["verdict"], [string, string]> = {
  supported: ["warn", "Readings fit"],
  not_supported: ["wip", "Readings do not fit"],
  no_data: ["wip", "No fresh readings"],
};

const NOTHING: Record<Correlation["verdict"], string> = {
  supported: "",
  not_supported: "The readings do not point to a cause in the soil or air.",
  no_data: "No reading in the last 36 hours. Run a rover round.",
};

const BASIS = { spec: "Farm rule", practice: "Standard practice", guava_doc: "Guava document, not checked" } as const;

const seen = (s: number | null) => (s === null ? "" : ago(new Date(Date.now() - s * 1000).toISOString()));

function Row({ e }: { e: Evidence }) {
  const u = unitText(e.unit);
  const value = e.value === null ? null : e.value.toLocaleString(undefined, { minimumFractionDigits: e.decimals, maximumFractionDigits: e.decimals });
  const fit = e.value === null
    ? <span className="ev-fit gap"><Clock size={14} aria-hidden />No reading</span>
    : e.stale
      ? <span className="ev-fit gap"><Clock size={14} aria-hidden />Old reading, not counted</span>
      : e.met
        ? <span className="ev-fit met"><TriangleAlert size={14} aria-hidden />Fits</span>
        : <span className="ev-fit no"><CircleCheck size={14} aria-hidden />Does not fit</span>;
  return (
    <tr>
      <td>{e.label}</td>
      <td>{value === null ? <span className="muted">—</span> : <><span className="num">{value}</span>{u && ` ${u}`}<div className="mono-sm muted">{seen(e.ageSeconds)}</div></>}</td>
      <td className="muted">{e.op === "<" ? "below" : "above"} {trim(e.limit)}{u ? ` ${u}` : ""}</td>
      <td>{fit}</td>
    </tr>
  );
}

/** A symptom set against one bed's live readings: the verdict, the readings it rests on, and what to do. */
export default function CorrelationCard({ c }: { c: Correlation }) {
  const [kind, word] = VERDICT[c.verdict];
  return (
    <div className="corr">
      <div className="corr-head">
        <span className="corr-title">{c.title}</span>
        <Tag kind={kind}>{word}</Tag>
      </div>
      <div className="corr-sub">
        {c.label ?? c.zone}{c.stage ? ` · day ${c.stage.day} · ${c.stage.title}` : " · no crop planted"}
        {" · "}{c.source === "photo" ? "symptom from your photo" : "symptom you chose"}
      </div>

      {c.looksLike && <More label="What to look for">{c.looksLike}</More>}

      <table className="ev">
        <tbody>{c.evidence.map((e) => <Row key={e.metric} e={e} />)}</tbody>
      </table>

      {c.verdict === "supported" && c.explanation ? (
        <div className="corr-say">
          {c.explanation}
          {c.basis && <span className="basis">{BASIS[c.basis]}</span>}
        </div>
      ) : (
        <Notice kind="info">{NOTHING[c.verdict]}</Notice>
      )}
      {c.caveat && <Notice kind="warn">{c.caveat}</Notice>}
    </div>
  );
}
