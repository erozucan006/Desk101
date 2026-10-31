import { LEARN } from "../lib/learn";
import { useLive } from "../lib/hooks";

export function LearnDrawer({ k, onClose }: { k: string | null; onClose: () => void }) {
  const ctx = useLive();
  const e = k ? LEARN[k] : null;
  return (
    <aside className={`learn ${k ? "open" : ""}`} aria-hidden={!k} aria-label="Explanation">
      {e && (
        <div className="learn-in">
          <div className="learn-head"><span className="fk">?</span><h2>{e.title}</h2><button className="x" onClick={onClose} aria-label="Close explanation">×</button></div>
          {e.now && (() => { const t = e.now!(ctx); return t ? <div className="now"><span>Right now</span><p>{t}</p></div> : null; })()}
          <h3>What it is</h3><p>{e.what}</p>
          <h3>How to read it</h3><p>{e.read}</p>
          {e.mistake && <><h3>Common mistake</h3><p className="mistake">{e.mistake}</p></>}
          <p className="fine">Educational explanation, not investment advice.</p>
        </div>
      )}
    </aside>
  );
}
