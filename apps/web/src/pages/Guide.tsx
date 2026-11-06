import { BookOpen } from "lucide-react";
import { Empty, More, Notice, Panel, Tag } from "../components/ui";
import { api, loadProblem, type Disease } from "../lib/api";
import { useData } from "../lib/useData";

function Detail({ d }: { d: Disease }) {
  const rows: [string, string | null][] = [["Leaf", d.leaf], ["Fruit", d.fruit], ["Not to confuse", d.notToConfuse], ["Favoured by", d.favours], ["What to do", d.do]];
  return (
    <>
      <table className="tbl kv"><tbody>
        {rows.filter(([, v]) => v).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        <tr><th scope="row">Sources</th><td>{d.sources.map((s, i) => <span key={s.title}>{i > 0 && " · "}{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</span>)}</td></tr>
      </tbody></table>
    </>
  );
}

export default function Guide() {
  const guide = useData(api.diseaseGuide);
  const rows = guide.data ?? [];
  return (
    <main className="main stack" style={{ paddingTop: 12 }}>
      {guide.error && <Notice kind="alert">{loadProblem(guide.error)}</Notice>}
      <Panel title="Guava problems" icon={BookOpen} pad={false} right={<span className="small muted">No spray doses: the sources give none</span>}>
        {rows.length === 0 ? <Empty>Loading the guide.</Empty> : (
          <div className="tablewrap">
            <table className="tbl fold">
              <thead><tr><th>Problem</th><th>Cause</th><th>Seen on</th><th>Soil check</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td><More label={<b>{d.title}</b>}><Detail d={d} /></More>{d.thin && <> <Tag>Little source</Tag></>}</td>
                    <td data-label="Cause">{d.kind}</td>
                    <td data-label="Seen on" className="nowrap">{[d.leaf && "Leaf", d.fruit && "Fruit"].filter(Boolean).join(", ")}</td>
                    <td data-label="Soil check" className="nowrap">{d.symptom ? "Yes" : <span className="muted">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
