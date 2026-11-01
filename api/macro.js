// GET /api/macro — latest observations for the indicators on the economic calendar.
// US data: FRED API (St. Louis Fed). Needs the FRED_API_KEY environment variable in Vercel.
// Euro area data: ECB Data Portal (policy rate) and Eurostat (HICP, ECOICOP v2 dataset used since 2026). No key.
// "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis."
// The series used here come from BLS, BEA and the Federal Reserve Board (US public domain).

const FRED = [
  { id: "cpi", series: "CPIAUCSL", limit: 30 },
  { id: "cpi_core", series: "CPILFESL", limit: 30 },
  { id: "payrolls", series: "PAYEMS", limit: 8 },
  { id: "unrate", series: "UNRATE", limit: 8 },
  { id: "earnings", series: "CES0500000003", limit: 16 },
  { id: "pce", series: "PCEPI", limit: 30 },
  { id: "pce_core", series: "PCEPILFE", limit: 30 },
  { id: "gdp", series: "A191RL1Q225SBEA", limit: 8 },
  { id: "fed_upper", series: "DFEDTARU", limit: 500 },
  { id: "fed_lower", series: "DFEDTARL", limit: 500 },
];

// The deposit facility rate series only has rows on the days a new rate takes effect.
const ECB = [{ id: "ecb_dfr", path: "FM/B.U2.EUR.4F.KR.DFR.LEV", n: 12 }];
const EUROSTAT = [{ id: "hicp", query: "prc_hicp_minr?geo=EA&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=8" }];

async function get(url, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept, "user-agent": "Desk101/0.5 (+https://desk101.vercel.app)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return accept.includes("json") ? r.json() : r.text();
  } finally {
    clearTimeout(t);
  }
}

/** ECB csvdata → [{d, v}] ascending. Monthly periods come as "2026-09", daily as "2026-10-29". */
export function parseEcbCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const split = (l) => l.split(",").map((x) => x.replace(/^"|"$/g, ""));
  const head = split(lines[0]);
  const ti = head.indexOf("TIME_PERIOD"), vi = head.indexOf("OBS_VALUE");
  if (ti < 0 || vi < 0) throw new Error("unexpected CSV");
  return lines.slice(1).map(split)
    .map((c) => ({ d: c[ti].length === 7 ? `${c[ti]}-01` : c[ti], v: parseFloat(c[vi]) }))
    .filter((o) => o.d && isFinite(o.v))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

/** Eurostat JSON-stat with a single series → [{d, v}] ascending. */
export function parseJsonStat(j) {
  const idx = j?.dimension?.time?.category?.index || {};
  return Object.entries(idx)
    .map(([period, i]) => ({ d: period.length === 7 ? `${period}-01` : period, v: j.value?.[i] }))
    .filter((o) => typeof o.v === "number" && isFinite(o.v))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

export function parseFred(json) {
  return (json.observations || [])
    .map((o) => ({ d: o.date, v: parseFloat(o.value) }))
    .filter((o) => isFinite(o.v))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

export async function GET() {
  const key = process.env.FRED_API_KEY;
  const series = {}, sources = [];

  const fredJobs = FRED.map(async (s) => {
    if (!key) return;
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.series}&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=${s.limit}`;
      series[s.id] = parseFred(await get(url, "application/json"));
    } catch (e) {
      sources.push({ id: s.id, ok: false, error: String(e && e.name === "AbortError" ? "timeout" : e && e.message || e) });
    }
  });
  const ecbJobs = ECB.map(async (s) => {
    try {
      const url = `https://data-api.ecb.europa.eu/service/data/${s.path}?lastNObservations=${s.n}&format=csvdata`;
      series[s.id] = parseEcbCsv(await get(url, "text/csv"));
    } catch (e) {
      sources.push({ id: s.id, ok: false, error: String(e && e.name === "AbortError" ? "timeout" : e && e.message || e) });
    }
  });
  const estatJobs = EUROSTAT.map(async (s) => {
    try {
      series[s.id] = parseJsonStat(await get(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${s.query}`, "application/json"));
    } catch (e) {
      sources.push({ id: s.id, ok: false, error: String(e && e.name === "AbortError" ? "timeout" : e && e.message || e) });
    }
  });
  await Promise.all([...fredJobs, ...ecbJobs, ...estatJobs]);

  return new Response(JSON.stringify({
    updated: Date.now(),
    fred: key ? "ok" : "missing-key",
    series,
    errors: sources,
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=120, s-maxage=600, stale-while-revalidate=1800",
    },
  });
}
