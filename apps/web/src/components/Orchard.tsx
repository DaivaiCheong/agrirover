import { useState } from "react";
import { More, Tag } from "./ui";
import type { OrchardJob, OrchardStage } from "../lib/api";

/** The whole cycle at a glance: one block per stage, sized by its days, with a mark at today. */
export function StageStrip({ stages, day }: { stages: OrchardStage[]; day: number }) {
  const total = stages[stages.length - 1].lastDay;
  const current = stages.find((s) => day >= s.firstDay && day <= s.lastDay);
  return (
    <div className="stagestrip" role="img" aria-label={`Day ${day} of ${total}: ${current?.title ?? ""}`}>
      {stages.map((s) => {
        const state = s === current ? "on" : day > s.lastDay ? "past" : "next";
        return (
          <div key={s.key} className={`ss-seg ss-${state}`} style={{ flexGrow: s.lastDay - s.firstDay + 1 }} title={`${s.title}, days ${s.firstDay}-${s.lastDay}`}>
            {s.short}
          </div>
        );
      })}
      <i className="ss-mark" style={{ left: `${Math.min(100, (day / total) * 100)}%` }} />
    </div>
  );
}

const STATE: Record<OrchardJob["state"], [string | undefined, string]> = {
  due: ["info", "Due"], overdue: ["alert", "Overdue"], done: ["ok", "Done"], later: [undefined, "Later"], past: [undefined, "Past"],
};

/** One thing to do, as a table row: the sentence opens from its title, and a dose always says who to ask first. */
export function JobRow({ j, bed, fruitMm, onDone, onFruit }:
  { j: OrchardJob; bed?: string; fruitMm: number | null; onDone?: (id: string) => void; onFruit?: (mm: number) => void }) {
  const [mm, setMm] = useState("");
  const open = j.state === "due" || j.state === "overdue";
  const [kind, word] = STATE[j.state];
  const label = <>{j.title}{j.confirm && <> <Tag>Ask an agronomist</Tag></>}</>;
  return (
    <tr className={`jr jr-${j.state}`}>
      {bed !== undefined && <td className="nowrap jr-bed"><b>{bed}</b></td>}
      <td className="jr-job">
        {j.detail ? <More label={label}>{j.detail}</More> : label}
        {j.measure && open && onFruit && (
          <form className="job-measure" onSubmit={(e) => { e.preventDefault(); if (Number(mm) > 0) { onFruit(Number(mm)); setMm(""); } }}>
            <label className="small" htmlFor={`fruit-${j.id}`}>Fruit size{fruitMm !== null ? ` (last ${fruitMm} mm)` : ""}</label>
            <div className="erp-input-group" style={{ width: 110 }}>
              <input id={`fruit-${j.id}`} className="erp-input" type="number" min={1} max={150} value={mm} onChange={(e) => setMm(e.target.value)} />
              <span className="erp-input-addon">mm</span>
            </div>
            <button className="btn btn-sm btn-ghost" disabled={!mm}>Save</button>
          </form>
        )}
      </td>
      <td className="r nowrap muted jr-when">{j.firstDay === j.lastDay ? `Day ${j.firstDay}` : `Days ${j.firstDay}–${j.lastDay}`}</td>
      <td className="nowrap jr-state">{j.state === "later" || j.state === "past" ? word : <Tag kind={kind}>{j.ongoing && j.state === "due" ? "Ongoing" : word}</Tag>}</td>
      <td className="act jr-act">
        {open && onDone && !j.ongoing && (
          <button type="button" className="btn btn-sm btn-ghost job-btn" onClick={() => onDone(j.id)}>{j.measure ? "Bags on" : "Done"}</button>
        )}
      </td>
    </tr>
  );
}

export function JobsHead({ bed }: { bed?: boolean }) {
  return <thead><tr>{bed && <th>Block</th>}<th>Task</th><th className="r">When</th><th>Status</th><th /></tr></thead>;
}

export function OrchardJobs({ jobs, fruitMm, onDone, onFruit }:
  { jobs: OrchardJob[]; fruitMm: number | null; onDone?: (id: string) => void; onFruit?: (mm: number) => void }) {
  return (
    <div className="tablewrap">
      <table className="tbl jobs-t">
        <JobsHead />
        <tbody>{jobs.map((j) => <JobRow key={j.id} j={j} fruitMm={fruitMm} onDone={onDone} onFruit={onFruit} />)}</tbody>
      </table>
    </div>
  );
}
