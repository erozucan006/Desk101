import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import type { Candle } from "../lib/types";
import type { JournalTrade } from "../lib/journal";
import { ema, lastValue, rsi } from "../lib/indicators";
import { compact, pct, price } from "../lib/format";
import { live } from "../lib/live";

type Props = {
  candles: Candle[];
  tf: string;
  viewKey: string; // resets zoom/scroll when the pair or timeframe changes
  showEma: boolean;
  showRsi: boolean;
  positions: JournalTrade[]; // journal trades for this symbol
  orders?: ChartOrder[]; // resting paper orders for this symbol
  events?: ChartEvent[]; // macro releases to mark on the time axis
  empty: string;
  /** Content of the popup shown when a release marker is clicked. */
  renderEvent?: (ids: string[], close: () => void) => ReactNode;
};

export type ChartEvent = { t: number; label: string; id: string };
type EvHit = { x: number; xs: number[]; lx: number; w: number; ids: string[] };
export type ChartOrder = { price: number; label: string; kind: "limit" | "stop" | "sl" | "tp" };

const C = {
  line: "rgba(44,53,66,.55)", dim: "#7a8594", up: "#1fb57a", down: "#f0525c", amber: "#e9b23f",
  ink: "#0e1217", panel: "#141920", ema9: "#5aa2ff", ema21: "#c4a0ff", rsi: "#a08bff", blue: "#4b8bff", cross: "rgba(174,183,196,.55)",
};
const MIN_VISIBLE = 20;
const DEFAULT_VISIBLE = 150;
/** Default zoom: 150 candles on a desktop, fewer on a phone so candles and release markers stay readable. */
const defaultCount = (w?: number) => (w ? Math.max(40, Math.min(DEFAULT_VISIBLE, Math.round((w - PAD_L - PAD_R) / 5))) : DEFAULT_VISIBLE);
const PAD_L = 8, PAD_R = 78, PAD_B = 22, PAD_T = 10;

/** Geometry of the last paint, used by the mouse handlers. */
type Layout = { plotW: number; step: number; from: number; cnt: number; n: number; priceTop: number; priceH: number; top: number; bot: number; H: number; ev: EvHit[]; evY: number };

/** A "nice" axis step (1, 2, 2.5, 5 × 10^k) for about `target` ticks. */
export function niceStep(range: number, target = 6): number {
  const raw = range / target, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

/** Visible window [from, to) for a series of n candles. */
export function viewWindow(n: number, count: number, end: number) {
  const cnt = Math.max(Math.min(MIN_VISIBLE, n), Math.min(n, Math.round(count)));
  const e = Math.max(0, Math.min(n - cnt, Math.round(end)));
  return { from: n - e - cnt, to: n - e, cnt, end: e };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function timeLabel(t: number, tf: string, prev: number | null) {
  const d = new Date(t), p = prev != null ? new Date(prev) : null;
  if (tf === "1W") return p && p.getFullYear() === d.getFullYear() ? MON[d.getMonth()] : String(d.getFullYear());
  if (tf === "1D") return p && p.getFullYear() !== d.getFullYear() ? String(d.getFullYear()) : `${d.getDate()} ${MON[d.getMonth()]}`;
  if (p && p.toDateString() !== d.toDateString()) return `${d.getDate()} ${MON[d.getMonth()]}`;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fullTime(t: number, tf: string) {
  const d = new Date(t);
  const date = `${d.getDate()} ${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return tf === "1D" || tf === "1W" ? date : `${date} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function Chart({ candles, tf, viewKey, showEma, showRsi, positions, orders = [], events = [], empty, renderEvent }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layout = useRef<Layout | null>(null);
  const drag = useRef<{ x: number; end: number; moved: boolean } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>()); // active pointers (fingers)
  const pinch = useRef<{ d0: number; cnt0: number; anchor: number; f: number } | null>(null);
  const [count, setCount] = useState(() => defaultCount(typeof window !== "undefined" ? Math.min(window.innerWidth, 1200) : undefined));
  const [end, setEnd] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openEv, setOpenEv] = useState<{ ids: string[]; x: number } | null>(null);
  const [overEv, setOverEv] = useState(false);

  const closes = useMemo(() => candles.map((c) => c.c), [candles]);
  const e9 = useMemo(() => ema(closes, 9), [closes]);
  const e21 = useMemo(() => ema(closes, 21), [closes]);
  const rs = useMemo(() => rsi(closes, 14), [closes]);
  const n = candles.length;
  const win = viewWindow(n, count, end);

  useEffect(() => { live.set({ rsi: lastValue(rs), ema9: lastValue(e9), ema21: lastValue(e21) }); }, [rs, e9, e21]);

  // New pair or timeframe: back to the default view at the latest candle.
  useEffect(() => { setCount(defaultCount(ref.current?.clientWidth)); setEnd(0); setHover(null); setOpenEv(null); }, [viewKey]);

  /** Release marker under a point (its label at the top, or near its line). */
  const evAt = (p: { x: number; y: number }) => {
    const L = layout.current; if (!L || !renderEvent) return null;
    // Labels can overlap when releases are close together: merge everything under the point.
    const pad = 6; // generous for fingers
    const h = L.ev.find((h) => p.y >= L.evY - pad && p.y <= L.evY + 14 + pad && p.x >= h.lx - pad && p.x <= h.lx + h.w + pad) ??
      L.ev.find((h) => h.xs.some((x) => Math.abs(p.x - x) <= 4) && p.y > L.evY && p.y < L.H - PAD_B);
    return h ? { x: h.x, ids: h.ids } : null;
  };

  // When scrolled back in history, keep the same candles in view as new ones arrive.
  const prevN = useRef(n);
  useEffect(() => {
    const added = n - prevN.current;
    if (added > 0 && added < 5 && end > 0) setEnd((e) => e + added);
    prevN.current = n;
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  const hoverIdx = useMemo(() => {
    const L = layout.current;
    if (!hover || !L || dragging) return null;
    const i = Math.floor((hover.x - PAD_L) / (L.plotW / win.cnt)); // current window, not the last paint
    return i >= 0 && i < win.cnt ? win.from + i : null;
  }, [hover, dragging, win.from, win.cnt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const draw = () => {
      layout.current = paint(cv, candles, win.from, win.to, e9, e21, rs, tf, showEma, showRsi, positions, orders, events, empty, hover && !dragging ? hover : null, openEv?.ids ?? null);
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    return () => ro.disconnect();
  }, [candles, win.from, win.to, e9, e21, rs, tf, showEma, showRsi, positions, orders, events, empty, hover, dragging, openEv]);

  // Wheel: zoom around the cursor; horizontal scroll pans. Registered non-passive to stop page scroll.
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const onWheel = (ev: WheelEvent) => {
      const L = layout.current; if (!L || !L.n) return;
      ev.preventDefault();
      if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
        const shift = Math.round(ev.deltaX / Math.max(2, L.step));
        if (shift) setEnd((e) => viewWindow(L.n, L.cnt, e - shift).end);
        return;
      }
      const rect = cv.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (ev.clientX - rect.left - PAD_L) / L.plotW));
      const factor = ev.deltaY > 0 ? 1.15 : 1 / 1.15;
      const newCnt = Math.max(MIN_VISIBLE, Math.min(L.n, Math.round(L.cnt * factor)));
      const anchor = L.from + f * L.cnt;
      const newFrom = Math.round(anchor - f * newCnt);
      setCount(newCnt);
      setEnd(viewWindow(L.n, newCnt, L.n - newFrom - newCnt).end);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, []);

  // Safari on iOS fires its own page-zoom gestures; keep two-finger gestures for the chart.
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const stop = (e: Event) => e.preventDefault();
    cv.addEventListener("gesturestart", stop);
    cv.addEventListener("gesturechange", stop);
    return () => { cv.removeEventListener("gesturestart", stop); cv.removeEventListener("gesturechange", stop); };
  }, []);

  const zoom = (factor: number) => {
    setCount((c) => Math.max(MIN_VISIBLE, Math.min(n, Math.round(viewWindow(n, c, end).cnt * factor))));
  };
  const local = (ev: RPointerEvent) => { const r = ev.currentTarget.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

  const hc = hoverIdx != null ? candles[hoverIdx] : candles[win.to - 1];
  const prevC = hoverIdx != null ? candles[hoverIdx - 1] : candles[win.to - 2];
  const atStart = n > 0 && win.from === 0 && n >= 700;

  return (
    <>
      <canvas ref={ref} className={`chart-canvas ${dragging ? "grabbing" : overEv ? "on-ev" : ""}`} aria-label="Price chart. Scroll or pinch to zoom, drag to move through history." role="img"
        onPointerDown={(ev) => {
          if (ev.pointerType === "mouse" && ev.button !== 0) return;
          ev.currentTarget.setPointerCapture(ev.pointerId);
          pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
          const L = layout.current;
          if (pts.current.size === 2 && L) {
            // second finger down: start a pinch anchored at the midpoint between the fingers
            const [a, b] = [...pts.current.values()];
            const mid = (a.x + b.x) / 2 - ev.currentTarget.getBoundingClientRect().left;
            const f = Math.min(1, Math.max(0, (mid - PAD_L) / L.plotW));
            pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), cnt0: L.cnt, anchor: L.from + f * L.cnt, f };
            drag.current = null; setDragging(false); setHover(null);
            return;
          }
          drag.current = { x: ev.clientX, end: win.end, moved: false };
        }}
        onPointerMove={(ev) => {
          if (pts.current.has(ev.pointerId)) pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
          const P = pinch.current, L = layout.current;
          if (P && L && pts.current.size >= 2) {
            const [a, b] = [...pts.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 10) return;
            const newCnt = Math.max(MIN_VISIBLE, Math.min(L.n, Math.round((P.cnt0 * P.d0) / d)));
            const newFrom = Math.round(P.anchor - P.f * newCnt);
            setCount(newCnt);
            setEnd(viewWindow(L.n, newCnt, L.n - newFrom - newCnt).end);
            return;
          }
          const dr = drag.current;
          if (dr && L) {
            const dx = ev.clientX - dr.x;
            if (Math.abs(dx) > 3) { dr.moved = true; setDragging(true); }
            if (dr.moved) setEnd(viewWindow(L.n, L.cnt, dr.end + Math.round(dx / Math.max(2, L.step))).end);
            return;
          }
          if (ev.pointerType === "mouse") { const p = local(ev); setHover(p); setOverEv(!!evAt(p)); }
        }}
        onPointerUp={(ev) => {
          const wasPinch = !!pinch.current;
          pts.current.delete(ev.pointerId);
          if (pts.current.size < 2) pinch.current = null;
          if (wasPinch) {
            // one finger lifted: keep panning with the other one without a jump
            const rest = [...pts.current.values()][0];
            drag.current = rest ? { x: rest.x, end: win.end, moved: true } : null;
            if (!rest) setDragging(false);
            return;
          }
          const moved = drag.current?.moved;
          drag.current = null; setDragging(false);
          if (moved) { ev.preventDefault(); return; }
          const p = local(ev), hit = evAt(p);
          if (hit) { setOpenEv({ ids: hit.ids, x: hit.x }); return; }
          if (openEv) setOpenEv(null);
          if (ev.pointerType !== "mouse") setHover(p); // tap shows the crosshair and readout
        }}
        onPointerCancel={(ev) => { pts.current.delete(ev.pointerId); pinch.current = null; drag.current = null; setDragging(false); }}
        onPointerLeave={(ev) => { if (ev.pointerType === "mouse" && !drag.current) setHover(null); }}
        onDoubleClick={() => { setCount(defaultCount(ref.current?.clientWidth)); setEnd(0); }}
      />
      {hc && (
        <div className="ohlc" aria-live="off">
          <span className="dim">{fullTime(hc.t, tf)}</span>
          <span>O <b>{price(hc.o)}</b></span><span>H <b>{price(hc.h)}</b></span><span>L <b>{price(hc.l)}</b></span>
          <span>C <b className={hc.c >= hc.o ? "up" : "dn"}>{price(hc.c)}</b></span>
          {prevC && <span className={hc.c >= prevC.c ? "up" : "dn"}>{pct((hc.c / prevC.c - 1) * 100)}</span>}
          <span className="dim">Vol {compact(hc.v)}</span>
        </div>
      )}
      <div className="chart-tools">
        {win.end > 0 && <button className="latest" onClick={() => setEnd(0)} title="Jump to the latest candle">Latest →</button>}
        <button onClick={() => zoom(1.4)} title="Zoom out (or scroll down)" aria-label="Zoom out">−</button>
        <button onClick={() => zoom(1 / 1.4)} title="Zoom in (or scroll up)" aria-label="Zoom in">+</button>
        <button onClick={() => { setCount(defaultCount(ref.current?.clientWidth)); setEnd(0); }} title="Reset view (or double-click the chart)" aria-label="Reset view">⟲</button>
        <span className="dim">{win.cnt}/{n}</span>
      </div>
      {openEv && renderEvent && (
        <div className="ev-pop" role="dialog" aria-label="Release and market reaction" style={{ ["--ev-x" as string]: `${openEv.x}px` }} onPointerDown={(e) => e.stopPropagation()}>
          {renderEvent(openEv.ids, () => setOpenEv(null))}
        </div>
      )}
      {atStart && <div className="chart-hint">{tf === "1W" ? "Start of the history Kraken provides for this pair." : `Start of available history for ${tf}. Switch to a higher timeframe to see further back.`}</div>}
    </>
  );
}

function paint(cv: HTMLCanvasElement, all: Candle[], from: number, to: number, E9: (number | null)[], E21: (number | null)[], RS: (number | null)[],
  tf: string, showEma: boolean, showRsi: boolean, positions: JournalTrade[], orders: ChartOrder[], events: ChartEvent[], empty: string,
  hover: { x: number; y: number } | null, selEv: string[] | null): Layout | null {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
  const FONT = "500 11px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.font = FONT;
  const W = r.width, H = r.height;
  const cs = all.slice(from, to), e9 = E9.slice(from, to), e21 = E21.slice(from, to), rs = RS.slice(from, to);
  if (!cs.length) { ctx.fillStyle = C.dim; ctx.fillText(empty, 12, 24); return null; }
  const priceTop = PAD_T + 22; // leave room for the OHLC readout
  const rsiH = showRsi ? 72 : 0, gap = showRsi ? 10 : 0;
  const volH = (H - PAD_B - rsiH - gap) * 0.14;
  const plotW = W - PAD_R - PAD_L, priceH = H - PAD_B - rsiH - gap - volH - priceTop - 6;
  const volBase = priceTop + priceH + 6 + volH;
  const latest = all[all.length - 1];
  let hi = Math.max(...cs.map((c) => c.h)), lo = Math.min(...cs.map((c) => c.l));
  // stretch the range to show nearby order and entry levels (within 12% of the last visible close)
  const lastC = cs[cs.length - 1].c;
  [...orders.map((o) => o.price), ...positions.filter((t) => t.status === "open").map((t) => t.entry)]
    .filter((p) => Math.abs(p / lastC - 1) < 0.12).forEach((p) => { hi = Math.max(hi, p); lo = Math.min(lo, p); });
  const pad = (hi - lo) * 0.06 || hi * 0.001;
  const top = hi + pad, bot = lo - pad, y = (p: number) => priceTop + ((top - p) / (top - bot)) * priceH;
  const n = cs.length, step = plotW / n, bw = Math.max(1, Math.min(18, step * 0.66)), X = (i: number) => PAD_L + i * step + step / 2;
  const vmax = Math.max(...cs.map((c) => c.v || 0)) || 1;

  // grid + price axis on round numbers
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const ps = niceStep(top - bot, Math.max(3, Math.round(priceH / 70)));
  for (let p = Math.ceil(bot / ps) * ps; p <= top; p += ps) {
    const yy = Math.round(y(p)) + 0.5;
    ctx.beginPath(); ctx.moveTo(PAD_L, yy); ctx.lineTo(PAD_L + plotW, yy); ctx.stroke(); ctx.fillText(price(p), plotW + PAD_L + 8, yy);
  }
  // time axis: a label about every 90px, with vertical grid lines
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const every = Math.max(1, Math.round(90 / step));
  let prevT: number | null = from > 0 ? all[from - 1].t : null;
  for (let i = 0; i < n; i++) {
    if ((from + i) % every) continue;
    const x = X(i);
    ctx.strokeStyle = "rgba(44,53,66,.3)"; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, priceTop); ctx.lineTo(Math.round(x) + 0.5, volBase); ctx.stroke();
    if (x > 24 && x < PAD_L + plotW - 20) ctx.fillText(timeLabel(cs[i].t, tf, prevT), x, H - PAD_B + 6);
    prevT = cs[i].t;
  }
  // macro events
  const span = all.length > 1 ? all[1].t - all[0].t : 3600_000;
  const evX = new Map<number, { labels: string[]; ids: string[] }>();
  const evHits: EvHit[] = [];
  // Markers only make sense when candles are wide enough to tell releases apart.
  if (tf !== "1W" && step >= 4) events.forEach((e) => {
    if (e.t < cs[0].t || e.t >= cs[n - 1].t + span) return;
    const i = Math.min(n - 1, Math.floor((e.t - cs[0].t) / span));
    const g = evX.get(i) ?? { labels: [], ids: [] };
    g.labels.push(e.label); g.ids.push(e.id); evX.set(i, g);
  });
  ctx.font = "600 10px 'IBM Plex Sans', system-ui, sans-serif";
  // On narrow screens the OHLC readout wraps to two lines; keep the labels below it.
  const evY = priceTop + (W < 600 ? 26 : 0);
  const groups = [...evX.entries()].sort((a, b) => a[0] - b[0]).map(([i, g]) => ({ x: Math.round(X(i)) + 0.5, labels: g.labels, ids: g.ids }));
  // Releases close together share one label ("PCE · ECB · GDP") instead of overprinting.
  type Cl = { xs: number[]; labels: string[]; ids: string[]; lx: number; w: number };
  const box = (c: Omit<Cl, "lx" | "w">) => {
    const w = ctx.measureText([...new Set(c.labels)].join(" · ")).width + 8, cx = (c.xs[0] + c.xs[c.xs.length - 1]) / 2;
    return { ...c, w, lx: Math.min(Math.max(PAD_L, cx - w / 2), PAD_L + plotW - w) };
  };
  const clusters: Cl[] = [];
  for (const g of groups) {
    const c = box({ xs: [g.x], labels: g.labels, ids: g.ids }), prev = clusters[clusters.length - 1];
    if (prev && c.lx < prev.lx + prev.w + 4) clusters[clusters.length - 1] = box({ xs: [...prev.xs, g.x], labels: [...prev.labels, ...g.labels], ids: [...prev.ids, ...g.ids] });
    else clusters.push(c);
  }
  clusters.forEach((c) => {
    const sel = selEv != null && c.ids.some((id) => selEv.includes(id));
    evHits.push({ x: (c.xs[0] + c.xs[c.xs.length - 1]) / 2, xs: c.xs, lx: c.lx, w: c.w, ids: [...new Set(c.ids)] });
    ctx.strokeStyle = sel ? "rgba(160,139,255,.95)" : "rgba(160,139,255,.45)"; ctx.setLineDash(sel ? [] : [2, 3]);
    c.xs.forEach((x) => { ctx.beginPath(); ctx.moveTo(x, evY + 14); ctx.lineTo(x, volBase); ctx.stroke(); });
    ctx.setLineDash([]);
    ctx.fillStyle = sel ? "rgba(160,139,255,.5)" : "rgba(160,139,255,.16)"; ctx.fillRect(c.lx, evY, c.w, 14);
    ctx.fillStyle = C.rsi; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText([...new Set(c.labels)].join(" · "), c.lx + c.w / 2, evY + 7);
  });
  ctx.font = FONT;
  // candles + volume
  cs.forEach((c, i) => {
    const x = X(i), col = c.c >= c.o ? C.up : C.down;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, y(c.h)); ctx.lineTo(Math.round(x) + 0.5, y(c.l)); ctx.stroke();
    const yo = y(c.o), yc = y(c.c);
    ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    const vh = ((c.v || 0) / vmax) * volH;
    ctx.globalAlpha = 0.3; ctx.fillRect(x - bw / 2, volBase - vh, bw, vh); ctx.globalAlpha = 1;
  });
  const line = (arr: (number | null)[], col: string, yf: (v: number) => number) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); let on = false;
    arr.forEach((v, i) => { if (v == null) return; const yy = yf(v); if (on) ctx.lineTo(X(i), yy); else ctx.moveTo(X(i), yy); on = true; });
    ctx.stroke(); ctx.lineWidth = 1;
  };
  ctx.save(); ctx.beginPath(); ctx.rect(PAD_L, priceTop, plotW, priceH); ctx.clip();
  if (showEma) { line(e9, C.ema9, y); line(e21, C.ema21, y); }
  ctx.restore();
  if (showRsi) {
    const rt = volBase + gap, ry = (v: number) => rt + ((100 - v) / 100) * rsiH;
    ctx.fillStyle = "rgba(160,139,255,.06)"; ctx.fillRect(PAD_L, ry(70), plotW, ry(30) - ry(70));
    ctx.strokeStyle = C.line;
    [30, 50, 70].forEach((v) => { const yy = Math.round(ry(v)) + 0.5; ctx.beginPath(); ctx.moveTo(PAD_L, yy); ctx.lineTo(PAD_L + plotW, yy); ctx.stroke(); });
    ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    [30, 70].forEach((v) => ctx.fillText(String(v), plotW + PAD_L + 8, ry(v)));
    ctx.fillText("RSI", plotW + PAD_L + 34, ry(50));
    line(rs, C.rsi, ry);
  }
  // journal markers
  const idxAt = (iso: string) => { const ts = Date.parse(iso); if (!(ts >= cs[0].t) || ts >= cs[n - 1].t + span) return -1; let k = -1; cs.forEach((c, i) => { if (c.t <= ts) k = i; }); return k; };
  positions.forEach((t) => {
    const col = t.side === "long" ? C.up : C.down;
    if (t.status === "open" && t.entry <= top && t.entry >= bot) {
      const ey = Math.round(y(t.entry)) + 0.5;
      ctx.strokeStyle = col; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(PAD_L, ey); ctx.lineTo(PAD_L + plotW, ey); ctx.stroke(); ctx.setLineDash([]);
      const lab = `${t.side === "long" ? "L" : "S"} ${t.qty} @ ${price(t.entry)}`, w = ctx.measureText(lab).width + 10;
      ctx.fillStyle = C.panel; ctx.fillRect(PAD_L + 2, ey - 9, w, 18); ctx.strokeStyle = col; ctx.strokeRect(PAD_L + 2.5, ey - 8.5, w - 1, 17);
      ctx.fillStyle = col; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(lab, PAD_L + 7, ey);
    }
    const ei = idxAt(t.entryAt);
    if (ei >= 0) {
      const c = cs[ei], x = X(ei); ctx.fillStyle = col; ctx.beginPath();
      if (t.side === "long") { const yy = y(c.l) + 4; ctx.moveTo(x, yy); ctx.lineTo(x - 5, yy + 8); ctx.lineTo(x + 5, yy + 8); }
      else { const yy = y(c.h) - 4; ctx.moveTo(x, yy); ctx.lineTo(x - 5, yy - 8); ctx.lineTo(x + 5, yy - 8); }
      ctx.closePath(); ctx.fill();
    }
    if (t.status === "closed" && t.exitAt && t.exit != null) {
      const xi = idxAt(t.exitAt);
      if (xi >= 0) { ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(xi), Math.max(priceTop + 5, Math.min(priceTop + priceH - 5, y(t.exit))), 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
    }
  });
  // resting orders
  const OC = { limit: C.amber, stop: C.blue, sl: C.down, tp: C.up };
  orders.forEach((o) => {
    if (o.price > top || o.price < bot) return;
    const oy = Math.round(y(o.price)) + 0.5, col = OC[o.kind];
    ctx.strokeStyle = col; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(PAD_L, oy); ctx.lineTo(PAD_L + plotW, oy); ctx.stroke(); ctx.setLineDash([]);
    const lab = `${o.label} ${price(o.price)}`, w = ctx.measureText(lab).width + 10;
    const lx = PAD_L + plotW - w - 4;
    ctx.fillStyle = C.panel; ctx.fillRect(lx, oy - 9, w, 18); ctx.strokeStyle = col; ctx.strokeRect(lx + 0.5, oy - 8.5, w - 1, 17);
    ctx.fillStyle = col; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(lab, lx + 5, oy);
  });
  // latest price tag (even when scrolled back, if it is within the visible range)
  if (latest.c <= top && latest.c >= bot) {
    const ly = Math.round(y(latest.c)) + 0.5, lcol = latest.c >= latest.o ? C.up : C.down;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = lcol; ctx.beginPath(); ctx.moveTo(PAD_L, ly); ctx.lineTo(PAD_L + plotW, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = lcol; ctx.fillRect(plotW + PAD_L + 2, ly - 9, PAD_R - 4, 18);
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(price(latest.c), plotW + PAD_L + 8, ly);
  }
  // crosshair
  if (hover && hover.x >= PAD_L && hover.x <= PAD_L + plotW && hover.y >= priceTop && hover.y <= H - PAD_B) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((hover.x - PAD_L) / step))), x = Math.round(X(i)) + 0.5;
    ctx.strokeStyle = C.cross; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, priceTop); ctx.lineTo(x, H - PAD_B); ctx.stroke();
    if (hover.y <= priceTop + priceH) { const hy = Math.round(hover.y) + 0.5; ctx.beginPath(); ctx.moveTo(PAD_L, hy); ctx.lineTo(PAD_L + plotW, hy); ctx.stroke(); }
    ctx.setLineDash([]);
    if (hover.y <= priceTop + priceH) {
      const pv = top - ((hover.y - priceTop) / priceH) * (top - bot);
      ctx.fillStyle = "#2c3542"; ctx.fillRect(plotW + PAD_L + 2, hover.y - 9, PAD_R - 4, 18);
      ctx.fillStyle = "#e6eaf0"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(price(pv), plotW + PAD_L + 8, hover.y);
    }
    const tl = fullTime(cs[i].t, tf), tw = ctx.measureText(tl).width + 12;
    const tx = Math.min(Math.max(PAD_L, x - tw / 2), PAD_L + plotW - tw);
    ctx.fillStyle = "#2c3542"; ctx.fillRect(tx, H - PAD_B + 2, tw, 18);
    ctx.fillStyle = "#e6eaf0"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(tl, tx + tw / 2, H - PAD_B + 5);
  }
  return { plotW, step, from, cnt: n, n: all.length, priceTop, priceH, top, bot, H, ev: evHits, evY };
}
