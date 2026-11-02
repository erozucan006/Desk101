import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS serverless module
import { sanitize, SYSTEM } from "../../api/ask.js";
import { screenContext, suggestions } from "./askContext";

describe("Ask Desk", () => {
  it("keeps only valid turns, trims history and starts with the student", () => {
    const m = sanitize([{ role: "assistant", content: "hi" }, { role: "system", content: "x" }, { role: "user", content: "a".repeat(5000) }, { role: "user", content: " " }]);
    expect(m).toHaveLength(1);
    expect(m[0].role).toBe("user");
    expect(m[0].content).toHaveLength(1200);
    expect(sanitize("nope")).toEqual([]);
  });
  it("never lets the tutor give buy/sell calls", () => {
    expect(SYSTEM).toMatch(/Never tell the student to buy, sell/);
  });
  it("describes the screen in plain text", () => {
    const ctx = screenContext({ symbol: "BTC", quote: "EUR", timeframe: "4H", rsi: 71.23, spreadBps: 1.2, winRate: 0.5, profitFactor: 1.4, expectancy: 3, openCount: 1,
      ticker: { symbol: "BTC/EUR", last: 70000, bid: 69999, ask: 70001, changePct: -2.5, high: 72000, low: 69000, volume: 10, vwap: 70500 } as never }, { now: Date.UTC(2026, 10, 2, 12) });
    expect(ctx).toContain("BTC/EUR");
    expect(ctx).toContain("RSI(14) 71.2");
    expect(ctx).toContain("win rate 50%");
    expect(suggestions({ symbol: "BTC", quote: "EUR", timeframe: "4H", rsi: 75 })[0]).toMatch(/RSI is 75/);
  });
});

declare const process: { env: Record<string, string | undefined> };

describe("Ask Desk server", () => {
  it("answers 503 without a key and streams text deltas with one", async () => {
    // @ts-expect-error plain JS serverless module
    const { POST } = await import("../../api/ask.js");
    const req = () => new Request("http://x/api/ask", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "What is RSI?" }], context: "Pair: BTC/USD" }) });
    delete process.env.ANTHROPIC_API_KEY;
    expect((await POST(req())).status).toBe(503);
    process.env.ANTHROPIC_API_KEY = " 'test' ";
    const sse = ['event: message_start\ndata: {"type":"message_start"}\n\n', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"RSI "}}\n', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"measures momentum."}}\n\n'];
    let sent: { headers: Record<string, string>; body: string } | null = null;
    const orig = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: { headers: Record<string, string>; body: string }) => {
      sent = init;
      return new Response(new ReadableStream({ start(c) { sse.forEach((s) => c.enqueue(new TextEncoder().encode(s))); c.close(); } }), { status: 200 });
    }) as never;
    const r = await POST(req());
    globalThis.fetch = orig;
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("RSI measures momentum.");
    expect(sent!.headers["x-api-key"]).toBe("test");
    expect(JSON.parse(sent!.body).system).toContain("Pair: BTC/USD");
    delete process.env.ANTHROPIC_API_KEY;
  });
});
