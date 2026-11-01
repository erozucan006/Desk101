import { useState } from "react";
import { START_CASH, buyingPower, equity, quoteOf, unrealized, type Account } from "../lib/paper";
import { duration, money, pct, price, timeHMS } from "../lib/format";
import { PanelHead } from "./Panels";

type Props = {
  acc: Account;
  quote: string;
  qs: string;
  prices: Record<string, number>;
  onSelect: (base: string) => void;
  onClose: (symbol: string) => void;
  onCancel: (id: string) => void;
  onReset: () => void;
};

export function AccountPanel({ acc, quote, qs, prices, onSelect, onClose, onCancel, onReset }: Props) {
  const [confirm, setConfirm] = useState(false);
  const mine = (sym: string) => quoteOf(sym) === quote;
  const positions = Object.entries(acc.positions).filter(([s]) => mine(s));
  const orders = acc.orders.filter((o) => mine(o.symbol));
  const fills = acc.fills.filter((f) => mine(f.symbol));
  const eq = equity(acc, quote, prices);
  const openPnl = positions.reduce((a, [s]) => a + unrealized(acc, s, prices), 0);
  const fees = fills.reduce((a, f) => a + f.fee, 0);
  const ret = (eq / START_CASH - 1) * 100;
  const other = Object.keys(acc.positions).filter((s) => !mine(s)).length + acc.orders.filter((o) => !mine(o.symbol)).length;
  const cls = (v: number) => (v > 0.005 ? "up" : v < -0.005 ? "dn" : "");
  const roleLabel = { entry: "Entry", sl: "SL", tp: "TP" } as const;

  return (
    <section className="pnl account">
      <PanelHead code="PA" title={`Paper account · ${quote}`} learn="paper_account" status={
        confirm ? <span className="confirm">Reset to {qs}{START_CASH.toLocaleString("en-US")} and clear all paper positions, orders and fills?
          <button className="danger" onClick={() => { onReset(); setConfirm(false); }}>Reset</button><button onClick={() => setConfirm(false)}>Keep</button></span>
        : <button className="link" onClick={() => setConfirm(true)}>Reset account</button>} />
      <div className="tiles">
        <div data-learn="equity">Equity<b>{qs}{eq.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
        <div>Return<b className={cls(ret)}>{pct(ret)}</b></div>
        <div data-learn="unrealized">Open P&amp;L<b className={cls(openPnl)}>{positions.length ? money(openPnl, qs) : "—"}</b></div>
        <div>Cash<b>{qs}{(acc.cash[quote] ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
        <div data-learn="buying_power">Buying power<b>{qs}{buyingPower(acc, quote, prices).toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
        <div data-learn="fees">Fees paid<b>{qs}{fees.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
      </div>
      <div className="acols">
        <div>
          <div className="sub">Positions</div>
          <div className="scroll short">
            <table className="tbl">
              <thead><tr><th>Pair</th><th>Size</th><th data-learn="avg_entry">Avg</th><th>Mark</th><th>P&amp;L</th><th>%</th><th>Held</th><th /></tr></thead>
              <tbody>
                {positions.length ? positions.map(([s, p]) => {
                  const u = unrealized(acc, s, prices), m = prices[s];
                  const r = m ? ((m / p.avg - 1) * 100 * Math.sign(p.qty)) : null;
                  return (
                    <tr key={s}>
                      <td><button className="x sym" onClick={() => onSelect(s.split("/")[0])}>{s}</button></td>
                      <td className={p.qty > 0 ? "up" : "dn"}>{p.qty > 0 ? "+" : ""}{p.qty.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                      <td>{price(p.avg)}</td><td>{price(m)}</td>
                      <td className={cls(u)}>{money(u, qs)}</td><td className={cls(r ?? 0)}>{pct(r)}</td>
                      <td className="dim">{duration(p.openedAt)}</td>
                      <td><button className="mini" onClick={() => onClose(s)}>Close</button></td>
                    </tr>
                  );
                }) : <tr><td colSpan={8} className="dim left">No open positions. Use the order ticket to place your first paper trade.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="sub" data-learn="order_type">Open orders</div>
          <div className="scroll short">
            <table className="tbl">
              <thead><tr><th>Pair</th><th>Order</th><th>Size</th><th>Price</th><th /></tr></thead>
              <tbody>
                {orders.length ? orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.symbol}</td>
                    <td><span className={o.side === "buy" ? "up" : "dn"}>{o.side.toUpperCase()}</span> <span className="dim">{o.type}{o.role !== "entry" ? ` · ${roleLabel[o.role]}` : ""}</span></td>
                    <td>{o.qty.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                    <td>{price(o.price)}</td>
                    <td><button className="x" onClick={() => onCancel(o.id)} title="Cancel order">×</button></td>
                  </tr>
                )) : <tr><td colSpan={5} className="dim left">No resting orders.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="sub">Fills</div>
          <div className="scroll short">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Pair</th><th>Side</th><th>Price</th><th data-learn="fees">Fee</th></tr></thead>
              <tbody>
                {fills.length ? fills.slice(0, 40).map((f) => (
                  <tr key={f.id} title={`${f.qty} @ ${f.price} · ${f.liquidity}`}>
                    <td className="dim">{timeHMS(Date.parse(f.ts))}</td><td>{f.symbol.split("/")[0]}</td>
                    <td className={f.side === "buy" ? "up" : "dn"}>{f.side.toUpperCase()} {f.qty.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                    <td>{price(f.price)}</td>
                    <td className="dim">{f.fee.toFixed(2)} <span className="tag">{f.liquidity === "maker" ? "M" : "T"}</span></td>
                  </tr>
                )) : <tr><td colSpan={5} className="dim left">No fills yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="note">Virtual money, real Kraken prices. Orders are checked while Desk101 is open in your browser; fills use the best bid/ask, so very large orders fill more favourably here than they would on the real book.{other ? ` You also have ${other} position(s)/order(s) in the ${quote === "USD" ? "EUR" : "USD"} account.` : ""}</p>
    </section>
  );
}
