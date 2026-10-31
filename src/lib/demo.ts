// Offline demo feed: synthetic but realistic-looking market data with the same
// interface as KrakenFeed. Used with ?demo=1, in tests, and as a fallback for
// presentations without internet.
import type { Book, Candle, Feed, FeedStatus, Ticker, Trade, Unsub } from "./types";

const BASE_PRICES: Record<string, number> = {
  BTC: 77500, ETH: 2250, SOL: 178, XRP: 0.62, ADA: 0.41, DOGE: 0.16, DOT: 4.6, LINK: 13.2,
  AVAX: 27.5, LTC: 72, BCH: 360, ATOM: 4.9, UNI: 8.1, AAVE: 165, XLM: 0.11, NEAR: 4.8,
  ARB: 0.55, OP: 1.7, SUI: 2.1, PEPE: 0.0000095, SHIB: 0.000018, APT: 9.2, INJ: 21,
  FET: 1.35, RENDER: 5.4, ALGO: 0.14, TRX: 0.16, POL: 0.38, TIA: 5.2, SEI: 0.34,
};

// deterministic PRNG so demos look the same each load
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

type Sim = { base: string; quote: string; price: number; open24: number; hi: number; lo: number; vol: number; r: () => number; vola: number };

export class DemoFeed implements Feed {
  readonly kind = "demo" as const;
  private sims = new Map<string, Sim>();
  private timers = new Set<ReturnType<typeof setInterval>>();

  status(): FeedStatus { return "demo"; }
  onStatus(): Unsub { return () => {}; }

  private sim(symbol: string): Sim | null {
    if (this.sims.has(symbol)) return this.sims.get(symbol)!;
    const [base, quote] = symbol.split("/");
    const p0 = BASE_PRICES[base];
    if (!p0) return null;
    const seed = [...symbol].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const r = rng(seed);
    const fx = quote === "EUR" ? 0.9 : 1;
    const price = p0 * fx;
    const open24 = price * (1 + (r() - 0.5) * 0.12);
    const s: Sim = { base, quote, price, open24, hi: Math.max(price, open24) * 1.01, lo: Math.min(price, open24) * 0.99, vol: (2e6 + r() * 4e8) / price, r, vola: 0.0006 + r() * 0.0012 };
    this.sims.set(symbol, s);
    return s;
  }

  private step(s: Sim) {
    const shock = (s.r() - 0.5) * 2 * s.vola * s.price;
    s.price = Math.max(s.price * 0.5, s.price + shock);
    s.hi = Math.max(s.hi, s.price); s.lo = Math.min(s.lo, s.price);
    s.vol += s.r() * 3;
  }

  private every(ms: number, fn: () => void): Unsub {
    const id = setInterval(fn, ms);
    this.timers.add(id);
    return () => { clearInterval(id); this.timers.delete(id); };
  }

  private tickerOf(symbol: string, s: Sim): Ticker {
    const spread = s.price * 0.00008;
    return { symbol, last: s.price, bid: s.price - spread / 2, ask: s.price + spread / 2, high: s.hi, low: s.lo, changePct: (s.price / s.open24 - 1) * 100, volume: s.vol, vwap: (s.hi + s.lo + s.price) / 3 };
  }

  ticker(symbol: string, fn: (t: Ticker) => void, onError?: (m: string) => void): Unsub {
    const s = this.sim(symbol);
    if (!s) { queueMicrotask(() => onError?.("Currency pair not supported")); return () => {}; }
    queueMicrotask(() => fn(this.tickerOf(symbol, s)));
    return this.every(1000 + s.r() * 1500, () => { this.step(s); fn(this.tickerOf(symbol, s)); });
  }

  book(symbol: string, depth: number, fn: (b: Book) => void, onError?: (m: string) => void): Unsub {
    const s = this.sim(symbol);
    if (!s) { queueMicrotask(() => onError?.("Currency pair not supported")); return () => {}; }
    const make = (): Book => {
      const tick = s.price * 0.00004;
      const bids = [], asks = [];
      for (let i = 0; i < depth; i++) {
        bids.push({ price: s.price - tick * (i + 1) - s.r() * tick, qty: +(s.r() ** 2 * 8 * (77500 / s.price) ** 0.3 + 0.001).toFixed(4) });
        asks.push({ price: s.price + tick * (i + 1) + s.r() * tick, qty: +(s.r() ** 2 * 8 * (77500 / s.price) ** 0.3 + 0.001).toFixed(4) });
      }
      return { symbol, bids, asks, ts: Date.now() };
    };
    queueMicrotask(() => fn(make()));
    return this.every(900, () => fn(make()));
  }

  trades(symbol: string, fn: (b: Trade[]) => void, onError?: (m: string) => void): Unsub {
    const s = this.sim(symbol);
    if (!s) { queueMicrotask(() => onError?.("Currency pair not supported")); return () => {}; }
    const one = (ts: number): Trade => ({ symbol, side: s.r() > 0.48 ? "buy" : "sell", price: s.price * (1 + (s.r() - 0.5) * 0.0002), qty: +((s.r() ** 3) * 3 * (77500 / s.price) ** 0.5 + 0.0005).toFixed(5), ts });
    queueMicrotask(() => fn(Array.from({ length: 40 }, (_, i) => one(Date.now() - (40 - i) * 1500))));
    return this.every(700, () => { if (s.r() < 0.7) fn([one(Date.now())]); });
  }

  candles(symbol: string, minutes: number, fn: (c: Candle[]) => void, onError?: (m: string) => void): Unsub {
    const s = this.sim(symbol);
    if (!s) { queueMicrotask(() => onError?.("Currency pair not supported")); return () => {}; }
    const ms = minutes * 60000;
    const now = Math.floor(Date.now() / ms) * ms;
    const r = rng(minutes * 977 + s.base.length * 13);
    const vola = s.vola * Math.sqrt(minutes) * 0.7;
    // walk backwards from the current price so the series ends where the ticker is
    const closes: number[] = [s.price];
    for (let i = 1; i < 200; i++) closes.unshift(closes[0] * (1 - (r() - 0.5) * 2 * vola + Math.sin(i / 23) * vola * 0.25));
    const arr: Candle[] = closes.map((c, i) => {
      const o = i === 0 ? c * (1 + (r() - 0.5) * vola) : closes[i - 1];
      const h = Math.max(o, c) * (1 + r() * vola * 0.6), l = Math.min(o, c) * (1 - r() * vola * 0.6);
      return { t: now - (199 - i) * ms, o, h, l, c, v: (s.vol / (1440 / minutes)) * (0.4 + r() * 1.2) };
    });
    queueMicrotask(() => fn(arr.slice()));
    return this.every(1500, () => {
      const last = arr[arr.length - 1];
      const t = Math.floor(Date.now() / ms) * ms;
      if (t > last.t) arr.push({ t, o: last.c, h: s.price, l: s.price, c: s.price, v: 0 });
      const cur = arr[arr.length - 1];
      cur.c = s.price; cur.h = Math.max(cur.h, s.price); cur.l = Math.min(cur.l, s.price); cur.v += s.r() * 2;
      fn(arr.slice());
    });
  }
}
