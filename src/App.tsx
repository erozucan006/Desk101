import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME, APP_TAGLINE, DEFAULT_WATCH, KRAKEN_WS, TIMEFRAMES, UNIVERSE, type Quote } from "./config";
import { KrakenFeed } from "./lib/kraken";
import { DemoFeed } from "./lib/demo";
import type { Feed } from "./lib/types";
import { useCandles, useFeedStatus, useJournal, useLive, useStored, useTickers } from "./lib/hooks";
import { ccySymbol, compact, pct, price } from "./lib/format";
import { live } from "./lib/live";
import { journal } from "./lib/journal";
import { Chart } from "./components/Chart";
import { OrderBook, PanelHead, Scanner, Sessions, Tape, Watchlist } from "./components/Panels";
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
  const journalSyms = trades.filter((t) => t.status === "open").map((t) => t.symbol.split("/")[0]);
  const universe = useMemo(() => [...new Set([...UNIVERSE, ...watch, ...journalSyms, sel])], [watch, journalSyms.join(","), sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const allSymbols = useMemo(() => {
    const set = new Set(universe.map((b) => `${b}/${quote}`));
    trades.filter((t) => t.status === "open").forEach((t) => set.add(t.symbol));
    return [...set];
  }, [universe, quote, trades]);
  const { tickers, missing } = useTickers(feed, allSymbols);
  const t = tickers[symbol];
  const { candles, error: chartErr } = useCandles(feed, symbol, minutes);

  useEffect(() => { live.set({ symbol: sel, quote, timeframe: tf, ticker: t }); }, [sel, quote, tf, t]);
  useEffect(() => { document.title = t ? `${sel} ${price(t.last)} · ${APP_NAME}` : APP_NAME; }, [t, sel]);

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
      const p = m[4] ? parseFloat(m[4].replace(",", ".")) : tickers[sym]?.last;
      if (!(q > 0)) return say("Quantity must be greater than zero.", "err");
      if (!p) return say(`No live price for ${sym}. Add a price: ${m[1]} ${b} ${m[3]} @ 12345`, "err");
      const side = m[1] === "BUY" || m[1] === "LONG" ? "long" : "short";
      journal.open({ symbol: sym, side, qty: q, entry: p, fee: 0, setup: "Other", note: "", ctx: b === sel ? entryCtx() : undefined });
      return say(`${side === "long" ? "Long" : "Short"} ${q} ${sym} @ ${price(p)} logged.`, "ok");
    }
    m = s.match(/^CLOSE\s+([A-Z0-9/]+)(?:\s*@\s*([0-9.,]+))?$/);
    if (m) {
      const b = strip(m[1]);
      const os = trades.filter((x) => x.status === "open" && x.symbol.split("/")[0] === b);
      if (!os.length) return say(`No open ${b} position.`, "err");
      for (const o of os) {
        const p = m[2] ? parseFloat(m[2].replace(",", ".")) : tickers[o.symbol]?.last;
        if (!p) { say(`No live price for ${o.symbol}. Use CLOSE ${b} @ price.`, "err"); continue; }
        journal.close(o.id, p);
      }
      return say(`${b} closed.`, "ok");
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
        <div className="brand"><b>{APP_NAME.split(" ").map((w) => w[0]).join("").slice(0, 3)}</b><span>{APP_NAME}</span></div>
        <label className="cmd" htmlFor="cmd"><span>&gt;</span>
          <input id="cmd" ref={cmdRef} autoComplete="off" spellCheck={false} placeholder="BTC 4H · BUY ETH 0.5 · LEARN · HELP"
            onKeyDown={(e) => { if (e.key === "Enter") { run(e.currentTarget.value); e.currentTarget.value = ""; } }} />
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
            <p>Live crypto markets with the explanations built in. Turn on <b>Learn</b> (or press <kbd>L</kbd>) and click any number to see what it measures and what it is saying right now. Log your trades in the journal and the coach will show you patterns in your own behaviour.</p>
          </div>
          <div className="welcome-actions">
            <button className="go" onClick={() => { setLearnOn(true); setWelcomed(true); }}>Start with Learn on</button>
            <button className="ghost" onClick={() => setWelcomed(true)}>I know my way around</button>
          </div>
        </section>
      )}

      <main className="grid">
        <Watchlist bases={watch} quote={quote} tickers={tickers} missing={missing} sel={sel} onSelect={select} onRemove={remove} />

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
              positions={trades.filter((x) => x.symbol === symbol)} empty={chartErr ? `Chart unavailable: ${chartErr}` : "Loading candles…"} />
          </div>
        </section>

        <OrderBook feed={feed} symbol={symbol} />
      </main>

      <section className="deck">
        <Scanner universe={UNIVERSE} quote={quote} tickers={tickers} watch={watch} onSelect={select} onAdd={add} />
        <Tape feed={feed} symbol={symbol} quoteSym={qs} />
        <Sessions />
      </section>

      <JournalPanel trades={trades} tickers={tickers} sel={sel} quote={quote} quoteSym={qs} entryCtx={entryCtx} say={say} />

      <footer className="foot">
        <span>{APP_NAME} v0.1 · Market data: Kraken public API{isDemo ? " (demo mode: synthetic data)" : ""}.</span>
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
              <dt>BUY BTC 0.1 @ 77500</dt><dd>Log a long in the journal (SELL for a short; no @ uses the live price)</dd>
              <dt>CLOSE BTC</dt><dd>Close open BTC positions at the live price</dd>
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

function Legend({ show }: { show: { ema: boolean; rsi: boolean } }) {
  const c = useLive();
  return (
    <div className="legend">
      {show.ema && <><span data-learn="ema"><i style={{ background: "#7aa7ff" }} />EMA 9 {price(c.ema9)}</span><span data-learn="ema"><i style={{ background: "#c792ea" }} />EMA 21 {price(c.ema21)}</span></>}
      {show.rsi && <span data-learn="rsi">RSI 14 <b className={c.rsi != null && c.rsi >= 70 ? "dn" : c.rsi != null && c.rsi <= 30 ? "up" : ""}>{c.rsi != null ? c.rsi.toFixed(1) : "—"}</b></span>}
      <span data-learn="volume_bars" className="dim">Volume</span>
    </div>
  );
}

