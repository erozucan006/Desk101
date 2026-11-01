import { describe, expect, it } from "vitest";
import { paper } from "./paperStore";
import { journal, pnl } from "./journal";
import type { Ticker } from "./types";

const tk = (last: number): Record<string, Ticker> => ({
  "ETH/USD": { symbol: "ETH/USD", last, bid: last, ask: last, high: last, low: last, changePct: 0, volume: 0, vwap: last },
});

describe("paper fills feed the journal", () => {
  it("opens, adds, partially closes and closes one journal record per position", () => {
    paper.reset(); journal.replaceAll([]);
    paper.place({ symbol: "ETH/USD", side: "buy", type: "market", qty: 1, meta: { setup: "Breakout", note: "test" } }, tk(100));
    let open = journal.all().filter((t) => t.status === "open");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ source: "paper", side: "long", qty: 1, entry: 100, setup: "Breakout" });

    paper.place({ symbol: "ETH/USD", side: "buy", type: "market", qty: 1 }, tk(110));
    open = journal.all().filter((t) => t.status === "open");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ qty: 2, entry: 105 });

    paper.place({ symbol: "ETH/USD", side: "sell", type: "market", qty: 0.5 }, tk(120));
    const closed = journal.all().filter((t) => t.status === "closed");
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ qty: 0.5, exit: 120 });

    paper.close("ETH/USD", tk(130));
    expect(journal.all().filter((t) => t.status === "open")).toHaveLength(0);
    const all = journal.all();
    // journal P&L (after fees) matches the change in cash
    const total = all.reduce((a, t) => a + pnl(t, t.exit)!, 0);
    expect(paper.get().cash.USD - 10_000).toBeCloseTo(total, 6);
  });

  it("resting stop-loss fills in the background and closes the journal record", () => {
    paper.reset(); journal.replaceAll([]);
    const notes: string[] = [];
    const off = paper.onNotice((m) => notes.push(m));
    paper.place({ symbol: "ETH/USD", side: "buy", type: "market", qty: 1, bracket: { sl: 95, tp: 130 } }, tk(100));
    expect(paper.get().orders).toHaveLength(2);
    const t = tk(94)["ETH/USD"];
    paper.tick(t, tk(94));
    off();
    expect(paper.get().orders).toHaveLength(0);
    expect(journal.all()[0]).toMatchObject({ status: "closed", exit: 94 });
    expect(notes.join(" ")).toMatch(/Stop-loss hit/);
  });
});
