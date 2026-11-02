import { useEffect, useRef, useState } from "react";
import { useLive } from "../lib/hooks";
import { screenContext, suggestions } from "../lib/askContext";
import type { EconEvent } from "../lib/calendar";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };
const STORE = "d101.ask";

const load = (): Msg[] => { try { return JSON.parse(sessionStorage.getItem(STORE) || "[]"); } catch { return []; } };

/** "Ask Desk": a tutor that sees what is on the screen. Floating button + panel. */
export function Assistant({ open, onOpen, onClose, prefill, nextEvent, paper }: {
  open: boolean; onOpen: () => void; onClose: () => void; prefill: string | null;
  nextEvent?: EconEvent | null; paper?: { equity: number; positions: string[] };
}) {
  const ctx = useLive();
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(msgs.filter((m) => !m.error).slice(-30))); } catch { /* ignore */ } }, [msgs]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs, open]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 60); }, [open]);
  useEffect(() => { if (open && prefill) { setText(prefill); setTimeout(() => input.current?.focus(), 60); } }, [open, prefill]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    const history: Msg[] = [...msgs.filter((m) => !m.error), { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setText(""); setBusy(true);
    const ac = new AbortController(); abort.current = ac;
    const fail = (content: string) => setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content, error: true }]);
    try {
      const r = await fetch("/api/ask", {
        method: "POST", signal: ac.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), context: screenContext(ctx, { nextEvent, paper }) }),
      });
      const ct = r.headers.get("content-type") ?? "";
      if (!r.ok || !r.body) {
        const j = ct.includes("json") ? await r.json().catch(() => ({})) : {};
        if (j.error === "no-key") return fail("The tutor isn't connected yet. Once the Anthropic API key is added on the server, it will answer here.");
        if (j.error === "limit") return fail(`You've reached today's limit of ${j.limit} questions. It resets tomorrow.`);
        if (r.status === 404 || !ct.includes("json")) return fail("The tutor runs on the live site (desk101.vercel.app), not in local preview.");
        return fail("The tutor couldn't answer just now. Try again in a moment.");
      }
      const rem = r.headers.get("x-remaining"); if (rem) setLeft(Number(rem));
      const reader = r.body.getReader(), dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: acc }]);
      }
      if (!acc.trim()) fail("The tutor couldn't answer just now. Try again in a moment.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") fail("Connection lost. Check your internet and try again.");
    } finally { setBusy(false); abort.current = null; }
  };

  const starters = suggestions(ctx, nextEvent);

  return (
    <>
      <button className={`ask-fab ${open ? "hide" : ""}`} onClick={onOpen} aria-label="Ask Desk, your tutor" title="Ask Desk (your tutor)">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="8.5" cy="9.6" r="1" fill="currentColor" /><circle cx="12" cy="9.6" r="1" fill="currentColor" /><circle cx="15.5" cy="9.6" r="1" fill="currentColor" /></svg>
        Ask Desk
      </button>
      <section className={`ask ${open ? "open" : ""}`} aria-label="Ask Desk" aria-hidden={!open}>
        <header className="ask-head">
          <div><b>Ask Desk</b><span>Sees what's on your screen · {ctx.symbol}/{ctx.quote} {ctx.timeframe}</span></div>
          {msgs.length > 0 && <button className="link" onClick={() => { abort.current?.abort(); setMsgs([]); }}>New chat</button>}
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="ask-list" ref={list} aria-live="polite">
          {!msgs.length && (
            <div className="ask-empty">
              <p>Ask anything about the market, a number on screen, or your own trading. Answers explain; they never tell you what to buy or sell.</p>
              <div className="ask-chips">{starters.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`ask-msg ${m.role} ${m.error ? "err" : ""}`}>
              {m.content || (busy && i === msgs.length - 1 ? <span className="ask-dots"><i /><i /><i /></span> : null)}
            </div>
          ))}
        </div>
        <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <textarea ref={input} rows={1} value={text} maxLength={1200} placeholder="Ask about this chart, a term, or your journal…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }} />
          <button type="submit" className="go" disabled={busy || !text.trim()}>{busy ? "…" : "Ask"}</button>
        </form>
        <p className="ask-fine">Education only, not investment advice.{left != null ? ` ${left} questions left today.` : ""}</p>
      </section>
    </>
  );
}
