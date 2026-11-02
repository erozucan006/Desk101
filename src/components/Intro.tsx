import { useEffect, useState } from "react";
import { price } from "../lib/format";
import { Smoke } from "./Smoke";

function greeting(h = new Date().getHours()) {
  return h < 5 ? "Late night, trader." : h < 12 ? "Good morning, trader." : h < 18 ? "Good afternoon, trader." : "Good evening, trader.";
}

/**
 * Opening sequence, once per browser session: smoke drifting on a dark screen, a greeting written in
 * word by word, a thin loading line, then the desk fades up. Click or any key skips it.
 */
export function Intro({ last, quote, onDone }: { last?: number; quote: string; onDone: () => void }) {
  const [out, setOut] = useState(false);
  const words = greeting().split(" ");

  useEffect(() => {
    const a = setTimeout(() => setOut(true), 2900);
    const b = setTimeout(onDone, 3700);
    const skip = () => { setOut(true); setTimeout(onDone, 450); };
    window.addEventListener("keydown", skip, { once: true });
    return () => { clearTimeout(a); clearTimeout(b); window.removeEventListener("keydown", skip); };
  }, [onDone]);

  return (
    <div className={`intro ${out ? "out" : ""}`} onClick={() => { setOut(true); setTimeout(onDone, 450); }} role="presentation">
      <Smoke intensity={0.5} className="intro-smoke" />
      <h1 className="intro-hello" aria-label={words.join(" ")}>
        {words.map((w, i) => <span key={i} style={{ ["--i" as string]: i }}>{w}</span>)}
      </h1>
      <div className="intro-line" aria-hidden="true"><i /></div>
      <div className="intro-price" aria-live="off">
        <span className="dim">BTC/{quote}</span> {last != null ? price(last) : "connecting…"}
      </div>
    </div>
  );
}
