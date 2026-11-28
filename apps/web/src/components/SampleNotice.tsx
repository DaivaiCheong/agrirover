import { Notice } from "./ui";
import { useFinanceSample, useRemoveFinanceSample } from "../lib/queries";

/** Shows only when sample rows exist in the database, with a way to clear them. */
export default function SampleNotice({ inMain = false }: { inMain?: boolean }) {
  const status = useFinanceSample();
  const remove = useRemoveFinanceSample();

  if (status.error || !status.data?.sample) return null;

  function clear() {
    if (!window.confirm("Delete all the sample costs, harvests and sales? Real entries are not touched.")) return;
    remove.mutate();
  }

  const body = (
    <Notice kind="warn">
      <b>{status.data.sample} sample entries are in the books.</b>{" "}
      <button className="linkbtn" onClick={clear} disabled={remove.isPending}>Clear sample entries</button>
    </Notice>
  );
  return inMain ? body : <div className="main" style={{ paddingBottom: 0 }}>{body}</div>;
}
