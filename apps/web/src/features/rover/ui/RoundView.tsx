import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import "./rover.css";
import { adviceFor, useTwin } from "../store";
import { litres } from "../sim/advice";
import { SIGN_LOOK, type Sign } from "../sim/crop";
import type { PlantId, RoundData } from "../sim/scout";
import FieldMap, { MapLegend } from "./FieldMap";
import { roundWord } from "./AdviceView";
import { SPEEDS, STOPS_PER_SECOND, replayAt, stopTotal, type Speed } from "./replay";

const BLOCK = "t1";
const words = (s: string) => SIGN_LOOK[s as Sign]?.word ?? s;

/** The round as the rover checked it, stop by stop. The field fills in as the rover goes; the numbers are the round's own. */
export default function RoundView() {
  const twin = useTwin();
  const nav = useNavigate();
  const rounds = twin.rounds[BLOCK] ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const round: RoundData | undefined = rounds.find((r) => r.id === picked) ?? rounds[rounds.length - 1];
  const advice = useMemo(() => (round ? adviceFor(twin, BLOCK, round.id) : null), [twin, round]);
  const total = round ? stopTotal(round) : 0;

  const [progress, setProgress] = useState(0);            // stops, fractional while playing
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(10);
  const latest = useRef(progress);
  latest.current = progress;

  // a new round, or a different one picked, starts again from its first stop, paused
  useEffect(() => { setProgress(0); setPlaying(false); }, [round?.id]);

  // advance by real time at the chosen speed; stop at the last stop
  useEffect(() => {
    if (!playing || !round) return;
    let last = performance.now(), frame = 0;
    const tick = (now: number) => {
      const next = Math.min(total, latest.current + ((now - last) / 1000) * STOPS_PER_SECOND[speed]);
      last = now;
      latest.current = next;
      setProgress(next);
      if (next >= total) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, round, total]);

  if (!round || !advice) {
    return (
      <div className="rv2">
        <div className="rv2-panel rv2-empty">
          <h2>No round to replay yet</h2>
          <p className="muted">Run a simulated round on the Advice tab first.</p>
        </div>
      </div>
    );
  }

  const reached = Math.floor(progress);
  const r = replayAt(round, advice, reached, words);
  const done = reached >= total;
  const nowPlant = r.current[0];
  const nowWhat = nowPlant ? (r.signs[nowPlant]?.length ? r.signs[nowPlant].join(", ") : "nothing seen") : null;

  return (
    <div className="rv2">
      <div className="rv2-head">
        <label>Round
          <select className="rv2-select" value={round.id} onChange={(e) => setPicked(e.target.value)}>
            {[...rounds].reverse().map((x) => <option key={x.id} value={x.id}>{roundWord(x)}</option>)}
          </select>
        </label>
        <span className="grow" />
        <span className="rv2-chip" aria-live="polite">{done ? "Round done" : playing ? "Replaying" : reached === 0 ? "Not started" : "Paused"}</span>
      </div>

      <div className="rv2-panel rv2-replay" aria-label="Replay controls">
        <button type="button" className="rv2-btn primary" onClick={() => {
          if (playing) { setPlaying(false); return; }
          if (done) { latest.current = 0; setProgress(0); }      // a finished round starts again
          setPlaying(true);
        }} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}{playing ? "Pause" : done ? "Replay" : "Play"}
        </button>
        <span className="seg" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={speed === s ? "on" : ""} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </span>
        <label className="rv2-scrub">
          <span className="small muted">Stop {reached} of {total}</span>
          <input type="range" min={0} max={total} step={1} value={reached} aria-label="Stop"
                 onChange={(e) => { setPlaying(false); const v = Number(e.target.value); latest.current = v; setProgress(v); }} />
        </label>
      </div>
      <div className="rv2-bar" aria-hidden><span style={{ width: `${total ? (progress / total) * 100 : 0}%` }} /></div>

      <div className="rv2-grid">
        <section className="rv2-panel rv2-map" aria-label="Field as the rover sees it">
          <FieldMap rows={round.rows} spots={round.spots} status={r.status} lit={new Set(r.current)} onPick={(id: PlantId) => nav(`/rover/plants?plant=${id}`)}
                    label={`${round.label}: the rover's stops so far`} />
          <MapLegend />
        </section>

        <aside className="rv2-cards" aria-label="Now and so far">
          <div className="rv2-panel rv2-now">
            <div className="small muted">Now</div>
            {nowPlant ? (
              <>
                <h2>{r.current.length === 1 ? nowPlant : `${r.current.length} plants`}</h2>
                <p>{nowWhat}</p>
              </>
            ) : <p className="muted">Not started</p>}
          </div>
          <div className="rv2-panel rv2-gauges">
            <div><span className="big num">{r.seen}</span><span className="small muted">photos taken</span></div>
            <div><span className="big num">{r.looks}</span><span className="small muted">to look at</span></div>
            <div><span className="big num">{litres(r.waterL)}</span><span className="small muted">water so far</span></div>
          </div>
          <p className="small muted rv2-note">
            A replay of the round&apos;s record. Nothing is driven here: the rover&apos;s live view comes with the rover.
          </p>
        </aside>
      </div>
    </div>
  );
}
