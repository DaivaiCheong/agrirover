import { useEffect, useRef, useState } from "react";
import { OctagonX } from "lucide-react";
import { useEstop, useRoverLive, useRoverTest } from "../../../lib/queries";
import { chargePct, roverState, type StateKind } from "./roverState";
import "./roverbar.css";

/** Release needs this long a hold, so nobody restarts a rover by accident. */
export const RELEASE_HOLD_MS = 1500;

const KIND_CLASS: Record<StateKind, string> = { ok: "rb-ok", info: "rb-info", warn: "rb-warn", alert: "rb-alert", wip: "rb-wip" };

/** Hold to release: the fill grows over 1.5 s; letting go early does nothing. Keyboard: hold Space or Enter. */
function HoldToRelease({ onRelease }: { onRelease: () => void }) {
  const [p, setP] = useState(0);
  const frame = useRef<number | null>(null);
  const t0 = useRef(0);
  const cancel = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; setP(0); };
  const start = () => {
    if (frame.current !== null) return;
    t0.current = performance.now();
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0.current) / RELEASE_HOLD_MS);
      setP(f);
      if (f >= 1) { frame.current = null; setP(0); onRelease(); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  return (
    <button type="button" className="rb-hold" aria-label="Release the rover: hold for 1.5 seconds"
            onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
            onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); } }}
            onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") cancel(); }} onBlur={cancel}>
      <span className="rb-fill" style={{ width: `${p * 100}%` }} aria-hidden />
      <span className="rb-hold-word">Hold to release</span>
    </button>
  );
}

/** The rover's state, charge and E-stop. It sits above the tabs on every rover screen, so the E-stop never moves. */
export default function RoverBar() {
  const live = useRoverLive(true);
  const test = useRoverTest();
  const estop = useEstop();
  const problem = estop.error ? estop.error.message : null;
  const rover = live.data?.rover ?? null, mission = live.data?.mission ?? null;
  const state = roverState({ rover, mission });
  const volts = test.data?.rover.batteryV ?? mission?.battery ?? null;
  const pct = volts == null ? null : chargePct(volts);

  function setEstop(engaged: boolean) {
    estop.mutate(engaged);
  }

  return (
    <div className="rb" role="region" aria-label="Rover">
      <span className={`rb-chip ${KIND_CLASS[state.kind]}`} aria-live="polite">{state.word}</span>
      {pct != null && <span className="rb-batt" title={`${volts!.toFixed(2)} V at rest`}>Charge {pct} %</span>}
      <span className="rb-tag">{mission?.simulated === false ? "Real rover" : "Simulated"}</span>
      <span className="rb-spacer" />
      {problem && <span className="rb-problem" role="alert">{problem}</span>}
      {rover?.estop
        ? <HoldToRelease onRelease={() => setEstop(false)} />
        : (
          <button type="button" className="rb-estop" aria-label="E-stop: stop the rover now" onClick={() => setEstop(true)}>
            <OctagonX size={18} aria-hidden />E-stop
          </button>
        )}
    </div>
  );
}
