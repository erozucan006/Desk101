import { useCallback, useEffect, useRef, useState } from "react";
import type { Review as R } from "../lib/review";
import { money } from "../lib/format";
import { Smoke } from "./Smoke";

const SCENE_MS = 4800;
const sym = (c: string) => (c === "EUR" ? "€" : "$");

/** Number that counts up to its value when the scene appears. */
function Count({ value, fmt, ms = 1100 }: { value: number; fmt: (v: number) => string; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(value); return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => { const k = Math.min(1, (now - t0) / ms); setV(value * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{fmt(v)}</>;
}

function Curve({ pts }: { pts: number[] }) {
  const W = 320, H = 120, lo = Math.min(...pts), hi = Math.max(...pts), r = hi - lo || 1;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * W},${H - ((p - lo) / r) * (H - 10) - 5}`).join(" ");
  const zero = H - ((0 - lo) / r) * (H - 10) - 5;
  return (
    <svg className="rv-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {zero > 0 && zero < H && <line x1="0" x2={W} y1={zero} y2={zero} className="zero" />}
      <path d={d} pathLength={1} />
    </svg>
  );
}

/** Full-screen "month in review" story: one number per scene, tap to move on. */
export function Review({ data, sample, onClose }: { data: R; sample?: boolean; onClose: () => void }) {
  const c = sym(data.ccy), m = (v: number) => money(v, c);
  const pos = (v: number) => (v >= 0 ? "pos" : "neg");
  const scenes: { key: string; tone: "pos" | "neg" | "flat"; body: JSX.Element }[] = [
    { key: "intro", tone: "flat", body: <>
      <span className="rv-pill">Month in review</span>
      <h2 className="rv-title">{data.title}</h2>
      <p className="rv-sub">{data.trades} trades · {data.days} trading days{sample ? " · sample data" : ""}</p>
    </> },
    { key: "net", tone: pos(data.net), body: <>
      <span className="rv-pill">Net result</span>
      <div className={`rv-big ${pos(data.net)}`}><Count value={data.net} fmt={m} /></div>
      <div className="rv-stats">
        <span><b>{Math.round(data.winRate * 100)}%</b>win rate</span>
        <span><b className="pos">{data.wins}</b>wins</span>
        <span><b className="neg">{data.losses}</b>losses</span>
      </div>
    </> },
    { key: "shape", tone: pos(data.net), body: <>
      <span className="rv-pill">The shape of it</span>
      <Curve pts={data.curve} />
      <div className="rv-days">
        <span><small>Best day</small><b className="pos">{m(data.bestDay.pnl)}</b><small>{data.bestDay.label}</small></span>
        <span><small>Worst day</small><b className="neg">{m(data.worstDay.pnl)}</b><small>{data.worstDay.label}</small></span>
      </div>
    </> },
    { key: "best", tone: "pos", body: <>
      <span className="rv-pill">Best trade</span>
      <div className="rv-big pos"><Count value={data.best.pnl} fmt={m} ms={800} /></div>
      <TradeCard t={data.best} />
    </> },
    { key: "worst", tone: "neg", body: <>
      <span className="rv-pill neg">Worst trade</span>
      <div className="rv-big neg"><Count value={data.worst.pnl} fmt={m} ms={800} /></div>
      <TradeCard t={data.worst} />
      <p className="rv-foot">Every month has one. What matters is what it taught you.</p>
    </> },
    { key: "how", tone: "flat", body: <>
      <span className="rv-pill">How you traded</span>
      <ul className="rv-bars">
        {data.setups.slice(0, 4).map((s) => (
          <li key={s.setup}>
            <span>{s.setup}</span>
            <i style={{ ["--w" as string]: `${(s.count / data.setups[0].count) * 100}%` }} className={pos(s.net)} />
            <b>{s.count}</b>
          </li>
        ))}
      </ul>
      {data.setups.length > 0 && (() => { const top = [...data.setups].sort((a, b) => b.net - a.net)[0]; return <p className="rv-sub">Most profitable setup: <b className={pos(top.net)}>{top.setup} {m(top.net)}</b></p>; })()}
    </> },
    { key: "coach", tone: "flat", body: <>
      <span className="rv-pill">Coach notes</span>
      <div className="rv-notes">
        {data.insights.length ? data.insights.map((i) => (
          <div key={i.title} className={`rv-note ${i.tone}`}><b>{i.title}</b><p>{i.body}</p></div>
        )) : <div className="rv-note info"><b>Keep journaling</b><p>With a few more closed trades the coach starts spotting patterns in how you trade.</p></div>}
      </div>
    </> },
  ];

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const last = i === scenes.length - 1;
  const next = useCallback(() => setI((k) => Math.min(k + 1, scenes.length - 1)), [scenes.length]);
  const prev = useCallback(() => setI((k) => Math.max(k - 1, 0)), []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!paused && !last) timer.current = setTimeout(next, SCENE_MS);
    return () => clearTimeout(timer.current);
  }, [i, paused, last, next]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [next, prev, onClose]);

  const s = scenes[i];
  return (
    <div className={`rv tone-${s.tone}`} role="dialog" aria-modal="true" aria-label={`Month in review, ${data.title}`}
      onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerCancel={() => setPaused(false)}>
      <Smoke intensity={0.55} className="rv-smoke" />
      <div className="rv-glow" />
      <div className="rv-progress" aria-hidden="true">
        {scenes.map((x, k) => <span key={x.key} className={k < i ? "done" : k === i ? (paused ? "on paused" : "on") : ""} style={{ ["--dur" as string]: `${SCENE_MS}ms` }} />)}
      </div>
      <button className="rv-close" onClick={onClose} aria-label="Close review">×</button>
      <div className="rv-tap prev" onClick={prev} aria-hidden="true" />
      <div className="rv-tap next" onClick={next} aria-hidden="true" />
      <div className="rv-scene" key={s.key} aria-live="polite">{s.body}</div>
      <div className="rv-bottom">
        {last ? <div className="rv-actions"><button className="ghost" onClick={() => setI(0)}>Replay</button><button className="go" onClick={onClose}>Back to the desk</button></div>
          : <span>Tap to continue</span>}
      </div>
    </div>
  );
}

function TradeCard({ t }: { t: R["best"] }) {
  const when = new Date(t.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className={`rv-card ${t.pnl >= 0 ? "pos" : "neg"}`}>
      <div className="rv-card-top"><b>{t.symbol}</b><span>{t.side}</span><span>{t.setup}</span><span className="dim">{when}</span></div>
      {t.note && <p>“{t.note}”</p>}
    </div>
  );
}
