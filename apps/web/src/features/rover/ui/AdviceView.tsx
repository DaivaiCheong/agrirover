import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import "./rover.css";
import { adviceFor, respond, runRound, undoResponse, useTwin } from "../store";
import { SCENARIOS } from "../sim/scenarios";
import { litres, type AdviceCard as Card } from "../sim/advice";
import type { PlantId, RoundData } from "../sim/scout";
import AdviceCard from "./AdviceCard";
import FieldMap, { MapLegend } from "./FieldMap";
import WhyPanel from "./WhyPanel";

const BLOCK = "t1";

/** "Today 06:40, 97/97 seen" */
export function roundWord(r: RoundData, now = new Date()) {
  const at = new Date(r.at), today = at.toDateString() === now.toDateString();
  const day = today ? "Today" : at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const seen = r.plants.filter((o) => o.reached && o.seen > 0).length;
  return `${day} ${at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}, ${seen}/${r.plantCount} seen`;
}

/** The agronomist's report for a round: at most five actions, the field map, the water value line. */
export default function AdviceView() {
  const twin = useTwin();
  const nav = useNavigate();
  const rounds = twin.rounds[BLOCK] ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const round = rounds.find((r) => r.id === picked) ?? rounds[rounds.length - 1];
  const advice = useMemo(() => (round ? adviceFor(twin, BLOCK, round.id) : null), [twin, round]);
  const [scenarioId, setScenarioId] = useState("today");
  const [lit, setLit] = useState<Card | null>(null);
  const [why, setWhy] = useState<Card | null>(null);
  const latest = round && round.id === rounds[rounds.length - 1]?.id;
  const responseOf = (c: Card) => twin.feedback.find((f) => f.cardId === c.id && f.roundId === round!.id);
  const openPlant = (id: PlantId) => nav(`/rover/plants?plant=${id}`);
  const start = () => { const r = runRound(scenarioId); setPicked(r.id); };

  const head = (
    <div className="rv2-head">
      <label>Block<select className="rv2-select" value={BLOCK} disabled><option value="t1">T1 Tomato</option></select></label>
      {rounds.length > 0 && (
        <label>Round
          <select className="rv2-select" value={round?.id} onChange={(e) => setPicked(e.target.value)}>
            {[...rounds].reverse().map((r) => <option key={r.id} value={r.id}>{roundWord(r)}</option>)}
          </select>
        </label>
      )}
      <span className="grow" />
      <label>Next round
        <select className="rv2-select" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
          {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}: {s.short}</option>)}
        </select>
      </label>
      <button type="button" className="rv2-btn primary" style={{ alignSelf: "flex-end" }} onClick={start}><Play size={16} aria-hidden />Run round</button>
    </div>
  );

  if (!round || !advice) {
    return (
      <div className="rv2">
        {head}
        <div className="rv2-panel rv2-empty">
          <h2>No round yet</h2>
          <p className="muted">Run a simulated round of T1 to see what to do, where, how much and by when.</p>
        </div>
      </div>
    );
  }

  const litSet = lit ? new Set(lit.where.plants) : undefined;
  const todo = advice.cards.length;
  return (
    <div className="rv2">
      {head}
      <div className="rv2-grid">
        <section className="rv2-cards" aria-label="Advice">
          <div className="rv2-outcome">
            <span className="rv2-chip">{advice.outcome}</span>
            {!latest && <span className="rv2-chip">Earlier round</span>}
          </div>
          <h2>{todo === 0 ? "Nothing to do today" : `Today: ${todo} ${todo === 1 ? "thing" : "things"} to do`}</h2>
          {advice.cards.map((c, i) => (
            <AdviceCard key={c.id} card={c} n={i + 1} response={responseOf(c)}
                        onRespond={(r, answer) => respond({ cardId: c.id, roundId: round.id, kind: c.kind, plants: c.where.plants, response: r, answer })}
                        onUndo={() => undoResponse(c.id, round.id)} onWhy={() => setWhy(c)}
                        onHover={(on) => setLit(on ? c : null)} />
          ))}
          {advice.canWait.length > 0 && (
            <details className="rv2-later">
              <summary>Can wait ({advice.canWait.length})</summary>
              <div className="rv2-cards">
                {advice.canWait.map((c, i) => (
                  <AdviceCard key={c.id} card={c} n={advice.cards.length + i + 1} response={responseOf(c)}
                              onRespond={(r, answer) => respond({ cardId: c.id, roundId: round.id, kind: c.kind, plants: c.where.plants, response: r, answer })}
                              onUndo={() => undoResponse(c.id, round.id)} onWhy={() => setWhy(c)}
                              onHover={(on) => setLit(on ? c : null)} />
                ))}
              </div>
            </details>
          )}
          <div className="rv2-foot">
            <span><b>{advice.counts.fine}</b> fine</span>
            {advice.counts.unchecked > 0 && <span><b>{advice.counts.unchecked}</b> not checked</span>}
          </div>
        </section>
        <aside className="rv2-panel rv2-map" aria-label="Field map">
          <h3>Field map</h3>
          <FieldMap rows={round.rows} spots={round.spots} status={advice.status} lit={litSet} onPick={openPlant}
                    label={`${round.label}: one mark a plant`} />
          <MapLegend />
          <div className="rv2-value">
            {advice.value ? (
              <>
                <div>Water today</div>
                <div><span className="big">{litres(advice.value.waterL)}</span> for {advice.value.plants} plants</div>
                <div className="muted small">All {advice.value.allPlants} at this dose: {litres(advice.value.allL)}</div>
              </>
            ) : <div className="muted">No watering from this round</div>}
          </div>
        </aside>
      </div>
      {why && <WhyPanel card={why} onClose={() => setWhy(null)} />}
    </div>
  );
}
