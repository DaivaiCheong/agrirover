import type { PlantVisionInfo, VisionBox } from "../lib/vision";

function boxStyle(b: VisionBox) {
  return {
    left: `${Math.max(2, b.x)}%`,
    top: `${Math.max(2, b.y)}%`,
    width: `${Math.min(96 - Math.max(2, b.x), b.w)}%`,
    height: `${Math.min(96 - Math.max(2, b.y), b.h)}%`,
  };
}

function boxLabelClass(b: VisionBox): string {
  const classes = ["rv-box-lbl"];
  if (b.kind === "fruit") classes.push("rv-lbl-bottom");
  if (b.kind !== "foliage" && b.x + b.w > 64) classes.push("rv-lbl-right");
  return classes.join(" ");
}

function boxKindClass(kind: VisionBox["kind"]): string {
  switch (kind) {
    case "issue":
      return "rv-box rv-box-issue";
    case "fruit":
      return "rv-box rv-box-fruit";
    case "flower":
      return "rv-box rv-box-flower";
    case "stem":
      return "rv-box rv-box-stem";
    default:
      return "rv-box rv-box-foliage";
  }
}

/** Realistic sample tomato plant scene matching the plant's detected condition, growth stage, and soil moisture. */
function SimulatedTomatoFrame({
  vision,
  canopy = 0.42,
  chlorosis = 0,
  soilMoisture = 64,
}: {
  vision: PlantVisionInfo;
  canopy?: number | null;
  chlorosis?: number | null;
  soilMoisture?: number | null;
}) {
  const wet = Math.min(1, Math.max(0, (soilMoisture ?? 62) / 85));
  const soilColor = wet > 0.58 ? "#8e7154" : "#b89b77";
  const hasPlant = vision.status !== "none" && vision.status !== "unrecorded";
  const scale = Math.max(0.78, Math.min(1.16, (canopy ?? 0.42) / 0.4));

  const cond = vision.condition.toLowerCase();
  const isCurl = cond.includes("curl");
  const isBlight = cond.includes("blight") || cond.includes("spot");
  const isBlossom = cond.includes("blossom");
  const isPest = cond.includes("pest") || cond.includes("miner");
  const isYellow = !isBlight && !isCurl && !isBlossom && !isPest && (vision.status === "alert" || (chlorosis ?? 0) >= 0.08);

  const stageLower = (vision.growthStage ?? "").toLowerCase();
  const showFlowers = vision.status === "healthy" || stageLower.includes("flower");
  const showFruits = vision.status === "healthy" || isYellow || isBlossom || stageLower.includes("fruit");

  return (
    <svg viewBox="0 0 320 210" className="rv-cam-svg" role="img" aria-label={`Rover camera capture: ${vision.condition}`}>
      <defs>
        <linearGradient id="tomatoBackdrop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eaf1e6" />
          <stop offset="56%" stopColor="#d7e4d1" />
          <stop offset="57%" stopColor={soilColor} />
          <stop offset="100%" stopColor="#775c42" />
        </linearGradient>
      </defs>

      <rect width="320" height="210" fill="url(#tomatoBackdrop)" />
      {/* Drip line & mulch texture */}
      <line x1="0" y1="158" x2="320" y2="158" stroke="#37413b" strokeWidth="2.5" opacity="0.45" />
      <circle cx="58" cy="172" r="2.8" fill="#5b432c" opacity="0.25" />
      <circle cx="248" cy="176" r="3" fill="#5b432c" opacity="0.24" />
      <circle cx="282" cy="164" r="2.2" fill="#5b432c" opacity="0.24" />

      {hasPlant ? (
        <g transform={`translate(160 144) scale(${scale}) translate(-160 -144)`}>
          {/* Tomato trellis stake */}
          <rect x="158" y="34" width="4" height="148" rx="1.5" fill="#9a8265" opacity="0.6" />

          {/* Main tomato stem & lateral branches */}
          <path d="M156 178 C156 142 162 110 158 58" stroke="#4f7c3c" strokeWidth="5.5" strokeLinecap="round" fill="none" />
          <path d="M158 124 C138 118 118 114 96 112" stroke="#4f7c3c" strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <path d="M160 116 C182 112 204 110 226 112" stroke="#4f7c3c" strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <path d="M159 84 C140 76 124 72 108 72" stroke="#578843" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          <path d="M160 76 C182 68 202 66 220 68" stroke="#578843" strokeWidth="2.8" strokeLinecap="round" fill="none" />

          {/* Compound tomato foliage */}
          <ellipse cx="118" cy="74" rx="22" ry="12" transform="rotate(-14 118 74)" fill="#3b8e52" />
          <ellipse cx="102" cy="82" rx="16" ry="10" transform="rotate(8 102 82)" fill="#479d5f" />
          <ellipse cx="142" cy="54" rx="22" ry="13" transform="rotate(-8 142 54)" fill="#348049" />
          <ellipse cx="176" cy="54" rx="20" ry="12" transform="rotate(10 176 54)" fill="#419658" />
          <ellipse cx="114" cy="112" rx="24" ry="13" transform="rotate(-10 114 112)" fill="#36844b" />
          <ellipse cx="140" cy="120" rx="18" ry="11" fill="#2f7543" />

          {/* Upper right leaves (curled upward if Leaf curl, else healthy compound leaves) */}
          {isCurl ? (
            <g>
              <path d="M168 48 Q190 30 212 46 Q190 52 168 48 Z" fill="#89a844" stroke="#687f2d" strokeWidth="1.2" />
              <path d="M180 66 Q204 48 226 62 Q204 72 180 66 Z" fill="#9eb547" stroke="#687f2d" strokeWidth="1.2" />
              <path d="M198 78 Q218 64 234 76 Q216 84 198 78 Z" fill="#8fa83e" />
            </g>
          ) : (
            <g>
              <ellipse cx="202" cy="70" rx="22" ry="12" transform="rotate(12 202 70)" fill={isPest ? "#559a57" : "#44995b"} />
              <ellipse cx="220" cy="78" rx="15" ry="9" transform="rotate(-8 220 78)" fill="#3b8e52" />
              {isPest && (
                <path d="M192 68 Q202 62 208 72 T222 76" fill="none" stroke="#e9eedf" strokeWidth="2.4" strokeLinecap="round" />
              )}
            </g>
          )}

          {/* Lower right leaves (yellowing or early blight lesions if alert) */}
          <ellipse
            cx="196"
            cy="112"
            rx="25"
            ry="13"
            transform="rotate(14 196 112)"
            fill={isYellow ? "#dfc046" : isBlight ? "#769348" : "#3f9055"}
          />
          <ellipse
            cx="218"
            cy="118"
            rx="17"
            ry="10"
            transform="rotate(20 218 118)"
            fill={isYellow ? "#cfa934" : isBlight ? "#9a8f3d" : "#38854d"}
          />
          {isBlight && (
            <g>
              <circle cx="194" cy="112" r="6" fill="#6b3d1d" />
              <circle cx="194" cy="112" r="8.5" fill="none" stroke="#c89a2c" strokeWidth="1.6" />
              <circle cx="212" cy="118" r="5" fill="#5e3317" />
              <circle cx="212" cy="118" r="7.5" fill="none" stroke="#c89a2c" strokeWidth="1.4" />
            </g>
          )}

          {/* Yellow star tomato flower cluster */}
          {showFlowers && (
            <g>
              <circle cx="204" cy="54" r="4.5" fill="#facc15" stroke="#ca8a04" strokeWidth="0.9" />
              <circle cx="216" cy="60" r="4" fill="#fde047" stroke="#ca8a04" strokeWidth="0.9" />
              <circle cx="208" cy="65" r="3.5" fill="#facc15" stroke="#ca8a04" strokeWidth="0.9" />
            </g>
          )}

          {/* Green / ripening tomato cluster */}
          {showFruits && (
            <g>
              <circle cx="104" cy="96" r="9.5" fill="#6eb84a" stroke="#3f7c28" strokeWidth="1.2" />
              <circle cx="101" cy="92" r="2.6" fill="#b7e695" opacity="0.7" />
              <circle cx="121" cy="102" r="10.5" fill="#5ca83d" stroke="#3f7c28" strokeWidth="1.2" />
              <circle cx="118" cy="97" r="2.8" fill="#a8df82" opacity="0.7" />
              {!isYellow && (
                <>
                  <circle cx="110" cy="114" r="8.5" fill="#77c253" stroke="#3f7c28" strokeWidth="1.2" />
                  {isBlossom && (
                    <path d="M104 118 Q110 123 116 118 Q113 123 107 123 Z" fill="#3a2518" />
                  )}
                </>
              )}
              {isBlossom && (
                <ellipse cx="121" cy="109" rx="6" ry="3.5" fill="#3a2518" />
              )}
            </g>
          )}
        </g>
      ) : (
        <text x="160" y="108" textAnchor="middle" fontSize="13" fontWeight="600" fill="#58685e">
          {vision.status === "none" ? "No plant detected in plot" : "Not scanned yet"}
        </text>
      )}
    </svg>
  );
}

/** Read-only rover camera photo viewer with toggleable AI object detection bounding boxes & corner brackets. */
export default function RoverVisionPhoto({
  plantName,
  vision,
  canopy,
  chlorosis,
  soilMoisture,
  photoSrc,
  showBoxes = true,
  compact = false,
}: {
  plantName: string;
  vision: PlantVisionInfo;
  canopy?: number | null;
  chlorosis?: number | null;
  soilMoisture?: number | null;
  photoSrc?: string | null;
  showBoxes?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`rv-photo-frame${compact ? " rv-photo-compact" : ""}`}>
      {photoSrc ? (
        <img src={photoSrc} alt={`Rover camera capture of ${plantName}`} className="rv-cam-img" />
      ) : (
        <SimulatedTomatoFrame
          vision={vision}
          canopy={canopy}
          chlorosis={chlorosis}
          soilMoisture={soilMoisture}
        />
      )}

      {showBoxes && vision.boxes.length > 0 && (
        <div className="rv-box-layer" aria-hidden>
          {vision.boxes.map((b) => {
            const showLbl = !compact || (vision.status === "alert" ? b.kind === "issue" : b.kind === "fruit");
            return (
              <div key={b.id} className={boxKindClass(b.kind)} style={boxStyle(b)}>
                <span className="rv-corner rv-c-tl" />
                <span className="rv-corner rv-c-tr" />
                <span className="rv-corner rv-c-bl" />
                <span className="rv-corner rv-c-br" />
                {showLbl && <span className={boxLabelClass(b)}>{b.label}</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="rv-cam-hud">
        <span>CAM-01 · {plantName}</span>
        {!compact && vision.confidencePct !== null && <span>{vision.confidencePct}% AI conf.</span>}
      </div>
    </div>
  );
}
