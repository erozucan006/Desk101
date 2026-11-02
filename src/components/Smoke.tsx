import { useEffect, useRef } from "react";

// Slow monochrome smoke: domain-warped value noise rendered at low resolution and scaled up
// (the browser's smoothing does the softening). Cheap enough to run behind the UI.

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) {
  let v = 0, amp = 0.5;
  for (let i = 0; i < 4; i++) { v += amp * noise(x, y); x *= 2.03; y *= 2.03; amp *= 0.5; }
  return v;
}

export function Smoke({ intensity = 1, tint = [242, 240, 234], className = "" }: { intensity?: number; tint?: [number, number, number]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const W = 120, H = 72;
    cv.width = W; cv.height = H;
    const img = ctx.createImageData(W, H);
    let raf = 0, last = 0, visible = true;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || now - last < 50) return; // ~20 fps is plenty for smoke
      last = now;
      const t = now / 1000 * 0.06;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const nx = x / W * 3, ny = y / H * 1.8;
          // two rounds of domain warping give the curling, fluid look
          const qx = fbm(nx + t, ny - t * 0.6), qy = fbm(nx - t * 0.7 + 5.2, ny + 1.3);
          const v = fbm(nx + 2.2 * qx + t * 0.5, ny + 2.2 * qy);
          // contrast curve: mostly black, bright wisps
          const k = Math.max(0, Math.min(1, (v - 0.42) * 2.6));
          const a = Math.pow(k, 1.6) * 255 * intensity;
          const i = (y * W + x) * 4;
          img.data[i] = tint[0]; img.data[i + 1] = tint[1]; img.data[i + 2] = tint[2]; img.data[i + 3] = a;
        }
      }
      ctx.putImageData(img, 0, 0);
      if (reduce) cancelAnimationFrame(raf); // one still frame
    };
    raf = requestAnimationFrame(draw);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(cv);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [intensity, tint[0], tint[1], tint[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className={`smoke ${className}`} aria-hidden="true" />;
}
