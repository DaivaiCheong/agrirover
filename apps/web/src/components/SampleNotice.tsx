import { useState } from "react";
import { Notice } from "./ui";
import { api } from "../lib/api";
import { useData } from "../lib/useData";

/** Shows sample status only when actual sample ledger rows exist in the backend database. */
export default function SampleNotice({ inMain = false }: { inMain?: boolean }) {
  const status = useData(api.financeSample);
  const [problem, setProblem] = useState<string | null>(null);

  if (status.error || !status.data?.sample) return null;

  async function remove() {
    if (!window.confirm("Delete all the sample costs, harvests and sales? Real entries are not touched.")) return;
    try {
      await api.removeFinanceSample();
      window.location.reload();
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  const body = (
    <Notice kind="warn">
      <b>Sample cost entries present in database.</b>{" "}
      <button className="linkbtn" onClick={remove}>Clear sample entries</button>
      {problem && <> {problem}</>}
    </Notice>
  );
  return inMain ? body : <div className="main" style={{ paddingBottom: 0 }}>{body}</div>;
}
