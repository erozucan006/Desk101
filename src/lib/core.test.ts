import { describe, expect, it, vi } from "vitest";
import { ema, rsi } from "./indicators";
import { coach, pnl, pnlPct, stats, toCSV, type JournalTrade } from "./journal";
import { KrakenFeed } from "./kraken";
import type { Book, Candle, Ticker, Trade } from "./types";

describe("indicators", () => {
  it("EMA seeds with the SMA and then weights recent values", () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e[0]).toBeNull();
    expect(e[2]).toBeCloseTo(2);
    expect(e[3]).toBeCloseTo(3); // 4*0.5 + 2*0.5
    expect(e[4]).toBeCloseTo(4);
  });
  it("RSI is 100 for a straight rise and 0 for a straight fall", () => {
    const up = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rsi(up)[19]).toBe(100);
    expect(rsi(up.slice().reverse())[19]).toBeCloseTo(0);
  });
  it("RSI matches a hand-checked mixed series", () => {
    const v = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    // classic Wilder example: first RSI ≈ 70.53
    expect(rsi(v, 14)[14]!).toBeCloseTo(70.46, 0);
  });
});

const mk = (o: Partial<JournalTrade>): JournalTrade => ({
  id: Math.random().toString(36), symbol: "BTC/USD", side: "long", qty: 1, entry: 100, entryAt: "2026-10-01T10:00:00Z",
  fee: 0, setup: "Breakout", note: "", status: "closed", exit: 110, exitAt: "2026-10-01T12:00:00Z", ...o,
});

describe("journal math", () => {
  it("computes long and short P&L with fees", () => {
    expect(pnl({ side: "long", qty: 2, entry: 100, fee: 1 }, 110)).toBe(19);
    expect(pnl({ side: "short", qty: 2, entry: 100, fee: 0 }, 90)).toBe(20);
    expect(pnlPct({ side: "short", entry: 100 }, 90)).toBeCloseTo(10);
  });
  it("summarises closed trades", () => {
    const s = stats([mk({ exit: 110 }), mk({ exit: 95 }), mk({ exit: 120 }), mk({ status: "open", exit: undefined })]);
    expect(s.closed).toBe(3);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.realized).toBe(25);
    expect(s.profitFactor).toBeCloseTo(30 / 5);
  });
  it("coach asks for data first, then flags held losers and overbought chasing", () => {
    expect(coach([mk({})])[0].title).toMatch(/needs data/);
    const t = [
      mk({ exit: 103, exitAt: "2026-10-01T10:30:00Z", ctx: { rsi: 50 } }),
      mk({ exit: 104, exitAt: "2026-10-01T10:30:00Z", ctx: { rsi: 55 } }),
      mk({ exit: 90, exitAt: "2026-10-02T10:00:00Z", ctx: { rsi: 75 } }),
      mk({ exit: 92, exitAt: "2026-10-02T10:00:00Z", ctx: { rsi: 78 } }),
      mk({ exit: 101, exitAt: "2026-10-01T11:00:00Z", ctx: { rsi: 72 } }),
    ];
    const titles = coach(t).map((i) => i.title).join(" | ");
    expect(titles).toMatch(/losses are bigger/);
    expect(titles).toMatch(/hold losers longer/);
    expect(titles).toMatch(/overbought/);
  });
  it("exports CSV with escaped notes", () => {
    const csv = toCSV([mk({ note: 'said "wait", then entered' })]);
    expect(csv.split("\n")[1]).toContain('"said ""wait"", then entered"');
  });
});

// ---- Kraken client against a fake socket replaying v2-shaped messages ----
class FakeWS {
  static OPEN = 1; static last: FakeWS;
  readyState = 0; sent: any[] = [];
  onopen?: () => void; onmessage?: (e: { data: string }) => void; onclose?: () => void; onerror?: () => void;
  constructor(public url: string) { FakeWS.last = this; }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  open() { this.readyState = 1; this.onopen?.(); }
  push(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

describe("KrakenFeed", () => {
  vi.stubGlobal("WebSocket", FakeWS);
  vi.stubGlobal("navigator", { onLine: true });

  it("subscribes on open and parses ticker, book, trades and ohlc", async () => {
    const f = new KrakenFeed("wss://x");
    const ws = FakeWS.last;
    const got: { t?: Ticker; b?: Book; tr?: Trade[]; c?: Candle[] } = {};
    f.ticker("BTC/USD", (t) => (got.t = t));
    f.book("BTC/USD", 10, (b) => (got.b = b));
    f.trades("BTC/USD", (tr) => (got.tr = tr));
    f.candles("BTC/USD", 60, (c) => (got.c = c));
    ws.open();
    expect(ws.sent.map((m) => m.params.channel).sort()).toEqual(["book", "ohlc", "ticker", "trade"]);

    ws.push({ channel: "ticker", type: "snapshot", data: [{ symbol: "BTC/USD", bid: 77500.1, bid_qty: 1, ask: 77500.2, ask_qty: 1, last: 77500.2, volume: 1200, vwap: 77000, low: 76000, high: 78000, change: 300, change_pct: 0.39 }] });
    expect(got.t?.last).toBe(77500.2);
    expect(got.t?.changePct).toBe(0.39);

    ws.push({ channel: "book", type: "snapshot", data: [{ symbol: "BTC/USD", bids: [{ price: 100, qty: 1 }, { price: 99, qty: 2 }], asks: [{ price: 101, qty: 1 }], checksum: 1, timestamp: "2026-10-31T16:00:00Z" }] });
    ws.push({ channel: "book", type: "update", data: [{ symbol: "BTC/USD", bids: [{ price: 100, qty: 0 }, { price: 99.5, qty: 3 }], asks: [], checksum: 1, timestamp: "2026-10-31T16:00:01Z" }] });
    expect(got.b?.bids.map((l) => l.price)).toEqual([99.5, 99]);

    ws.push({ channel: "trade", type: "update", data: [{ symbol: "BTC/USD", side: "sell", price: 100, qty: 0.5, ord_type: "market", trade_id: 1, timestamp: "2026-10-31T16:00:02Z" }] });
    expect(got.tr?.[0].side).toBe("sell");

    const c = (begin: string, close: number) => ({ symbol: "BTC/USD", open: 1, high: 2, low: 0.5, close, trades: 3, volume: 4, vwap: 1, interval_begin: begin, interval: 60, timestamp: begin });
    ws.push({ channel: "ohlc", type: "snapshot", data: [c("2026-10-31T14:00:00Z", 1), c("2026-10-31T15:00:00Z", 2)] });
    expect(got.c?.length).toBe(2);
    ws.push({ channel: "ohlc", type: "update", data: [c("2026-10-31T15:00:00Z", 2.5)] });
    expect(got.c?.length).toBe(2);
    expect(got.c?.[1].c).toBe(2.5);
    ws.push({ channel: "ohlc", type: "update", data: [c("2026-10-31T16:00:00Z", 3)] });
    expect(got.c?.length).toBe(3);
  });

  it("reports unsupported pairs to the listener", () => {
    const f = new KrakenFeed("wss://x");
    const ws = FakeWS.last;
    let err = "";
    f.ticker("ZZZ/USD", () => {}, (m) => (err = m));
    ws.open();
    const req = ws.sent[0];
    ws.push({ method: "subscribe", success: false, error: "Currency pair not supported ZZZ/USD", req_id: req.req_id });
    expect(err).toMatch(/not supported/);
  });
});
