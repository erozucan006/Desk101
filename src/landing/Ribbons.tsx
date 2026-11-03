import { useEffect, useRef } from "react";

/**
 * Hero background: silk-like ribbons of light drawn from real price history.
 * Every ribbon follows the same closes with a small lag and its own wave, so together they
 * look like one market moving; the light turns green where price was rising and red where it fell.
 * Scrolling twists and lifts them. Pauses off screen; a still frame for reduced motion.
 */
export function Ribbons({ closes }: { closes: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const data = useRef<number[]>([]);
  data.current = closes;

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, raf = 0, last = 0, visible = true;
    const N = 34, S = 180;

    const resize = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // price path normalised to -1..1, smoothed; synthetic waves until real data arrives
    const pathAt = (cl: number[]) => {
      if (cl.length < 20) return Array.from({ length: S }, (_, i) => Math.sin(i / 23) * 0.5 + Math.sin(i / 9) * 0.15);
      const out: number[] = [];
      for (let i = 0; i < S; i++) {
        const f = (i / (S - 1)) * (cl.length - 1), a = Math.floor(f), t = f - a;
        out.push(cl[a] + ((cl[Math.min(a + 1, cl.length - 1)] - cl[a]) * t));
      }
      const lo = Math.min(...out), hi = Math.max(...out), m = (lo + hi) / 2, h = (hi - lo) / 2 || 1;
      const n = out.map((v) => (v - m) / h);
      return n.map((_, i) => { let s = 0, k = 0; for (let j = -4; j <= 4; j++) { const v = n[i + j]; if (v != null) { s += v; k++; } } return s / k; });
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || (now - last < 33 && !reduce)) return;
      last = now;
      const t = reduce ? 0 : now / 1000;
      const scroll = Math.min(1.5, window.scrollY / Math.max(1, H));
      const p = pathAt(data.current);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      // colour along x follows the direction of price
      const g = ctx.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 12; i++) {
        const a = Math.floor((i / 12) * (S - 8)), d = p[Math.min(S - 1, a + 8)] - p[a];
        const c = d > 0.08 ? "69, 214, 160" : d < -0.08 ? "255, 122, 107" : "242, 240, 234";
        g.addColorStop(i / 12, `rgba(${c}, 1)`);
      }

      const cy = H * (0.58 - scroll * 0.18), amp = H * 0.2;
      for (let k = 0; k < N; k++) {
        const u = k / (N - 1) - 0.5; // -0.5..0.5 across the bundle
        const lag = Math.round(u * 10);
        ctx.beginPath();
        for (let i = 0; i < S; i++) {
          const x = (i / (S - 1)) * W * 1.2 - W * 0.1;
          const fx = i / (S - 1);
          // the bundle is tight at the edges and fans out in the middle-right, twisting over time
          const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, fx * 1.1 - 0.05))), 2);
          const twist = Math.sin(t * 0.35 + fx * 5.2 + scroll * 2.4) * (0.6 + scroll * 0.8);
          const y = cy
            - (p[Math.min(S - 1, Math.max(0, i - lag))] ?? 0) * amp
            + u * H * 0.42 * env * twist
            + Math.sin(fx * 9 + t * 0.6 + k * 0.35) * 6 * env;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        const core = 1 - Math.abs(u) * 1.7; // brighter in the middle of the bundle
        ctx.strokeStyle = g;
        ctx.globalAlpha = 0.05 * Math.max(0.2, core); ctx.lineWidth = 6; ctx.stroke();
        ctx.globalAlpha = 0.34 * Math.max(0.12, core); ctx.lineWidth = 1; ctx.stroke();
      }

      // a few sparks travelling along the bundle
      ctx.globalAlpha = 1;
      for (let s = 0; s < 22; s++) {
        const fx = ((s * 0.137 + t * 0.03 * (1 + (s % 3) * 0.4)) % 1.1);
        const i = Math.min(S - 1, Math.floor(fx * (S - 1)));
        const u = ((s * 0.618) % 1) - 0.5;
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, fx * 1.1 - 0.05))), 2);
        const twist = Math.sin(t * 0.35 + fx * 5.2 + scroll * 2.4) * (0.6 + scroll * 0.8);
        const x = fx * W * 1.2 - W * 0.1, y = cy - (p[i] ?? 0) * amp + u * H * 0.42 * env * twist;
        const a = 0.25 + 0.5 * Math.abs(Math.sin(t * 1.3 + s));
        ctx.fillStyle = `rgba(242, 240, 234, ${a * env})`;
        ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (reduce) cancelAnimationFrame(raf);
    };

    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(cv);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  return <canvas ref={ref} className="ribbons" aria-hidden="true" />;
}
