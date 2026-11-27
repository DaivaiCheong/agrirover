import { useState } from "react";
import { Notice, Tag } from "./ui";
import { api } from "../lib/api";
import { useData } from "../lib/useData";

export function SyncBadge({ className }: { className?: string }) {
  return <Tag className={className}>Sample data · Synced with AgriRover</Tag>;
}

/** Shows sample status softly when connected to demo finance data; stays quiet without error banners when offline. */
export default function SampleNotice({ inMain = false }: { inMain?: boolean }) {
  const status = useData(api.financeSample);
  const [problem, setProblem] = useState<string | null>(null);

  if (status.error && status.data === null) {
    return null;
  }
  if (!status.data?.sample) return null;

  async function remove() {
    if (!window.confirm("Delete all the sample costs, harvests and sales? Real entries are not touched.")) return;
    try { await api.removeFinanceSample(); window.location.reload(); }
    catch (err) { setProblem((err as Error).message); }
  }

  const body = (
    <Notice kind="warn">
      <b>Sample figures synced with AgriRover.</b> Showing live tomato cost model data.{" "}
      <button className="linkbtn" onClick={remove}>Reset sample figures</button>{problem && <> {problem}</>}
    </Notice>
  );
  return inMain ? body : <div className="sample-bar">{body}</div>;
}
