import { useEffect, useMemo, useState } from "react";
import type { Candle } from "../lib/types";
import { EVENTS, learnKey } from "../lib/calendar";
import { loadMacro, resultFor, type MacroData } from "../lib/macro";
import { describeImpact, eventImpact } from "../lib/impact";
import { price } from "../lib/format";

const arrow = { up: "▲", down: "▼", flat: "■" } as const;
let macroOnce: Promise<MacroData | null> | null = null;
const macro = () => (macroOnce ??= loadMacro().then((d) => { if (!d) macroOnce = null; return d; }));

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const sgn = (x?: number) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}%`);
const cls = (x?: number) => (x == null ? "dim" : x > 0 ? "up" : x < 0 ? "dn" : "");

/** Popup for a release marker on the chart: what was announced and how this pair moved after it. */
export function EventCard({ ids, candles, tf, base, onClose, onLearn }: {
  ids: string[]; candles: Candle[]; tf: string; base: string; onClose: () => void; onLearn: (key: string) => void;
}) {
  const evs = useMemo(() => ids.map((id) => EVENTS.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e), [ids]);
  const [k, setK] = useState(0);
  const [data, setData] = useState<MacroData | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setK(0); }, [ids]);
  useEffect(() => { let dead = false; macro().then((d) => { if (!dead) { setData(d); setLoaded(true); } }); return () => { dead = true; }; }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const e = evs[Math.min(k, evs.length - 1)];
  const imp = useMemo(() => (e ? eventImpact(candles, e.at, tf) : null), [e, candles, tf]);
  if (!e) return null;
  const res = resultFor(e, data);
  const when = new Date(e.at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="evc">
      <div className="evc-head">
        <div>
          <b>{e.title}</b>{e.period && <span className="dim"> · {e.period}</span>}
          <div className="dim small">{when} your time · {e.local} · <a href={e.source} target="_blank" rel="noopener noreferrer">{host(e.source)}</a></div>
        </div>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
      </div>
      {evs.length > 1 && (
        <div className="tabs evc-tabs">{evs.map((x, i) => <button key={x.id} aria-selected={i === k} onClick={() => setK(i)}>{x.title}</button>)}</div>
      )}

      <div className="evc-sec">
        <div className="evc-lab">What was announced</div>
        {res.status === "ok" ? (
          <ul className="evc-res">{res.lines.slice(0, 3).map((l) => (
            <li key={l.label}><span>{l.label}</span><span><b>{l.value}</b>{l.dir && <i className={`ar ${l.dir}`}> {arrow[l.dir]}</i>}{l.prev && <span className="dim"> prev {l.prev}</span>}</span></li>
          ))}</ul>
        ) : <p className="dim small">{
          res.status === "pending" && loaded && !data ? "Results load on the live site (desk101.vercel.app)." :
          res.status === "pending" ? res.note :
          res.status === "no-key" ? "US results appear once the FRED data connection is set up on the server." :
          res.status === "no-data" ? "No headline number: this event matters for positioning, not for a data print." : "Not released yet."
        }</p>}
      </div>

      <div className="evc-sec">
        <div className="evc-lab">How {base} moved after it <span className="dim">({tf} candles)</span></div>
        {imp ? <>
          <div className="evc-moves">
            {imp.moves.map((m) => (
              <div key={m.label}>
                <span className="dim">{m.label}</span>
                <b className={cls(m.pct)}>{m.pct == null ? "not yet" : sgn(m.pct)}</b>
                {m.ratio != null && <span className={`evc-x ${m.ratio >= 1.5 ? "big" : ""}`} title={`A typical ${m.label} move is ${m.normal!.toFixed(2)}%`}>{m.ratio.toFixed(1)}× normal</span>}
              </div>
            ))}
          </div>
          <p className="evc-read">{describeImpact(base, imp)}</p>
          <p className="dim small">Measured from {price(imp.p0)}, the open of the candle the release fell in{imp.aligned ? "" : " (it started before the release)"}. Other news can move price at the same time, so treat this as what happened, not proof of cause.</p>
        </> : <p className="dim small">Not enough candles around this release on {tf}. Try a lower timeframe.</p>}
      </div>
      <button className="evc-learn" onClick={() => onLearn(learnKey(e.kind))}>Why this release moves markets →</button>
    </div>
  );
}
