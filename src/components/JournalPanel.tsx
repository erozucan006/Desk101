import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Ticker } from "../lib/types";
import { SETUPS, coach, journal, pnl, pnlPct, stats, toCSV, type JournalTrade, type Setup, type Side } from "../lib/journal";
import { duration, money, pct, price } from "../lib/format";
import { live } from "../lib/live";
import { PanelHead } from "./Panels";

type Props = {
  trades: JournalTrade[];
  tickers: Record<string, Ticker>;
  sel: string;
  quote: string;
  quoteSym: string;
  entryCtx: () => JournalTrade["ctx"];
  say: (msg: string, tone?: "ok" | "err") => void;
  onClosePaper: (symbol: string) => void;
};

export function JournalPanel({ trades, tickers, sel, quote, quoteSym, entryCtx, say, onClosePaper }: Props) {
  const [side, setSide] = useState<Side>("long");
  const [sym, setSym] = useState("");
  const [qty, setQty] = useState("");
  const [px, setPx] = useState("");
  const [fee, setFee] = useState("");
  const [setup, setSetup] = useState<Setup>("Breakout");
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState<{ id: string; px: string } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const open = trades.filter((t) => t.status === "open");
  const closed = trades.filter((t) => t.status === "closed").sort((a, b) => Date.parse(b.exitAt!) - Date.parse(a.exitAt!));
  const cur = (t: JournalTrade) => tickers[t.symbol]?.last ?? null;
  const inQuote = useMemo(() => trades.filter((t) => t.symbol.endsWith("/" + quote)), [trades, quote]);
  const st = useMemo(() => stats(inQuote), [inQuote]);
  const insights = useMemo(() => coach(trades), [trades]);
  const unreal = open.filter((t) => t.symbol.endsWith("/" + quote)).reduce<{ v: number; known: boolean }>((a, t) => { const p = pnl(t, cur(t)); return p == null ? { ...a, known: false } : { v: a.v + p, known: a.known }; }, { v: 0, known: true });
  const curSym = (t: JournalTrade) => (t.symbol.endsWith("/EUR") ? "€" : "$");

  useEffect(() => {
    live.set({ winRate: st.winRate, profitFactor: st.profitFactor, expectancy: st.expectancy, openCount: open.length });
  }, [st, open.length]);

  const n = (s: string) => parseFloat(s.replace(",", "."));
  const base = (sym.trim().toUpperCase() || sel).replace(/[/_-]?(USD|EUR)$/, "");
  const symbol = `${base}/${quote}`;

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = n(qty), p = px ? n(px) : tickers[symbol]?.last;
    if (!(q > 0)) return say("Enter a quantity greater than zero.", "err");
    if (!(p && p > 0)) return say(`No live price for ${symbol} yet. Enter an entry price.`, "err");
    journal.open({ symbol, side, qty: q, entry: p, fee: n(fee) > 0 ? n(fee) : 0, setup, note: note.trim(), ctx: base === sel ? entryCtx() : undefined });
    say(`${side === "long" ? "Long" : "Short"} ${q} ${symbol} @ ${price(p)} logged.`, "ok");
    setQty(""); setPx(""); setFee(""); setNote("");
  }

  function doClose(id: string, val: string) {
    const v = n(val);
    if (!(v > 0)) return say("Enter a valid exit price.", "err");
    const t = trades.find((x) => x.id === id)!;
    journal.close(id, v); setClosing(null);
    say(`${t.symbol} closed: ${money(pnl(t, v), curSym(t))}`, "ok");
  }

  function del(id: string) {
    if (armed === id) { journal.remove(id); setArmed(null); return; }
    setArmed(id); setTimeout(() => setArmed((a) => (a === id ? null : a)), 3000);
  }

  function exportCSV() {
    const blob = new Blob([toCSV(trades)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `journal-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const cls = (v: number | null) => (v == null ? "" : v > 0 ? "up" : v < 0 ? "dn" : "");
  const sideTag = (t: JournalTrade) => <span className={`side ${t.side === "long" ? "up" : "dn"}`} data-learn="long_short">{t.side === "long" ? "LONG" : "SHORT"}</span>;

  return (
    <section className="pnl journal">
      <PanelHead code="JR" title="Positions & journal" status={<>{trades.length} entries · <button className="link" onClick={exportCSV} disabled={!trades.length}>Export CSV</button></>} />
      <div className="tiles">
        <div data-learn="unrealized">Unrealized P&amp;L<b className={cls(unreal.v)}>{open.length ? money(unreal.v, quoteSym) + (unreal.known ? "" : "*") : "—"}</b></div>
        <div data-learn="realized">Realized P&amp;L<b className={cls(st.realized)}>{st.closed ? money(st.realized, quoteSym) : "—"}</b></div>
        <div data-learn="win_rate">Win rate<b>{st.winRate != null ? Math.round(st.winRate * 100) + "%" : "—"}</b></div>
        <div data-learn="profit_factor">Profit factor<b>{st.profitFactor == null ? "—" : isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : "∞"}</b></div>
        <div data-learn="expectancy">Avg per trade<b className={cls(st.expectancy)}>{st.expectancy != null ? money(st.expectancy, quoteSym) : "—"}</b></div>
        <div>Closed trades<b>{st.closed}</b></div>
      </div>

      <form className="jf" onSubmit={submit}>
        <input id="j-sym" aria-label="Pair" placeholder={sel} value={sym} onChange={(e) => setSym(e.target.value)} maxLength={12} className="sym" />
        <div className="seg" data-learn="long_short">
          <button type="button" className="l" aria-pressed={side === "long"} onClick={() => setSide("long")}>LONG</button>
          <button type="button" className="s" aria-pressed={side === "short"} onClick={() => setSide("short")}>SHORT</button>
        </div>
        <input id="j-qty" aria-label="Quantity" inputMode="decimal" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input id="j-px" aria-label="Entry price" inputMode="decimal" placeholder={tickers[symbol] ? `Market ${price(tickers[symbol].last)}` : "Entry price"} value={px} onChange={(e) => setPx(e.target.value)} />
        <input id="j-fee" aria-label="Fee" inputMode="decimal" placeholder={`Fee ${quoteSym}`} value={fee} onChange={(e) => setFee(e.target.value)} />
        <select id="j-setup" aria-label="Setup" value={setup} onChange={(e) => setSetup(e.target.value as Setup)} data-learn="setup">
          {SETUPS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <input id="j-note" aria-label="Note" placeholder="Why this trade? Where would you be wrong?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} className="note-in" />
        <button type="submit" className="ghost">Log outside trade</button>
      </form>

      <div className="jcols">
        <div>
          <div className="sub">Open positions</div>
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Pair</th><th>Side</th><th>Qty</th><th>Entry</th><th>Now</th><th>P&amp;L</th><th>%</th><th>Held</th><th /></tr></thead>
              <tbody>
                {open.length ? open.map((t) => {
                  const c = cur(t), p = pnl(t, c), pc = pnlPct(t, c);
                  return (
                    <tr key={t.id} title={t.note}>
                      <td>{t.symbol}{t.source === "paper" && <span className="tag">paper</span>}</td><td>{sideTag(t)}</td><td>{t.qty.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td><td>{price(t.entry)}</td><td>{price(c)}</td>
                      <td className={cls(p)}>{money(p, curSym(t))}</td><td className={cls(pc)}>{pct(pc)}</td><td className="dim">{duration(t.entryAt)}</td>
                      <td>{closing?.id === t.id ? (
                        <span className="closebox">
                          <input aria-label="Exit price" inputMode="decimal" value={closing.px} autoFocus onChange={(e) => setClosing({ id: t.id, px: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") doClose(t.id, closing.px); if (e.key === "Escape") setClosing(null); }} />
                          <button className="ok" onClick={() => doClose(t.id, closing.px)}>Close</button>
                          <button onClick={() => setClosing(null)}>Cancel</button>
                        </span>
                      ) : (
                        <span className="closebox">
                          <button onClick={() => (t.source === "paper" ? onClosePaper(t.symbol) : setClosing({ id: t.id, px: c != null ? String(c) : "" }))}>Close</button>
                          <button className={`x ${armed === t.id ? "armed" : ""}`} onClick={() => del(t.id)} title="Delete entry">{armed === t.id ? "delete?" : "×"}</button>
                        </span>
                      )}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={9} className="dim left">No open positions. Place a paper trade with the order ticket, or log a trade you made elsewhere above.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="sub">Closed trades</div>
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Pair</th><th>Side</th><th>Entry → Exit</th><th>P&amp;L</th><th>%</th><th>Setup</th><th /></tr></thead>
              <tbody>
                {closed.length ? closed.slice(0, 60).map((t) => {
                  const p = pnl(t, t.exit), pc = pnlPct(t, t.exit);
                  return (
                    <tr key={t.id} title={t.note}>
                      <td>{t.symbol}{t.source === "paper" && <span className="tag">paper</span>}</td><td>{sideTag(t)}</td><td>{price(t.entry)} → {price(t.exit)}</td>
                      <td className={cls(p)}>{money(p, curSym(t))}</td><td className={cls(pc)}>{pct(pc)}</td><td className="dim">{t.setup}</td>
                      <td><button className={`x ${armed === t.id ? "armed" : ""}`} onClick={() => del(t.id)} title="Delete entry">{armed === t.id ? "delete?" : "×"}</button></td>
                    </tr>
                  );
                }) : <tr><td colSpan={7} className="dim left">No closed trades yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="sub" data-learn="coach">Coach</div>
          <div className="coach">
            {insights.map((i, k) => (
              <div key={k} className={`ins ${i.tone}`}><b>{i.title}</b><p>{i.body}</p></div>
            ))}
          </div>
        </div>
      </div>
      <p className="note">Paper trades are logged here automatically. Use the form to log trades you made on a real exchange. Your journal is stored in this browser only; export CSV to keep a copy. Totals add up positions quoted in {quote}.</p>
    </section>
  );
}
