// Browser-side store around the paper engine: persistence, change notifications,
// and turning position changes into journal entries so the coach sees paper trades.
import { useSyncExternalStore } from "react";
import { cancel as cancelOrder, closePosition, newAccount, onQuote, place, type Account, type OrderInput, type PositionEvent, type Px, type Result } from "./paper";
import { journal, SETUPS, type Setup } from "./journal";
import type { Ticker } from "./types";

const KEY = "d101.paper.v1";

function load(): Account {
  try { const v = localStorage.getItem(KEY); if (v) return JSON.parse(v) as Account; } catch { /* ignore */ }
  return newAccount();
}

let acc: Account = typeof localStorage !== "undefined" ? load() : newAccount();
const fns = new Set<() => void>();
const noticeFns = new Set<(msg: string) => void>();

function save(next: Account) {
  acc = next;
  try { localStorage.setItem(KEY, JSON.stringify(acc)); } catch { /* storage full or blocked */ }
  fns.forEach((f) => f());
}

const pxOf = (t?: Ticker): Px | undefined => (t ? { bid: t.bid, ask: t.ask, last: t.last } : undefined);
const lastPrices = (tk: Record<string, Ticker>) => Object.fromEntries(Object.entries(tk).map(([k, v]) => [k, v.last]));
const asSetup = (s?: string): Setup => (SETUPS as readonly string[]).includes(s ?? "") ? (s as Setup) : "Other";

/** Mirror one position change into the journal (open, add, partial close, close, flip).
 *  `jid` maps symbol -> the journal entry of the currently open position. */
function journalize(jid: Record<string, string | undefined>, ev: PositionEvent) {
  const { symbol, before, after, price, fee, ts, meta } = ev;
  const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  const openNew = (qty: number, entry: number, f: number) => {
    jid[symbol] = journal.open({ symbol, side: qty > 0 ? "long" : "short", qty: Math.abs(qty), entry, fee: f, setup: asSetup(meta?.setup), note: meta?.note ?? "", ctx: meta?.ctx, source: "paper", entryAt: ts });
  };
  const prev = jid[symbol] ? journal.get(jid[symbol]!) : undefined;

  if (sgn(before) === 0) return openNew(after, price, fee);
  if (sgn(after) === sgn(before) && Math.abs(after) > Math.abs(before)) {
    if (prev) journal.update(prev.id, { qty: Math.abs(after), entry: ev.avgAfter, fee: prev.fee + fee });
    return;
  }
  // reducing, closing or flipping
  const closedQty = Math.min(Math.abs(before), Math.abs(after - before));
  const closeFee = fee * (closedQty / Math.abs(after - before));
  if (sgn(after) === sgn(before)) { // partial close: split off the closed part
    if (prev) {
      const portion = closedQty / Math.abs(before);
      journal.add({ ...prev, qty: closedQty, fee: prev.fee * portion + closeFee, status: "closed", exit: price, exitAt: ts });
      journal.update(prev.id, { qty: Math.abs(after), fee: prev.fee * (1 - portion) });
    }
    return;
  }
  if (prev) journal.update(prev.id, { status: "closed", exit: price, exitAt: ts, fee: prev.fee + closeFee });
  jid[symbol] = undefined;
  if (sgn(after) !== 0) openNew(after, price, fee - closeFee); // flipped through zero
}

function commit(r: Result, broadcast: boolean) {
  if (r.error) return r;
  const jid: Record<string, string | undefined> = Object.fromEntries(Object.entries(acc.positions).map(([k, v]) => [k, v.journalId]));
  r.events.forEach((ev) => journalize(jid, ev));
  for (const [sym, p] of Object.entries(r.acc.positions)) p.journalId = jid[sym];
  save(r.acc);
  if (broadcast) r.notices.forEach((n) => noticeFns.forEach((f) => f(n)));
  return r;
}

export const paper = {
  get: () => acc,
  subscribe(fn: () => void) { fns.add(fn); return () => { fns.delete(fn); }; },
  /** Notices from fills that happen in the background (limit, stop, SL/TP). */
  onNotice(fn: (msg: string) => void) { noticeFns.add(fn); return () => { noticeFns.delete(fn); }; },
  place(input: OrderInput, tickers: Record<string, Ticker>) {
    return commit(place(acc, input, pxOf(tickers[input.symbol]), lastPrices(tickers)), false);
  },
  close(symbol: string, tickers: Record<string, Ticker>) {
    return commit(closePosition(acc, symbol, pxOf(tickers[symbol]), lastPrices(tickers)), false);
  },
  cancel(id: string) { save(cancelOrder(acc, id)); },
  cancelAll(symbol?: string) { save({ ...acc, orders: acc.orders.filter((o) => symbol && o.symbol !== symbol) }); },
  reset() {
    // Open paper trades in the journal can no longer be closed by the engine: drop them.
    journal.all().filter((t) => t.source === "paper" && t.status === "open").forEach((t) => journal.remove(t.id));
    save(newAccount());
  },
  /** Feed every ticker update through the matching engine. */
  tick(t: Ticker, tickers: Record<string, Ticker>) {
    if (!acc.orders.some((o) => o.symbol === t.symbol)) return;
    const r = onQuote(acc, t.symbol, pxOf(t)!, lastPrices(tickers));
    if (r.fills.length || r.acc.orders.length !== acc.orders.length) commit(r, true);
  },
};

export function usePaper() {
  return useSyncExternalStore(paper.subscribe, paper.get, paper.get);
}
