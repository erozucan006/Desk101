import { describe, expect, it } from "vitest";
import { FEES, START_CASH, buyingPower, cancel, closePosition, equity, newAccount, onQuote, place, type Account } from "./paper";

const T = "2026-11-01T12:00:00Z";
const px = (last: number, spread = 1) => ({ bid: last - spread / 2, ask: last + spread / 2, last });
const P = { "BTC/USD": 100 };

describe("market orders", () => {
  it("buys at the ask, charges the taker fee, and values equity at the mark", () => {
    const r = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "market", qty: 10 }, px(100), P, T);
    expect(r.error).toBeUndefined();
    const fee = 100.5 * 10 * FEES.taker;
    expect(r.acc.cash.USD).toBeCloseTo(START_CASH - 1005 - fee);
    expect(r.acc.positions["BTC/USD"]).toMatchObject({ qty: 10, avg: 100.5 });
    // marked at last=100: lost half the spread plus the fee
    expect(equity(r.acc, "USD", P)).toBeCloseTo(START_CASH - 5 - fee);
    expect(r.acc.cash.EUR).toBe(START_CASH); // other currency untouched
  });

  it("refuses orders bigger than equity (no leverage)", () => {
    const r = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "market", qty: 120 }, px(100), P, T);
    expect(r.error).toMatch(/buying power/);
  });

  it("allows shorts within equity and realises P&L when covering", () => {
    let a: Account = place(newAccount(T), { symbol: "BTC/USD", side: "sell", type: "market", qty: 10 }, px(100, 0), P, T).acc;
    expect(a.positions["BTC/USD"].qty).toBe(-10);
    const r = closePosition(a, "BTC/USD", px(90, 0), { "BTC/USD": 90 }, T);
    a = r.acc;
    expect(a.positions["BTC/USD"]).toBeUndefined();
    expect(r.fills[0].realized).toBeCloseTo(100);
    const fees = 1000 * FEES.taker + 900 * FEES.taker;
    expect(a.cash.USD).toBeCloseTo(START_CASH + 100 - fees);
  });

  it("averages entries when adding and flips through zero", () => {
    let a = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "market", qty: 1 }, px(100, 0), P, T).acc;
    a = place(a, { symbol: "BTC/USD", side: "buy", type: "market", qty: 1 }, px(110, 0), P, T).acc;
    expect(a.positions["BTC/USD"].avg).toBeCloseTo(105);
    const r = place(a, { symbol: "BTC/USD", side: "sell", type: "market", qty: 3 }, px(120, 0), P, T);
    expect(r.fills[0].realized).toBeCloseTo(30);
    expect(r.acc.positions["BTC/USD"]).toMatchObject({ qty: -1, avg: 120 });
  });
});

describe("resting orders", () => {
  it("fills a buy limit as maker when the ask reaches it", () => {
    let a = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "limit", qty: 2, price: 95 }, px(100), P, T).acc;
    expect(a.orders).toHaveLength(1);
    a = onQuote(a, "BTC/USD", px(97), P, T).acc;
    expect(a.orders).toHaveLength(1); // ask 97.5 > 95: no fill
    const r = onQuote(a, "BTC/USD", px(94.6, 0.2), P, T); // ask 94.7
    expect(r.fills[0]).toMatchObject({ price: 95, liquidity: "maker" });
    expect(r.fills[0].fee).toBeCloseTo(95 * 2 * FEES.maker);
    expect(r.acc.orders).toHaveLength(0);
  });

  it("fills a marketable limit immediately at the better price", () => {
    const r = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "limit", qty: 1, price: 110 }, px(100), P, T);
    expect(r.fills[0]).toMatchObject({ price: 100.5, liquidity: "taker" });
    expect(r.notices[0]).toMatch(/filled immediately/);
  });

  it("rejects a buy stop below the market and triggers a sell stop at the bid", () => {
    expect(place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "stop", qty: 1, price: 90 }, px(100), P, T).error).toMatch(/above the last price/);
    let a = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "market", qty: 1 }, px(100, 0), P, T).acc;
    a = place(a, { symbol: "BTC/USD", side: "sell", type: "stop", qty: 1, price: 95, reduceOnly: true }, px(100, 0), P, T).acc;
    const r = onQuote(a, "BTC/USD", px(94, 2), P, T);
    expect(r.fills[0]).toMatchObject({ price: 93, liquidity: "taker", role: "sl" });
  });

  it("cancels an order", () => {
    const a = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "limit", qty: 1, price: 90 }, px(100), P, T).acc;
    expect(cancel(a, a.orders[0].id).orders).toHaveLength(0);
  });
});

describe("brackets (stop-loss / take-profit)", () => {
  it("validates levels against the entry", () => {
    const r = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "market", qty: 1, bracket: { sl: 105 } }, px(100, 0), P, T);
    expect(r.error).toMatch(/below the entry/);
  });

  it("attaches OCO exits on fill; one hitting cancels the other", () => {
    let a = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "market", qty: 1, bracket: { sl: 90, tp: 120 } }, px(100, 0), P, T).acc;
    expect(a.orders.map((o) => o.role).sort()).toEqual(["sl", "tp"]);
    const r = onQuote(a, "BTC/USD", px(121, 0), P, T);
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0]).toMatchObject({ role: "tp", price: 120, liquidity: "maker" });
    a = r.acc;
    expect(a.orders).toHaveLength(0);
    expect(a.positions["BTC/USD"]).toBeUndefined();
  });

  it("attaches exits only when a resting entry fills", () => {
    let a = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "limit", qty: 1, price: 95, bracket: { sl: 90 } }, px(100, 0), P, T).acc;
    expect(a.orders).toHaveLength(1);
    a = onQuote(a, "BTC/USD", px(95, 0), P, T).acc;
    expect(a.orders).toHaveLength(1);
    expect(a.orders[0]).toMatchObject({ role: "sl", type: "stop", price: 90, side: "sell" });
  });

  it("cancels leftover exits when the position is closed by hand", () => {
    let a = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "market", qty: 1, bracket: { sl: 90, tp: 120 } }, px(100, 0), P, T).acc;
    const r = closePosition(a, "BTC/USD", px(100, 0), P, T);
    a = r.acc;
    expect(a.orders).toHaveLength(0);
    expect(r.notices.join(" ")).toMatch(/cancelled/);
  });
});

it("buying power shrinks as positions grow", () => {
  const a = place(newAccount(T), { symbol: "BTC/USD", side: "buy", type: "market", qty: 40 }, px(100, 0), P, T).acc;
  // equity = cash + position value = START_CASH - fee; exposure = 4000
  expect(buyingPower(a, "USD", P)).toBeCloseTo(START_CASH - 4000 * FEES.taker - 4000, 6);
});
