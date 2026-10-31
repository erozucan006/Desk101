// A small shared snapshot of what the screen currently shows. Panels write to it,
// the Learn drawer reads it to explain the *current* reading, not just the theory.
import type { Ticker } from "./types";

export type LiveCtx = {
  symbol: string;
  quote: string;
  timeframe: string;
  ticker?: Ticker;
  rsi?: number | null;
  ema9?: number | null;
  ema21?: number | null;
  spreadBps?: number | null;
  imbalance?: number | null; // bid share of visible book size, 0..1
  buyShare?: number | null; // share of recent traded volume that hit the ask
  winRate?: number | null;
  profitFactor?: number | null;
  expectancy?: number | null;
  openCount?: number;
};

let ctx: LiveCtx = { symbol: "BTC", quote: "USD", timeframe: "1H" };
const fns = new Set<() => void>();
let scheduled = false;

export const live = {
  /** Immutable snapshot; replaced (throttled) whenever a panel writes. */
  snapshot: () => ctx,
  set(patch: Partial<LiveCtx>) {
    ctx = { ...ctx, ...patch };
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; fns.forEach((f) => f()); }, 250);
  },
  subscribe(fn: () => void) { fns.add(fn); return () => { fns.delete(fn); }; },
};
