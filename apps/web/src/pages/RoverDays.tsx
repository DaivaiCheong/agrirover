// Every day's data for one plant: what the rover read on the day's last round, and what the farmer logged that day.
import { ChevronLeft, ChevronRight } from "lucide-react";
import BlockPicker from "../features/rover/ui/BlockPicker";
import { RESULT, SEEN, lookItems, parseTree, treeKey, treeName, whenText, type Tree } from "../features/rover/ui/fieldlog/model";
import { METER, dailyRows, latestPerDay, soilWords, statusOf, targetsFor, valueText, type ParamKey, type Targets } from "../features/rover/ui/fieldlog/soil";
import { useFieldLog } from "../features/rover/ui/fieldlog/store";
import { useBlock } from "../features/rover/ui/fieldlog/useBlock";
import RoundsHistory from "../components/RoundsHistory";
import { EF, Empty, More, Notice, Tag } from "../components/ui";
import { api } from "../lib/api";
import { useQueries } from "@tanstack/react-query";
import { errorText, qk, useConditions, useSurveys } from "../lib/queries";
import type { RoundDetail } from "../lib/tomatoFinance";
import "../features/rover/ui/fieldlog/fieldlog.css";

/** The most days shown: one round is fetched for each. */
const DAYS = 30;

const dayText = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/** One reading's cell, with a "Low" or "High" mark when it is outside the crop's target. An empty cell is hidden on a
 *  phone, where each day is a card. */
function Reading({ k, v, label, targets, edge }: { k: ParamKey; v: number | undefined; label: string; targets: Targets; edge?: boolean }) {
  const st = v === undefined ? null : statusOf(k, v, targets);
  return (
    <td className={`${edge ? "sp-edge" : ""}${v === undefined ? " sp-empty" : ""}`} data-label={label}>
      {v === undefined ? <span className="muted">—</span> : valueText(k, v)}
      {st && st !== "ok" && <> <Tag kind="warn">{st === "low" ? "Low" : "High"}</Tag></>}
    </td>
  );
}

const share = (x: number | null | undefined) => (x === null || x === undefined ? null : `${Math.round(x * 100)} %`);

export default function RoverDays() {
  const b = useBlock();
  const { zone, trees } = b;
  const surveys = useSurveys();
  const conditions = useConditions();
  const log = useFieldLog();

  const days = latestPerDay((surveys.data ?? []).filter((s) => s.zone === zone && (s.status === "completed" || s.status === "aborted"))).slice(0, DAYS);
  // each round from the shared cache: a finished round never changes, so it is fetched once for every page
  const rounds = useQueries({
    queries: days.map((d) => ({ queryKey: qk.survey(d.id), queryFn: () => api.survey(d.id), staleTime: Infinity })),
    combine: (results) => ({ data: results.map((r) => r.data).filter((d): d is RoundDetail => Boolean(d)), error: results.find((r) => r.error)?.error ?? null,
                             loading: results.some((r) => r.isPending) }),
  });
  // while another block's days load, the old ones are still held: never show them under this block
  const loaded = rounds.data.filter((r) => r.zone === zone);

  // the plant: the one in the address, else the first the newest round flagged, else the first
  const wanted = parseTree(b.search.get("tree"));
  const flagged = lookItems(loaded[0]?.cells ?? [], new Map())[0];
  const tree: Tree | undefined = trees.find((t) => wanted && t[0] === wanted[0] && t[1] === wanted[1])
    ?? (flagged ? trees.find((t) => t[0] === flagged.row && t[1] === flagged.col) : undefined) ?? trees[0];
  const at = tree ? trees.findIndex((t) => treeKey(t[0], t[1]) === treeKey(tree[0], tree[1])) : -1;
  const choose = (t: Tree) => b.setSearch({ zone, tree: `${t[0] + 1}-${t[1] + 1}` });

  const condition = conditions.data?.find((c) => c.zone === zone);
  const targets = targetsFor(b.crop ?? condition?.cropName, condition?.params);
  const rows = tree ? dailyRows(tree, loaded, log.soil.filter((e) => e.zone === zone), log.plants.filter((e) => e.zone === zone)) : [];
  const loading = surveys.isPending || (days.length > 0 && loaded.length === 0 && rounds.loading);

  return (
    <main className="main">
      <div className="fl-top">
        <BlockPicker blocks={b.options} value={zone} onChange={b.setZone} />
        <EF label="Plant">
          <select className="erp-select" value={tree ? treeKey(tree[0], tree[1]) : ""}
                  onChange={(e) => { const t = trees.find((x) => treeKey(x[0], x[1]) === e.target.value); if (t) choose(t); }}>
            {trees.map((t) => <option key={treeKey(t[0], t[1])} value={treeKey(t[0], t[1])}>{treeName(t[0], t[1])}</option>)}
          </select>
        </EF>
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-sm btn-ghost" aria-label="Previous plant" disabled={at <= 0} onClick={() => choose(trees[at - 1])}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" className="btn btn-sm btn-ghost" aria-label="Next plant" disabled={at < 0 || at >= trees.length - 1} onClick={() => choose(trees[at + 1])}><ChevronRight size={16} aria-hidden /></button>
        </span>
        <span className="small muted fl-grow">{tree ? `${treeName(tree[0], tree[1])} · ${rows.length} ${rows.length === 1 ? "day" : "days"}` : ""}</span>
      </div>

      {surveys.error && <Notice kind="alert">{errorText(surveys.error)}</Notice>}
      {rounds.error && <Notice kind="alert">{errorText(rounds.error)}</Notice>}

      {!tree ? <Empty>This block has no plants yet. Lay it out on the Setup tab.</Empty>
        : loading ? <Empty>Loading the days…</Empty>
        : rows.length === 0 ? <Empty>No days yet. The rover's rounds and your entries show here.</Empty>
        : (
          <div className="panel">
            <div className="tablewrap">
              <table className="tbl fold sp-table">
                <thead>
                  <tr>
                    <th>Day</th><th className="sp-edge">Soil pH</th><th className="sp-edge">N</th><th>P</th><th>K</th>
                    <th className="sp-edge">Moisture</th><th>EC</th><th className="sp-edge">Leaf cover</th><th>Yellow leaves</th>
                    <th className="sp-edge">You logged</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const c = r.cell;
                    const x = c?.plant ? c.readings : undefined;
                    const nothing = !r.soil.length && !r.health.length;
                    const cover = share(c?.plant ? c.canopy : undefined), yellow = share(c?.plant ? c.chlorosis : undefined);
                    return (
                      <tr key={r.day}>
                        <td className="nowrap">
                          <b>{dayText(r.day)}</b>
                          <span className="sp-note">{!r.roundAt ? "No round" : !c ? "Not visited" : !c.plant ? "No plant seen" : whenText(r.roundAt).split(", ").pop()}</span>
                        </td>
                        <Reading k="ph" v={x?.soil_ph} label="Soil pH" targets={targets} edge />
                        <Reading k="n" v={x?.nitrogen} label="N" targets={targets} edge />
                        <Reading k="p" v={x?.phosphorus} label="P" targets={targets} />
                        <Reading k="k" v={x?.potassium} label="K" targets={targets} />
                        <Reading k="moisture" v={x?.soil_moisture} label="Moisture" targets={targets} edge />
                        <Reading k="ec" v={x?.soil_ec} label="EC" targets={targets} />
                        <td className={`sp-edge${cover ? "" : " sp-empty"}`} data-label="Leaf cover">{cover ?? "—"}</td>
                        <td className={yellow ? undefined : "sp-empty"} data-label="Yellow leaves">{yellow ?? "—"}{c?.plant && c.flagged && <> <Tag kind="warn">Look</Tag></>}</td>
                        <td className={`sp-edge fl-day-notes${nothing ? " sp-empty" : ""}`} data-label="You logged">
                          {nothing && <span className="muted">—</span>}
                          {r.soil.map((e) => (
                            <div key={e.id} className="small">{METER[e.meter]}{e.tree === null ? " (block)" : ""}: {soilWords(e)}{e.note ? `. ${e.note}` : ""}</div>
                          ))}
                          {r.health.map((e) => (
                            <div key={e.id} className="small">{RESULT[e.result]}: {e.seen ? SEEN[e.seen] : e.roverSaw ?? "no sign chosen"}{e.did ? `. ${e.did}` : ""}</div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      <p className="small muted fl-note">One row a day: the rover's last round that day, and what you logged. pH, moisture and EC are compared with the crop's targets.</p>

      <div className="fl-stack">
        <More label={<span className="small">All rounds of every block</span>}><RoundsHistory /></More>
      </div>
    </main>
  );
}
