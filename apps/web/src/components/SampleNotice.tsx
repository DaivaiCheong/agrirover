import { useState } from "react";
import { Notice } from "./ui";
import { api } from "../lib/api";
import { useData } from "../lib/useData";

/** Says so on every finance screen while sample figures are loaded, and is where they are removed. */
export default function SampleNotice({ inMain = false }: { inMain?: boolean }) {
  const status = useData(api.financeSample);
  const [problem, setProblem] = useState<string | null>(null);
  if (!status.data?.sample) return null;

  async function remove() {
    if (!window.confirm("Delete all the sample costs, harvests and sales? Real entries are not touched.")) return;
    try { await api.removeFinanceSample(); window.location.reload(); }
    catch (err) { setProblem((err as Error).message); }
  }

  const body = (
    <Notice kind="warn">
      <b>Sample figures, not real results.</b> Made up to show how these screens work.{status.data.real > 0 && " Your real entries are mixed in with them, so totals are not real either."}{" "}
      <button className="linkbtn" onClick={remove}>Remove them</button>{problem && <> {problem}</>}
    </Notice>
  );
  return inMain ? body : <div className="sample-bar">{body}</div>;
}
