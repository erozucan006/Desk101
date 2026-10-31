// Trade journal: stored in the browser for v0.1 (no accounts yet).
// Stats and the coach are pure functions so they can be tested and later run server-side.

export type Side = "long" | "short";
export const SETUPS = ["Breakout", "Pullback", "Reversal", "Range", "News", "Other"] as const;
export type Setup = (typeof SETUPS)[number];

export type JournalTrade = {
  id: string;
  symbol: string; // e.g. "BTC/USD"
  side: Side;
  qty: number;
  entry: number;
  entryAt: string; // ISO
  fee: number;
  setup: Setup;
  note: string;
  status: "open" | "closed";
  exit?: number;
  exitAt?: string;
  // market context captured at entry, used by the coach
  ctx?: { rsi?: number | null; trend?: "up" | "down" | null; timeframe?: string };
};

const KEY = "lt.journal.v1";

function load(): JournalTrade[] {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : []; } catch { return []; }
}

let trades: JournalTrade[] = typeof localStorage !== "undefined" ? load() : [];
const fns = new Set<() => void>();
function commit(next: JournalTrade[]) {
  trades = next;
  try { localStorage.setItem(KEY, JSON.stringify(trades)); } catch { /* storage full or blocked */ }
  fns.forEach((f) => f());
}

export const journal = {
  all: () => trades,
  subscribe(fn: () => void) { fns.add(fn); return () => { fns.delete(fn); }; },
  open(t: Omit<JournalTrade, "id" | "status" | "entryAt"> & { entryAt?: string }) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    commit([...trades, { ...t, id, status: "open", entryAt: t.entryAt ?? new Date().toISOString() }]);
    return id;
  },
  close(id: string, exit: number) {
    commit(trades.map((t) => (t.id === id ? { ...t, status: "closed", exit, exitAt: new Date().toISOString() } : t)));
  },
  remove(id: string) { commit(trades.filter((t) => t.id !== id)); },
  replaceAll(next: JournalTrade[]) { commit(next); },
};

export function pnl(t: Pick<JournalTrade, "side" | "qty" | "entry" | "fee">, px: number | null | undefined): number | null {
  if (px == null || !isFinite(px)) return null;
  return (t.side === "long" ? px - t.entry : t.entry - px) * t.qty - (t.fee || 0);
}

export function pnlPct(t: Pick<JournalTrade, "side" | "entry">, px: number | null | undefined): number | null {
  if (px == null || !isFinite(px)) return null;
  return (t.side === "long" ? px / t.entry - 1 : 1 - px / t.entry) * 100;
}

export type Stats = {
  closed: number; wins: number; losses: number; winRate: number | null;
  realized: number; profitFactor: number | null; avgWin: number | null; avgLoss: number | null;
  expectancy: number | null;
};

export function stats(list: JournalTrade[]): Stats {
  const res = list.filter((t) => t.status === "closed" && t.exit != null).map((t) => pnl(t, t.exit)!);
  const w = res.filter((x) => x > 0), l = res.filter((x) => x < 0);
  const gw = w.reduce((a, b) => a + b, 0), gl = -l.reduce((a, b) => a + b, 0);
  return {
    closed: res.length, wins: w.length, losses: l.length,
    winRate: res.length ? w.length / res.length : null,
    realized: res.reduce((a, b) => a + b, 0),
    profitFactor: gl > 0 ? gw / gl : w.length ? Infinity : null,
    avgWin: w.length ? gw / w.length : null,
    avgLoss: l.length ? -gl / l.length : null,
    expectancy: res.length ? res.reduce((a, b) => a + b, 0) / res.length : null,
  };
}

export type Insight = { tone: "good" | "warn" | "info"; title: string; body: string };

const MIN_TRADES = 5;

// Rule-based coach. Each rule needs a minimum sample so it does not overreact.
export function coach(list: JournalTrade[]): Insight[] {
  const closed = list.filter((t) => t.status === "closed" && t.exit != null);
  if (closed.length < MIN_TRADES) {
    return [{ tone: "info", title: "The coach needs data", body: `Close ${MIN_TRADES - closed.length} more trade${MIN_TRADES - closed.length === 1 ? "" : "s"} and the coach starts looking for patterns in how you trade.` }];
  }
  const out: Insight[] = [];
  const r = (t: JournalTrade) => pnlPct(t, t.exit)!;
  const winRate = (a: JournalTrade[]) => a.filter((t) => r(t) > 0).length / a.length;
  const fmtPct = (x: number) => Math.round(x * 100) + "%";

  // 1. Payoff: average win vs average loss
  const s = stats(closed);
  if (s.avgWin != null && s.avgLoss != null) {
    const ratio = s.avgWin / -s.avgLoss;
    if (ratio < 1) out.push({ tone: "warn", title: "Your losses are bigger than your wins", body: `Average win is ${ratio.toFixed(2)}× your average loss. With that payoff you need a win rate above ${fmtPct(1 / (1 + ratio))} just to break even. Yours is ${fmtPct(s.winRate!)}.` });
    else out.push({ tone: "good", title: "Healthy payoff", body: `Your average win is ${ratio.toFixed(2)}× your average loss, so you can be wrong more often than right and still make money.` });
  }

  // 2. Holding time: cutting winners, riding losers
  const hold = (t: JournalTrade) => Date.parse(t.exitAt!) - Date.parse(t.entryAt);
  const wins = closed.filter((t) => r(t) > 0), losses = closed.filter((t) => r(t) < 0);
  if (wins.length >= 2 && losses.length >= 2) {
    const hw = wins.reduce((a, t) => a + hold(t), 0) / wins.length;
    const hl = losses.reduce((a, t) => a + hold(t), 0) / losses.length;
    if (hl > hw * 1.5) out.push({ tone: "warn", title: "You hold losers longer than winners", body: `Losing trades stay open ${(hl / hw).toFixed(1)}× longer than winning ones. That is the classic disposition effect: taking profit quickly, hoping losers come back. A stop level decided before entry helps.` });
  }

  // 3. Long vs short
  const longs = closed.filter((t) => t.side === "long"), shorts = closed.filter((t) => t.side === "short");
  if (longs.length >= 3 && shorts.length >= 3) {
    const wl = winRate(longs), ws = winRate(shorts);
    if (Math.abs(wl - ws) >= 0.2) out.push({ tone: "info", title: `You trade ${wl > ws ? "longs" : "shorts"} better`, body: `Win rate on longs is ${fmtPct(wl)}, on shorts ${fmtPct(ws)}. Consider sizing down on the side that keeps losing until you understand why.` });
  }

  // 4. Buying overbought
  const hot = longs.filter((t) => (t.ctx?.rsi ?? 0) >= 70);
  const rest = longs.filter((t) => t.ctx?.rsi != null && t.ctx.rsi < 70);
  if (hot.length >= 3 && rest.length >= 2) {
    const wh = winRate(hot), wr = winRate(rest);
    if (wh < wr) out.push({ tone: "warn", title: "Chasing overbought moves", body: `Longs opened with RSI ≥ 70 won ${fmtPct(wh)} of the time, versus ${fmtPct(wr)} for your other longs. Entering after a big run often means buying from people taking profit.` });
  }

  // 5. Against the trend
  const against = closed.filter((t) => t.ctx?.trend && ((t.side === "long" && t.ctx.trend === "down") || (t.side === "short" && t.ctx.trend === "up")));
  const withT = closed.filter((t) => t.ctx?.trend && !against.includes(t));
  if (against.length >= 3 && withT.length >= 2) {
    const wa = winRate(against), ww = winRate(withT);
    if (wa < ww) out.push({ tone: "warn", title: "Fighting the trend costs you", body: `Trades against the EMA trend won ${fmtPct(wa)}, trades with it ${fmtPct(ww)}.` });
  }

  // 6. Best and worst setup
  const bySetup = new Map<string, JournalTrade[]>();
  closed.forEach((t) => { bySetup.set(t.setup, [...(bySetup.get(t.setup) ?? []), t]); });
  const ranked = [...bySetup.entries()].filter(([, a]) => a.length >= 3).map(([k, a]) => ({ k, avg: a.reduce((x, t) => x + r(t), 0) / a.length, n: a.length })).sort((a, b) => b.avg - a.avg);
  if (ranked.length >= 2) {
    const best = ranked[0], worst = ranked[ranked.length - 1];
    out.push({ tone: "info", title: `Best setup: ${best.k}`, body: `${best.k} trades average ${best.avg >= 0 ? "+" : ""}${best.avg.toFixed(2)}% (${best.n} trades). ${worst.k} averages ${worst.avg >= 0 ? "+" : ""}${worst.avg.toFixed(2)}% (${worst.n} trades).` });
  }

  if (!out.length) out.push({ tone: "good", title: "No red flags yet", body: "Nothing in your recent trades stands out. Keep logging setups and notes; patterns show up with more data." });
  return out;
}

export function toCSV(list: JournalTrade[]): string {
  const head = ["id", "symbol", "side", "qty", "entry", "entry_at", "exit", "exit_at", "fee", "pnl", "pnl_pct", "setup", "rsi_at_entry", "trend_at_entry", "note"];
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = list.map((t) => [t.id, t.symbol, t.side, t.qty, t.entry, t.entryAt, t.exit ?? "", t.exitAt ?? "", t.fee,
    t.exit != null ? pnl(t, t.exit)?.toFixed(2) : "", t.exit != null ? pnlPct(t, t.exit)?.toFixed(2) : "", t.setup, t.ctx?.rsi?.toFixed(1) ?? "", t.ctx?.trend ?? "", t.note].map(esc).join(","));
  return [head.join(","), ...rows].join("\n");
}
