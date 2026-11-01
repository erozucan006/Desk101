import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME, APP_TAGLINE, DEFAULT_WATCH, KRAKEN_WS, TIMEFRAMES, UNIVERSE, type Quote } from "./config";
import { KrakenFeed } from "./lib/kraken";
import { DemoFeed } from "./lib/demo";
import type { Feed } from "./lib/types";
import { useCandles, useFeedStatus, useJournal, useLive, useNow, useStored, useTickers } from "./lib/hooks";
import { ccySymbol, compact, money, pct, price } from "./lib/format";
import { live } from "./lib/live";
import { Chart, type ChartEvent, type ChartOrder } from "./components/Chart";
import { CalendarPanel } from "./components/CalendarPanel";
import { NewsPanel } from "./components/NewsPanel";
import { EVENTS, countdown, nextEvent } from "./lib/calendar";
import { OrderTicket } from "./components/OrderTicket";
import { AccountPanel } from "./components/AccountPanel";
import { paper, usePaper } from "./lib/paperStore";
import type { OrderInput } from "./lib/paper";
import { OrderBook, PanelHead, Scanner, Tape, Watchlist } from "./components/Panels";
import { JournalPanel } from "./components/JournalPanel";
import { LearnDrawer } from "./components/LearnDrawer";

const isDemo = new URLSearchParams(location.search).has("demo");

export default function App() {
  const feed: Feed = useMemo(() => (isDemo ? new DemoFeed() : new KrakenFeed(KRAKEN_WS)), []);
  const status = useFeedStatus(feed);
  const [quote, setQuote] = useStored<Quote>("quote", "USD");
  const [watch, setWatch] = useStored<string[]>("watch", DEFAULT_WATCH);
  const [sel, setSel] = useStored<string>("sel", "BTC");
  const [tf, setTf] = useStored<string>("tf", "1H");
  const [ind, setInd] = useStored<{ ema: boolean; rsi: boolean }>("ind", { ema: true, rsi: true });
  const [learnOn, setLearnOn] = useState(false);
  const [learnKey, setLearnKey] = useState<string | null>(null);
  const [welcomed, setWelcomed] = useStored<boolean>("welcomed", false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone?: "ok" | "err" }>({ text: "Type a command and press Enter. Try BTC 4H, BUY ETH 0.5 or HELP." });
  const cmdRef = useRef<HTMLInputElement>(null);
  const say = useCallback((text: string, tone?: "ok" | "err") => setMsg({ text, tone }), []);

  const symbol = `${sel}/${quote}`;
  const qs = ccySymbol(quote);
  const minutes = TIMEFRAMES.find((t) => t.label === tf)?.minutes ?? 60;
  const trades = useJournal();
  const acc = usePaper();
  const journalSyms = trades.filter((t) => t.status === "open").map((t) => t.symbol.split("/")[0]);
  const universe = useMemo(() => [...new Set([...UNIVERSE, ...watch, ...journalSyms, sel])], [watch, journalSyms.join(","), sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const allSymbols = useMemo(() => {
    const set = new Set(universe.map((b) => `${b}/${quote}`));
    trades.filter((t) => t.status === "open").forEach((t) => set.add(t.symbol));
    Object.keys(acc.positions).forEach((s) => set.add(s));
    acc.orders.forEach((o) => set.add(o.symbol));
    return [...set];
  }, [universe, quote, trades, acc]);
  const { tickers, missing } = useTickers(feed, allSymbols);
  const t = tickers[symbol];
  const { candles, error: chartErr } = useCandles(feed, symbol, minutes);
  const prices = useMemo(() => Object.fromEntries(Object.entries(tickers).map(([k, v]) => [k, v.last])), [tickers]);

  // Match resting paper orders against every quote update.
  useEffect(() => {
    for (const s of new Set(paper.get().orders.map((o) => o.symbol))) if (tickers[s]) paper.tick(tickers[s], tickers);
  }, [tickers]);

  const now = useNow(30_000);
  const SHORT = { fomc: "FED", ecb: "ECB", cpi: "CPI", nfp: "NFP", pce: "PCE", gdp: "GDP", hicp: "EU CPI", expiry: "EXPIRY" } as const;
  const chartEvents: ChartEvent[] = useMemo(() => EVENTS.filter((e) => e.impact === "high" && e.at <= now).map((e) => ({ t: e.at, label: SHORT[e.kind] })), [Math.floor(now / 600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const soon = nextEvent(now, { impact: "high" });
  const eventWarning = soon && soon.at - now < 30 * 60_000 ? `${soon.title} in ${countdown(soon.at - now)}: spreads can widen and price can jump around the release.` : undefined;

  const chartOrders: ChartOrder[] = useMemo(() => acc.orders.filter((o) => o.symbol === symbol).map((o) => ({
    price: o.price,
    kind: o.role === "sl" ? "sl" : o.role === "tp" ? "tp" : o.type,
    label: o.role === "sl" ? "SL" : o.role === "tp" ? "TP" : `${o.side === "buy" ? "BUY" : "SELL"} ${o.type === "limit" ? "LMT" : "STP"} ${o.qty}`,
  })), [acc.orders, symbol]);

  useEffect(() => { live.set({ symbol: sel, quote, timeframe: tf, ticker: t }); }, [sel, quote, tf, t]);
  useEffect(() => { document.title = t ? `${sel} ${price(t.last)} · ${APP_NAME}` : APP_NAME; }, [t, sel]);

  useEffect(() => paper.onNotice((m) => say(m, "ok")), [say]);

  function placeOrder(input: OrderInput): boolean {
    const r = paper.place(input, tickers);
    if (r.error) { say(r.error, "err"); return false; }
    const f = r.fills[0];
    const what = f ? `Filled: ${f.side} ${f.qty} ${f.symbol} @ ${price(f.price)} (fee ${ccySymbol(input.symbol.split("/")[1])}${f.fee.toFixed(2)}).`
      : `Order placed: ${input.side} ${input.qty} ${input.symbol} ${input.type} @ ${price(input.price)}.`;
    const exits = input.bracket && f ? " Exit orders are live." : "";
    say([what + exits, ...r.notices].join(" "), "ok");
    return true;
  }
  function closePaper(sym: string) {
    const r = paper.close(sym, tickers);
    if (r.error) return say(r.error, "err");
    const f = r.fills[0];
    say(`Closed ${sym} @ ${price(f.price)}. Realised ${money(f.realized - f.fee, ccySymbol(sym.split("/")[1]))} after this fee.`, "ok");
  }

  const select = useCallback((b: string) => { setSel(b); say(`${b}/${quote} · ${tf}`); }, [quote, tf, say, setSel]);
  const add = (b: string) => { if (!watch.includes(b)) setWatch([...watch, b]); say(`${b} added to watchlist.`, "ok"); };
  const remove = (b: string) => setWatch(watch.filter((x) => x !== b));

  const entryCtx = useCallback(() => {
    const c = live.snapshot();
    return { rsi: c.rsi ?? null, trend: c.ema9 != null && c.ema21 != null ? (c.ema9 >= c.ema21 ? "up" as const : "down" as const) : null, timeframe: c.timeframe };
  }, []);

  function run(raw: string) {
    const s = raw.trim().toUpperCase();
    if (!s) return;
    const strip = (x: string) => x.replace(/[/_-]?(USD|EUR)$/, "");
    if (s === "HELP" || s === "?") return setHelpOpen(true);
    if (s === "LEARN") { setLearnOn((v) => !v); return; }
    if (s === "USD" || s === "EUR") { setQuote(s); return say(`Prices now in ${s}.`, "ok"); }
    let m = s.match(/^(BUY|SELL|LONG|SHORT)\s+([A-Z0-9/]+)\s+([0-9.,]+)(?:\s*@\s*([0-9.,]+))?$/);
    if (m) {
      const b = strip(m[2]), sym = `${b}/${quote}`, q = parseFloat(m[3].replace(",", "."));
      const side = m[1] === "BUY" || m[1] === "LONG" ? "buy" : "sell";
      const lim = m[4] ? parseFloat(m[4].replace(",", ".")) : undefined;
      placeOrder({ symbol: sym, side, type: lim ? "limit" : "market", qty: q, price: lim, meta: { setup: "Other", ctx: b === sel ? entryCtx() : undefined } });
      return;
    }
    m = s.match(/^CLOSE\s+([A-Z0-9/]+)$/);
    if (m) {
      const sym = `${strip(m[1])}/${quote}`;
      if (acc.positions[sym]) return closePaper(sym);
      return say(`No open paper position in ${sym}.`, "err");
    }
    m = s.match(/^CANCEL(?:\s+([A-Z0-9/]+))?$/);
    if (m) {
      const b = m[1] && m[1] !== "ALL" ? strip(m[1]) : null;
      paper.cancelAll(b ? `${b}/${quote}` : undefined);
      return say(b ? `Cancelled open ${b}/${quote} orders.` : "Cancelled all open orders.", "ok");
    }
    const parts = s.split(/\s+/);
    const b = strip(parts[0]);
    if (parts[1] === "ADD") return add(b);
    if (parts[1] === "DEL") { remove(b); return say(`${b} removed.`, "ok"); }
    if (parts[1] && !TIMEFRAMES.some((x) => x.label === parts[1])) return say(`Unknown command "${raw}". Type HELP.`, "err");
    if (!/^[A-Z0-9]{2,10}$/.test(b)) return say(`"${raw}" is not a symbol. Type HELP.`, "err");
    if (parts[1]) setTf(parts[1]);
    setSel(b);
    say(`${b}/${quote} · ${parts[1] ?? tf}`);
  }

  // Learn mode: clicking anything with data-learn explains it instead of acting.
  useEffect(() => {
    if (!learnOn) { document.body.classList.remove("learning"); return; }
    document.body.classList.add("learning");
    const h = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-learn]");
      if (!el || el.closest(".learn") || el.closest(".topbar .learn-toggle")) return;
      e.preventDefault(); e.stopPropagation();
      setLearnKey(el.dataset.learn!);
    };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, [learnOn]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).matches("input, select, textarea");
      if (e.key === "Escape") { setLearnKey(null); setHelpOpen(false); }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); cmdRef.current?.focus(); }
      if (e.key.toLowerCase() === "l") setLearnOn((v) => !v);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const statusLabel = { connecting: "Connecting", live: "Live · Kraken", reconnecting: "Reconnecting…", offline: "Offline", demo: "Demo data" }[status];

  return (
    <div className={`app ${learnKey ? "with-learn" : ""}`}>
      <header className="topbar">
        <div className="brand"><Logo /><span>Desk<em>101</em></span></div>
        <label className="cmd" htmlFor="cmd"><span>›</span>
          <input id="cmd" ref={cmdRef} autoComplete="off" spellCheck={false} placeholder="Type a command: BTC 4H, BUY ETH 0.5, HELP"
            onKeyDown={(e) => { if (e.key === "Enter") { run(e.currentTarget.value); e.currentTarget.value = ""; } }} />
          <kbd title="Press / to focus">/</kbd>
        </label>
        <div className="tb-right">
          <div className="seg small" data-learn="quote" role="group" aria-label="Quote currency">
            {(["USD", "EUR"] as Quote[]).map((q) => <button key={q} aria-pressed={quote === q} onClick={() => setQuote(q)}>{q}</button>)}
          </div>
          <button className={`learn-toggle ${learnOn ? "on" : ""}`} aria-pressed={learnOn} onClick={() => { setLearnOn(!learnOn); if (learnOn) setLearnKey(null); }} title="Learn mode (L)">
            <span className="dot" />Learn {learnOn ? "on" : "off"}
          </button>
          <span className={`feed ${status}`} title={isDemo ? "Synthetic data for demos. Remove ?demo=1 for live prices." : "Public market data from Kraken"}>{statusLabel}</span>
        </div>
        <div className={`msg ${msg.tone ?? ""}`} role="status">{learnOn && !learnKey ? "Learn mode: click any underlined label to see what it means and what it says right now." : msg.text}</div>
      </header>

      {!welcomed && (
        <section className="welcome">
          <div>
            <h1>{APP_TAGLINE}</h1>
            <p>Live crypto markets with the explanations built in. Turn on <b>Learn</b> (or press <kbd>L</kbd>) and click any number to see what it measures and what it is saying right now. Practise with a <b>10,000 paper account</b> at real prices: every trade lands in your journal, and the coach shows you patterns in your own behaviour.</p>
          </div>
          <div className="welcome-actions">
            <button className="go" onClick={() => { setLearnOn(true); setWelcomed(true); }}>Start with Learn on</button>
            <button className="ghost" onClick={() => setWelcomed(true)}>I know my way around</button>
          </div>
        </section>
      )}

      <main className="grid">
        <div className="leftcol">
          <Watchlist bases={watch} quote={quote} tickers={tickers} missing={missing} sel={sel} onSelect={select} onRemove={remove} />
          <OrderBook feed={feed} symbol={symbol} />
        </div>

        <section className="pnl chartbox">
          <PanelHead code="GP" title={symbol} learn="candles" status={chartErr ? "unavailable" : candles.length ? `${candles.length} candles` : "loading…"}>
            <div className="tabs" data-learn="timeframe" role="tablist">
              {TIMEFRAMES.map((x) => <button key={x.label} role="tab" aria-selected={tf === x.label} onClick={() => setTf(x.label)}>{x.label}</button>)}
            </div>
            <div className="tabs">
              <button aria-pressed={ind.ema} onClick={() => setInd({ ...ind, ema: !ind.ema })} data-learn="ema">EMA</button>
              <button aria-pressed={ind.rsi} onClick={() => setInd({ ...ind, rsi: !ind.rsi })} data-learn="rsi">RSI</button>
            </div>
          </PanelHead>
          <div className="quote">
            {missing[symbol] ? <p className="note err">{symbol} is not listed on Kraken. Try the other quote currency or another coin.</p> : <>
              <div className="big" data-learn="last_price"><span className={t ? (t.changePct >= 0 ? "up" : "dn") : ""}>{t ? price(t.last) : "…"}</span></div>
              <div className="kv" data-learn="change_24h">24h change<b className={t ? (t.changePct >= 0 ? "up" : "dn") : ""}>{t ? pct(t.changePct) : "—"}</b></div>
              <div className="kv" data-learn="range_24h">24h range<b>{t ? `${price(t.low)} – ${price(t.high)}` : "—"}</b></div>
              <div className="kv" data-learn="volume_24h">24h volume<b>{t ? qs + compact(t.volume * t.vwap) : "—"}</b></div>
              <div className="kv" data-learn="vwap">VWAP<b>{t ? price(t.vwap) : "—"}</b></div>
            </>}
          </div>
          <Legend show={ind} />
          <div className="chartwrap" data-learn="candles">
            <Chart candles={candles} tf={tf} showEma={ind.ema} showRsi={ind.rsi}
              positions={trades.filter((x) => x.symbol === symbol)} orders={chartOrders} events={chartEvents} empty={chartErr ? `Chart unavailable: ${chartErr}` : "Loading candles…"} />
          </div>
        </section>

        <div className="rightcol">
          <OrderTicket symbol={symbol} quote={quote} qs={qs} ticker={t} acc={acc} prices={prices} entryCtx={entryCtx} onPlace={placeOrder} onClosePosition={closePaper} warning={eventWarning} />
          <Tape feed={feed} symbol={symbol} quoteSym={qs} />
        </div>
      </main>

      <AccountPanel acc={acc} quote={quote} qs={qs} prices={prices} onSelect={select}
        onClose={closePaper} onCancel={(id) => { paper.cancel(id); say("Order cancelled.", "ok"); }}
        onReset={() => { paper.reset(); say("Paper account reset to 10,000.", "ok"); }} />

      <section className="deck">
        <CalendarPanel onLearn={(k) => setLearnKey(k)} />
        <NewsPanel base={sel} />
        <Scanner universe={UNIVERSE} quote={quote} tickers={tickers} watch={watch} onSelect={select} onAdd={add} />
      </section>

      <JournalPanel trades={trades} tickers={tickers} sel={sel} quote={quote} quoteSym={qs} entryCtx={entryCtx} say={say} onClosePaper={closePaper} />

      <footer className="foot">
        <span>{APP_NAME} v0.4 · Market data: Kraken public API{isDemo ? " (demo mode: synthetic data)" : ""}.</span>
        <span>For education only. Nothing here is investment advice or a recommendation to buy or sell.</span>
      </footer>

      <LearnDrawer k={learnKey} onClose={() => setLearnKey(null)} />

      {helpOpen && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setHelpOpen(false); }}>
          <div className="box" role="dialog" aria-labelledby="help-h">
            <h2 id="help-h">Commands</h2>
            <dl>
              <dt>BTC</dt><dd>Open BTC on the chart, book and tape</dd>
              <dt>ETH 4H</dt><dd>Symbol with timeframe (15M, 1H, 4H, 1D)</dd>
              <dt>SOL ADD · SOL DEL</dt><dd>Add to or remove from the watchlist</dd>
              <dt>USD · EUR</dt><dd>Switch the quote currency</dd>
              <dt>BUY BTC 0.1</dt><dd>Paper market order (SELL to sell or go short)</dd>
              <dt>BUY BTC 0.1 @ 75000</dt><dd>Paper limit order at that price</dd>
              <dt>CLOSE BTC</dt><dd>Close the paper BTC position at market</dd>
              <dt>CANCEL BTC · CANCEL</dt><dd>Cancel open orders for one pair, or all</dd>
              <dt>LEARN</dt><dd>Toggle Learn mode (or press L)</dd>
            </dl>
            <p className="dim">Press <kbd>/</kbd> to jump to the command line, <kbd>Esc</kbd> to close panels.</p>
            <button className="go" onClick={() => setHelpOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1a2029" />
      <rect x="7.5" y="7" width="1.5" height="18" rx=".75" fill="#1fb57a" /><rect x="6" y="11" width="4.5" height="9" rx="1" fill="#1fb57a" />
      <rect x="15.25" y="5" width="1.5" height="16" rx=".75" fill="#f0525c" /><rect x="13.75" y="8" width="4.5" height="8" rx="1" fill="#f0525c" />
      <rect x="23" y="9" width="1.5" height="18" rx=".75" fill="#4b8bff" /><rect x="21.5" y="13" width="4.5" height="10" rx="1" fill="#4b8bff" />
    </svg>
  );
}

function Legend({ show }: { show: { ema: boolean; rsi: boolean } }) {
  const c = useLive();
  return (
    <div className="legend">
      {show.ema && <><span data-learn="ema"><i style={{ background: "#5aa2ff" }} />EMA 9 {price(c.ema9)}</span><span data-learn="ema"><i style={{ background: "#c4a0ff" }} />EMA 21 {price(c.ema21)}</span></>}
      {show.rsi && <span data-learn="rsi">RSI 14 <b className={c.rsi != null && c.rsi >= 70 ? "dn" : c.rsi != null && c.rsi <= 30 ? "up" : ""}>{c.rsi != null ? c.rsi.toFixed(1) : "—"}</b></span>}
      <span data-learn="volume_bars" className="dim">Volume</span>
    </div>
  );
}

