import { describe, expect, it } from "vitest";
import { buildReview, sampleTrades } from "./review";

describe("month in review", () => {
  it("needs at least three closed trades", () => {
    expect(buildReview(sampleTrades().slice(0, 2))).toBeNull();
  });
  it("builds a consistent review from the sample month", () => {
    const r = buildReview(sampleTrades(Date.UTC(2026, 10, 2)))!;
    expect(r.trades).toBe(24);
    expect(r.wins + r.losses).toBeLessThanOrEqual(r.trades);
    expect(r.curve).toHaveLength(25);
    expect(r.curve[24]).toBeCloseTo(r.net, 6);
    expect(r.best.pnl).toBeGreaterThanOrEqual(r.worst.pnl);
    expect(r.net).toBeGreaterThan(0);
  });
});
