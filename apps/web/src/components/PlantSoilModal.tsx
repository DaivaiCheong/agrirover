import { useState } from "react";
import { ArrowRight, Camera, Eye, EyeOff, History, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import RoverVisionPhoto from "./RoverVisionPhoto";
import { Modal, Notice, Tag } from "./ui";
import { photoImageUrl } from "../lib/api";
import type { MetricRating, PlantSoilRow, SoilTargets } from "../lib/soil";
import { buildPlantCarePlan, type CareStep } from "../lib/treatments";

export function CareStepList({ steps }: { steps: CareStep[] }) {
  return (
    <ol className="rv-step-list small">
      {steps.map((s) => (
        <li key={s.step} className="rv-step-item">
          <span className="rv-step-badge">Step {s.step}</span>
          <div className="rv-step-copy">
            <b>{s.label}:</b> {s.action}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ratingClass(state: MetricRating): string {
  return state === "low" || state === "high" ? "ts-item ts-off" : "ts-item";
}

function fmtNum(v: number | null, digits: number, unit = ""): string {
  if (v === null) return "—";
  return `${v.toFixed(digits)}${unit}`;
}

function formatCapturedAt(iso: string | null): string {
  if (!iso) return "Captured automatically by AgriRover";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Captured automatically by AgriRover";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const timeStr = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const dayStr = sameDay ? "Today" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `Captured automatically by AgriRover · ${dayStr}, ${timeStr}`;
}

export default function PlantSoilModal({
  plant,
  blockLabel,
  targets,
  liveFrame,
  onClose,
  onViewHistory,
}: {
  plant: PlantSoilRow;
  blockLabel: string;
  targets: SoilTargets;
  liveFrame?: string | null;
  onClose: () => void;
  onViewHistory: (plant: PlantSoilRow) => void;
}) {
  const [showBoxes, setShowBoxes] = useState(true);

  const v = plant.vision;
  const r = plant.readings;
  const savedPhoto = plant.camera.latestPhoto;
  const photoSrc = liveFrame
    ? `data:image/jpeg;base64,${liveFrame}`
    : savedPhoto
      ? photoImageUrl(savedPhoto.id)
      : null;

  const carePlan = buildPlantCarePlan(plant, targets);

  const statusTag =
    plant.status === "optimal"
      ? <Tag kind="ok">Optimal</Tag>
      : plant.status === "attention"
        ? <Tag kind="warn">Needs attention</Tag>
        : <Tag>{plant.reached && !plant.plant ? "No plant detected" : "Unrecorded"}</Tag>;

  const visionTagKind = v.status === "healthy" ? "ok" : v.status === "alert" ? "warn" : undefined;

  return (
    <Modal title={`${blockLabel} · ${plant.name}`} onClose={onClose} width={740}>
      <div className="modal-body-erp stack">
        <div className="psm-top">
          <div className="psm-status-row">
            {statusTag}
            <span className="small muted">Row {plant.row + 1}, Plant {plant.col + 1}</span>
            {plant.waterLitres !== null && plant.plant && (
              <span className="small muted">· Water today: <b>{plant.waterLitres} L</b></span>
            )}
          </div>
          {plant.issues.length > 0 && (
            <Notice kind="warn">{plant.issues.join(" · ")}</Notice>
          )}
        </div>

        {/* Rover Camera & AI Analysis */}
        <div className="erp-section">
          <div className="erp-section-header">
            <span className="erp-section-title"><Camera size={14} aria-hidden />Rover camera &amp; AI analysis</span>
            <div className="rowflex" style={{ gap: 8 }}>
              <Tag kind={visionTagKind}>{v.badgeLabel}</Tag>
              {v.boxes.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-pressed={showBoxes}
                  onClick={() => setShowBoxes((x) => !x)}
                >
                  {showBoxes ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  {showBoxes ? "Hide AI boxes" : "Show AI boxes"}
                </button>
              )}
            </div>
          </div>

          <div className="rv-vision-grid">
            <RoverVisionPhoto
              plantName={plant.name}
              vision={v}
              canopy={plant.canopy}
              chlorosis={plant.chlorosis}
              soilMoisture={r.moisture}
              photoSrc={photoSrc}
              showBoxes={showBoxes}
            />

            <div className="rv-vision-summary">
              <div className="rv-diag-item">
                <span className="ts-k">Detected condition</span>
                <b className={`rv-diag-val${v.status === "alert" ? " rv-diag-warn" : ""}`}>{v.condition}</b>
                {v.linkedNote && <span className="small muted">{v.linkedNote}</span>}
              </div>
              <div className="rv-diag-item">
                <span className="ts-k">Confidence &amp; severity</span>
                <span className="rv-diag-val">
                  {v.confidencePct !== null
                    ? `${v.confidencePct}% confidence · ${v.severity === "None" ? "No issues" : `${v.severity} severity`}`
                    : "—"}
                </span>
              </div>
              <div className="rv-diag-item">
                <span className="ts-k">Growth stage detected</span>
                <span className="rv-diag-val">
                  {v.growthStage ?? "—"}
                  {v.reproductiveNote && <span className="muted"> · {v.reproductiveNote}</span>}
                </span>
              </div>
              <div className="rv-diag-item">
                <span className="ts-k">Canopy metrics</span>
                <span className="rv-diag-val">
                  Leaf cover {plant.camera.leafCoverPct !== null ? `${plant.camera.leafCoverPct}%` : "—"} · Yellowing{" "}
                  {plant.camera.chlorosisPct !== null ? `${plant.camera.chlorosisPct}%` : "—"}
                </span>
              </div>
              <p className="small muted rv-diag-time">{formatCapturedAt(v.capturedAt)}</p>
            </div>
          </div>
        </div>

        {/* Live soil telemetry */}
        <div className="erp-section">
          <div className="erp-section-header">
            <span className="erp-section-title">Live soil telemetry</span>
            <span className="small muted">Recorded automatically by rover probe</span>
          </div>
          <div className="ts-grid psm-metrics">
            <div className={ratingClass(plant.states.ph)}>
              <span className="ts-k">Soil pH</span>
              <span className="ts-v">{fmtNum(r.ph, 2)}</span>
              <span className="ts-t">Target {targets.ph[0]}–{targets.ph[1]}</span>
            </div>
            <div className={ratingClass(plant.states.moisture)}>
              <span className="ts-k">Moisture</span>
              <span className="ts-v">{fmtNum(r.moisture, 1, " %")}</span>
              <span className="ts-t">Target {targets.moisture[0]}–{targets.moisture[1]} %</span>
            </div>
            <div className={ratingClass(plant.states.ec)}>
              <span className="ts-k">EC</span>
              <span className="ts-v">{fmtNum(r.ec, 2, " mS/cm")}</span>
              <span className="ts-t">Target {targets.ec[0]}–{targets.ec[1]}</span>
            </div>
            <div className={ratingClass(plant.states.soilTemp)}>
              <span className="ts-k">Soil Temp</span>
              <span className="ts-v">{fmtNum(r.soilTemp, 1, " °C")}</span>
              <span className="ts-t">Target {targets.soilTemp[0]}–{targets.soilTemp[1]} °C</span>
            </div>
            <div className="ts-item">
              <span className="ts-k">Nitrogen (N)</span>
              <span className="ts-v">{r.n !== null ? `${Math.round(r.n)} mg/kg` : "—"}</span>
              <span className="ts-t">Probe trend</span>
            </div>
            <div className="ts-item">
              <span className="ts-k">Phosphorus (P)</span>
              <span className="ts-v">{r.p !== null ? `${Math.round(r.p)} mg/kg` : "—"}</span>
              <span className="ts-t">Probe trend</span>
            </div>
            <div className="ts-item">
              <span className="ts-k">Potassium (K)</span>
              <span className="ts-v">{r.k !== null ? `${Math.round(r.k)} mg/kg` : "—"}</span>
              <span className="ts-t">Probe trend</span>
            </div>
            <div className="ts-item">
              <span className="ts-k">Organic matter</span>
              <span className="ts-v">{plant.organicMatterPct.toFixed(1)} %</span>
              <span className="ts-t">{plant.texture}</span>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Rooting depth &amp; drainage: <b>{plant.rootingSummary}</b>
          </p>
        </div>

        {/* Live-Telemetry-Linked Recommended Care & Step-by-Step Procedure */}
        {carePlan && (
          <div className="erp-section rv-care-card">
            <div className="erp-section-header">
              <span className="erp-section-title">
                <ShieldCheck size={14} aria-hidden />Recommended care &amp; treatment · {carePlan.title}
              </span>
              <Link
                className="linkbtn small rowflex"
                style={{ gap: 4 }}
                to={`/crop?tab=guide&zone=${encodeURIComponent(plant.zone)}&plant=${encodeURIComponent(plant.name)}#${carePlan.guideId}`}
                state={{ plant, blockLabel, targets }}
                onClick={onClose}
              >
                View full treatment guide <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
            <div className="rv-care-body">
              <div className="rv-care-diag">
                <span className="ts-k">Live probe diagnosis ({plant.name})</span>
                <p className="small">{carePlan.diagnosisNote}</p>
              </div>
              <div>
                <span className="ts-k">Step-by-step care procedure</span>
                <CareStepList steps={carePlan.steps} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="modal-foot-erp">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onViewHistory(plant)}>
          <History size={15} aria-hidden />View photo history
        </button>
        <div className="erp-foot-actions">
          <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
