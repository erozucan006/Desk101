import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS serverless module
import { parseFeed } from "../../api/news.js";

const feed = { id: "t", name: "Test", cat: "regulation", tier: "official" };

describe("RSS / Atom parsing", () => {
  it("reads RSS items with CDATA and entities, and tags coins and macro words", () => {
    const xml = `<rss><channel><title>x</title>
      <item><title><![CDATA[Bitcoin slips as Fed&#8217;s Powell signals caution]]></title><link>https://ex.com/a</link><pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate></item>
      <item><title>Solana &amp; Ether ETFs see inflows</title><link>https://ex.com/b</link><pubDate>Sun, 01 Nov 2026 11:00:00 +0000</pubDate></item>
      <item><title>No link</title><pubDate>Sun, 01 Nov 2026 11:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const items = parseFeed(xml, feed);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Bitcoin slips as Fed’s Powell signals caution", coins: ["BTC"], macro: true, source: "Test" });
    expect(items[1].title).toBe("Solana & Ether ETFs see inflows");
    expect(items[1].coins).toEqual(["ETH", "SOL"]);
    expect(items[1].macro).toBe(false);
    expect(items[1].crypto).toBe(true);
  });

  it("drops sponsored posts and press releases from media feeds, tags tiers", () => {
    const xml = `<rss><channel>
      <item><title>Real story about Bitcoin</title><link>https://media.ex/news/real</link><pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate><category>Markets</category></item>
      <item><title>XYZ token launches presale</title><link>https://media.ex/press-releases/xyz</link><pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate></item>
      <item><title>Another launch</title><link>https://media.ex/news/b</link><pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate><category><![CDATA[Sponsored]]></category></item>
      <item><title>Press Release: ABC wallet</title><link>https://media.ex/news/c</link><pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate></item>
      <item><title>Price analysis: ETH</title><link>https://media.ex/price-analysis/eth</link><pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const items = parseFeed(xml, { id: "m", name: "Media", cat: "crypto", tier: "media" });
    expect(items.map((i: { title: string }) => i.title)).toEqual(["Real story about Bitcoin", "Price analysis: ETH"]);
    expect(items.sponsored).toBe(3);
    expect(items[0].tier).toBe("media");
  });

  it("flags crypto-related regulator releases and never filters official sources", () => {
    const xml = `<rss><channel><item><title>ESMA publishes MiCA guidelines on crypto-asset transfers</title><link>https://esma.example/press-releases/1</link><pubDate>Sun, 01 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
    const items = parseFeed(xml, { id: "esma", name: "ESMA", cat: "regulation", tier: "official" });
    expect(items).toHaveLength(1); // "/press-releases/" is not treated as sponsored for official feeds
    expect(items[0]).toMatchObject({ crypto: true, macro: false, tier: "official" });
  });

  it("resolves links relative to xml:base", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xml:base="https://www.esma.europa.eu/"><channel><item><title>ESMA statement</title><link>/press-news/esma-news/statement</link><pubDate>Fri, 30 Oct 2026 10:00:00 +0100</pubDate></item></channel></rss>`;
    const items = parseFeed(xml, { id: "esma", name: "ESMA", cat: "regulation", tier: "official", url: "https://www.esma.europa.eu/rss.xml" });
    expect(items[0].link).toBe("https://www.esma.europa.eu/press-news/esma-news/statement");
  });

  it("reads Atom entries with href links", () => {
    const xml = `<feed><entry><title type="html">ECB keeps rates unchanged</title><link rel="alternate" href="https://ecb.example/p1"/><updated>2026-10-29T13:15:00Z</updated></entry></feed>`;
    const items = parseFeed(xml, { id: "ecb", name: "ECB", cat: "central-bank", tier: "official" });
    expect(items[0]).toMatchObject({ title: "ECB keeps rates unchanged", link: "https://ecb.example/p1", macro: true, crypto: false, ts: Date.parse("2026-10-29T13:15:00Z") });
  });
});
