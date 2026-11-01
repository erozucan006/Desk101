import { describe, expect, it } from "vitest";
import { EVENTS, countdown, nextEvent, zoned } from "./calendar";

describe("zoned time conversion", () => {
  it("handles US standard and daylight time", () => {
    expect(new Date(zoned("2026-11-10", "08:30", "America/New_York")).toISOString()).toBe("2026-11-10T13:30:00.000Z"); // EST
    expect(new Date(zoned("2027-06-10", "08:30", "America/New_York")).toISOString()).toBe("2027-06-10T12:30:00.000Z"); // EDT
  });
  it("handles European summer and winter time", () => {
    expect(new Date(zoned("2026-12-17", "14:15", "Europe/Berlin")).toISOString()).toBe("2026-12-17T13:15:00.000Z"); // CET
    expect(new Date(zoned("2027-07-22", "14:15", "Europe/Berlin")).toISOString()).toBe("2027-07-22T12:15:00.000Z"); // CEST
  });
  it("handles the weeks when only one side has changed clocks", () => {
    // 2027-03-17: US already on EDT (since 14 Mar), Europe still on CET until 28 Mar
    expect(new Date(zoned("2027-03-17", "14:00", "America/New_York")).toISOString()).toBe("2027-03-17T18:00:00.000Z");
  });
});

describe("calendar data", () => {
  it("is sorted and has unique ids", () => {
    for (let i = 1; i < EVENTS.length; i++) expect(EVENTS[i].at).toBeGreaterThanOrEqual(EVENTS[i - 1].at);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
  });
  it("puts options expiry on the last Friday", () => {
    const e = EVENTS.filter((x) => x.kind === "expiry" && new Date(x.at).toISOString().startsWith("2026-11"));
    expect(new Date(e[0].at).toISOString()).toBe("2026-11-27T08:00:00.000Z");
    const dec = EVENTS.find((x) => x.kind === "expiry" && new Date(x.at).toISOString().startsWith("2026-12"))!;
    expect(new Date(dec.at).getUTCDay()).toBe(5);
    expect(dec.impact).toBe("high"); // quarterly
  });
  it("finds the next high-impact event", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    expect(nextEvent(now, { impact: "high" })?.kind).toBe("hicp"); // 4 Nov
    expect(countdown(26 * 3600_000 + 5 * 60_000)).toBe("1d 2h");
  });
});
