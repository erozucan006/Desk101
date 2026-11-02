// What the tutor gets to "see": a compact text snapshot of the screen. Pure, so it can be tested.
import type { LiveCtx } from "./live";
import type { EconEvent } from "./calendar";
import { countdown } from "./calendar";

const n = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? undefined : v.toFixed(d));

export function screenContext(c: LiveCtx, opts: { nextEvent?: EconEvent | null; now?: number; paper?: { equity: number; positions: string[] } } = {}): string {
  const now = opts.now ?? Date.now();
  const L: string[] = [];
  L.push(`Pair: ${c.symbol}/${c.quote}, chart timeframe ${c.timeframe}.`);
  const t = c.ticker;
  if (t) {
    L.push(`Last price ${t.last}; bid ${t.bid}, ask ${t.ask}; 24h change ${n(t.changePct)}%; 24h range ${t.low}–${t.high}; VWAP ${t.vwap}.`);
  }
  const ind = [
    c.rsi != null && `RSI(14) ${n(c.rsi, 1)}`,
    c.ema9 != null && `EMA9 ${n(c.ema9)}`,
    c.ema21 != null && `EMA21 ${n(c.ema21)}`,
    c.spreadBps != null && `spread ${n(c.spreadBps, 1)} bps`,
    c.imbalance != null && `order book: ${Math.round(c.imbalance * 100)}% of visible size on the bid side`,
    c.buyShare != null && `recent trades: ${Math.round(c.buyShare * 100)}% of volume bought at the ask`,
  ].filter(Boolean);
  if (ind.length) L.push(`Indicators: ${ind.join("; ")}.`);
  if (c.winRate != null || c.openCount) {
    L.push(`Student's journal: win rate ${c.winRate != null ? Math.round(c.winRate * 100) + "%" : "n/a"}, profit factor ${c.profitFactor != null && isFinite(c.profitFactor) ? n(c.profitFactor) : "n/a"}, expectancy per trade ${n(c.expectancy) ?? "n/a"}, open positions ${c.openCount ?? 0}.`);
  }
  if (opts.paper) L.push(`Paper account equity ${opts.paper.equity.toFixed(2)} ${c.quote}${opts.paper.positions.length ? `; holding ${opts.paper.positions.join(", ")}` : ""}.`);
  const e = opts.nextEvent;
  if (e && e.at > now) L.push(`Next high-impact release: ${e.title}${e.period ? ` (${e.period})` : ""} in ${countdown(e.at - now)}.`);
  L.push(`Current time (UTC): ${new Date(now).toISOString().slice(0, 16)}.`);
  return L.join("\n");
}

/** Starter questions that fit what is on screen. */
export function suggestions(c: LiveCtx, nextEvent?: EconEvent | null): string[] {
  const out: string[] = [];
  if (c.rsi != null) out.push(c.rsi >= 70 ? `RSI is ${c.rsi.toFixed(0)}. Does that mean ${c.symbol} will fall?` : c.rsi <= 30 ? `RSI is ${c.rsi.toFixed(0)}. Is ${c.symbol} cheap now?` : `What is RSI telling me about ${c.symbol} right now?`);
  out.push("Explain the order book like I'm new to this.");
  if (nextEvent) out.push(`Why could the ${nextEvent.title} move crypto?`);
  out.push("How much should I risk on one trade?");
  if (c.winRate != null) out.push("What does my journal say about how I trade?");
  return out.slice(0, 4);
}
