import { describe, expect, it } from "vitest";
import { referenceRows, within } from "../reference";

// One test per row of docs/rover-redesign.md "Reference numbers and tests". A failure means the physics is wrong.
describe("reference numbers", () => {
  const rows = referenceRows();
  it("covers the whole table", () => expect(rows.length).toBeGreaterThanOrEqual(80));
  for (const r of rows) {
    const tol = r.abs !== undefined ? `±${r.abs}` : `±${(r.rel! * 100).toFixed(0)} %`;
    it(`${r.group}: ${r.name} = ${r.expected} ${r.unit} ${tol}`, () => {
      expect(within(r), `got ${r.actual.toFixed(4)} ${r.unit}`).toBe(true);
    });
  }
});
