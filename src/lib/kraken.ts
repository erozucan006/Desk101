// Kraken WebSocket API v2 client (public market data only, no keys).
// Docs: https://docs.kraken.com/api/docs/websocket-v2/
// One socket, reference-counted subscriptions, state (book, candles) merged here
// so components always receive a complete picture.
import type { Book, Candle, Feed, FeedStatus, Level, Ticker, Trade, Unsub } from "./types";

type Listener<T> = { fn: (v: T) => void; onError?: (m: string) => void };

type Sub = {
  key: string;
  params: Record<string, unknown>;
  listeners: Set<Listener<any>>;
  // merged state
  bids?: Map<number, number>;
  asks?: Map<number, number>;
  depth?: number;
  candles?: Candle[];
  last?: unknown;
};

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)));

export class KrakenFeed implements Feed {
  readonly kind = "kraken" as const;
  private ws: WebSocket | null = null;
  private subs = new Map<string, Sub>();
  private st: FeedStatus = "connecting";
  private statusFns = new Set<(s: FeedStatus) => void>();
  private retry = 0;
  private reqId = 1;
  private pendingAck = new Map<number, string>();

  constructor(private url: string) {
    this.connect();
  }

  status() { return this.st; }
  onStatus(fn: (s: FeedStatus) => void): Unsub {
    this.statusFns.add(fn);
    return () => this.statusFns.delete(fn);
  }
  private setStatus(s: FeedStatus) {
    this.st = s;
    this.statusFns.forEach((f) => f(s));
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.setStatus("offline");
      return;
    }
    this.ws.onopen = () => {
      this.retry = 0;
      this.setStatus("live");
      this.subs.forEach((s) => this.send("subscribe", s));
    };
    this.ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.route(msg);
    };
    this.ws.onclose = () => {
      this.ws = null;
      this.setStatus(navigator.onLine === false ? "offline" : "reconnecting");
      const delay = Math.min(30000, 1000 * 2 ** this.retry++) + Math.random() * 500;
      setTimeout(() => this.connect(), delay);
    };
    this.ws.onerror = () => { /* onclose follows */ };
  }

  private send(method: "subscribe" | "unsubscribe", s: Sub) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const req_id = this.reqId++;
    if (method === "subscribe") this.pendingAck.set(req_id, s.key);
    this.ws.send(JSON.stringify({ method, params: s.params, req_id }));
  }

  private add<T>(key: string, params: Record<string, unknown>, l: Listener<T>, init?: (s: Sub) => void): Unsub {
    let s = this.subs.get(key);
    if (!s) {
      s = { key, params, listeners: new Set() };
      init?.(s);
      this.subs.set(key, s);
      this.send("subscribe", s);
    } else if (s.last !== undefined) {
      // replay current state to a late listener
      const v = s.last as T;
      queueMicrotask(() => l.fn(v));
    }
    s.listeners.add(l);
    return () => {
      const cur = this.subs.get(key);
      if (!cur) return;
      cur.listeners.delete(l);
      if (cur.listeners.size === 0) {
        this.send("unsubscribe", cur);
        this.subs.delete(key);
      }
    };
  }

  private emit(s: Sub, v: unknown) {
    s.last = v;
    s.listeners.forEach((l) => l.fn(v));
  }

  private route(msg: any) {
    if (msg.method === "subscribe" && msg.success === false) {
      const key = this.pendingAck.get(msg.req_id);
      const s = key ? this.subs.get(key) : undefined;
      s?.listeners.forEach((l) => l.onError?.(String(msg.error || "Subscription failed")));
      return;
    }
    if (msg.method) return; // other acks
    const ch = msg.channel;
    if (!Array.isArray(msg.data)) return;

    if (ch === "ticker") {
      for (const d of msg.data) {
        const s = this.subs.get(`ticker|${d.symbol}`);
        if (!s) continue;
        const t: Ticker = {
          symbol: d.symbol, last: num(d.last), bid: num(d.bid), ask: num(d.ask),
          high: num(d.high), low: num(d.low), changePct: num(d.change_pct),
          volume: num(d.volume), vwap: num(d.vwap),
        };
        this.emit(s, t);
      }
    } else if (ch === "book") {
      for (const d of msg.data) {
        for (const s of this.subs.values()) {
          if (!s.key.startsWith(`book|${d.symbol}|`)) continue;
          if (msg.type === "snapshot") { s.bids = new Map(); s.asks = new Map(); }
          const apply = (m: Map<number, number> | undefined, lv: any[] | undefined) => {
            if (!m || !lv) return;
            for (const x of lv) { const p = num(x.price), q = num(x.qty); if (q === 0) m.delete(p); else m.set(p, q); }
          };
          apply(s.bids, d.bids); apply(s.asks, d.asks);
          const depth = s.depth ?? 10;
          const bids: Level[] = [...(s.bids ?? new Map()).entries()].map(([price, qty]) => ({ price, qty })).sort((a, b) => b.price - a.price).slice(0, depth);
          const asks: Level[] = [...(s.asks ?? new Map()).entries()].map(([price, qty]) => ({ price, qty })).sort((a, b) => a.price - b.price).slice(0, depth);
          // keep maps bounded to the subscribed depth
          s.bids = new Map(bids.map((l) => [l.price, l.qty]));
          s.asks = new Map(asks.map((l) => [l.price, l.qty]));
          const b: Book = { symbol: d.symbol, bids, asks, ts: Date.parse(d.timestamp) || Date.now() };
          this.emit(s, b);
        }
      }
    } else if (ch === "trade") {
      const bySym = new Map<string, Trade[]>();
      for (const d of msg.data) {
        const t: Trade = { symbol: d.symbol, side: d.side === "sell" ? "sell" : "buy", price: num(d.price), qty: num(d.qty), ts: Date.parse(d.timestamp) || Date.now() };
        if (!bySym.has(t.symbol)) bySym.set(t.symbol, []);
        bySym.get(t.symbol)!.push(t);
      }
      bySym.forEach((batch, sym) => {
        const s = this.subs.get(`trade|${sym}`);
        if (s) { s.listeners.forEach((l) => l.fn(batch)); }
      });
    } else if (ch === "ohlc") {
      if (msg.type === "snapshot") {
        for (const d of msg.data) { const s = this.subs.get(`ohlc|${d.symbol}|${d.interval}`); if (s) s.candles = []; }
      }
      for (const d of msg.data) {
        const s = this.subs.get(`ohlc|${d.symbol}|${d.interval}`);
        if (!s) continue;
        if (!s.candles) s.candles = [];
        const c: Candle = { t: Date.parse(d.interval_begin), o: num(d.open), h: num(d.high), l: num(d.low), c: num(d.close), v: num(d.volume) };
        if (!isFinite(c.t)) continue;
        const arr = s.candles!;
        const i = arr.findIndex((x) => x.t === c.t);
        if (i >= 0) arr[i] = c; else { arr.push(c); arr.sort((a, b) => a.t - b.t); }
        if (arr.length > 400) arr.splice(0, arr.length - 400);
      }
      // emit once per message per sub
      const seen = new Set<string>();
      for (const d of msg.data) {
        const key = `ohlc|${d.symbol}|${d.interval}`;
        if (seen.has(key)) continue; seen.add(key);
        const s = this.subs.get(key);
        if (s?.candles) this.emit(s, s.candles.slice());
      }
    }
  }

  ticker(symbol: string, fn: (t: Ticker) => void, onError?: (m: string) => void) {
    return this.add<Ticker>(`ticker|${symbol}`, { channel: "ticker", symbol: [symbol] }, { fn, onError });
  }
  book(symbol: string, depth: number, fn: (b: Book) => void, onError?: (m: string) => void) {
    // Kraken accepts depth 10, 25, 100, 500, 1000
    const d = [10, 25, 100, 500, 1000].find((x) => x >= depth) ?? 10;
    return this.add<Book>(`book|${symbol}|${d}`, { channel: "book", symbol: [symbol], depth: d }, { fn, onError }, (s) => { s.depth = depth; });
  }
  trades(symbol: string, fn: (b: Trade[]) => void, onError?: (m: string) => void) {
    return this.add<Trade[]>(`trade|${symbol}`, { channel: "trade", symbol: [symbol], snapshot: true }, { fn, onError });
  }
  candles(symbol: string, minutes: number, fn: (c: Candle[]) => void, onError?: (m: string) => void) {
    return this.add<Candle[]>(`ohlc|${symbol}|${minutes}`, { channel: "ohlc", symbol: [symbol], interval: minutes, snapshot: true }, { fn, onError });
  }
}
