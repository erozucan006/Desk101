import { useEffect, useRef } from "react";
import type { Candle } from "../lib/types";

// 4×4 Bayer matrix: ordered dithering gives the engraved, dotted look.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** The price history drawn as a dithered engraving: an area under the closes, lit from the line down. */
export function DitherChart({ candles, cell = 3, color = "#f2f0ea", reveal = true }: { candles: Candle[]; cell?: number; color?: string; reveal?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);

  useEffect(() => {
    const cv = ref.current; if (!cv || candles.length < 10) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, dead = false;

    const paint = (progress: number) => {
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
      const ctx = cv.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
      const cols = Math.floor(r.width / cell), rows = Math.floor(r.height / cell);
      const cl = candles.map((c) => c.c), lo = Math.min(...candles.map((c) => c.l)), hi = Math.max(...candles.map((c) => c.h));
      const at = (x: number) => { const f = (x / Math.max(1, cols - 1)) * (cl.length - 1), i = Math.floor(f), t = f - i; return cl[i] + ((cl[Math.min(i + 1, cl.length - 1)] - cl[i]) * t); };
      const rowOf = (p: number) => rows * 0.12 + (1 - (p - lo) / (hi - lo || 1)) * rows * 0.8;
      ctx.fillStyle = color;
      const until = Math.floor(cols * progress);
      for (let x = 0; x < until; x++) {
        const top = rowOf(at(x));
        for (let y = Math.max(0, Math.floor(top) - 1); y < rows; y++) {
          const d = y - top;
          // bright at the price line, fading into the dark towards the bottom; a faint halo just above it
          const v = d < 0 ? Math.max(0, 0.5 + d * 0.5) : Math.max(0, 0.95 - (d / (rows - top + 1)) * 1.05);
          if (v > BAYER[(y % 4) * 4 + (x % 4)]) ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }
      }
    };

    if (reduce || drawn.current || !reveal) { paint(1); drawn.current = true; }
    else {
      const t0 = performance.now(), dur = 1600;
      const step = (now: number) => {
        if (dead) return;
        const k = Math.min(1, (now - t0) / dur);
        paint(1 - Math.pow(1 - k, 3));
        if (k < 1) raf = requestAnimationFrame(step); else drawn.current = true;
      };
      raf = requestAnimationFrame(step);
    }
    const ro = new ResizeObserver(() => { if (drawn.current) paint(1); });
    ro.observe(cv);
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [candles.length > 10 ? candles[candles.length - 1].t : 0, cell, color]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} className="dither" aria-hidden="true" />;
}
