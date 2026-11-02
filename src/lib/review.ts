// "Month in review": turns closed journal trades into the numbers for a short story sequence.
import { coach, pnl, SETUPS, type Insight, type JournalTrade, type Side } from "./journal";

export type ReviewTrade = { symbol: string; side: string; pnl: number; setup: string; note: string; at: number };
export type Review = {
  title: string; // "October 2026"
  trades: number;
  days: number; // distinct trading days
  net: number;
  winRate: number;
  wins: number;
  losses: number;
  curve: number[]; // cumulative P&L after each trade, starting at 0
  best: ReviewTrade;
  worst: ReviewTrade;
  bestDay: { label: string; pnl: number };
  worstDay: { label: string; pnl: number };
  setups: { setup: string; count: number; net: number; winRate: number }[];
  insights: Insight[];
  ccy: string;
};

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const dayLabel = (k: string) => new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Review of the most recent month that has closed trades (or all trades, if `all`). Null when there is too little to show. */
export function buildReview(list: JournalTrade[], minTrades = 3): Review | null {
  const closed = list.filter((t) => t.status === "closed" && t.exit != null && t.exitAt)
    .map((t) => ({ t, at: Date.parse(t.exitAt!), p: pnl(t, t.exit)! }))
    .filter((x) => isFinite(x.at)).sort((a, b) => a.at - b.at);
  if (closed.length < minTrades) return null;
  const lastMonth = new Date(closed[closed.length - 1].at).toISOString().slice(0, 7);
  let rows = closed.filter((x) => new Date(x.at).toISOString().slice(0, 7) === lastMonth);
  if (rows.length < minTrades) rows = closed; // too few this month: review everything
  const sameMonth = rows.every((x) => new Date(x.at).toISOString().slice(0, 7) === lastMonth);
  const title = sameMonth
    ? new Date(lastMonth + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "All your trades";

  const toRT = (x: (typeof rows)[number]): ReviewTrade => ({ symbol: x.t.symbol, side: x.t.side, pnl: x.p, setup: x.t.setup, note: x.t.note, at: x.at });
  const curve = [0]; rows.forEach((x) => curve.push(curve[curve.length - 1] + x.p));
  const byDay = new Map<string, number>(); rows.forEach((x) => byDay.set(dayKey(x.at), (byDay.get(dayKey(x.at)) ?? 0) + x.p));
  const days = [...byDay.entries()].sort((a, b) => b[1] - a[1]);
  const best = rows.reduce((a, b) => (b.p > a.p ? b : a)), worst = rows.reduce((a, b) => (b.p < a.p ? b : a));
  const wins = rows.filter((x) => x.p > 0).length, losses = rows.filter((x) => x.p < 0).length;
  const setups = SETUPS.map((s) => {
    const r = rows.filter((x) => x.t.setup === s);
    return { setup: s as string, count: r.length, net: r.reduce((a, x) => a + x.p, 0), winRate: r.length ? r.filter((x) => x.p > 0).length / r.length : 0 };
  }).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);

  return {
    title, trades: rows.length, days: byDay.size, net: curve[curve.length - 1], winRate: wins / rows.length, wins, losses, curve,
    best: toRT(best), worst: toRT(worst),
    bestDay: { label: dayLabel(days[0][0]), pnl: days[0][1] }, worstDay: { label: dayLabel(days[days.length - 1][0]), pnl: days[days.length - 1][1] },
    setups, insights: coach(rows.map((x) => x.t)).filter((i) => i.tone !== "info" || rows.length >= 5).slice(0, 3),
    ccy: rows[0].t.symbol.endsWith("/EUR") ? "EUR" : "USD",
  };
}

/** A believable sample month for demos: mixed results, one rough patch, a strong finish. Deterministic. */
export function sampleTrades(now = Date.now()): JournalTrade[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const start = new Date(now); start.setUTCDate(1); start.setUTCHours(9, 0, 0, 0);
  if (start.getTime() > now - 20 * 86400_000) start.setUTCMonth(start.getUTCMonth() - 1); // use a finished month
  const syms: [string, number][] = [["BTC/USD", 78000], ["ETH/USD", 2300], ["SOL/USD", 180], ["XRP/USD", 0.62]];
  const plan = ["Breakout", "Pullback", "Pullback", "Breakout", "Reversal", "Range", "Pullback", "News"] as const;
  const good = ["Waited for the retest, clean entry.", "Followed the plan.", "Took profit at target, no regrets.", "Patient. Let the setup come to me."];
  const bad = ["Moved my stop early. Should not have.", "Chased the candle. Knew it.", "Entered before the CPI release. Too early.", "Revenge trade after the last loss."];
  const out: JournalTrade[] = [];
  for (let i = 0; i < 24; i++) {
    const day = Math.floor(i * 1.15) + 1, [sym, px] = syms[i % syms.length];
    const side: Side = rnd() > 0.35 ? "long" : "short";
    const rough = i >= 9 && i <= 12;
    const edge = rough ? -0.014 : 0.011;
    const move = (edge + (rnd() - 0.45) * 0.03) * (side === "long" ? 1 : -1);
    const qty = +(25000 / px).toFixed(px > 100 ? 4 : 1);
    const t0 = start.getTime() + day * 86400_000 + Math.floor(rnd() * 8) * 3600_000;
    out.push({
      id: `sample-${i}`, symbol: sym, side, qty, entry: px, entryAt: new Date(t0).toISOString(), fee: 25000 * 0.004,
      setup: plan[i % plan.length], note: (move * (side === "long" ? 1 : -1) > 0 ? good : bad)[i % 4], status: "closed",
      exit: +(px * (1 + move)).toFixed(px > 100 ? 2 : 4), exitAt: new Date(t0 + (2 + Math.floor(rnd() * 20)) * 3600_000).toISOString(), source: "paper",
    });
  }
  return out;
}
