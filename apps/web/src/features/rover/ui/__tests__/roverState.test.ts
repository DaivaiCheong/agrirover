import { describe, expect, it } from "vitest";
import { chargePct, roverState } from "../roverState";

const online = { status: "online" as const, estop: false };

describe("the top bar's rover state", () => {
  it("waits while the first status is loading", () => {
    expect(roverState({})).toEqual({ kind: "wip", word: "Connecting" });
  });
  it("says Offline before anything else", () => {
    expect(roverState({ rover: { status: "offline", estop: false }, mission: { status: "running" } }).word).toBe("Offline");
  });
  it("says E-stopped, even while a round is listed", () => {
    expect(roverState({ rover: { status: "online", estop: true }, mission: { status: "running" } })).toEqual({ kind: "alert", word: "E-stopped" });
  });
  it("says Scouting while a round runs or waits", () => {
    expect(roverState({ rover: online, mission: { status: "running" } }).word).toBe("Scouting");
    expect(roverState({ rover: online, mission: { status: "queued" } }).word).toBe("Scouting");
  });
  it("names why a round stopped, from the reason the rover gave", () => {
    expect(roverState({ rover: online, mission: { status: "aborted", reason: "battery_low" } })).toEqual({ kind: "warn", word: "Stopped: Low battery" });
    expect(roverState({ rover: online, mission: { status: "lost", reason: null } }).word).toBe("Stopped: unknown reason");
  });
  it("says Docked when the rover is online and idle", () => {
    expect(roverState({ rover: online, mission: { status: "completed" } })).toEqual({ kind: "ok", word: "Docked" });
    expect(roverState({ rover: online, mission: null }).word).toBe("Docked");
  });
  it("does not claim Docked when the status is unknown", () => {
    expect(roverState({ rover: { status: "unknown", estop: false } }).word).toBe("Status unknown");
  });
});

describe("charge from the voltage", () => {
  it("11.10 V at rest is about 37 %, not 0 % (the prompt's example)", () => {
    expect(chargePct(11.1)).toBe(37);
  });
  it("a full 3S pack at rest reads 100 %", () => {
    expect(chargePct(12.6)).toBe(100);
  });
});
