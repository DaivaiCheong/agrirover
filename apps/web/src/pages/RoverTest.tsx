import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Cable, Camera, Cpu, ExternalLink, OctagonX, Wifi } from "lucide-react";
import wiringUrl from "../assets/rover-wiring.svg";
import { Led, Notice, Panel } from "../components/ui";
import { api, type RoverTestMove, type RoverTestStatus } from "../lib/api";
import { usePoll } from "../lib/usePoll";

type Move = "forward" | "back" | "left" | "right";
const MOVES: { move: Move; label: string; icon: typeof ArrowUp; hint: string }[] = [
  { move: "forward", label: "Forward", icon: ArrowUp, hint: "0.6 s" },
  { move: "left", label: "Turn left", icon: ArrowLeft, hint: "0.5 s, on the spot" },
  { move: "right", label: "Turn right", icon: ArrowRight, hint: "0.5 s, on the spot" },
  { move: "back", label: "Back", icon: ArrowDown, hint: "0.6 s" },
];

// The pins drawn in docs/hardware/rover-wiring.svg (generator: docs/hardware/rover_wiring.py), as the firmware reports them.
const DIAGRAM_PINS = "L:32,33,25;L:13,26,27;R:23,22,21;R:17,19,18";
const WHEELS = ["Front-left", "Rear-left", "Front-right", "Rear-right"];

function pinWords(pins: string | null | undefined, fw: string | null | undefined) {
  if (!pins) return { ok: false, text: `${fw ?? "This firmware"} does not report its pins: flash rover-mc-2.1.0 to use the wiring below.` };
  if (pins === DIAGRAM_PINS) return { ok: true, text: "Same as the wiring diagram below." };
  return { ok: false, text: `Not the diagram's pins: ${pins.split(";").map((c, i) => `${WHEELS[i] ?? c[0]} ${c.slice(2).replace(/,/g, "/")}`).join(" · ")}` };
}

const signal = (rssi: number | null | undefined) =>
  rssi == null ? "—" : `${rssi} dBm · ${rssi >= -60 ? "strong" : rssi >= -72 ? "good" : rssi >= -80 ? "weak" : "very weak"}`;

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <tr><th style={{ fontWeight: 500, width: 150 }}>{k}</th><td>{v}</td></tr>;
}

export default function RoverTest() {
  const { data, error } = usePoll<RoverTestStatus>(api.roverTest, 2000);
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState<Move | null>(null);
  const [result, setResult] = useState<RoverTestMove | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoAt, setPhotoAt] = useState<Date | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const rover = data?.rover;
  const cam = data?.camera;
  const roverOnline = rover?.status === "online";
  const canMove = roverOnline && rover?.wifiDriving === true && rover?.estop !== true && clear && !busy;

  async function move(m: Move) {
    setBusy(m); setProblem(null); setResult(null);
    try { setResult(await api.roverTestMove(m)); } catch (e) { setProblem((e as Error).message); }
    setBusy(null);
  }
  async function stop() {
    try { await api.roverTestStop(); } catch (e) { setProblem((e as Error).message); }
  }
  async function snap() {
    setPhotoBusy(true); setPhotoProblem(null);
    try { setPhoto(await api.roverTestPhoto()); setPhotoAt(new Date()); } catch (e) { setPhotoProblem((e as Error).message); }
    setPhotoBusy(false);
  }

  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {error && <Notice kind="alert">Cannot reach the farm server: {String(error)}</Notice>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        <Panel title="Wheels" icon={Cpu}
               right={<Led kind={roverOnline ? "ok" : "alert"}>ROVER-01 {rover?.status ?? "…"}</Led>}>
          <table className="tbl" style={{ marginBottom: 12 }}>
            <tbody>
              <Row k="Wi-Fi" v={<><Wifi size={14} aria-hidden /> {rover?.ip ?? "—"} · {signal(rover?.rssi)}</>} />
              <Row k="Firmware" v={rover?.fw ?? "—"} />
              <Row k="Wi-Fi driving" v={rover?.wifiDriving == null ? "—" : rover.wifiDriving ? "On" : "Off in the firmware (MQTT_DRIVE 0)"} />
              <Row k="E-stop" v={rover?.estop ? <span style={{ color: "var(--alert)" }}>Engaged</span> : "Released"} />
              <Row k="Battery" v={rover?.batteryV != null ? `${rover.batteryV.toFixed(2)} V` : "Not measured (no divider on GPIO 34 yet)"} />
              {rover?.status === "online" && (() => {
                const p = pinWords(rover.pins, rover.fw);
                return <Row k="Motor pins" v={<span style={{ color: p.ok ? "var(--ok)" : "var(--warn)" }}>{p.text}</span>} />;
              })()}
            </tbody>
          </table>

          <label className="small" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12 }}>
            <input type="checkbox" checked={clear} onChange={e => setClear(e.target.checked)} />
            <span>Wheels off the ground, or a clear metre all round. Hand on the power switch.</span>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 360 }}>
            {([null, MOVES[0], null, MOVES[1], "stop", MOVES[2], null, MOVES[3], null] as (typeof MOVES[number] | "stop" | null)[]).map((m, i) => {
              if (m === null) return <span key={i} />;
              if (m === "stop") return (
                <button key={i} className="btn btn-alert" onClick={stop} title="Stop the wheels now">
                  <OctagonX size={16} aria-hidden /> Stop
                </button>
              );
              const Icon = m.icon;
              return (
                <button key={i} className="btn btn-ghost" disabled={!canMove} onClick={() => move(m.move)} title={m.hint}>
                  <Icon size={16} aria-hidden /> {busy === m.move ? "…" : m.label}
                </button>
              );
            })}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Each press is one short, slow move (PWM 150 of 255). The rover stops by itself after it, and after 1.5 s whatever it is sent.
          </p>
          {!roverOnline && <Notice kind="warn">The rover is not on the broker. Power it and check it joined the Wi-Fi.</Notice>}
          {roverOnline && rover?.wifiDriving === false &&
            <Notice kind="warn">The rover refuses moves over Wi-Fi. Set <code>MQTT_DRIVE 1</code> in its <code>secrets.h</code> and flash it.</Notice>}
          {problem && <Notice kind="alert">{problem}</Notice>}
          {result && <Notice kind={result.ok ? "ok" : "alert"}>{result.text}</Notice>}
        </Panel>

        <Panel title="Camera" icon={Camera}
               right={<Led kind={cam?.status === "online" ? (cam.sensor ? "ok" : "warn") : "alert"}>ROVER-CAM-01 {cam?.status ?? "…"}</Led>}>
          <table className="tbl" style={{ marginBottom: 12 }}>
            <tbody>
              <Row k="Wi-Fi" v={<><Wifi size={14} aria-hidden /> {cam?.ip ?? "—"} · {signal(cam?.rssi)}</>} />
              <Row k="Camera module" v={cam?.sensor == null ? "—" : cam.sensor ? `Working · ${cam.size}` :
                <span style={{ color: "var(--alert)" }}>Does not answer</span>} />
              <Row k="Firmware" v={cam?.fw ?? "—"} />
            </tbody>
          </table>
          <button className="btn" onClick={snap} disabled={photoBusy}>
            <Camera size={16} aria-hidden /> {photoBusy ? "Taking a photo…" : "Take a test photo"}
          </button>
          {cam?.status === "online" && cam.sensor === false &&
            <Notice kind="warn">The camera board is on Wi-Fi, but its camera module does not answer. Check the ribbon cable, or fit a new OV2640 module.</Notice>}
          {photoProblem && <Notice kind="alert">{photoProblem}</Notice>}
          {photo && (
            <figure style={{ margin: "12px 0 0" }}>
              <img src={photo} alt="Test photo from the rover camera" style={{ width: "100%", borderRadius: 8, display: "block" }} />
              <figcaption className="small muted" style={{ marginTop: 4 }}>Taken {photoAt?.toLocaleTimeString()}</figcaption>
            </figure>
          )}
        </Panel>
      </div>

      <Panel title="Wiring" icon={Cable}
             right={<a className="linkbtn small" href={wiringUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> Full size</a>}>
        <p className="small muted" style={{ margin: "0 0 10px" }}>
          One ESP32 pin for each L298N pin. Take the ENA and ENB jumpers off, join every GND, then press Forward above.
        </p>
        <a href={wiringUrl} target="_blank" rel="noreferrer">
          <img src={wiringUrl} alt="Wiring: ESP32 D32, D33, D25, D26, D27, D13 to the left L298N; D23, D22, D21, D19, D18, TX2 to the right L298N; four motors on OUT1 to OUT4"
               style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} />
        </a>
      </Panel>
    </main>
  );
}
