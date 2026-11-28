// Prints the reference table from the engine's own modules: npm run sanity
import { referenceRows, within } from "../src/features/rover/sim/reference";

const rows = referenceRows();
const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(1) : Math.abs(x) >= 10 ? x.toFixed(2) : x.toFixed(3));
const w = Math.max(...rows.map((r) => r.name.length));
let group = "", bad = 0;
for (const r of rows) {
  if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
  const ok = within(r);
  if (!ok) bad++;
  const tol = r.abs !== undefined ? `±${r.abs}` : `±${(r.rel! * 100).toFixed(0)} %`;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${r.name.padEnd(w)}  ${fmt(r.actual).padStart(8)}  expected ${fmt(r.expected).padStart(8)} ${tol.padEnd(7)} ${r.unit}${r.note ? `  (${r.note})` : ""}`);
}
console.log(`\n${rows.length - bad} of ${rows.length} within tolerance`);
(globalThis as unknown as { process: { exitCode: number } }).process.exitCode = bad ? 1 : 0;   // no @types/node here
