import { describe, expect, it } from "vitest";
import { usd } from "./format";

describe("usd", () => {
  it("puts the minus before the dollar sign", () => {
    expect(usd(-100)).toBe("-$100.00");
    expect(usd(100)).toBe("$100.00");
    expect(usd(0)).toBe("$0.00");
  });
  it("shows nothing it does not know", () => {
    expect(usd(null)).toBe("—");
    expect(usd(undefined)).toBe("—");
  });
});
