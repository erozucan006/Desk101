import { useEffect, useRef, useState } from "react";
import type { Ticker } from "../lib/types";
import { Smoke } from "./Smoke";
import { price } from "../lib/format";
import { APP_TAGLINE } from "../config";

/** First-visit hero: a live price annotated like a page of study notes. */
export function Hero({ t, symbol, onStart, onSkip, onSample }: { t?: Ticker; symbol: string; onStart: () => void; onSkip: () => void; onSample: () => void }) {
  const [flash, setFlash] = useState<"up" | "dn" | null>(null);
  const prev = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!t) return;
    if (prev.current != null && t.last !== prev.current) {
      setFlash(t.last > prev.current ? "up" : "dn");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(null), 350);
    }
    prev.current = t.last;
  }, [t?.last]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);

  const spread = t && t.ask > 0 && t.bid > 0 ? t.ask - t.bid : undefined;
  const bps = spread != null && t ? (spread / ((t.ask + t.bid) / 2)) * 1e4 : undefined;
  const [base, quote] = symbol.split("/");

  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero-art"><Smoke intensity={0.75} /></div>
      <h1 id="hero-h">{APP_TAGLINE}</h1>
      <p className="hero-lede">Real crypto prices, live from Kraken, with a note beside every number telling you what it means right now. Practise with a 10,000 paper account, and the journal shows you the habits behind your wins and losses.</p>
      <div className="hero-actions">
        <button className="go" onClick={onStart}>Start with Learn on</button>
        <button className="ghost" onClick={onSkip}>I know my way around</button>
        <button className="link hero-sample" onClick={onSample}>Watch a sample month in review</button>
      </div>

      <figure className="specimen" aria-label={`Live ${base} price with explanations`}>
        <div className="sp-pair">{base}<span>/{quote}</span></div>
        <div className="sp-row r1">
          <div className={`sp-val big ${flash ?? ""}`}>{t ? price(t.last) : "—"}</div>
          <figcaption className="sp-note"><mark>Last price</mark> The most recent trade. It changes every time someone buys or sells.</figcaption>
        </div>
        <div className="sp-row r2">
          <div className={`sp-val ${t ? (t.changePct >= 0 ? "up" : "dn") : ""}`}>{t ? `${t.changePct >= 0 ? "+" : "−"}${Math.abs(t.changePct).toFixed(2)}%` : "—"}</div>
          <p className="sp-note"><mark>24h change</mark> Compared with this exact time yesterday.</p>
        </div>
        <div className="sp-row r3">
          <div className="sp-val">{spread != null ? price(spread) : "—"}{bps != null && <small> {bps.toFixed(1)} bps</small>}</div>
          <p className="sp-note"><mark>Spread</mark> The gap between the best offer to buy and to sell. Smaller means cheaper to trade.</p>
        </div>
      </figure>
    </section>
  );
}
