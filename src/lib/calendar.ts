// Economic calendar built from official schedules (public data, no API key).
// Times are stored in the publisher's own time zone and converted in the browser, so
// daylight-saving changes on either side of the Atlantic are handled correctly.
//
// Sources (checked 1 Nov 2026; Sep–Oct 2026 dates from the BLS/BEA monthly schedules):
//   FOMC   https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
//   ECB    https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
//   CPI    https://www.bls.gov/schedule/news_release/cpi.htm
//   NFP    https://www.bls.gov/schedule/news_release/empsit.htm
//   GDP/PCE https://www.bea.gov/news/schedule  (and /next-year)
//   HICP   https://www.ecb.europa.eu/press/calendars/statscal/ges/html/sthicp.en.html (Eurostat flash, 11:00 CET)
// Update this file when the publishers add new years.

export type Region = "US" | "EU" | "Crypto";
export type Kind = "fomc" | "ecb" | "cpi" | "nfp" | "pce" | "gdp" | "hicp" | "expiry";
export type Impact = "high" | "medium";

export type EconEvent = {
  id: string;
  kind: Kind;
  region: Region;
  title: string;
  period?: string;
  impact: Impact;
  at: number; // epoch ms (UTC)
  ref?: string; // reference period of the data ("2026-10-01" = October 2026; decision date for central banks)
  local: string; // "08:30 ET" as the publisher states it
  source: string;
};

const NY = "America/New_York", FRA = "Europe/Berlin", UTC = "UTC";
const SRC = {
  fomc: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  ecb: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
  cpi: "https://www.bls.gov/schedule/news_release/cpi.htm",
  nfp: "https://www.bls.gov/schedule/news_release/empsit.htm",
  bea: "https://www.bea.gov/news/schedule",
  hicp: "https://ec.europa.eu/eurostat/en/news/euro-indicators",
  expiry: "https://www.deribit.com/",
};

/** Offset (ms) of `tz` from UTC at instant `t`. */
function tzOffset(t: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
  const g = (k: string) => +p.find((x) => x.type === k)!.value;
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - t;
}

/** Wall-clock date + time in a time zone → UTC epoch ms. */
export function zoned(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz); // second pass settles DST edges
  return t;
}

const tzLabel = (tz: string) => (tz === NY ? "ET" : tz === FRA ? "CET" : "UTC");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Reference period for a release: "Oct" released in Nov 2026 → 2026-10-01; "Dec" released in Jan 2027 → 2026-12-01. */
export function refPeriod(kind: Kind, releaseDate: string, period?: string): string | undefined {
  if (kind === "fomc" || kind === "ecb") return releaseDate;
  if (!period) return undefined;
  const q = period.match(/^Q([1-4]) (\d{4})$/);
  if (q) return `${q[2]}-${String((+q[1] - 1) * 3 + 1).padStart(2, "0")}-01`;
  const mi = MONTHS.indexOf(period);
  if (mi < 0) return undefined;
  const [ry, rm] = releaseDate.split("-").map(Number);
  const y = mi + 1 > rm ? ry - 1 : ry;
  return `${y}-${String(mi + 1).padStart(2, "0")}-01`;
}

function ev(kind: Kind, region: Region, title: string, date: string, time: string, tz: string, impact: Impact, source: string, period?: string): EconEvent {
  return { id: `${kind}-${date}-${time}`, kind, region, title, period, impact, at: zoned(date, time, tz), local: `${time} ${tzLabel(tz)}`, source, ref: refPeriod(kind, date, period) };
}

const FOMC: [string, boolean][] = [ // decision day, has projections (SEP)
  ["2026-01-28", false], ["2026-03-18", true], ["2026-04-29", false], ["2026-06-17", true], ["2026-07-29", false],
  ["2026-09-16", true], ["2026-10-28", false], ["2026-12-09", true],
  ["2027-01-27", false], ["2027-03-17", true], ["2027-04-28", false], ["2027-06-09", true], ["2027-07-28", false],
  ["2027-09-15", true], ["2027-10-27", false], ["2027-12-08", true],
];
const ECB = ["2026-10-29", "2026-12-17", "2027-02-04", "2027-03-18", "2027-04-29", "2027-06-10", "2027-07-22", "2027-09-09", "2027-10-28", "2027-12-16"];
const CPI: [string, string][] = [
  ["2026-09-11", "Aug"], ["2026-10-14", "Sep"], ["2026-11-10", "Oct"], ["2026-12-10", "Nov"], ["2027-01-13", "Dec"], ["2027-02-11", "Jan"], ["2027-03-10", "Feb"], ["2027-04-13", "Mar"],
  ["2027-05-12", "Apr"], ["2027-06-10", "May"], ["2027-07-14", "Jun"], ["2027-08-11", "Jul"], ["2027-09-14", "Aug"], ["2027-10-14", "Sep"],
  ["2027-11-10", "Oct"], ["2027-12-10", "Nov"],
];
const NFP: [string, string][] = [
  ["2026-09-04", "Aug"], ["2026-10-02", "Sep"], ["2026-11-06", "Oct"], ["2026-12-04", "Nov"], ["2027-01-08", "Dec"], ["2027-02-05", "Jan"], ["2027-03-05", "Feb"], ["2027-04-02", "Mar"],
  ["2027-05-07", "Apr"], ["2027-06-04", "May"], ["2027-07-02", "Jun"], ["2027-08-06", "Jul"], ["2027-09-03", "Aug"], ["2027-10-08", "Sep"],
  ["2027-11-05", "Oct"], ["2027-12-03", "Nov"],
];
const PCE: [string, string][] = [
  ["2026-09-30", "Aug"], ["2026-10-29", "Sep"], ["2026-11-25", "Oct"], ["2026-12-23", "Nov"], ["2027-01-28", "Dec"], ["2027-02-25", "Jan"], ["2027-03-31", "Feb"], ["2027-04-29", "Mar"],
  ["2027-05-27", "Apr"], ["2027-06-25", "May"], ["2027-07-29", "Jun"], ["2027-08-25", "Jul"], ["2027-09-30", "Aug"], ["2027-10-28", "Sep"],
  ["2027-11-24", "Oct"], ["2027-12-22", "Nov"],
];
const GDP: [string, string, "Advance" | "Second" | "Third"][] = [
  ["2026-09-30", "Q2 2026", "Third"], ["2026-10-29", "Q3 2026", "Advance"],
  ["2026-11-25", "Q3 2026", "Second"], ["2026-12-23", "Q3 2026", "Third"],
  ["2027-01-28", "Q4 2026", "Advance"], ["2027-02-25", "Q4 2026", "Second"], ["2027-03-31", "Q4 2026", "Third"],
  ["2027-04-29", "Q1 2027", "Advance"], ["2027-05-27", "Q1 2027", "Second"], ["2027-06-25", "Q1 2027", "Third"],
  ["2027-07-29", "Q2 2027", "Advance"], ["2027-08-25", "Q2 2027", "Second"], ["2027-09-30", "Q2 2027", "Third"],
  ["2027-10-28", "Q3 2027", "Advance"], ["2027-11-24", "Q3 2027", "Second"], ["2027-12-22", "Q3 2027", "Third"],
];
const HICP: [string, string][] = [["2026-10-02", "Sep"], ["2026-11-04", "Oct"], ["2026-12-01", "Nov"], ["2027-01-06", "Dec"]];

/** Deribit monthly options expire on the last Friday of the month at 08:00 UTC. */
function expiries(fromYear: number, toYear: number): EconEvent[] {
  const out: EconEvent[] = [];
  for (let y = fromYear; y <= toYear; y++) for (let m = 0; m < 12; m++) {
    const last = new Date(Date.UTC(y, m + 1, 0));
    const day = last.getUTCDate() - ((last.getUTCDay() + 2) % 7); // back to Friday
    const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const q = m % 3 === 2;
    out.push(ev("expiry", "Crypto", q ? "BTC & ETH quarterly options expiry" : "BTC & ETH monthly options expiry", date, "08:00", UTC, q ? "high" : "medium", SRC.expiry));
  }
  return out;
}

export const EVENTS: EconEvent[] = [
  ...FOMC.flatMap(([d, sep]) => [
    ev("fomc", "US", sep ? "Fed rate decision + projections" : "Fed rate decision", d, "14:00", NY, "high", SRC.fomc),
  ]),
  ...ECB.map((d) => ev("ecb", "EU", "ECB rate decision", d, "14:15", FRA, "high", SRC.ecb)),
  ...CPI.map(([d, p]) => ev("cpi", "US", "US CPI inflation", d, "08:30", NY, "high", SRC.cpi, p)),
  ...NFP.map(([d, p]) => ev("nfp", "US", "US jobs report (NFP)", d, "08:30", NY, "high", SRC.nfp, p)),
  ...PCE.map(([d, p]) => ev("pce", "US", "US PCE inflation", d, "08:30", NY, "high", SRC.bea, p)),
  ...GDP.map(([d, p, est]) => ev("gdp", "US", `US GDP (${est.toLowerCase()} estimate)`, d, "08:30", NY, est === "Advance" ? "high" : "medium", SRC.bea, p)),
  ...HICP.map(([d, p]) => ev("hicp", "EU", "Euro area inflation (flash)", d, "11:00", FRA, "high", SRC.hicp, p)),
  ...expiries(2026, 2027),
].sort((a, b) => a.at - b.at);

/** The schedule we hold runs out here; after this the panel says so instead of looking empty. */
export const COVERED_UNTIL = Date.UTC(2027, 11, 31);

export function between(from: number, to: number, list = EVENTS) {
  return list.filter((e) => e.at >= from && e.at < to);
}

export function nextEvent(now: number, opts: { impact?: Impact } = {}, list = EVENTS) {
  return list.find((e) => e.at > now && (!opts.impact || e.impact === opts.impact));
}

export function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/** Learn-mode key for each event type. */
export const learnKey = (k: Kind) => `cal_${k}`;
