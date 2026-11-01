// GET /api/news — merged headlines from public RSS/Atom feeds.
// Runs as a Vercel serverless function. Only titles, links, source and time are passed
// through; readers click through to the publisher for the article itself.
// Cached at Vercel's edge for 5 minutes so feeds are fetched rarely, whatever the traffic.

const FEEDS = [
  { id: "fed", name: "Federal Reserve", cat: "macro", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { id: "ecb", name: "ECB", cat: "macro", url: "https://www.ecb.europa.eu/rss/press.html" },
  { id: "coindesk", name: "CoinDesk", cat: "crypto", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { id: "cointelegraph", name: "Cointelegraph", cat: "crypto", url: "https://cointelegraph.com/rss" },
  { id: "decrypt", name: "Decrypt", cat: "crypto", url: "https://decrypt.co/feed" },
  { id: "theblock", name: "The Block", cat: "crypto", url: "https://www.theblock.co/rss.xml" },
];

// Coins we tag headlines with, so the panel can filter to the pair on screen.
const COINS = {
  BTC: /\b(bitcoin|btc)\b/i, ETH: /\b(ethereum|ether|eth)\b/i, SOL: /\b(solana|sol)\b/i, XRP: /\b(xrp|ripple)\b/i,
  ADA: /\b(cardano|ada)\b/i, DOGE: /\b(dogecoin|doge)\b/i, LINK: /\b(chainlink)\b/i, AVAX: /\b(avalanche|avax)\b/i,
  DOT: /\b(polkadot)\b/i, LTC: /\b(litecoin|ltc)\b/i, SUI: /\bsui\b/i, PEPE: /\bpepe\b/i,
};
// Macro words that make a crypto-site headline relevant to the macro filter too.
const MACRO = /\b(fed|fomc|powell|ecb|lagarde|inflation|cpi|pce|rate (cut|hike)s?|interest rates?|jobs report|payrolls|tariffs?|treasur(y|ies)|recession|gdp|dollar)\b/i;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

export function parseFeed(xml, feed) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks.slice(0, 20)) {
    const title = tag(b, "title");
    let link = tag(b, "link");
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const when = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const ts = Date.parse(when);
    if (!title || !/^https?:\/\//.test(link) || !isFinite(ts)) continue;
    const coins = Object.entries(COINS).filter(([, re]) => re.test(title)).map(([k]) => k);
    items.push({ id: `${feed.id}:${link}`, title, link, source: feed.name, cat: feed.cat, macro: feed.cat === "macro" || MACRO.test(title), coins, ts });
  }
  return items;
}

async function load(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(feed.url, { signal: ctrl.signal, headers: { "user-agent": "Desk101/0.4 (+https://desk101.vercel.app)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const items = parseFeed(await r.text(), feed);
    return { items, status: { id: feed.id, name: feed.name, ok: true, count: items.length } };
  } catch (e) {
    return { items: [], status: { id: feed.id, name: feed.name, ok: false, error: String(e && e.name === "AbortError" ? "timeout" : e && e.message || e) } };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const results = await Promise.all(FEEDS.map(load));
  const seen = new Set();
  const items = results.flatMap((r) => r.items)
    .filter((i) => i.ts <= Date.now() + 3600_000 && !seen.has(i.link) && seen.add(i.link))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 120);
  return new Response(JSON.stringify({ updated: Date.now(), items, sources: results.map((r) => r.status) }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
    },
  });
}
