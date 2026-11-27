import { useState } from "react";
import { AlertTriangle, CalendarClock, Check, Clock, Hourglass, RotateCcw } from "lucide-react";
import { URGENCY_WORD, type AdviceCard as Card, type Feedback, type Urgency } from "../sim/advice";

const URG_ICON: Record<Urgency, typeof Clock> = { now: AlertTriangle, today: Clock, tomorrow: CalendarClock, canWait: Hourglass };
const RESPONSE_WORD: Record<Feedback["response"], string> = { done: "Done", later: "Later", wrong: "Marked wrong" };

export function Urgency({ u }: { u: Urgency }) {
  const I = URG_ICON[u];
  return <span className={`urg urg-${u}`}><I size={16} aria-hidden />{URGENCY_WORD[u]}</span>;
}

/** One action: what, where, how much, by when, why. Done, Later, Wrong; Wrong asks one question. */
export default function AdviceCard({ card, n, response, onRespond, onUndo, onWhy, onHover }: {
  card: Card; n: number; response?: Feedback;
  onRespond: (r: Feedback["response"], answer?: string) => void; onUndo: () => void;
  onWhy: () => void; onHover: (on: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const d = card.diagnosis;
  return (
    <article className={`rv2-card k-${card.kind}`} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
             onFocus={() => onHover(true)} onBlur={() => onHover(false)} aria-labelledby={`c-${n}`}>
      <div className="n num" aria-hidden>{n}</div>
      <div>
        <div className="top"><h3 id={`c-${n}`}>{card.action}</h3><Urgency u={card.urgency} /></div>
        {!card.action.includes(card.where.text) && <p className="detail muted small">{card.where.text}</p>}
        {card.detail && <p className="detail">{card.detail}</p>}
        {d && card.kind === "lookAt" && <p className="tell">{d.ruledOut ?? d.howToTell}</p>}
        <button type="button" className="rv2-why" onClick={onWhy}><b>Why:</b> {card.why}</button>
        <div className="rv2-act">
          {response ? (
            <>
              <span className="rv2-done"><Check size={16} aria-hidden />{RESPONSE_WORD[response.response]}{response.answer ? `: ${response.answer}` : ""}</span>
              <button type="button" className="rv2-btn sm" onClick={onUndo}><RotateCcw size={14} aria-hidden />Undo</button>
            </>
          ) : asking ? (
            <form onSubmit={(e) => { e.preventDefault(); onRespond("wrong", answer.trim() || undefined); setAsking(false); }}>
              <input autoFocus aria-label="What was it?" placeholder="What was it?" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={120} />
              <button className="rv2-btn sm primary" type="submit">Save</button>
              <button className="rv2-btn sm" type="button" onClick={() => setAsking(false)}>Cancel</button>
            </form>
          ) : (
            <>
              <button type="button" className="rv2-btn sm primary" onClick={() => onRespond("done")}>Done</button>
              <button type="button" className="rv2-btn sm" onClick={() => onRespond("later")}>Later</button>
              <button type="button" className="rv2-btn sm" onClick={() => setAsking(true)}>Wrong</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
