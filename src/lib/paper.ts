// Paper trading engine. Pure functions over an Account value, so the rules can be
// unit-tested and later moved to a server unchanged.
//
// Model: one netted position per pair (qty > 0 long, qty < 0 short), cash per quote
// currency, no leverage (gross exposure may not exceed equity). Fees follow Kraken Pro's
// entry tier: 0.25% maker (resting limit orders), 0.40% taker (market, stops, marketable limits).

export const START_CASH = 10_000;
export const FEES = { maker: 0.0025, taker: 0.004 } as const;
const MAX_FILLS = 300;

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop";
export type Role = "entry" | "sl" | "tp";

export type OrderMeta = { setup?: string; note?: string; ctx?: { rsi?: number | null; trend?: "up" | "down" | null; timeframe?: string } };

export type Order = {
  id: string;
  symbol: string;
  side: Side;
  type: Exclude<OrderType, "market">;
  qty: number;
  price: number; // limit price, or stop trigger
  createdAt: string;
  role: Role;
  reduceOnly: boolean;
  oco?: string; // orders sharing an oco id cancel each other
  bracket?: { sl?: number; tp?: number };
  meta?: OrderMeta;
};

export type Fill = {
  id: string;
  orderId: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  liquidity: "maker" | "taker";
  role: Role;
  realized: number; // P&L realised by this fill before fees (0 when it only opens/adds)
  ts: string;
};

export type Position = { qty: number; avg: number; openedAt: string; journalId?: string };

export type Account = {
  cash: Record<string, number>;
  positions: Record<string, Position>;
  orders: Order[];
  fills: Fill[];
  startedAt: string;
};

export type Px = { bid: number; ask: number; last: number };

/** What changed in a position because of one fill. The store turns these into journal entries. */
export type PositionEvent = { symbol: string; before: number; after: number; avgBefore: number; avgAfter: number; price: number; fee: number; ts: string; meta?: OrderMeta };

export type Result = { acc: Account; fills: Fill[]; events: PositionEvent[]; notices: string[]; error?: string };

export type OrderInput = {
  symbol: string;
  side: Side;
  type: OrderType;
  qty: number;
  price?: number;
  bracket?: { sl?: number; tp?: number };
  reduceOnly?: boolean;
  meta?: OrderMeta;
};

let seq = 0;
const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
const EPS = 1e-12;

export const quoteOf = (symbol: string) => symbol.split("/")[1] ?? "USD";
const sign = (x: number) => (Math.abs(x) < EPS ? 0 : x > 0 ? 1 : -1);

export function newAccount(now = new Date().toISOString()): Account {
  return { cash: { USD: START_CASH, EUR: START_CASH }, positions: {}, orders: [], fills: [], startedAt: now };
}

/** Mark price for a pair: last trade if known, else the position's average. */
function mark(acc: Account, sym: string, prices: Record<string, number>) {
  return prices[sym] ?? acc.positions[sym]?.avg ?? 0;
}

export function equity(acc: Account, quote: string, prices: Record<string, number>): number {
  let e = acc.cash[quote] ?? 0;
  for (const [sym, p] of Object.entries(acc.positions)) if (quoteOf(sym) === quote) e += p.qty * mark(acc, sym, prices);
  return e;
}

export function exposure(acc: Account, quote: string, prices: Record<string, number>): number {
  let x = 0;
  for (const [sym, p] of Object.entries(acc.positions)) if (quoteOf(sym) === quote) x += Math.abs(p.qty * mark(acc, sym, prices));
  return x;
}

/** How much more gross exposure the account can take in this quote currency. */
export function buyingPower(acc: Account, quote: string, prices: Record<string, number>): number {
  return Math.max(0, equity(acc, quote, prices) - exposure(acc, quote, prices));
}

export function unrealized(acc: Account, sym: string, prices: Record<string, number>): number {
  const p = acc.positions[sym];
  return p ? (mark(acc, sym, prices) - p.avg) * p.qty : 0;
}

/** Would this signed change keep gross exposure within equity (no leverage)? Reducing is always allowed. */
function fits(acc: Account, symbol: string, delta: number, price: number, fee: number, prices: Record<string, number>): boolean {
  const before = acc.positions[symbol]?.qty ?? 0, after = before + delta;
  if (Math.abs(after) <= Math.abs(before) + EPS && sign(after) !== -sign(before)) return true;
  const q = quoteOf(symbol);
  const px = { ...prices, [symbol]: price };
  const gross = exposure(acc, q, px) - Math.abs(before * price) + Math.abs(after * price);
  return gross + fee <= equity(acc, q, px) + 1e-6;
}

function clone(acc: Account): Account {
  return { ...acc, cash: { ...acc.cash }, positions: Object.fromEntries(Object.entries(acc.positions).map(([k, v]) => [k, { ...v }])), orders: acc.orders.slice(), fills: acc.fills.slice() };
}

/** Apply one execution to a (cloned) account. Mutates `acc`. */
function execute(acc: Account, o: { id: string; symbol: string; side: Side; qty: number; role: Role; meta?: OrderMeta }, price: number, liquidity: "maker" | "taker", ts: string, out: Result) {
  const delta = o.side === "buy" ? o.qty : -o.qty;
  const fee = price * o.qty * FEES[liquidity];
  const q = quoteOf(o.symbol);
  acc.cash[q] = (acc.cash[q] ?? 0) - delta * price - fee;

  const pos = acc.positions[o.symbol];
  const before = pos?.qty ?? 0, avgBefore = pos?.avg ?? 0, after = before + delta;
  let avg = avgBefore, realized = 0, openedAt = pos?.openedAt ?? ts;
  if (sign(before) === 0 || sign(before) === sign(delta)) {
    avg = (Math.abs(before) * avgBefore + Math.abs(delta) * price) / Math.abs(after);
    if (sign(before) === 0) openedAt = ts;
  } else {
    const closed = Math.min(Math.abs(delta), Math.abs(before));
    realized = (price - avgBefore) * closed * sign(before);
    if (sign(after) !== 0 && sign(after) !== sign(before)) { avg = price; openedAt = ts; } // flipped
  }
  if (Math.abs(after) < EPS) delete acc.positions[o.symbol];
  else acc.positions[o.symbol] = { qty: after, avg, openedAt, journalId: pos?.journalId };

  const fill: Fill = { id: uid(), orderId: o.id, symbol: o.symbol, side: o.side, qty: o.qty, price, fee, liquidity, role: o.role, realized, ts };
  acc.fills = [fill, ...acc.fills].slice(0, MAX_FILLS);
  out.fills.push(fill);
  out.events.push({ symbol: o.symbol, before, after: Math.abs(after) < EPS ? 0 : after, avgBefore, avgAfter: avg, price, fee, ts, meta: o.meta });

  // A flat position leaves reduce-only orders (stop-loss, take-profit) with nothing to protect.
  if (Math.abs(after) < EPS) {
    const n = acc.orders.length;
    acc.orders = acc.orders.filter((x) => !(x.symbol === o.symbol && x.reduceOnly));
    if (acc.orders.length < n) out.notices.push(`${o.symbol} is flat: its stop-loss / take-profit orders were cancelled.`);
  }
}

/** Clamp a reduce-only quantity to the open position; 0 means nothing to reduce. */
function reducible(acc: Account, symbol: string, side: Side, qty: number): number {
  const pos = acc.positions[symbol]?.qty ?? 0;
  if ((side === "sell" && pos <= 0) || (side === "buy" && pos >= 0)) return 0;
  return Math.min(qty, Math.abs(pos));
}

function attachBracket(acc: Account, symbol: string, entrySide: Side, qty: number, bracket: { sl?: number; tp?: number } | undefined, ts: string) {
  if (!bracket || (!bracket.sl && !bracket.tp)) return;
  const side: Side = entrySide === "buy" ? "sell" : "buy";
  const oco = uid();
  if (bracket.sl) acc.orders.push({ id: uid(), symbol, side, type: "stop", qty, price: bracket.sl, createdAt: ts, role: "sl", reduceOnly: true, oco });
  if (bracket.tp) acc.orders.push({ id: uid(), symbol, side, type: "limit", qty, price: bracket.tp, createdAt: ts, role: "tp", reduceOnly: true, oco });
}

export function validateBracket(side: Side, ref: number, b?: { sl?: number; tp?: number }): string | null {
  if (!b) return null;
  const long = side === "buy";
  if (b.sl != null && (long ? b.sl >= ref : b.sl <= ref)) return `Stop-loss must be ${long ? "below" : "above"} the entry price.`;
  if (b.tp != null && (long ? b.tp <= ref : b.tp >= ref)) return `Take-profit must be ${long ? "above" : "below"} the entry price.`;
  return null;
}

export function place(acc0: Account, input: OrderInput, px: Px | undefined, prices: Record<string, number>, now = new Date().toISOString()): Result {
  const out: Result = { acc: acc0, fills: [], events: [], notices: [] };
  const fail = (error: string): Result => ({ ...out, error });
  const { symbol, side, type } = input;
  let qty = input.qty;
  if (!(qty > 0)) return fail("Quantity must be greater than zero.");
  if (type !== "market" && !(input.price && input.price > 0)) return fail(`Enter a ${type === "stop" ? "trigger" : "limit"} price.`);
  if (!px || !(px.ask > 0) || !(px.bid > 0)) return fail(`No live quote for ${symbol} yet.`);
  if (input.reduceOnly) { qty = reducible(acc0, symbol, side, qty); if (!qty) return fail(`No ${side === "sell" ? "long" : "short"} ${symbol} position to reduce.`); }

  const acc = clone(acc0);
  out.acc = acc;
  const delta = side === "buy" ? qty : -qty;
  const marketable = type === "market" || (type === "limit" && (side === "buy" ? input.price! >= px.ask : input.price! <= px.bid));

  if (type === "stop" && (side === "buy" ? input.price! <= px.last : input.price! >= px.last))
    return fail(`A ${side} stop must be ${side === "buy" ? "above" : "below"} the last price (${px.last}). For a better price, use a limit order.`);

  const ref = marketable ? (side === "buy" ? px.ask : px.bid) : input.price!;
  const bErr = validateBracket(side, ref, input.bracket);
  if (bErr) return fail(bErr);

  if (marketable) {
    const p = side === "buy" ? px.ask : px.bid;
    if (!fits(acc, symbol, delta, p, p * qty * FEES.taker, prices)) return fail("Not enough buying power. Paper accounts trade without leverage: total positions can't exceed account equity.");
    const id = uid();
    execute(acc, { id, symbol, side, qty, role: "entry", meta: input.meta }, p, "taker", now, out);
    if (type === "limit") out.notices.push(`Your limit was at or through the best ${side === "buy" ? "ask" : "bid"}, so it filled immediately at ${p} as a taker.`);
    attachBracket(acc, symbol, side, qty, input.bracket, now);
    return out;
  }

  if (!input.reduceOnly && !fits(acc, symbol, delta, input.price!, input.price! * qty * FEES.maker, prices))
    return fail("Not enough buying power for this order at that price.");
  acc.orders.push({ id: uid(), symbol, side, type: type as "limit" | "stop", qty, price: input.price!, createdAt: now, role: input.reduceOnly ? (type === "stop" ? "sl" : "tp") : "entry", reduceOnly: !!input.reduceOnly, bracket: input.bracket, meta: input.meta });
  return out;
}

/** Match resting orders for one pair against a new quote. */
export function onQuote(acc0: Account, symbol: string, px: Px, prices: Record<string, number>, now = new Date().toISOString()): Result {
  const out: Result = { acc: acc0, fills: [], events: [], notices: [] };
  if (!acc0.orders.some((o) => o.symbol === symbol)) return out;
  const acc = clone(acc0);
  out.acc = acc;
  const pr = { ...prices, [symbol]: px.last };
  for (const o of acc0.orders.filter((x) => x.symbol === symbol)) {
    if (!acc.orders.some((x) => x.id === o.id)) continue; // cancelled by an earlier fill in this pass
    let fillAt: number | null = null, liq: "maker" | "taker" = "maker";
    if (o.type === "limit") {
      if (o.side === "buy" && px.ask <= o.price) fillAt = o.price;
      if (o.side === "sell" && px.bid >= o.price) fillAt = o.price;
    } else {
      if (o.side === "buy" && px.last >= o.price) { fillAt = px.ask; liq = "taker"; }
      if (o.side === "sell" && px.last <= o.price) { fillAt = px.bid; liq = "taker"; }
    }
    if (fillAt == null) continue;
    acc.orders = acc.orders.filter((x) => x.id !== o.id);
    let qty = o.qty;
    if (o.reduceOnly) { qty = reducible(acc, symbol, o.side, qty); if (!qty) continue; }
    const delta = o.side === "buy" ? qty : -qty;
    if (!o.reduceOnly && !fits(acc, symbol, delta, fillAt, fillAt * qty * FEES[liq], pr)) {
      out.notices.push(`${o.side.toUpperCase()} ${o.qty} ${symbol} was cancelled: not enough buying power when it triggered.`);
      continue;
    }
    if (o.oco) acc.orders = acc.orders.filter((x) => x.oco !== o.oco);
    execute(acc, { ...o, qty }, fillAt, liq, now, out);
    const label = o.role === "sl" ? "Stop-loss hit" : o.role === "tp" ? "Take-profit hit" : `${o.type === "limit" ? "Limit" : "Stop"} order filled`;
    out.notices.push(`${label}: ${o.side} ${qty} ${symbol} @ ${fillAt}.`);
    attachBracket(acc, symbol, o.side, qty, o.bracket, now);
  }
  return out;
}

export function cancel(acc: Account, id: string): Account {
  return { ...acc, orders: acc.orders.filter((o) => o.id !== id) };
}

export function closePosition(acc: Account, symbol: string, px: Px | undefined, prices: Record<string, number>, now?: string): Result {
  const p = acc.positions[symbol];
  if (!p) return { acc, fills: [], events: [], notices: [], error: `No open ${symbol} position.` };
  return place(acc, { symbol, side: p.qty > 0 ? "sell" : "buy", type: "market", qty: Math.abs(p.qty), reduceOnly: true }, px, prices, now);
}
