import { useMemo, useState } from "react";
import { Beaker, Calculator, FlaskConical, ShieldAlert, Target, Zap } from "lucide-react";
import { Tag } from "./ui";
import type { PlantSoilRow } from "../lib/soil";
import {
  getMulderRule,
  inspectBlockMulder,
  MULDER_RULES,
  type FastCareCard,
  type MulderKey,
} from "../utils/agronomyEngine";

/** Scannable prescription sheet: Calculated Recipe & Tank Mix -> 4-step DO THIS NOW -> Do Not Mix -> Result -> Formula & Probe Math. */
export function FastFocusBlocks({ card }: { card: FastCareCard }) {
  const rx = card.prescription;
  return (
    <div className="ff-grid" role="region" aria-label="Calculated prescription summary">
      <div className="rx-pair">
        <div className="ff-box rx-recipe">
          <span className="ff-k">
            <Beaker size={13} aria-hidden />CALCULATED 1-PLANT RECIPE ({rx.growthStage.tierLabel})
          </span>
          <p className="ff-v"><b>{rx.recipeSummaryLine}</b></p>
        </div>
        <div className="ff-box rx-tank">
          <span className="ff-k ff-k-result">
            <Calculator size={13} aria-hidden />
            BLOCK BATCH TANK MIX ({rx.flaggedCountInBlock} flagged in {rx.blockLabel})
          </span>
          <p className="ff-v"><b>{rx.batchTankLine}</b></p>
        </div>
      </div>

      <div className="ff-box ff-do">
        <span className="ff-k">
          <Zap size={13} aria-hidden />DO THIS NOW (EXACT NUMBERED RECIPE)
        </span>
        <ol className="rx-steps">
          {card.doNowSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="ff-box ff-avoid">
        <span className="ff-k ff-k-avoid">
          <ShieldAlert size={13} aria-hidden />DO NOT MIX / AVOID
        </span>
        <ul className="rx-avoid-list">
          {card.doNotMixList.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </div>

      <div className="ff-box ff-result">
        <span className="ff-k ff-k-result">
          <Target size={13} aria-hidden />EXPECTED RESULT
        </span>
        <p className="ff-v">{card.expectedResult}</p>
      </div>

      <div className="rx-formula">
        <div className="rx-formula-row">
          <span className="ff-why-lbl">
            <FlaskConical size={12} aria-hidden />FORMULA &amp; PROBE MATH:
          </span>
          <code>{rx.formulaMathLine}</code>
        </div>
        <div className="rx-formula-row small muted">
          <b>Live sensor context:</b> {card.whyLine}
        </div>
      </div>
    </div>
  );
}

/** Interactive Mulder's Chart Nutrient Check widget for Health (/crop & /guide). */
export function MulderQuickCheck({
  blocks,
  rowsByZone,
}: {
  blocks: { zone: string; label: string }[];
  rowsByZone: Map<string, PlantSoilRow[]>;
}) {
  const [selectedKey, setSelectedKey] = useState<MulderKey>("high_n");
  const [selectedZone, setSelectedZone] = useState<string>("");

  const blockInfo = useMemo(() => {
    if (!selectedZone) return null;
    const rows = rowsByZone.get(selectedZone) ?? [];
    if (rows.length === 0) return null;
    return inspectBlockMulder(rows);
  }, [selectedZone, rowsByZone]);

  const activeKey = blockInfo?.activeKey ?? selectedKey;
  const rule = getMulderRule(activeKey);

  return (
    <div className="panel mulder-card">
      <div className="panel-head">
        <span className="lbl lbl-ink">
          <FlaskConical size={17} aria-hidden />Mulder&apos;s Chart Quick Check · Nutrient Synergy &amp; Antagonism
        </span>
        <Tag kind={activeKey === "high_k" || activeKey === "high_p" ? "warn" : "ok"}>
          {blockInfo ? `${blocks.find((b) => b.zone === selectedZone)?.label ?? selectedZone} · ` : ""}
          {rule.shortLabel}
        </Tag>
      </div>

      <div className="panel-pad stack">
        <div className="mulder-controls">
          <div className="seg" role="group" aria-label="Select nutrient status">
            {MULDER_RULES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={!selectedZone && activeKey === r.key ? "on" : ""}
                onClick={() => {
                  setSelectedZone("");
                  setSelectedKey(r.key);
                }}
              >
                {r.shortLabel}
              </button>
            ))}
          </div>

          <div className="mulder-blocks" role="group" aria-label="Or inspect live block NPK">
            <span className="small muted">Or check live block:</span>
            {blocks.map((b) => (
              <button
                key={b.zone}
                type="button"
                className={`f3-chip${selectedZone === b.zone ? " on" : ""}`}
                onClick={() => setSelectedZone(selectedZone === b.zone ? "" : b.zone)}
              >
                {b.zone.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {blockInfo && (
          <div className="ff-why">
            <span className="ff-why-lbl">LIVE BLOCK PROBE:</span>
            <span>{blockInfo.summaryLine} — Active rule: <b>{rule.title}</b></span>
          </div>
        )}

        <div className="mulder-cols">
          <div className="ff-box ff-do">
            <span className="ff-k">WHAT TO APPLY (SYNERGY)</span>
            <p className="ff-v">{rule.applySynergy}</p>
          </div>
          <div className="ff-box ff-avoid">
            <span className="ff-k ff-k-avoid">WHAT BLOCKS IT / DO NOT MIX</span>
            <p className="ff-v">{rule.blocksDoNotMix}</p>
          </div>
          <div className="ff-box ff-tank">
            <span className="ff-k ff-k-tank">TANK-MIX COMPATIBILITY</span>
            <p className="ff-v">{rule.tankMixRule}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
