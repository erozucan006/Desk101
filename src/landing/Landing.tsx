import { useEffect, useMemo, useRef, useState } from "react";
import { KrakenFeed } from "../lib/kraken";
import { DemoFeed } from "../lib/demo";
import { KRAKEN_WS } from "../config";
import { useCandles } from "../lib/hooks";
import { rsi, lastValue } from "../lib/indicators";
import { LEARN } from "../lib/learn";
import { price, pct } from "../lib/format";
import { buildReview, sampleTrades } from "../lib/review";
import type { Feed, Ticker } from "../lib/types";
import { Ribbons } from "./Ribbons";
import { Review } from "../components/Review";
import "./landing.css";

const isDemo = new URLSearchParams(location.search).has("demo");
const DESK = "/desk" + (isDemo ? "?demo=1" : "");

function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#f2f0ea" />
      <g fill="#0a0a0a">
        <rect x="7.4" y="13" width="1.4" height="13" rx=".7" /><rect x="5.6" y="16" width="5" height="7" rx="1" />
        <rect x="15.3" y="9" width="1.4" height="15" rx=".7" /><rect x="13.5" y="11.5" width="5" height="9" rx="1" />
        <rect x="23.2" y="5" width="1.4" height="17" rx=".7" /><rect x="21.4" y="7" width="5" height="11" rx="1" />
      </g>
    </svg>
  );
}

/** Adds .in to [data-reveal] elements as they scroll into view (once). */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.25, rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

/** True once the element has been revealed; used to start the small demos. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

function CountUp({ to, run, fmt, ms = 1400 }: { to: number; run: boolean; fmt: (v: number) => string; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => { const k = Math.min(1, (now - t0) / ms); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, to, ms]);
  return <>{fmt(v)}</>;
}

function useTypewriter(text: string, run: boolean, speed = 16) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => setN((k) => { if (k >= text.length) { clearInterval(id); return k; } return k + 2; }), speed);
    return () => clearInterval(id);
  }, [run, text, speed]);
  return text.slice(0, n);
}

export default function Landing() {
  const feed: Feed = useMemo(() => (isDemo ? new DemoFeed() : new KrakenFeed(KRAKEN_WS)), []);
  const [t, setT] = useState<Ticker | undefined>();
  useEffect(() => feed.ticker("BTC/USD", setT), [feed]);
  const { candles } = useCandles(feed, "BTC/USD", 60);
  const closes = useMemo(() => candles.map((c) => c.c), [candles]);
  const r = useMemo(() => lastValue(rsi(closes, 14)), [closes]);
  const [scrolled, setScrolled] = useState(false);
  const [review, setReview] = useState(false);
  useReveal();
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 24);
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => { document.title = "Desk101 — the trading terminal that explains itself"; }, []);

  const sample = useMemo(() => buildReview(sampleTrades())!, []);

  // demos start when they come into view
  const [explainRef, explainOn] = useInView<HTMLDivElement>();
  const [paperRef, paperOn] = useInView<HTMLDivElement>();
  const [tutorRef, tutorOn] = useInView<HTMLDivElement>();
  const [reviewRef, reviewOn] = useInView<HTMLDivElement>();
  const [statsRef, statsOn] = useInView<HTMLDivElement>();

  const rsiNow = LEARN.rsi.now?.({ symbol: "BTC", quote: "USD", timeframe: "1H", rsi: r, ticker: t }) ?? "RSI compares recent up moves with recent down moves on a 0–100 scale.";
  const answer = "An RSI above 70 means recent gains were much bigger than recent losses: momentum is strong. It does not mean the price has to fall. In a strong trend RSI can stay high for weeks. A careful trader would ask: where would my stop go, and does the risk still fit my plan?";
  const typed = useTypewriter(answer, tutorOn);
  const fill = t?.ask ?? 77950;
  const [filled, setFilled] = useState(false);
  useEffect(() => { if (!paperOn) return; const id = setTimeout(() => setFilled(true), 1100); return () => clearTimeout(id); }, [paperOn]);

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? "solid" : ""}`}>
        <a className="lp-brand" href="/"><Logo /><span>Desk<em>101</em></span></a>
        <nav aria-label="Sections">
          <a href="#explain">Learn mode</a><a href="#paper">Paper trading</a><a href="#tutor">Ask Desk</a><a href="#plans">Plans</a>
        </nav>
        <span className="lp-live" title="Live price from Kraken"><i />{t ? <>BTC {price(t.last)}</> : "markets connecting"}</span>
        <a className="lp-cta sm" href={DESK}>Open the desk</a>
      </header>

      <section className="lp-hero">
        <Ribbons closes={closes} />
        <div className="lp-hero-in">
          <span className="lp-pill" data-reveal><i />Free during beta · crypto · EUR &amp; USD</span>
          <h1 data-reveal style={{ ["--d" as string]: ".08s" }}>The trading terminal that <em>explains itself.</em></h1>
          <p className="lp-lede" data-reveal style={{ ["--d" as string]: ".16s" }}>Live market data with a plain-language note beside every number. Practise with a paper account at real prices, ask a tutor that sees your screen, and learn from your own trades.</p>
          <div className="lp-actions" data-reveal style={{ ["--d" as string]: ".24s" }}>
            <a className="lp-cta" href={DESK}>Open the desk</a>
            <button className="lp-ghost" onClick={() => setReview(true)}>Watch a sample month</button>
          </div>
        </div>
        <div className="lp-float" data-reveal style={{ ["--d" as string]: ".4s" }} aria-hidden="true">
          <div className="lp-float-top"><b>BTC/USD</b><span className={t && t.changePct < 0 ? "dn" : "up"}>{t ? pct(t.changePct) : "—"}</span></div>
          <div className="lp-float-px">{t ? price(t.last) : "—"}</div>
          <p><mark>Last price</mark> The most recent trade on Kraken. It changes every time someone buys or sells.</p>
        </div>
      </section>

      <section className="lp-sec" id="explain">
        <div className="lp-copy" data-reveal>
          <span className="lp-num">Learn mode</span>
          <h2>Every number <em>explains itself.</em></h2>
          <p>Turn on Learn and point at anything on the desk: what it measures, how to read it, the mistake beginners make, and what it is saying right now.</p>
        </div>
        <div className="lp-demo" ref={explainRef} data-reveal style={{ ["--d" as string]: ".1s" }}>
          <div className="dm-panel">
            <div className="dm-row"><span>24h change</span><b className={t && t.changePct < 0 ? "dn" : "up"}>{t ? pct(t.changePct) : "—"}</b></div>
            <div className={`dm-row hl ${explainOn ? "on" : ""}`}><span>RSI 14</span><b>{r != null ? r.toFixed(1) : "—"}</b></div>
            <div className="dm-row"><span>Spread</span><b>{t ? price(t.ask - t.bid) : "—"}</b></div>
          </div>
          <div className={`dm-tip ${explainOn ? "on" : ""}`}>
            <b>RSI 14</b>
            <p>{LEARN.rsi.what}</p>
            <p className="now">{rsiNow}</p>
          </div>
        </div>
      </section>

      <section className="lp-sec flip" id="paper">
        <div className="lp-copy" data-reveal>
          <span className="lp-num">Paper trading</span>
          <h2>Practise at <em>real</em> prices.</h2>
          <p>A 10,000 practice account that fills at the live bid and ask, with real exchange fees. Every trade lands in your journal, and the coach finds the habits behind your results.</p>
        </div>
        <div className="lp-demo" ref={paperRef} data-reveal style={{ ["--d" as string]: ".1s" }}>
          <div className="dm-ticket">
            <div className="dm-seg"><span className="on">Buy</span><span>Sell</span></div>
            <div className="dm-row"><span>Amount</span><b>0.05 BTC</b></div>
            <div className="dm-row"><span>Fills at the ask</span><b>{price(fill)}</b></div>
            <div className={`dm-btn ${paperOn ? "press" : ""} ${filled ? "done" : ""}`}>{filled ? "Filled" : "Buy BTC"}</div>
          </div>
          <div className={`dm-journal ${filled ? "on" : ""}`}>
            <span className="dm-tag">paper</span><b>Long 0.05 BTC</b><span>@ {price(fill)}</span><span className="dim">fee ${(fill * 0.05 * 0.004).toFixed(2)}</span>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="tutor">
        <div className="lp-copy" data-reveal>
          <span className="lp-num">Ask Desk</span>
          <h2>A tutor that <em>sees your screen.</em></h2>
          <p>Ask about the chart, a term or your own journal. It answers with the numbers in front of you, in your language, and it never tells you what to buy or sell.</p>
        </div>
        <div className="lp-demo" ref={tutorRef} data-reveal style={{ ["--d" as string]: ".1s" }}>
          <div className="dm-chat">
            <div className="dm-q">RSI is 71 on BTC. Does that mean it will fall?</div>
            <div className="dm-a">{typed}{tutorOn && typed.length < answer.length && <i className="dm-caret" />}</div>
            <span className="dm-note">Example answer</span>
          </div>
        </div>
      </section>

      <section className="lp-sec flip" id="review">
        <div className="lp-copy" data-reveal>
          <span className="lp-num">Month in review</span>
          <h2>Your month, <em>told back to you.</em></h2>
          <p>Net result, the shape of your equity, best and worst trade, the setups you lean on and what the coach noticed. One number per scene, like a story.</p>
          <button className="lp-ghost" onClick={() => setReview(true)}>Play the sample</button>
        </div>
        <div className="lp-demo" ref={reviewRef} data-reveal style={{ ["--d" as string]: ".1s" }}>
          <div className="dm-review">
            <span className="dm-pill">Net result</span>
            <div className="dm-big"><CountUp to={sample.net} run={reviewOn} fmt={(v) => `+$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} /></div>
            <svg viewBox="0 0 320 90" preserveAspectRatio="none" className={reviewOn ? "on" : ""} aria-hidden="true">
              <path pathLength={1} d={sample.curve.map((p, i) => { const lo = Math.min(...sample.curve), hi = Math.max(...sample.curve); return `${i ? "L" : "M"}${(i / (sample.curve.length - 1)) * 320},${85 - ((p - lo) / (hi - lo || 1)) * 80}`; }).join(" ")} />
            </svg>
            <div className="dm-stats"><span><b>{Math.round(sample.winRate * 100)}%</b>win rate</span><span><b>{sample.trades}</b>trades</span><span><b>{sample.days}</b>days</span></div>
          </div>
        </div>
      </section>

      <section className="lp-stats" ref={statsRef}>
        <div data-reveal><b><CountUp to={600} run={statsOn} fmt={(v) => `${Math.round(v)}+`} /></b><span>coins you can watch, live from Kraken</span></div>
        <div data-reveal style={{ ["--d" as string]: ".08s" }}><b><CountUp to={720} run={statsOn} fmt={(v) => `${Math.round(v)}`} /></b><span>candles of history on every timeframe</span></div>
        <div data-reveal style={{ ["--d" as string]: ".16s" }}><b><CountUp to={9} run={statsOn} fmt={(v) => `${Math.round(v)}`} /></b><span>official news sources, no clickbait</span></div>
        <div data-reveal style={{ ["--d" as string]: ".24s" }}><b>€<CountUp to={0} run={statsOn} fmt={(v) => `${Math.round(v)}`} /></b><span>to start, during the beta</span></div>
      </section>

      <section className="lp-paper">
        <div className="lp-paper-in" data-reveal>
          <h2>Built for students <em>in Europe.</em></h2>
          <ul>
            <li><b>EUR and USD pairs</b><span>Trade the quote currency you think in.</span></li>
            <li><b>ECB, Eurostat and Fed on one calendar</b><span>With the result and how the market moved after it.</span></li>
            <li><b>Education only</b><span>No signals, no buy or sell calls. Paper money, real data.</span></li>
          </ul>
          <a className="lp-cta dark" href={DESK}>Open the desk</a>
        </div>
      </section>

      <section className="lp-plans" id="plans">
        <h2 data-reveal>Plans</h2>
        <div className="lp-plan-grid">
          <div className="lp-plan" data-reveal>
            <span className="lp-num">Student</span>
            <div className="lp-price">Free <small>during beta</small></div>
            <ul><li>Live desk with Learn mode</li><li>Paper account, journal and coach</li><li>Ask Desk tutor, daily limit</li><li>Calendar with results and market reaction</li></ul>
            <a className="lp-cta" href={DESK}>Open the desk</a>
          </div>
          <div className="lp-plan" data-reveal style={{ ["--d" as string]: ".1s" }}>
            <span className="lp-num">Clubs and universities</span>
            <div className="lp-price">Pilot <small>coming soon</small></div>
            <ul><li>Everything in Student</li><li>Team challenges and leaderboards</li><li>Class exercises around real releases</li><li>Shared progress for mentors</li></ul>
            <span className="lp-soon">We are starting with student finance clubs in Munich.</span>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-brand"><Logo size={20} /><span>Desk<em>101</em></span></div>
        <p>For education only. Nothing on Desk101 is investment advice. Market data: Kraken. Official news from the Federal Reserve, ECB, BLS, SEC and ESMA. This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.</p>
      </footer>

      {review && <Review data={sample} sample onClose={() => setReview(false)} />}
    </div>
  );
}
