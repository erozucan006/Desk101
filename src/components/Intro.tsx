import { useEffect, useRef, useState } from "react";
import { price } from "../lib/format";

/**
 * Opening sequence, once per browser session: black screen, the logo, the live BTC price counting up,
 * then the desk lights up from the centre. Click or any key skips it.
 */
export function Intro({ last, quote, onDone }: { last?: number; quote: string; onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [shown, setShown] = useState<number | null>(null);
  const target = useRef<number | undefined>(last);
  target.current = last;
  const started = useRef(false);

  // count up once the first price arrives
  useEffect(() => {
    if (last == null || started.current) return;
    started.current = true;
    const t0 = performance.now(), from = last * 0.82, dur = 900;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      setShown(from + ((target.current ?? last) - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [last]);

  useEffect(() => {
    const out = setTimeout(() => setPhase("out"), 2300);
    const done = setTimeout(onDone, 3200);
    const skip = () => { setPhase("out"); setTimeout(onDone, 500); };
    window.addEventListener("keydown", skip, { once: true });
    return () => { clearTimeout(out); clearTimeout(done); window.removeEventListener("keydown", skip); };
  }, [onDone]);

  return (
    <div className={`intro ${phase}`} onClick={() => { setPhase("out"); setTimeout(onDone, 500); }} role="presentation">
      <div className="intro-mark">
        <svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#f4e04d" />
          <g fill="#0a0a0a">
            <rect className="c1" x="7.4" y="13" width="1.4" height="13" rx=".7" /><rect className="c1" x="5.6" y="16" width="5" height="7" rx="1" />
            <rect className="c2" x="15.3" y="9" width="1.4" height="15" rx=".7" /><rect className="c2" x="13.5" y="11.5" width="5" height="9" rx="1" />
            <rect className="c3" x="23.2" y="5" width="1.4" height="17" rx=".7" /><rect className="c3" x="21.4" y="7" width="5" height="11" rx="1" />
          </g>
        </svg>
        <div className="intro-word">Desk<em>101</em></div>
      </div>
      <div className="intro-price" aria-live="off">
        <span className="dim">BTC/{quote}</span> {shown != null ? price(shown) : "connecting…"}
      </div>
    </div>
  );
}
