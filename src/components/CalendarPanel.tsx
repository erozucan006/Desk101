import { useEffect, useMemo, useState } from "react";
import { COVERED_UNTIL, EVENTS, countdown, learnKey, type EconEvent, type Region } from "../lib/calendar";
import { loadMacro, marketReaction, resultFor, type EventResult, type MacroData, type Reaction } from "../lib/macro";
import { useNow } from "../lib/hooks";
import { PanelHead, SessionStrip } from "./Panels";

const DAY = 86_400_000;
const flag: Record<Region, string> = { US: "US", EU: "EU", Crypto: "₿" };
const arrow = { up: "▲", down: "▼", flat: "■" } as const;
const FRED_TERMS = "https://fred.stlouisfed.org/docs/api/terms_of_use.html";

function dayLabel(t: number, now: number) {
  const d = new Date(t), n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(n)) / DAY);
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return diff === 0 ? `Today · ${date}` : diff === 1 ? `Tomorrow · ${date}` : diff === -1 ? `Yesterday · ${date}` : date;
}

type Range = "results" | "week" | "month";

export function CalendarPanel({ onLearn }: { onLearn: (key: string) => void }) {
  const now = useNow(30_000);
  const [range, setRange] = useState<Range>("week");
  const [highOnly, setHighOnly] = useState(false);
  const [regions, setRegions] = useState<Record<Region, boolean>>({ US: true, EU: true, Crypto: true });
  const [open, setOpen] = useState<string | null>(null);
  const [macro, setMacro] = useState<MacroData | null>(null);

  useEffect(() => {
    let dead = false;
    const load = () => loadMacro().then((d) => { if (!dead && d) setMacro(d); });
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  const list = useMemo(() => {
    const keep = (e: EconEvent) => regions[e.region] && (!highOnly || e.impact === "high");
    if (range === "results") return EVENTS.filter((e) => e.at <= now && e.at > now - 60 * DAY && e.kind !== "expiry" && keep(e)).reverse();
    const from = now - 2 * DAY, to = now + (range === "week" ? 8 : 32) * DAY;
    return EVENTS.filter((e) => e.at >= from && e.at < to && keep(e));
  }, [now, range, highOnly, regions]);
  const next = EVENTS.find((e) => e.at > now && e.impact === "high");

  /** Latest available result for the same kind of release, shown next to upcoming events. */
  const lastOf = (e: EconEvent) => {
    for (let i = EVENTS.length - 1; i >= 0; i--) {
      const x = EVENTS[i];
      if (x.kind !== e.kind || x.at >= e.at || x.at > now) continue;
      const r = resultFor(x, macro, now);
      if (r.status === "ok") return { r, e: x };
    }
    return null;
  };

  const groups: [string, EconEvent[]][] = [];
  for (const e of list) {
    const k = dayLabel(e.at, now);
    if (!groups.length || groups[groups.length - 1][0] !== k) groups.push([k, []]);
    groups[groups.length - 1][1].push(e);
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ");

  return (
    <section className="pnl cal">
      <PanelHead code="EC" title="Economic calendar" learn="calendar" status={next ? <span className="next">Next: <b>{next.title}</b> in {countdown(next.at - now)}</span> : null} />
      <div className="cal-bar">
        <div className="tabs" role="tablist" aria-label="Range">
          <button role="tab" aria-selected={range === "results"} onClick={() => setRange("results")}>Results</button>
          <button role="tab" aria-selected={range === "week"} onClick={() => setRange("week")}>This week</button>
          <button role="tab" aria-selected={range === "month"} onClick={() => setRange("month")}>30 days</button>
        </div>
        <div className="seg" role="group" aria-label="Regions">
          {(Object.keys(regions) as Region[]).map((r) => (
            <button key={r} aria-pressed={regions[r]} onClick={() => setRegions({ ...regions, [r]: !regions[r] })}>{r}</button>
          ))}
        </div>
        <label className="chk" htmlFor="cal-high"><input id="cal-high" type="checkbox" checked={highOnly} onChange={(e) => setHighOnly(e.target.checked)} />High impact</label>
      </div>
      <SessionStrip />
      <div className="scroll">
        {groups.length ? groups.map(([day, evs]) => (
          <div key={day} className="cal-day">
            <div className="cal-date">{day}</div>
            {evs.map((e) => {
              const past = e.at <= now, soon = !past && e.at - now < 2 * 3600_000;
              const res = resultFor(e, macro, now);
              const isOpen = open === e.id;
              return (
                <div key={e.id} className={`cal-item ${isOpen ? "open" : ""}`}>
                  <button className={`cal-row ${past ? "past" : ""} ${soon ? "soon" : ""} ${res.status === "ok" ? "has-res" : ""}`} onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                    <span className="cal-time" title={`${e.local} (publisher's time)`}>{new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className={`cal-flag r-${e.region.toLowerCase()}`}>{flag[e.region]}</span>
                    <span className={`imp ${e.impact}`} aria-label={`${e.impact} impact`} title={`${e.impact} impact`}><i /><i /><i /></span>
                    <span className="cal-title">{e.title}{e.period && <span className="dim"> · {e.period}</span>}</span>
                    <span className="cal-when">{
                      res.status === "ok" ? <span className="res">{res.lines[0].dir && <i className={`ar ${res.lines[0].dir}`}>{arrow[res.lines[0].dir]}</i>}{res.headline}</span>
                      : past ? <span className="dim">{res.status === "pending" ? "awaiting data" : "released"}</span>
                      : soon ? <b>in {countdown(e.at - now)}</b> : <span className="dim">{countdown(e.at - now)}</span>
                    }</span>
                  </button>
                  {isOpen && <EventDetail e={e} res={res} last={past ? null : lastOf(e)} now={now} onLearn={onLearn} />}
                </div>
              );
            })}
          </div>
        )) : <p className="note">{range === "results" ? "No releases in the last 60 days match these filters." : "No events match these filters in this period."}</p>}
        {range !== "results" && now + 32 * DAY > COVERED_UNTIL && <p className="note">The schedule currently runs to the end of 2027.</p>}
      </div>
      <p className="note">Times in your time zone ({tz}). Click an event for the result, the market's reaction and what it means. Schedules: Federal Reserve, ECB, BLS, BEA, Eurostat, Deribit. US data uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis (<a href={FRED_TERMS} target="_blank" rel="noopener noreferrer">FRED API terms</a>).</p>
    </section>
  );
}

function EventDetail({ e, res, last, now, onLearn }: { e: EconEvent; res: EventResult; last: { r: EventResult; e: EconEvent } | null; now: number; onLearn: (k: string) => void }) {
  const [react, setReact] = useState<Reaction | null | "loading">("loading");
  const pair = e.region === "EU" ? "BTC/EUR" : "BTC/USD";
  useEffect(() => {
    if (e.at > now) { setReact(null); return; }
    let dead = false;
    setReact("loading");
    marketReaction(pair, e.at, now).then((r) => { if (!dead) setReact(r); });
    return () => { dead = true; };
  }, [e.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (x?: number) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`);
  const cls = (x?: number) => (x == null ? "" : x > 0 ? "up" : x < 0 ? "dn" : "");

  return (
    <div className="cal-detail">
      {res.status === "ok" && (
        <table className="tbl res-tbl">
          <thead><tr><th>Result</th><th>Actual</th><th>Previous</th></tr></thead>
          <tbody>{res.lines.map((l) => (
            <tr key={l.label}><td>{l.label}</td><td><b>{l.value}</b>{l.dir && <i className={`ar ${l.dir}`}> {arrow[l.dir]}</i>}</td><td className="dim">{l.prev ?? "—"}</td></tr>
          ))}</tbody>
        </table>
      )}
      {res.status === "pending" && <p className="cd-note">{res.note}</p>}
      {res.status === "no-key" && <p className="cd-note">US results appear once the FRED data connection is set up on the server.</p>}
      {res.status === "upcoming" && (
        <p className="cd-note">Releases {new Date(e.at).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} ({e.local}).
          {last && last.r.status === "ok" && <> Last time ({last.e.period ?? new Date(last.e.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}): <b>{last.r.headline}</b>.</>}
        </p>
      )}
      {e.at <= now && (
        <div className="reaction">
          <span className="dim">{pair.replace("/", " / ")} after the release</span>
          {react === "loading" ? <span className="dim">loading…</span> : react ? <>
            <span>5 min <b className={cls(react.ch5)}>{pct(react.ch5)}</b></span>
            <span>1 hour <b className={cls(react.ch60)}>{pct(react.ch60)}</b></span>
          </> : <span className="dim">not available</span>}
        </div>
      )}
      <div className="cd-actions">
        <button className="mini" onClick={() => onLearn(learnKey(e.kind))}>What is this?</button>
        <a className="link" href={e.source} target="_blank" rel="noopener noreferrer">Official source ↗</a>
      </div>
      {e.at <= now && <p className="cd-fine">No forecast is shown: market consensus figures are licensed data. Compare with the previous value, and with how price reacted.</p>}
    </div>
  );
}
