// The Field log's panels: what needs the farmer, the block map, the next round, the soil and plant logs, and the rounds.
import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, Circle, Footprints, Play, Plus } from "lucide-react";
import { Notice, Panel, Tag } from "../../../../components/ui";
import type { SurveySummary } from "../../../../lib/api";
import { STATUS_WORD, stopInfo } from "../../../../lib/rover";
import { treeKey, treeName, whenText, type LookItem, type Tree } from "./model";

// ---- the block map: one mark a tree, coloured by what the farmer needs to do

export type MapState = "unchecked" | "empty" | "fine" | "look" | "logged";
const MAP: Record<MapState, { fill: string; stroke: string; mark: string; markColor: string; word: string }> = {
  unchecked: { fill: "#E7ECE3", stroke: "#A08F78", mark: "", markColor: "#17261C", word: "Not checked yet" },
  empty: { fill: "#F5F7F2", stroke: "#A08F78", mark: "×", markColor: "#56645B", word: "No tree seen" },
  fine: { fill: "#FFFFFF", stroke: "#2E7D32", mark: "", markColor: "#17261C", word: "Checked, fine" },
  look: { fill: "#E2A700", stroke: "#8A6500", mark: "!", markColor: "#17261C", word: "Needs you" },
  logged: { fill: "#2E7D32", stroke: "#1F5C39", mark: "✓", markColor: "#FFFFFF", word: "You logged it" },
};

/** The block as a grid: each spot a tree, a tree with a plant a button. Tapping a tree opens its record. */
export function BlockMap({ rows, cols, trees, states, onPick, label }: {
  rows: number; cols: number; trees: Tree[]; states: Map<string, MapState>; onPick: (row: number, col: number) => void; label: string;
}) {
  const planted = new Set(trees.map(([r, c]) => treeKey(r, c)));
  const cell = 26, left = 34, top = 22, w = left + cols * cell + 8, h = top + rows * cell + 8;
  return (
    <div>
      <svg className="fl-map" viewBox={`0 0 ${w} ${h}`} role="group" aria-label={label}>
        {Array.from({ length: cols }, (_, c) => (c === 0 || (c + 1) % 5 === 0) && (
          <text key={`c${c}`} x={left + c * cell + cell / 2} y={14} textAnchor="middle" fontSize="10" fill="#56645B">{c + 1}</text>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <g key={`r${r}`}>
            <text x={4} y={top + r * cell + cell / 2 + 4} fontSize="11" fontWeight="700" fill="#17261C">R{r + 1}</text>
            {Array.from({ length: cols }, (_, c) => {
              const k = treeKey(r, c), cx = left + c * cell + cell / 2, cy = top + r * cell + cell / 2;
              if (!planted.has(k)) return <circle key={k} cx={cx} cy={cy} r={1.5} fill="#D6DCD3" />;
              const st = states.get(k) ?? "unchecked", look = MAP[st], name = treeName(r, c);
              return (
                <g key={k} className="tree" role="button" tabIndex={0} aria-label={`${name}: ${look.word}`}
                   onClick={() => onPick(r, c)}
                   onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r, c); } }}>
                  <title>{`${name}: ${look.word}`}</title>
                  <circle cx={cx} cy={cy} r={9} fill={look.fill} stroke={look.stroke} strokeWidth={1.5} />
                  {look.mark && <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={look.markColor}>{look.mark}</text>}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="fl-legend" aria-hidden>
        {(Object.keys(MAP) as MapState[]).map((k) => (
          <span key={k}><i style={{ background: MAP[k].fill, borderColor: MAP[k].stroke }} />{MAP[k].word}</span>
        ))}
      </div>
    </div>
  );
}

// ---- needs you: the trees the rover flagged, that the farmer has not looked at since

export function NeedsYou({ items, emptyText, onWalk, onOpen }: {
  items: LookItem[]; emptyText: string; onWalk: () => void; onOpen: (i: LookItem) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <Panel title="Needs you" pad={false}
           right={items.length ? <button type="button" className="btn btn-sm" onClick={onWalk}><Footprints size={15} aria-hidden />Field walk</button> : undefined}>
      {items.length === 0 ? <p className="panel-pad muted">{emptyText}</p> : (
        <>
          <ul className="fl-list">
            {shown.map((i) => (
              <li key={treeKey(i.row, i.col)}>
                <span><b>{i.name}</b> <span className="muted">{i.what}</span>{i.photoId && <> <Tag>Photo</Tag></>}</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpen(i)}>Open tree</button>
              </li>
            ))}
          </ul>
          {items.length > 8 && (
            <p className="panel-pad"><button type="button" className="linkbtn small" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${items.length}`}</button></p>
          )}
        </>
      )}
    </Panel>
  );
}

// ---- next round: the checks before the rover can start, and the start

export interface AutoCheck { ok: boolean; label: string; fix: string }

export function NextRound({ auto, manual, ticked, onTick, ready, busy, error, summary, running, settingsHref, onStart }: {
  auto: AutoCheck[]; manual: string[]; ticked: boolean[]; onTick: (i: number, on: boolean) => void;
  ready: boolean; busy: boolean; error: string | null; summary: string; running: string | null; settingsHref: string; onStart: () => void;
}) {
  return (
    <Panel title="Next round" right={<Link className="linkbtn small" to={settingsHref}>Setup</Link>}>
      <div className="panel-pad">
        <p className="small muted">{summary}</p>
        {running && <Notice kind="info">{running}</Notice>}
        <ul className="fl-checks">
          {auto.map((a) => (
            <li key={a.label} className={a.ok ? "ok" : "no"}>
              {a.ok ? <CircleCheck size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
              <span>{a.label}{!a.ok && <span className="small muted"> · {a.fix}</span>}</span>
            </li>
          ))}
        </ul>
        <div className="erp-label" style={{ marginBottom: 4 }}>Before starting</div>
        {manual.map((text, i) => (
          <label key={i} className="chk-man">
            <input type="checkbox" checked={ticked[i]} onChange={(e) => onTick(i, e.target.checked)} />{text}
          </label>
        ))}
        {error && <Notice kind="alert">{error}</Notice>}
        <button type="button" className="btn" style={{ marginTop: 12 }} disabled={!ready || busy} onClick={onStart}>
          <Play size={16} aria-hidden />{busy ? "Starting…" : "Start round"}
        </button>
      </div>
    </Panel>
  );
}

// ---- the logs

export interface SoilRow { key: string; at: string; where: string; moisture: string; ec: string; ph: string; who: string; note?: string }

export function SoilLog({ rows, onLog }: { rows: SoilRow[]; onLog: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 10);
  return (
    <Panel title="Soil log" pad={false}
           right={<button type="button" className="btn btn-sm" onClick={onLog}><Plus size={15} aria-hidden />Log soil</button>}>
      {rows.length === 0 ? (
        <p className="panel-pad muted">No soil readings yet. The rover adds one for each tree it checks, and you can log a reading from a hand meter.</p>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Where</th><th className="r">Moisture %</th><th className="r">EC mS/cm</th><th className="r">pH</th><th>From</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key}>
                  <td className="nowrap">{whenText(r.at)}</td>
                  <td>{r.where}</td>
                  <td className="r">{r.moisture}</td>
                  <td className="r">{r.ec}</td>
                  <td className="r">{r.ph}</td>
                  <td className="small">{r.who}{r.note ? ` · ${r.note}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 10 && (
        <p className="panel-pad"><button type="button" className="linkbtn small" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button></p>
      )}
    </Panel>
  );
}

export interface PlantRow { key: string; at: string; tree: Tree; name: string; saw: string; result: string; did: string }

export function PlantLog({ rows, onLog, onOpen }: { rows: PlantRow[]; onLog: () => void; onOpen: (t: Tree) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 10);
  return (
    <Panel title="Plant log" pad={false}
           right={<button type="button" className="btn btn-sm" onClick={onLog}><Plus size={15} aria-hidden />Log a plant</button>}>
      {rows.length === 0 ? (
        <p className="panel-pad muted">Nothing logged yet. Walk the flagged trees, or open any tree on the map and log what you see.</p>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Tree</th><th>You saw</th><th>Decided</th><th>Did</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key}>
                  <td className="nowrap">{whenText(r.at)}</td>
                  <td><button type="button" className="linkbtn small" onClick={() => onOpen(r.tree)}>{r.name}</button></td>
                  <td>{r.saw}</td>
                  <td>{r.result}</td>
                  <td className="small">{r.did}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 10 && (
        <p className="panel-pad"><button type="button" className="linkbtn small" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button></p>
      )}
    </Panel>
  );
}

export function RoundsList({ rounds, total }: { rounds: SurveySummary[]; total: number }) {
  return (
    <Panel title="Rounds" pad={false}>
      {rounds.length === 0 ? <p className="panel-pad muted">No round yet for this block.</p> : (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Result</th><th className="r">Spots checked</th><th className="r">Flagged</th></tr></thead>
            <tbody>
              {rounds.map((s) => {
                const [kind, word] = STATUS_WORD[s.status] ?? [undefined, s.status];
                const planned = s.rows != null && s.cols != null ? s.rows * s.cols : total;
                return (
                  <tr key={s.id}>
                    <td className="nowrap">{whenText(s.finishedAt ?? s.startedAt)}{s.simulated && <span className="small muted"> · simulated</span>}</td>
                    <td><Tag kind={kind}>{word}</Tag>{s.abortReason && <span className="small muted"> {stopInfo(s.abortReason)?.label}</span>}</td>
                    <td className="r">{s.cellsScanned ?? 0} of {planned}</td>
                    <td className="r">{s.cellsFlagged ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
