// Turn raw observations from /api/macro into readable results for a calendar event,
// and measure how BTC moved right after a release. All functions here are pure except
// the two fetchers at the bottom.
import type { EconEvent } from "./calendar";

export type Obs = { d: string; v: number };
export type MacroData = { updated: number; fred: "ok" | "missing-key"; series: Record<string, Obs[]>; errors: { id: string; error: string }[] };

export type Line = { label: string; value: string; prev?: string; dir?: "up" | "down" | "flat" };
export type EventResult =
  | { status: "upcoming" }
  | { status: "no-data" } // e.g. options expiry: nothing to report
  | { status: "no-key" } // US data needs the FRED key on the server
  | { status: "pending"; note: string } // released, but the data source has not updated yet
  | { status: "ok"; headline: string; lines: Line[] };

const addMonths = (d: string, n: number) => {
  const [y, m] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
};
const val = (s: Obs[] | undefined, d: string) => s?.find((o) => o.d === d)?.v;
const yoy = (s: Obs[] | undefined, d: string) => { const a = val(s, d), b = val(s, addMonths(d, -12)); return a != null && b ? (a / b - 1) * 100 : undefined; };
const mom = (s: Obs[] | undefined, d: string) => { const a = val(s, d), b = val(s, addMonths(d, -1)); return a != null && b ? (a / b - 1) * 100 : undefined; };
const dir = (a?: number, b?: number): Line["dir"] => (a == null || b == null ? undefined : Math.abs(a - b) < 1e-9 ? "flat" : a > b ? "up" : "down");
const p1 = (x?: number) => (x == null ? "—" : `${x.toFixed(1)}%`);
const p2 = (x?: number) => (x == null ? "—" : `${x.toFixed(2)}%`);
const k = (x?: number) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x))}k`);
const dayShift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
/** Value in force on a date for a series that only has rows on change dates (or daily rows). */
const asOf = (s: Obs[] | undefined, d: string) => { let v: number | undefined; for (const o of s ?? []) { if (o.d <= d) v = o.v; else break; } return v; };

const US: EconEvent["kind"][] = ["cpi", "nfp", "pce", "gdp", "fomc"];

export function resultFor(e: EconEvent, data: MacroData | null, now = Date.now()): EventResult {
  if (e.at > now) return { status: "upcoming" };
  if (e.kind === "expiry" || !e.ref) return { status: "no-data" };
  if (!data) return { status: "pending", note: "Loading results…" };
  if (US.includes(e.kind) && data.fred === "missing-key") return { status: "no-key" };
  const S = data.series, r = e.ref, pending = (note = "The data source usually updates within an hour of the release.") => ({ status: "pending" as const, note });

  switch (e.kind) {
    case "cpi":
    case "pce": {
      const [h, c] = e.kind === "cpi" ? [S.cpi, S.cpi_core] : [S.pce, S.pce_core];
      const y = yoy(h, r), yp = yoy(h, addMonths(r, -1));
      if (y == null) return pending();
      const cy = yoy(c, r), cyp = yoy(c, addMonths(r, -1)), m = mom(h, r), mp = mom(h, addMonths(r, -1));
      return { status: "ok", headline: `${p1(y)} y/y`, lines: [
        { label: "Headline, year on year", value: p1(y), prev: p1(yp), dir: dir(+y.toFixed(1), yp != null ? +yp.toFixed(1) : undefined) },
        { label: "Core (ex food & energy), y/y", value: p1(cy), prev: p1(cyp), dir: dir(cy != null ? +cy.toFixed(1) : undefined, cyp != null ? +cyp.toFixed(1) : undefined) },
        { label: "Headline, month on month", value: p1(m), prev: p1(mp), dir: dir(m != null ? +m.toFixed(1) : undefined, mp != null ? +mp.toFixed(1) : undefined) },
      ] };
    }
    case "nfp": {
      const a = val(S.payrolls, r), b = val(S.payrolls, addMonths(r, -1)), c = val(S.payrolls, addMonths(r, -2));
      if (a == null || b == null) return pending();
      const ch = a - b, chp = c != null ? b - c : undefined;
      const u = val(S.unrate, r), up = val(S.unrate, addMonths(r, -1));
      const w = yoy(S.earnings, r), wp = yoy(S.earnings, addMonths(r, -1));
      return { status: "ok", headline: `${k(ch)} jobs`, lines: [
        { label: "Jobs added", value: k(ch), prev: k(chp), dir: dir(ch, chp) },
        { label: "Unemployment rate", value: p1(u), prev: p1(up), dir: dir(u, up) },
        { label: "Average hourly earnings, y/y", value: p1(w), prev: p1(wp), dir: dir(w != null ? +w.toFixed(1) : undefined, wp != null ? +wp.toFixed(1) : undefined) },
      ] };
    }
    case "gdp": {
      const g = val(S.gdp, r), gp = val(S.gdp, addMonths(r, -3));
      if (g == null) return pending("GDP results usually appear in the data source within a few hours.");
      return { status: "ok", headline: `${p1(g)} annualised`, lines: [
        { label: "Real GDP growth, annualised", value: p1(g), prev: p1(gp), dir: dir(g, gp) },
      ] };
    }
    case "fomc": {
      const before = { lo: asOf(S.fed_lower, dayShift(r, -1)), hi: asOf(S.fed_upper, dayShift(r, -1)) };
      const lastDay = S.fed_upper?.[S.fed_upper.length - 1]?.d;
      if (!lastDay || lastDay <= r) return pending("The new target range shows up in the data the day after the decision.");
      const after = { lo: asOf(S.fed_lower, dayShift(r, 1)), hi: asOf(S.fed_upper, dayShift(r, 1)) };
      if (before.hi == null || after.hi == null || after.lo == null) return pending();
      const bp = Math.round((after.hi - before.hi) * 100);
      const what = bp === 0 ? "Held rates" : bp < 0 ? `Cut ${-bp} bp` : `Raised ${bp} bp`;
      return { status: "ok", headline: what, lines: [
        { label: "Target range", value: `${p2(after.lo)}–${p2(after.hi)}`, prev: before.lo != null ? `${p2(before.lo)}–${p2(before.hi)}` : undefined, dir: dir(after.hi, before.hi) },
      ] };
    }
    case "ecb": {
      const before = asOf(S.ecb_dfr, dayShift(r, -1));
      // A new ECB rate takes effect about a week after the decision; look for a change in that window.
      const change = S.ecb_dfr?.find((o) => o.d > r && o.d <= dayShift(r, 10));
      if (before == null) return pending();
      if (!change && now < Date.parse(dayShift(r, 8) + "T00:00:00Z"))
        return pending("A new ECB rate takes effect about a week after the decision. Check the ECB press release for the decision itself.");
      const after = change?.v ?? before;
      const bp = Math.round((after - before) * 100);
      return { status: "ok", headline: bp === 0 ? "Held rates" : bp < 0 ? `Cut ${-bp} bp` : `Raised ${bp} bp`, lines: [
        { label: "Deposit facility rate", value: p2(after), prev: p2(before), dir: dir(after, before) },
      ] };
    }
    case "hicp": {
      const h = val(S.hicp, r), hp = val(S.hicp, addMonths(r, -1));
      if (h == null) return pending("The flash estimate is in Eurostat's release; the data series updates with the full release about two weeks later.");
      return { status: "ok", headline: `${p1(h)} y/y`, lines: [
        { label: "Euro area HICP, y/y", value: p1(h), prev: p1(hp), dir: dir(h, hp) },
      ] };
    }
  }
  return { status: "no-data" };
}

/** Short text for the calendar row. */
export function rowSummary(res: EventResult): string | null {
  return res.status === "ok" ? res.headline : null;
}

// ---------- market reaction ----------

export type Reaction = { p0: number; p5?: number; p60?: number; ch5?: number; ch60?: number };

/** Percentage moves from the first trade at/after the release. */
export function reactionFrom(p0: number, p5?: number, p60?: number): Reaction {
  return { p0, p5, p60, ch5: p5 != null ? (p5 / p0 - 1) * 100 : undefined, ch60: p60 != null ? (p60 / p0 - 1) * 100 : undefined };
}

/** Price of the first trade at or after `t` (ms), from Kraken's public trade history. */
export async function priceAt(pair: string, t: number): Promise<number | undefined> {
  const r = await fetch(`https://api.kraken.com/0/public/Trades?pair=${encodeURIComponent(pair)}&since=${Math.floor(t / 1000)}&count=1`);
  const j = await r.json();
  const key = Object.keys(j?.result ?? {}).find((x) => x !== "last");
  const row = key ? j.result[key]?.[0] : undefined;
  return row ? parseFloat(row[0]) : undefined;
}

const cache = new Map<string, Promise<Reaction | null>>();
export function marketReaction(pair: string, t: number, now = Date.now()): Promise<Reaction | null> {
  const key = `${pair}@${t}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const p0 = await priceAt(pair, t);
      if (!p0) return null;
      const p5 = now >= t + 5 * 60_000 ? await priceAt(pair, t + 5 * 60_000) : undefined;
      const p60 = now >= t + 60 * 60_000 ? await priceAt(pair, t + 60 * 60_000) : undefined;
      return reactionFrom(p0, p5, p60);
    })().catch(() => { cache.delete(key); return null; }));
  }
  return cache.get(key)!;
}

export async function loadMacro(): Promise<MacroData | null> {
  try {
    const r = await fetch("/api/macro");
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null;
    return (await r.json()) as MacroData;
  } catch { return null; }
}
