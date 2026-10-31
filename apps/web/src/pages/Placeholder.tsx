export default function Placeholder({ title, sprint }: { title: string; sprint: string }) {
  return (
    <main className="main">
      <div className="panel reg" style={{ padding: 0 }}>
        <div className="ground" style={{ padding: "60px 40px", textAlign: "center" }}>
          <div className="display d-lg">{title}</div>
          <p style={{ color: "var(--ink-muted)", marginTop: 12 }}>
            This module is designed and its interfaces are reserved. Implementation is scheduled for {sprint}.
          </p>
          <span className="tag tag-wip" style={{ marginTop: 18, display: "inline-block" }}>
            UNDER CONSTRUCTION
          </span>
        </div>
      </div>
    </main>
  );
}
