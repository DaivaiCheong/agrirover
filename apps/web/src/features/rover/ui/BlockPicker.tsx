// The block picker shared by the Field log and Setup tabs. One choice, kept in the page address (?zone=…).

export default function BlockPicker({ blocks, value, onChange }: {
  blocks: { zone: string; label: string }[]; value: string; onChange: (zone: string) => void;
}) {
  return (
    <label className="erp-field" style={{ minWidth: 220 }}>
      <span className="erp-label">Block</span>
      <select className="erp-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {blocks.map((b) => <option key={b.zone} value={b.zone}>{b.label}</option>)}
      </select>
    </label>
  );
}
