import { useEffect, useMemo, useRef } from "react";
import type { Candle } from "../lib/types";
import type { JournalTrade } from "../lib/journal";
import { ema, lastValue, rsi } from "../lib/indicators";
import { price } from "../lib/format";
import { live } from "../lib/live";

type Props = {
  candles: Candle[];
  tf: string;
  showEma: boolean;
  showRsi: boolean;
  positions: JournalTrade[]; // journal trades for this symbol
  empty: string;
};

const C = {
  line: "#1f2a3c", dim: "#6f7f99", up: "#2ec27e", down: "#ff5a5f", amber: "#ffb02e",
  ink: "#0b0f17", panel: "#111826", ema9: "#7aa7ff", ema21: "#c792ea",
};

export function Chart({ candles, tf, showEma, showRsi, positions, empty }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const closes = useMemo(() => candles.map((c) => c.c), [candles]);
  const e9 = useMemo(() => ema(closes, 9), [closes]);
  const e21 = useMemo(() => ema(closes, 21), [closes]);
  const rs = useMemo(() => rsi(closes, 14), [closes]);

  useEffect(() => {
    live.set({ rsi: lastValue(rs), ema9: lastValue(e9), ema21: lastValue(e21) });
  }, [rs, e9, e21]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const draw = () => paint(cv, candles.slice(-120), e9.slice(-120), e21.slice(-120), rs.slice(-120), tf, showEma, showRsi, positions, empty);
    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    return () => ro.disconnect();
  }, [candles, e9, e21, rs, tf, showEma, showRsi, positions, empty]);

  return <canvas ref={ref} className="chart-canvas" aria-label="Price chart" role="img" />;
}

function paint(cv: HTMLCanvasElement, cs: Candle[], e9: (number | null)[], e21: (number | null)[], rs: (number | null)[],
  tf: string, showEma: boolean, showRsi: boolean, positions: JournalTrade[], empty: string) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  const W = r.width, H = r.height, padR = 76, padB = 22, padT = 10;
  if (!cs.length) { ctx.fillStyle = C.dim; ctx.fillText(empty, 12, 24); return; }
  const rsiH = showRsi ? 72 : 0, gap = showRsi ? 10 : 0;
  const volH = (H - padB - rsiH - gap) * 0.16;
  const plotW = W - padR - 8, priceH = H - padB - rsiH - gap - volH - padT - 6;
  const volBase = padT + priceH + 6 + volH;
  const hi = Math.max(...cs.map((c) => c.h)), lo = Math.min(...cs.map((c) => c.l));
  const pad = (hi - lo) * 0.06 || hi * 0.001;
  const top = hi + pad, bot = lo - pad, y = (p: number) => padT + ((top - p) / (top - bot)) * priceH;
  const n = cs.length, step = plotW / n, bw = Math.max(1, step * 0.62), X = (i: number) => 8 + i * step + step / 2;
  const vmax = Math.max(...cs.map((c) => c.v || 0)) || 1;

  // grid + price axis
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const p = bot + ((top - bot) * i) / 5, yy = Math.round(y(p)) + 0.5;
    ctx.beginPath(); ctx.moveTo(8, yy); ctx.lineTo(8 + plotW, yy); ctx.stroke(); ctx.fillText(price(p), plotW + 14, yy);
  }
  // time axis
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const every = Math.ceil(n / 6);
  cs.forEach((c, i) => {
    if (i % every || X(i) < 24) return;
    const d = new Date(c.t);
    const lab = tf === "1D" || tf === "4H" ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    ctx.fillText(lab, X(i), H - padB + 6);
  });
  // candles + volume
  cs.forEach((c, i) => {
    const x = X(i), col = c.c >= c.o ? C.up : C.down;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, y(c.h)); ctx.lineTo(Math.round(x) + 0.5, y(c.l)); ctx.stroke();
    const yo = y(c.o), yc = y(c.c);
    ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    const vh = ((c.v || 0) / vmax) * volH;
    ctx.globalAlpha = 0.35; ctx.fillRect(x - bw / 2, volBase - vh, bw, vh); ctx.globalAlpha = 1;
  });
  const line = (arr: (number | null)[], col: string, yf: (v: number) => number) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); let on = false;
    arr.forEach((v, i) => { if (v == null) return; const yy = yf(v); if (on) ctx.lineTo(X(i), yy); else ctx.moveTo(X(i), yy); on = true; });
    ctx.stroke(); ctx.lineWidth = 1;
  };
  if (showEma) { line(e9, C.ema9, y); line(e21, C.ema21, y); }
  if (showRsi) {
    const rt = volBase + gap, ry = (v: number) => rt + ((100 - v) / 100) * rsiH;
    ctx.fillStyle = "rgba(255,176,46,.06)"; ctx.fillRect(8, ry(70), plotW, ry(30) - ry(70));
    ctx.strokeStyle = C.line;
    [30, 50, 70].forEach((v) => { const yy = Math.round(ry(v)) + 0.5; ctx.beginPath(); ctx.moveTo(8, yy); ctx.lineTo(8 + plotW, yy); ctx.stroke(); });
    ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    [30, 70].forEach((v) => ctx.fillText(String(v), plotW + 14, ry(v)));
    ctx.fillText("RSI", plotW + 40, ry(50));
    line(rs, C.amber, ry);
  }
  // journal markers
  const idxAt = (iso: string) => { const ts = Date.parse(iso); if (!(ts >= cs[0].t)) return -1; let k = -1; cs.forEach((c, i) => { if (c.t <= ts) k = i; }); return k; };
  positions.forEach((t) => {
    const col = t.side === "long" ? C.up : C.down;
    if (t.status === "open" && t.entry <= top && t.entry >= bot) {
      const ey = Math.round(y(t.entry)) + 0.5;
      ctx.strokeStyle = col; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(8, ey); ctx.lineTo(8 + plotW, ey); ctx.stroke(); ctx.setLineDash([]);
      const lab = `${t.side === "long" ? "L" : "S"} ${t.qty} @ ${price(t.entry)}`, w = ctx.measureText(lab).width + 10;
      ctx.fillStyle = C.panel; ctx.fillRect(10, ey - 9, w, 18); ctx.strokeStyle = col; ctx.strokeRect(10.5, ey - 8.5, w - 1, 17);
      ctx.fillStyle = col; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(lab, 15, ey);
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
      if (xi >= 0) { ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(xi), Math.max(padT + 5, Math.min(padT + priceH - 5, y(t.exit))), 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
    }
  });
  // last price tag
  const lc = cs[n - 1], ly = Math.round(y(lc.c)) + 0.5, lcol = lc.c >= lc.o ? C.up : C.down;
  ctx.setLineDash([3, 3]); ctx.strokeStyle = lcol; ctx.beginPath(); ctx.moveTo(8, ly); ctx.lineTo(8 + plotW, ly); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = lcol; ctx.fillRect(plotW + 10, ly - 9, padR - 12, 18);
  ctx.fillStyle = C.ink; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(price(lc.c), plotW + 14, ly);
}
