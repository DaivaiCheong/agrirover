import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./rover.css";
import { adviceFor, useTwin } from "../store";
import { SIGN_LOOK } from "../sim/crop";
import type { Advice, PlantStatus } from "../sim/advice";
import type { PlantId } from "../sim/scout";
import { STATUS_LOOK } from "./FieldMap";
import { roundWord } from "./AdviceView";

const BLOCK = "t1";
type Filter = "all" | PlantStatus;
const FILTERS: { k: Filter; word: string }[] = [
  { k: "all", word: "All" }, { k: "water", word: "Water" }, { k: "look", word: "Look at" }, { k: "unchecked", word: "Not checked" },
];
const SOURCE: Record<string, string> = { measured: "measured", laneProxy: "lane reading", interpolated: "estimated", none: "no reading" };
const ANSWER: Record<string, string> = { done: "Done", later: "Later", wrong: "Wrong" };

/** One record per plant: every round's soil reading, what the camera saw, the actions and what came of them. */
export default function PlantsView() {
  const twin = useTwin();
  const rounds = twin.rounds[BLOCK] ?? [];
  const [search, setSearch] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const advices = useMemo(() => rounds.map((r) => adviceFor(twin, BLOCK, r.id)!), [twin, rounds]);
  const last = rounds[rounds.length - 1], lastAdvice: Advice | undefined = advices[advices.length - 1];

  if (!last || !lastAdvice) {
    return <div className="rv2"><div className="rv2-panel rv2-empty"><h2>No plants yet</h2>
      <p className="muted">Run a round on <Link to="/rover/advice">Advice</Link> first.</p></div></div>;
  }
  const ids = last.plants.map((o) => o.id).filter((id) => filter === "all" || lastAdvice.status[id] === filter);
  const plant: PlantId = search.get("plant") ?? ids[0] ?? last.plants[0].id;
  const pick = (id: PlantId) => setSearch({ plant: id });

  return (
    <div className="rv2">
      <div className="rv2-plants">
        <div>
          <div className="rv2-filter" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.k} type="button" className="rv2-btn sm" aria-pressed={filter === f.k} onClick={() => setFilter(f.k)}>
                {f.word}{f.k !== "all" ? ` ${lastAdvice.counts[f.k]}` : ""}
              </button>
            ))}
          </div>
          <nav className="rv2-panel rv2-list" aria-label="Plants">
            {ids.length === 0 && <p className="muted" style={{ padding: 16 }}>None.</p>}
            {ids.map((id) => {
              const st = lastAdvice.status[id];
              return (
                <button key={id} type="button" className={id === plant ? "on" : ""} aria-current={id === plant ? "true" : undefined} onClick={() => pick(id)}
                        ref={id === plant ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}>
                  <span>{id}</span><span className={`small st-${st}`}>{STATUS_LOOK[st].word}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <section className="rv2-panel" style={{ padding: 24 }} aria-labelledby="plant-title">
          <h2 id="plant-title">{plant}</h2>
          <p className={`st-${lastAdvice.status[plant] ?? "unchecked"}`} style={{ margin: "4px 0 16px", fontWeight: 700 }}>
            {STATUS_LOOK[lastAdvice.status[plant] ?? "unchecked"].word}
          </p>
          <ol className="rv2-tl" reversed>
            {[...rounds].map((r, i) => ({ r, a: advices[i] })).reverse().map(({ r, a }) => {
              const o = r.plants.find((x) => x.id === plant);
              const cards = [...a.cards, ...a.canWait].filter((c) => c.where.plants.includes(plant));
              return (
                <li key={r.id}>
                  <span className="small muted">{roundWord(r)}</span>
                  <div>
                    {!o ? <span className="muted">Not in this round</span> : (
                      <>
                        <div>Soil: {o.soil.theta === null ? <span className="muted">no reading{o.soil.probe === "tooHard" ? " (soil too hard)" : ""}</span>
                          : <><span className="num">θ {o.soil.theta.toFixed(2)}</span> <span className="muted small">{SOURCE[o.soil.source]}</span></>}</div>
                        <div>Photo: {o.seen === 0 ? <span className="muted">none</span>
                          : o.signs.filter((s) => s.p >= 0.5).map((s) => SIGN_LOOK[s.sign].word).join(", ") || "nothing seen"}
                          {o.seen > 0 && <span className="muted small"> · {Math.round(o.seen * 100)} % of the plant in view</span>}</div>
                        {cards.map((c) => {
                          const fb = twin.feedback.find((f) => f.cardId === c.id && f.roundId === r.id);
                          return <div key={c.id}><b>{c.action}</b>{fb ? ` · ${ANSWER[fb.response]}${fb.answer ? `: ${fb.answer}` : ""}` : ""}</div>;
                        })}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
