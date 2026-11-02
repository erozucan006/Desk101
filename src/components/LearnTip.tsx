import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LEARN } from "../lib/learn";
import { useLive } from "../lib/hooks";

/** Learn mode on a desktop: hovering anything explainable shows a short note beside it. Click opens the full explanation. */
export function LearnTip() {
  const ctx = useLive();
  const [tip, setTip] = useState<{ key: string; r: DOMRect } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-learn]");
      if (el && (el.closest(".learn") || !LEARN[el.dataset.learn!])) return;
      clearTimeout(timer.current);
      if (!el) { timer.current = setTimeout(() => setTip(null), 80); return; }
      const key = el.dataset.learn!, r = el.getBoundingClientRect();
      timer.current = setTimeout(() => setTip((t) => (t?.key === key && t.r.top === r.top ? t : { key, r })), 110);
    };
    const hide = () => setTip(null);
    document.addEventListener("pointerover", over);
    window.addEventListener("scroll", hide, true);
    document.addEventListener("click", hide, true);
    return () => { clearTimeout(timer.current); document.removeEventListener("pointerover", over); window.removeEventListener("scroll", hide, true); document.removeEventListener("click", hide, true); };
  }, []);

  // place below the element, or above when there is no room; keep inside the viewport
  useLayoutEffect(() => {
    if (!tip || !box.current) { setPos(null); return; }
    const w = box.current.offsetWidth, h = box.current.offsetHeight, m = 10;
    const x = Math.min(Math.max(m, tip.r.left + tip.r.width / 2 - w / 2), window.innerWidth - w - m);
    const below = tip.r.bottom + 10 + h < window.innerHeight;
    setPos({ x, y: below ? tip.r.bottom + 10 : tip.r.top - 10 - h, above: !below });
  }, [tip]);

  if (!tip) return null;
  const e = LEARN[tip.key];
  const now = e.now?.(ctx) ?? null;
  return (
    <div ref={box} className={`ltip ${pos ? "on" : ""} ${pos?.above ? "above" : ""}`} role="tooltip" style={pos ? { left: pos.x, top: pos.y } : { left: -9999, top: 0 }}>
      <b>{e.title}</b>
      <p>{e.what}</p>
      {now && <p className="ltip-now">{now}</p>}
      <span className="ltip-more">Click for how to read it</span>
    </div>
  );
}
