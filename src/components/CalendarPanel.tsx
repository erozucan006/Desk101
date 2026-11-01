import { useMemo, useState } from "react";
import { COVERED_UNTIL, EVENTS, countdown, learnKey, type EconEvent, type Region } from "../lib/calendar";
import { useNow } from "../lib/hooks";
import { PanelHead, SessionStrip } from "./Panels";

const DAY = 86_400_000;
const flag: Record<Region, string> = { US: "US", EU: "EU", Crypto: "₿" };

function dayLabel(t: number, now: number) {
  const d = new Date(t), n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(n)) / DAY);
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return diff === 0 ? `Today · ${date}` : diff === 1 ? `Tomorrow · ${date}` : diff === -1 ? `Yesterday · ${date}` : date;
}

export function CalendarPanel({ onLearn }: { onLearn: (key: string) => void }) {
  const now = useNow(30_000);
  const [range, setRange] = useState<"week" | "month">("week");
  const [highOnly, setHighOnly] = useState(false);
  const [regions, setRegions] = useState<Record<Region, boolean>>({ US: true, EU: true, Crypto: true });

  const list = useMemo(() => {
    const from = now - 2 * DAY, to = now + (range === "week" ? 8 : 32) * DAY;
    return EVENTS.filter((e) => e.at >= from && e.at < to && regions[e.region] && (!highOnly || e.impact === "high"));
  }, [now, range, highOnly, regions]);
  const next = EVENTS.find((e) => e.at > now && e.impact === "high");

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
              return (
                <div key={e.id} className={`cal-row ${past ? "past" : ""} ${soon ? "soon" : ""}`}>
                  <span className="cal-time" title={`${e.local} (publisher's time)`}>{new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className={`cal-flag r-${e.region.toLowerCase()}`}>{flag[e.region]}</span>
                  <span className={`imp ${e.impact}`} aria-label={`${e.impact} impact`} title={`${e.impact} impact`}><i /><i /><i /></span>
                  <button className="cal-title" onClick={() => onLearn(learnKey(e.kind))} title="What is this and why does it matter?">
                    {e.title}{e.period && <span className="dim"> · {e.period}</span>}
                  </button>
                  <span className="cal-when">{past ? <span className="dim">released</span> : soon ? <b>in {countdown(e.at - now)}</b> : <span className="dim">{countdown(e.at - now)}</span>}</span>
                </div>
              );
            })}
          </div>
        )) : <p className="note">No events match these filters in this period.</p>}
        {now + 32 * DAY > COVERED_UNTIL && <p className="note">The schedule currently runs to the end of 2027.</p>}
      </div>
      <p className="note">Times in your time zone ({tz}). Click an event to learn what it is and how it tends to move crypto. Sources: Federal Reserve, ECB, BLS, BEA, Eurostat, Deribit.</p>
    </section>
  );
}
