// POST /api/ask — "Ask Desk", the Desk101 tutor. Streams a plain-text answer from Claude.
// Needs the ANTHROPIC_API_KEY environment variable in Vercel (never sent to the browser).
// Body: { messages: [{ role: "user" | "assistant", content: string }], context: string }

const MODEL = process.env.ASK_MODEL || "claude-haiku-5-5";
const MAX_TURNS = 10; // conversation history sent to the model
const MAX_CHARS = 1200; // per user message
const DAILY_LIMIT = Number(process.env.ASK_DAILY_LIMIT || 30); // per IP, best effort (per server instance)

export const SYSTEM = `You are "Desk", the tutor inside Desk101, a trading terminal for students and beginners in Europe that explains itself.

Your job: help the student understand markets and what is on their screen right now. Explain concepts (order books, spreads, RSI, EMAs, candles, fees, risk per trade, stop-losses, macro releases like CPI, FOMC, ECB decisions) in plain language, with the live numbers from the context when they help. Coach their process using their own journal statistics when relevant.

Rules:
- Education only. Never tell the student to buy, sell, hold or size a specific position, and never predict where a price will go. If asked "should I buy?", explain what the data on screen does and does not say, what a careful trader would check, and that the decision is theirs. Do this briefly and without lecturing.
- No price targets, no "signals", no guarantees. Say plainly when something is uncertain or when you do not know.
- Desk101 is paper trading with live prices from Kraken: practice money, real market data. Do not claim to see anything that is not in the context.
- Keep answers short: usually 2–5 sentences or a few short bullet points. Use one concrete example when it helps. No headings.
- Answer in the language the student writes in.
- If the question is not about markets, trading, economics or using Desk101, answer in one line and steer back.
- If the student seems distressed about real money losses, be kind, suggest stepping back, and point them to a qualified adviser or support service.`;

const hits = new Map(); // ip -> { day, n }

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export function sanitize(messages) {
  if (!Array.isArray(messages)) return [];
  const out = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === "user" ? MAX_CHARS : 4000) }));
  while (out.length && out[0].role !== "user") out.shift(); // the API wants a user turn first
  return out;
}

export async function POST(req) {
  const key = (process.env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  if (!key) return json(503, { error: "no-key" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "bad-json" }); }
  const messages = sanitize(body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") return json(400, { error: "no-question" });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const day = new Date().toISOString().slice(0, 10);
  const h = hits.get(ip);
  const n = h && h.day === day ? h.n : 0;
  if (n >= DAILY_LIMIT) return json(429, { error: "limit", limit: DAILY_LIMIT });
  hits.set(ip, { day, n: n + 1 });

  const context = typeof body?.context === "string" ? body.context.slice(0, 3000) : "";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      stream: true,
      system: SYSTEM + (context ? `\n\nWhat the student's screen shows right now:\n${context}` : ""),
      messages,
    }),
  }).catch(() => null);

  if (!r || !r.ok || !r.body) {
    let detail = "";
    try { detail = (await r?.json())?.error?.type || ""; } catch { /* ignore */ }
    return json(502, { error: "upstream", status: r?.status ?? 0, detail });
  }

  // Turn Anthropic's server-sent events into a plain stream of text.
  const dec = new TextDecoder(), enc = new TextEncoder();
  const reader = r.body.getReader();
  const stream = new ReadableStream({
    async start(ctrl) {
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            try {
              const ev = JSON.parse(line.slice(5));
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
            } catch { /* keep-alive or partial line */ }
          }
        }
      } catch { /* client went away */ }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-remaining": String(DAILY_LIMIT - n - 1) } });
}
