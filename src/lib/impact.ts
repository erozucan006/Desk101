// How price moved around a macro release, measured from the candles on screen.
// Pure functions: no fetching, so the chart popup works for any pair and in demo mode.
import type { Candle } from "./types";

const M = 60_000, H = 60 * M, D = 24 * H;

/** Horizons worth reporting for a timeframe: each one is at least one candle long. */
export function horizonsFor(tf: string): { label: string; ms: number }[] {
  switch (tf) {
    case "5M": return [{ label: "15 min", ms: 15 * M }, { label: "1 hour", ms: H }, { label: "4 hours", ms: 4 * H }];
    case "15M":
    case "1H": return [{ label: "1 hour", ms: H }, { label: "4 hours", ms: 4 * H }, { label: "1 day", ms: D }];
    case "4H": return [{ label: "4 hours", ms: 4 * H }, { label: "1 day", ms: D }, { label: "3 days", ms: 3 * D }];
    case "1D": return [{ label: "1 day", ms: D }, { label: "3 days", ms: 3 * D }, { label: "1 week", ms: 7 * D }];
    default: return [];
  }
}

export type Move = { label: string; ms: number; pct?: number; normal?: number; ratio?: number };
export type Impact = {
  t0: number; // open time of the candle the release fell in
  p0: number; // price at that candle's open
  moves: Move[];
  swing?: { up: number; down: number; label: string }; // largest move each way within the first horizon
  aligned: boolean; // release time sits on a candle boundary
};

/** Index of the candle whose period contains `t`, or -1. */
export function candleAt(cs: Candle[], t: number, span: number): number {
  let lo = 0, hi = cs.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (cs[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans >= 0 && t < cs[ans].t + span ? ans : -1;
}

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Typical absolute % move over `k` candles across the loaded history (the "normal" to compare with). */
export function typicalMove(cs: Candle[], k: number): number | undefined {
  const xs: number[] = [];
  for (let i = 0; i + k < cs.length; i++) if (cs[i].o > 0) xs.push(Math.abs(cs[i + k].o / cs[i].o - 1) * 100);
  return xs.length >= 20 ? median(xs) : undefined;
}

export function eventImpact(cs: Candle[], t: number, tf: string): Impact | null {
  if (cs.length < 2) return null;
  const span = cs[1].t - cs[0].t;
  const i0 = candleAt(cs, t, span);
  if (i0 < 0) return null;
  const p0 = cs[i0].o;
  const last = cs[cs.length - 1];
  const moves: Move[] = horizonsFor(tf).map(({ label, ms }) => {
    const k = Math.max(1, Math.round(ms / span));
    const j = i0 + k;
    // price at t0 + horizon = open of that candle; the still-forming candle counts once its time has come
    const pj = j < cs.length ? cs[j].o : j === cs.length && last.t + span <= Date.now() ? last.c : undefined;
    const pct = pj != null ? (pj / p0 - 1) * 100 : undefined;
    const normal = typicalMove(cs, k);
    return { label, ms, pct, normal, ratio: pct != null && normal ? Math.abs(pct) / normal : undefined };
  });
  let swing: Impact["swing"];
  const first = horizonsFor(tf)[0];
  if (first) {
    const k = Math.max(1, Math.round(first.ms / span));
    const win = cs.slice(i0, Math.min(cs.length, i0 + k));
    if (win.length) swing = { up: (Math.max(...win.map((c) => c.h)) / p0 - 1) * 100, down: (Math.min(...win.map((c) => c.l)) / p0 - 1) * 100, label: first.label };
  }
  return { t0: cs[i0].t, p0, moves, swing, aligned: t === cs[i0].t };
}

const sgn = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}%`;
const size = (r?: number) => (r == null ? "" : r >= 2.5 ? "a very large move" : r >= 1.5 ? "a bigger than usual move" : r >= 0.67 ? "a fairly normal move" : "a smaller than usual move");

/** One or two plain-English sentences a beginner can read. */
export function describeImpact(base: string, imp: Impact): string {
  const done = imp.moves.filter((m) => m.pct != null);
  if (!done.length) return `The release is too recent: ${base} has not traded long enough after it to measure a reaction.`;
  const a = done[0], z = done[done.length - 1];
  let s = `${base} moved ${sgn(a.pct!)} in the first ${a.label.replace(/^1 /, "")}`;
  if (a.ratio != null) s += `, ${size(a.ratio)} (a typical ${a.label.replace(" ", "-")} move is about ${a.normal!.toFixed(2)}% either way)`;
  s += ".";
  if (z !== a) {
    const flipped = Math.sign(z.pct!) !== Math.sign(a.pct!) && Math.abs(z.pct!) > 0.05;
    s += flipped ? ` The first reaction did not hold: ${z.label} later it was ${sgn(z.pct!)}.` : ` ${z.label[0].toUpperCase() + z.label.slice(1)} later it was ${sgn(z.pct!)}.`;
  }
  if (imp.swing && imp.swing.up - imp.swing.down > 2 * Math.abs(a.pct ?? 0) && imp.swing.up > 0.1 && imp.swing.down < -0.1)
    s += ` Within the first ${imp.swing.label.replace(/^1 /, "")} it swung both ways (${sgn(imp.swing.up)} / ${sgn(imp.swing.down)}), typical of a market digesting news.`;
  return s;
}
