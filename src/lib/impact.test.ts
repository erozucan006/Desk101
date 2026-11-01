import { describe, expect, it } from "vitest";
import { candleAt, describeImpact, eventImpact, horizonsFor, typicalMove } from "./impact";
import type { Candle } from "./types";

const H = 3600_000;
// 100 hourly candles drifting +0.1% each, then a release at candle 60 that jumps +2% and fades.
const mk = (): Candle[] => {
  const cs: Candle[] = []; let p = 100;
  for (let i = 0; i < 100; i++) {
    const o = p; p = i === 60 ? p * 1.02 : i === 62 ? p * 0.995 : p * 1.001;
    cs.push({ t: i * H, o, h: Math.max(o, p) * 1.001, l: Math.min(o, p) * 0.999, c: p, v: 1 });
  }
  return cs;
};

describe("release impact from candles", () => {
  it("finds the candle a time falls in", () => {
    const cs = mk();
    expect(candleAt(cs, 60 * H + 1800_000, H)).toBe(60);
    expect(candleAt(cs, 60 * H, H)).toBe(60);
    expect(candleAt(cs, -1, H)).toBe(-1);
    expect(candleAt(cs, 100 * H + 1, H)).toBe(-1);
  });
  it("measures moves per horizon and compares with the typical move", () => {
    const cs = mk();
    const imp = eventImpact(cs, 60 * H + 1800_000, "1H")!;
    expect(imp.aligned).toBe(false);
    expect(imp.moves.map((m) => m.label)).toEqual(horizonsFor("1H").map((h) => h.label));
    expect(imp.moves[0].pct).toBeCloseTo(2, 5);
    expect(imp.moves[0].ratio!).toBeGreaterThan(5); // 2% vs ~0.1% normal
    expect(typicalMove(cs, 1)).toBeCloseTo(0.1, 2);
    expect(describeImpact("BTC", imp)).toMatch(/^BTC moved \+2\.00% in the first hour, a very large move \(a typical 1-hour move/);
  });
  it("leaves horizons that have not happened yet empty", () => {
    const cs = mk();
    const imp = eventImpact(cs, 98 * H, "1H")!;
    expect(imp.moves[0].pct).toBeDefined();
    expect(imp.moves[2].pct).toBeUndefined();
  });
});
