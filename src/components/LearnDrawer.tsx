import { LEARN } from "../lib/learn";
import { useLive } from "../lib/hooks";

/** The explanation itself; used in the slide-in drawer (small screens) and in the tutor rail (wide screens). */
export function LearnBody({ k, onClose, onAsk, inRail }: { k: string; onClose: () => void; onAsk?: (q: string) => void; inRail?: boolean }) {
  const ctx = useLive();
  const e = LEARN[k];
  if (!e) return null;
  const now = e.now?.(ctx) ?? null;
  return (
    <div className={inRail ? "learn-card" : "learn-in"} key={k}>
      <div className="learn-head"><span className="fk">?</span><h2>{e.title}</h2><button className="x" onClick={onClose} aria-label="Close explanation">×</button></div>
      {now && <div className="now"><span>Right now</span><p>{now}</p></div>}
      <h3>What it is</h3><p>{e.what}</p>
      <h3>How to read it</h3><p>{e.read}</p>
      {e.mistake && <><h3>Common mistake</h3><p className="mistake">{e.mistake}</p></>}
      {onAsk && (inRail ? (
        <div className="learn-follow">
          <button onClick={() => onAsk(`Explain ${e.title} more simply, with an example.`)}>Explain it more simply</button>
          <button onClick={() => onAsk(`What does ${e.title} tell me on my screen right now?`)}>What does it say right now?</button>
        </div>
      ) : <button className="ask-more" onClick={() => onAsk(`Explain ${e.title} using what's on my screen right now.`)}>Ask Desk about {e.title.toLowerCase()}</button>)}
      {!inRail && <p className="fine">Educational explanation, not investment advice.</p>}
    </div>
  );
}

export function LearnDrawer({ k, onClose, onAsk }: { k: string | null; onClose: () => void; onAsk?: (q: string) => void }) {
  return (
    <aside className={`learn ${k ? "open" : ""}`} aria-hidden={!k} aria-label="Explanation">
      {k && <LearnBody k={k} onClose={onClose} onAsk={onAsk} />}
    </aside>
  );
}
