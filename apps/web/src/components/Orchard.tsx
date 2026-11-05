import { useState } from "react";
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { Notice, Tag } from "./ui";
import type { DocIssue, OrchardJob, OrchardStage } from "../lib/api";

/** The whole cycle at a glance: one block per stage, sized by its days, with a line at today. */
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

const CONFIRM = "Confirm with an agronomist";

/** One thing to do: when, what, and whether it is done. A dose always says who to ask first. */
function Job({ j, fruitMm, onDone, onFruit }: { j: OrchardJob; fruitMm: number | null; onDone?: (id: string) => void; onFruit?: (mm: number) => void }) {
  const [mm, setMm] = useState("");
  const open = j.state === "due" || j.state === "overdue";
  return (
    <li className={`job job-${j.state}`}>
      {j.state === "done" ? <CircleCheck size={18} aria-hidden /> : j.state === "overdue" ? <TriangleAlert size={18} aria-hidden /> : <Clock size={18} aria-hidden />}
      <div className="job-body">
        <div className="job-head">
          <b>{j.title}</b>
          {j.state === "overdue" && <Tag kind="alert">Overdue</Tag>}
          {j.state === "done" && <Tag kind="ok">Done</Tag>}
          {j.confirm && <Tag kind="warn">{CONFIRM}</Tag>}
        </div>
        <div className="small muted">
          {j.firstDay === j.lastDay ? `Day ${j.firstDay}` : `Days ${j.firstDay}-${j.lastDay}`}. {j.detail}
        </div>
        {j.measure && open && onFruit && (
          <form className="job-measure" onSubmit={(e) => { e.preventDefault(); if (Number(mm) > 0) { onFruit(Number(mm)); setMm(""); } }}>
            <label className="small" htmlFor={`fruit-${j.id}`}>Fruit size{fruitMm !== null ? ` (last: ${fruitMm} mm)` : ""}</label>
            <div className="erp-input-group" style={{ width: 120 }}>
              <input id={`fruit-${j.id}`} className="erp-input" type="number" min={1} max={150} value={mm} onChange={(e) => setMm(e.target.value)} />
              <span className="erp-input-addon">mm</span>
            </div>
            <button className="btn btn-sm btn-ghost" disabled={!mm}>Save</button>
          </form>
        )}
      </div>
      {open && onDone && !j.ongoing && (
        <button type="button" className="btn btn-sm btn-ghost job-btn" onClick={() => onDone(j.id)}>
          {j.measure ? "Bags are on" : "Done"}
        </button>
      )}
    </li>
  );
}

export function OrchardJobs({ jobs, fruitMm, onDone, onFruit }:
  { jobs: OrchardJob[]; fruitMm: number | null; onDone?: (id: string) => void; onFruit?: (mm: number) => void }) {
  return <ul className="jobs">{jobs.map((j) => <Job key={j.id} j={j} fruitMm={fruitMm} onDone={onDone} onFruit={onFruit} />)}</ul>;
}

/** The document's own open questions, on the screen they affect. */
export function DocFlag({ issues, n }: { issues: DocIssue[]; n: number }) {
  const i = issues.find((x) => x.n === n);
  return i ? <Notice kind="warn"><b>To settle: {i.title.charAt(0).toLowerCase()}{i.title.slice(1)}.</b> {i.detail}</Notice> : null;
}
