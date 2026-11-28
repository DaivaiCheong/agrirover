import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { litres, duration, type AdviceCard } from "../sim/advice";
import { dripHours } from "../sim/agronomy";
import { Urgency } from "./AdviceCard";

const CONF: Record<AdviceCard["confidence"], string> = {
  high: "High: measured at the plant",
  medium: "Medium: a lane reading or a single photo",
  low: "Low: interpolated or partly seen",
};

/** The evidence behind a card: readings, the rule that fired, and for a sign, how to tell it apart. */
export default function WhyPanel({ card, onClose }: { card: AdviceCard; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const d = card.diagnosis, a = card.amount;
  return (
    <>
      <div className="rv2-scrim" onClick={onClose} />
      <aside className="rv2-drawer" role="dialog" aria-modal="true" aria-labelledby="why-title">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <h2 id="why-title">{card.action}</h2>
          <button ref={close} type="button" className="rv2-btn sm" onClick={onClose} aria-label="Close"><X size={16} aria-hidden /></button>
        </div>
        <p style={{ margin: "8px 0 0" }}><Urgency u={card.urgency} /> · {card.where.text}</p>
        <dl>
          <dt>Why</dt><dd>{card.why}</dd>
          <dt>Confidence</dt><dd>{CONF[card.confidence]}</dd>
          <dt>Rule</dt><dd>{card.rule}</dd>
        </dl>
        {d && (
          <section>
            <h3>{d.likely}</h3>
            <dl>
              {d.ruledOut && <><dt>Ruled out</dt><dd>{d.ruledOut}</dd></>}
              <dt>Could also be</dt><dd>{d.couldAlso}</dd>
              <dt>How to tell</dt><dd>{d.howToTell}</dd>
              <dt>First safe step</dt><dd>{d.firstStep}</dd>
            </dl>
            {d.products?.length ? (
              <p className="small">Your products: {d.products.map((p) => `${p.name} (${p.labelRate})`).join(", ")}. Follow the label.</p>
            ) : <p className="small muted">No chemical is suggested. Cultural steps come first; ask an agronomist before any treatment.</p>}
          </section>
        )}
        {a && !a.hold && (
          <section>
            <h3>How much</h3>
            <table>
              <thead><tr><th>Plant</th><th className="r">Water</th><th className="r">Drip</th></tr></thead>
              <tbody>
                {Object.entries(a.perPlantL).map(([id, l]) => (
                  <tr key={id}><td>{id}</td><td className="r">{litres(l)}</td><td className="r">{duration(dripHours(l))}</td></tr>
                ))}
                <tr><td><b>Total</b></td><td className="r"><b>{litres(a.totalL)}</b></td><td /></tr>
              </tbody>
            </table>
            {a.rain && <p className="small">Less the {a.rain}.</p>}
          </section>
        )}
        <section>
          <h3>Evidence</h3>
          <table><tbody>{card.evidence.map((e, i) => <tr key={i}><td>{e.label}</td><td>{e.value}</td></tr>)}</tbody></table>
        </section>
      </aside>
    </>
  );
}
