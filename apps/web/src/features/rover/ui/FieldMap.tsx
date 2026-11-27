import type { PlantStatus } from "../sim/advice";
import { plantId, type PlantId } from "../sim/scout";

/** Top-down block, one mark a plant, coloured by status with a letter so colour is never the only signal. */
export const STATUS_LOOK: Record<PlantStatus, { fill: string; stroke: string; glyph: string; word: string; text: string }> = {
  fine: { fill: "#FFFFFF", stroke: "#2E7D32", glyph: "", word: "Fine", text: "#2E7D32" },
  water: { fill: "#1D6FB0", stroke: "#1D6FB0", glyph: "w", word: "Water", text: "#FFFFFF" },
  look: { fill: "#E2A700", stroke: "#8A6500", glyph: "!", word: "Look at", text: "#17261C" },
  unchecked: { fill: "#A08F78", stroke: "#A08F78", glyph: "·", word: "Not checked", text: "#FFFFFF" },
};

export function MapLegend() {
  return (
    <div className="rv2-legend" aria-hidden>
      {(Object.keys(STATUS_LOOK) as PlantStatus[]).map((k) => (
        <span key={k}>
          <svg width="16" height="16"><circle cx="8" cy="8" r="6.5" fill={STATUS_LOOK[k].fill} stroke={STATUS_LOOK[k].stroke} strokeWidth="1.5" />
            <text x="8" y="11.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={STATUS_LOOK[k].text}>{STATUS_LOOK[k].glyph}</text></svg>
          {STATUS_LOOK[k].word}
        </span>
      ))}
    </div>
  );
}

export default function FieldMap({ rows, spots, status, lit, selected, onPick, label }: {
  rows: number; spots: number; status: Record<PlantId, PlantStatus>;
  /** plants of the card under the pointer */ lit?: Set<PlantId>;
  selected?: PlantId | null; onPick?: (id: PlantId) => void; label: string;
}) {
  const cell = 22, left = 32, top = 22, w = left + spots * cell + 4, h = top + rows * cell + 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="group" aria-label={label}>
      {Array.from({ length: spots }, (_, s) => (s === 0 || (s + 1) % 5 === 0) && (
        <text key={`c${s}`} x={left + s * cell + cell / 2} y={14} textAnchor="middle" fontSize="10" fill="#56645B">{s + 1}</text>
      ))}
      {Array.from({ length: rows }, (_, r) => (
        <g key={r}>
          <text x={4} y={top + r * cell + cell / 2 + 4} fontSize="11" fontWeight="700" fill="#17261C">R{r + 1}</text>
          {Array.from({ length: spots }, (_, s) => {
            const id = plantId(r, s), st = status[id];
            const cx = left + s * cell + cell / 2, cy = top + r * cell + cell / 2;
            if (!st) return <circle key={id} cx={cx} cy={cy} r={1.5} fill="#D6DCD3" aria-hidden />;
            const look = STATUS_LOOK[st], on = lit?.has(id), pick = selected === id;
            return (
              <g key={id} className="pl" role="button" tabIndex={onPick ? 0 : -1} aria-label={`${id}: ${look.word}`}
                 onClick={() => onPick?.(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(id); } }}>
                <title>{`${id}: ${look.word}`}</title>
                {(on || pick) && <circle cx={cx} cy={cy} r={10.5} fill="none" stroke="#17261C" strokeWidth={pick ? 2.5 : 2} />}
                <circle cx={cx} cy={cy} r={7.5} fill={look.fill} stroke={look.stroke} strokeWidth={1.5} opacity={lit && lit.size && !on ? 0.45 : 1} />
                <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill={look.text} pointerEvents="none">{look.glyph}</text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
