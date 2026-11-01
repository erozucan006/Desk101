import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Ticker } from "../lib/types";
import { FEES, buyingPower, equity, validateBracket, type Account, type OrderInput, type OrderType, type Side } from "../lib/paper";
import { SETUPS, type JournalTrade, type Setup } from "../lib/journal";
import { money, price } from "../lib/format";
import { PanelHead } from "./Panels";

type Props = {
  symbol: string;
  quote: string;
  qs: string;
  ticker?: Ticker;
  acc: Account;
  prices: Record<string, number>;
  entryCtx: () => JournalTrade["ctx"];
  onPlace: (input: OrderInput) => boolean; // true when accepted
  onClosePosition: (symbol: string) => void;
};

const num = (s: string) => parseFloat(s.replace(",", "."));
const round = (x: number, d = 8) => Math.floor(x * 10 ** d) / 10 ** d;

export function OrderTicket({ symbol, quote, qs, ticker, acc, prices, entryCtx, onPlace, onClosePosition }: Props) {
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("market");
  const [unit, setUnit] = useState<"coin" | "quote">("quote");
  const [amount, setAmount] = useState("");
  const [px, setPx] = useState("");
  const [exits, setExits] = useState(true);
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [setup, setSetup] = useState<Setup>("Breakout");
  const [note, setNote] = useState("");
  const base = symbol.split("/")[0];

  // Start each pair with a sensible price in the box.
  useEffect(() => { setPx(""); setSl(""); setTp(""); }, [symbol]);
  useEffect(() => { if (type !== "market" && !px && ticker) setPx(String(ticker.last)); }, [type, ticker, px]);

  const pos = acc.positions[symbol];
  const eq = equity(acc, quote, prices);
  const bp = buyingPower(acc, quote, prices);
  const p = type === "market" || !num(px) ? (ticker ? (side === "buy" ? ticker.ask : ticker.bid) : NaN) : num(px);
  const marketable = type === "market" || (type === "limit" && ticker != null && (side === "buy" ? p >= ticker.ask : p <= ticker.bid));
  const feeRate = marketable || type === "stop" ? FEES.taker : FEES.maker;
  const qty = useMemo(() => {
    const a = num(amount);
    if (!(a > 0) || !(p > 0)) return 0;
    return unit === "coin" ? a : round(a / p);
  }, [amount, unit, p]);
  const notional = qty * p, fee = notional * feeRate;
  const slN = exits ? num(sl) : NaN, tpN = exits ? num(tp) : NaN;
  const bracket = { sl: slN > 0 ? slN : undefined, tp: tpN > 0 ? tpN : undefined };
  const bErr = p > 0 ? validateBracket(side, p, bracket) : null;
  const dir = side === "buy" ? 1 : -1;
  const risk = bracket.sl && qty ? (p - bracket.sl) * dir * qty + fee + bracket.sl * qty * FEES.taker : null;
  const reward = bracket.tp && qty ? (bracket.tp - p) * dir * qty - fee - bracket.tp * qty * FEES.maker : null;

  function setPct(f: number) {
    if (!(p > 0)) return;
    const value = (bp * f) / (1 + feeRate);
    setAmount(unit === "quote" ? String(Math.floor(value * 100) / 100) : String(round(value / p, 6)));
  }

  function presetExits(riskPct: number, r: number) {
    if (!(p > 0)) return;
    const s = p * (1 - dir * riskPct), t = p * (1 + dir * riskPct * r);
    const d = p >= 100 ? 2 : p >= 1 ? 4 : 8;
    setSl(s.toFixed(d)); setTp(t.toFixed(d)); setExits(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const ok = onPlace({
      symbol, side, type, qty,
      price: type === "market" ? undefined : num(px),
      bracket: bracket.sl || bracket.tp ? bracket : undefined,
      meta: { setup, note: note.trim(), ctx: entryCtx() },
    });
    if (ok) { setAmount(""); setNote(""); setSl(""); setTp(""); }
  }

  const explain = !ticker ? "Waiting for a live quote…"
    : type === "market" ? `Fills now at the best ${side === "buy" ? "ask" : "bid"}, about ${price(p)}. You pay the spread and the ${FEES.taker * 100}% taker fee.`
    : type === "limit" ? (marketable
        ? `This price is through the ${side === "buy" ? "ask" : "bid"}, so it fills immediately like a market order (taker fee).`
        : `Waits in the order book until someone ${side === "buy" ? "sells at" : "buys at"} ${price(p)} or better. If it fills, you pay the ${FEES.maker * 100}% maker fee. It may never fill.`)
    : `Does nothing until the last price ${side === "buy" ? "rises to" : "falls to"} ${price(p)}, then fills at market. Usually used to exit when wrong.`;

  return (
    <section className="pnl ticket">
      <PanelHead code="OT" title={<>Paper trade · {symbol}</>} learn="paper_account" status={<span data-learn="buying_power">BP {qs}{Math.floor(bp).toLocaleString("en-US")}</span>} />
      <form onSubmit={submit} className="tk">
        <div className="tk-side" role="group" aria-label="Side">
          <button type="button" className="b" aria-pressed={side === "buy"} onClick={() => setSide("buy")}>Buy</button>
          <button type="button" className="s" aria-pressed={side === "sell"} onClick={() => setSide("sell")}>Sell</button>
        </div>

        <div className="tk-row">
          <span className="tk-l" data-learn="order_type">Order type</span>
          <div className="tabs" role="tablist" aria-label="Order type">
            {(["market", "limit", "stop"] as OrderType[]).map((t) => (
              <button type="button" key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>

        {type !== "market" && (
          <label className="tk-row" htmlFor="tk-px">
            <span className="tk-l">{type === "limit" ? "Limit price" : "Trigger price"}</span>
            <input id="tk-px" inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} />
          </label>
        )}

        <label className="tk-row" htmlFor="tk-amt">
          <span className="tk-l">Amount</span>
          <span className="tk-amt">
            <input id="tk-amt" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button type="button" className="unit" onClick={() => { setUnit(unit === "coin" ? "quote" : "coin"); setAmount(""); }} title="Switch unit">{unit === "coin" ? base : quote}</button>
          </span>
        </label>
        <div className="tk-pcts">
          {[0.1, 0.25, 0.5, 1].map((f) => <button type="button" key={f} onClick={() => setPct(f)}>{f * 100}%</button>)}
          {pos && <button type="button" className="close" onClick={() => onClosePosition(symbol)}>Close {pos.qty > 0 ? "long" : "short"}</button>}
        </div>
        <div className="tk-sum">
          <span>{qty ? `${qty.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${base}` : "—"}</span>
          <span>≈ {qs}{notional ? notional.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0"}</span>
          <span data-learn="fees" className="dim">fee {notional ? money(fee, qs).replace("+", "") : "—"}</span>
        </div>

        <div className="tk-exits">
          <label className="chk" htmlFor="tk-ex">
            <input id="tk-ex" type="checkbox" checked={exits} onChange={(e) => setExits(e.target.checked)} />
            <span data-learn="bracket">Exit plan</span>
          </label>
          {exits && <span className="presets">
            <button type="button" onClick={() => presetExits(0.02, 2)} title="Stop 2% away, target 4% away">2% / 2R</button>
            <button type="button" onClick={() => presetExits(0.05, 2)} title="Stop 5% away, target 10% away">5% / 2R</button>
          </span>}
        </div>
        {exits && (
          <div className="tk-grid">
            <label htmlFor="tk-sl"><span className="tk-l dn">Stop-loss</span><input id="tk-sl" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder={side === "buy" ? "below entry" : "above entry"} /></label>
            <label htmlFor="tk-tp"><span className="tk-l up">Take-profit</span><input id="tk-tp" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder={side === "buy" ? "above entry" : "below entry"} /></label>
          </div>
        )}
        {exits && (bErr ? <p className="tk-warn">{bErr}</p> : risk != null && (
          <p className="tk-risk" data-learn="risk_reward">
            Risk {money(-risk, qs)} <span className="dim">({((risk / eq) * 100).toFixed(2)}% of equity)</span>
            {reward != null && risk > 0 && <> · Reward {money(reward, qs)} · <b>{(reward / risk).toFixed(1)}R</b> <span className="dim">after fees</span></>}
          </p>
        ))}

        <div className="tk-grid">
          <label htmlFor="tk-setup"><span className="tk-l" data-learn="setup">Setup</span>
            <select id="tk-setup" value={setup} onChange={(e) => setSetup(e.target.value as Setup)}>{SETUPS.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label htmlFor="tk-note"><span className="tk-l">Why?</span><input id="tk-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your reason" maxLength={200} /></label>
        </div>

        <p className="tk-explain">{explain}</p>
        <button type="submit" className={`tk-go ${side}`} disabled={!qty || !ticker || !!bErr}>
          {side === "buy" ? "Buy" : "Sell"} {qty ? qty.toLocaleString("en-US", { maximumFractionDigits: 6 }) : ""} {base} {type !== "market" ? `· ${type}` : ""}
        </button>
      </form>
    </section>
  );
}
