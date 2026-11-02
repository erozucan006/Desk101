import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Feed, Ticker } from "../lib/types";
import { useBook, useNow, useTrades } from "../lib/hooks";
import { compact, pct, price, timeHMS } from "../lib/format";
import { live } from "../lib/live";
import { searchPairs } from "../lib/pairs";
import { Tick } from "./Tick";

export function PanelHead({ code, title, learn, children, status }: { code: string; title: ReactNode; learn?: string; children?: ReactNode; status?: ReactNode }) {
  return (
    <div className="ph">
      <span className="fk">{code}</span>
      <span data-learn={learn}>{title}</span>
      {children}
      {status != null && <span className="st">{status}</span>}
    </div>
  );
}

/* ---------- watchlist ---------- */
export function Watchlist({ bases, quote, tickers, missing, sel, onSelect, onRemove, onAdd, available }: {
  bases: string[]; quote: string; tickers: Record<string, Ticker>; missing: Record<string, true>;
  sel: string; onSelect: (b: string) => void; onRemove: (b: string) => void;
  onAdd: (b: string) => void; available: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const hits = useMemo(() => searchPairs(available, q, bases), [available, q, bases]);
  const close = () => { setOpen(false); setQ(""); setHi(0); };
  const pick = (b: string) => { onAdd(b); setQ(""); setHi(0); };
  return (
    <section className="pnl">
      <PanelHead code="WL" title="Watchlist">
        <button className={`wl-add${open ? " on" : ""}`} onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} title="Add a coin to the watchlist">{open ? "Done" : "+ Add"}</button>
      </PanelHead>
      {open && (
        <div className="wl-search">
          <input
            autoFocus value={q} placeholder={`Search ${available.length} coins (${quote})…`} aria-label="Search coins"
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Enter" && hits[hi]) pick(hits[hi]);
            }}
          />
          {hits.length ? (
            <ul role="listbox">
              {hits.map((b, i) => (
                <li key={b} role="option" aria-selected={i === hi} className={i === hi ? "hi" : ""} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(b); }}>
                  <span>{b}<span className="dim">/{quote}</span></span><span className="plus">+</span>
                </li>
              ))}
            </ul>
          ) : <p className="note">{q.trim() ? (bases.includes(q.trim().toUpperCase()) ? `${q.trim().toUpperCase()} is already on your watchlist.` : `No ${quote} pair for "${q.trim().toUpperCase()}" on Kraken.`) : "All popular coins are already on your list — type to search."}</p>}
        </div>
      )}
      <div className="scroll">
        <table className="tbl hover">
          <thead><tr><th>Pair</th><th data-learn="last_price">Last</th><th data-learn="change_24h">24h</th><th aria-label="Remove" /></tr></thead>
          <tbody>
            {bases.map((b) => {
              const s = `${b}/${quote}`, t = tickers[s];
              return (
                <tr key={b} className={b === sel ? "sel" : ""} onClick={() => onSelect(b)}>
                  <td>{b}</td>
                  {missing[s] ? <td colSpan={2} className="dim small">not listed</td> : <>
                    <td>{t ? <Tick value={t.last}>{price(t.last)}</Tick> : "…"}</td>
                    <td className={t ? (t.changePct >= 0 ? "up" : "dn") : ""}>{t ? pct(t.changePct) : ""}</td>
                  </>}
                  <td><button className="x" title={`Remove ${b}`} onClick={(e) => { e.stopPropagation(); onRemove(b); }}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!bases.length && <p className="note">Your watchlist is empty. Use “+ Add” to pick coins.</p>}
      </div>
    </section>
  );
}

/* ---------- order book ---------- */
export function OrderBook({ feed, symbol }: { feed: Feed; symbol: string }) {
  const { book, error } = useBook(feed, symbol, 8);
  const maxQ = useMemo(() => book ? Math.max(...book.bids.map((l) => l.qty), ...book.asks.map((l) => l.qty), 1e-12) : 1, [book]);
  const best = book && book.asks[0] && book.bids[0] ? { ask: book.asks[0].price, bid: book.bids[0].price } : null;
  const spread = best ? best.ask - best.bid : null;
  const mid = best ? (best.ask + best.bid) / 2 : null;
  const bps = spread != null && mid ? (spread / mid) * 1e4 : null;
  const bidSz = book ? book.bids.reduce((a, l) => a + l.qty, 0) : 0, askSz = book ? book.asks.reduce((a, l) => a + l.qty, 0) : 0;
  const imb = bidSz + askSz > 0 ? bidSz / (bidSz + askSz) : null;
  useEffect(() => { live.set({ spreadBps: bps, imbalance: imb }); }, [bps, imb]);
  const row = (l: { price: number; qty: number }, side: "a" | "b") => (
    <tr key={side + l.price}>
      <td className="bar"><i className={side === "a" ? "ask" : "bid"} style={{ width: `${(l.qty / maxQ) * 100}%` }} /><span className={side === "a" ? "dn" : "up"}>{price(l.price)}</span></td>
      <td>{l.qty.toLocaleString("en-US", { maximumFractionDigits: 5 })}</td>
    </tr>
  );
  return (
    <section className="pnl">
      <PanelHead code="OB" title="Order book" learn="order_book" status={error ? "unavailable" : book ? timeHMS(book.ts) : "loading…"} />
      {error ? <p className="note err">The order book for {symbol} is not available: {error}</p> : <div className="scroll book-body">
        <table className="tbl book"><thead><tr><th>Price</th><th>Size</th></tr></thead>
          <tbody>{book?.asks.slice().reverse().map((l) => row(l, "a"))}</tbody></table>
        <div className="spread" data-learn="spread">Spread {spread != null ? price(spread) : "—"} · {bps != null ? bps.toFixed(2) + " bp" : "—"}</div>
        <table className="tbl book"><tbody>{book?.bids.map((l) => row(l, "b"))}</tbody></table>
        {imb != null && <div className="imb" data-learn="imbalance" title="Bid share of visible size">
          <i style={{ width: `${imb * 100}%` }} /><span>Bids {Math.round(imb * 100)}%</span>
        </div>}
      </div>}
    </section>
  );
}

/* ---------- tape ---------- */
export function Tape({ feed, symbol, quoteSym }: { feed: Feed; symbol: string; quoteSym: string }) {
  const trades = useTrades(feed, symbol, 80);
  const { buyShare, bigCut } = useMemo(() => {
    const notional = trades.map((t) => t.price * t.qty);
    const sorted = notional.slice().sort((a, b) => a - b);
    let buy = 0, tot = 0;
    trades.forEach((t, i) => { tot += notional[i]; if (t.side === "buy") buy += notional[i]; });
    return { buyShare: tot ? buy / tot : null, bigCut: Math.max(sorted[Math.floor(sorted.length * 0.9)] ?? 0, 10000) };
  }, [trades]);
  useEffect(() => { live.set({ buyShare }); }, [buyShare]);
  return (
    <section className="pnl">
      <PanelHead code="TS" title="Time & sales" learn="tape" status={buyShare != null ? <span data-learn="buy_share">buy {Math.round(buyShare * 100)}%</span> : "waiting…"} />
      {buyShare != null && <div className="ratio" data-learn="buy_share"><i className="b" style={{ width: `${buyShare * 100}%` }} /><i className="s" style={{ width: `${(1 - buyShare) * 100}%` }} /></div>}
      <div className="scroll">
        <table className="tbl tape">
          <thead><tr><th>Time</th><th>Price</th><th>Size</th><th data-learn="big_trades">Value</th></tr></thead>
          <tbody>
            {trades.map((t, i) => {
              const v = t.price * t.qty;
              return <tr key={i} className={v >= bigCut ? "big" : ""}><td className="dim">{timeHMS(t.ts)}</td><td className={t.side === "buy" ? "up" : "dn"}>{price(t.price)}</td><td>{t.qty.toLocaleString("en-US", { maximumFractionDigits: 5 })}</td><td>{quoteSym}{compact(v)}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- scanner ---------- */
export function Scanner({ universe, quote, tickers, watch, onSelect, onAdd }: {
  universe: string[]; quote: string; tickers: Record<string, Ticker>; watch: string[]; onSelect: (b: string) => void; onAdd: (b: string) => void;
}) {
  const [tab, setTab] = useState<"up" | "dn" | "vol">("up");
  const rows = universe.map((b) => ({ b, t: tickers[`${b}/${quote}`] })).filter((r) => r.t)
    .map((r) => ({ b: r.b, t: r.t!, qv: r.t!.volume * r.t!.vwap }))
    .sort((a, b) => tab === "up" ? b.t.changePct - a.t.changePct : tab === "dn" ? a.t.changePct - b.t.changePct : b.qv - a.qv)
    .slice(0, 15);
  return (
    <section className="pnl">
      <PanelHead code="SC" title="Scanner" learn="scanner" status={`${rows.length ? universe.filter((b) => tickers[`${b}/${quote}`]).length : 0} pairs`}>
        <div className="tabs" role="tablist">
          {([["up", "Gainers"], ["dn", "Losers"], ["vol", "Volume"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </PanelHead>
      <div className="scroll">
        <table className="tbl hover">
          <thead><tr><th>Pair</th><th>Last</th><th data-learn="change_24h">24h</th><th data-learn="volume_24h">Volume</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.b} onClick={() => onSelect(r.b)}>
                <td>{r.b}</td><td>{price(r.t.last)}</td><td className={r.t.changePct >= 0 ? "up" : "dn"}>{pct(r.t.changePct)}</td>
                <td className="dim">{compact(r.qv)}</td>
                <td>{!watch.includes(r.b) && <button className="x add" title={`Add ${r.b} to watchlist`} onClick={(e) => { e.stopPropagation(); onAdd(r.b); }}>+</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- sessions ---------- */
function zone(tz: string, d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { h: +g("hour"), m: +g("minute"), wd: g("weekday") };
}
export function sessionStates(): [string, string, boolean][] {
  const wk = (wd: string) => wd !== "Sat" && wd !== "Sun";
  const open = (tz: string, a: number, b: number) => { const z = zone(tz), t = z.h * 60 + z.m; return wk(z.wd) && t >= a && t < b; };
  return [
    ["Tokyo", "09:00–15:30 local", open("Asia/Tokyo", 540, 930)],
    ["Frankfurt", "09:00–17:30 local", open("Europe/Berlin", 540, 1050)],
    ["London", "08:00–16:30 local", open("Europe/London", 480, 990)],
    ["New York", "09:30–16:00 local", open("America/New_York", 570, 960)],
  ];
}

/** One-line strip of stock-market sessions; crypto itself never closes. */
export function SessionStrip() {
  useNow(30000);
  return (
    <div className="sstrip" data-learn="sessions">
      <span className="dim">Stock markets</span>
      {sessionStates().map(([n, t, on]) => <span key={n} className={`sdot ${on ? "on" : ""}`} title={`${n}: ${t}, ${on ? "open" : "closed"}`}>{n}</span>)}
    </div>
  );
}
