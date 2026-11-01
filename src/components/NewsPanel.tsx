import { useEffect, useMemo, useState } from "react";
import { useNow } from "../lib/hooks";
import { PanelHead } from "./Panels";

type Item = { id: string; title: string; link: string; source: string; cat: "macro" | "crypto"; tier: "official" | "media"; macro: boolean; coins: string[]; ts: number };
type Payload = { updated: number; items: Item[]; sources: { id: string; name: string; tier?: string; ok: boolean; count?: number; sponsoredRemoved?: number; error?: string }[] };

const REFRESH = 5 * 60_000;

function ago(ts: number, now: number) {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export function NewsPanel({ base }: { base: string }) {
  const now = useNow(60_000);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "official" | "macro" | "crypto" | "coin">("all");

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const r = await fetch("/api/news");
        const ct = r.headers.get("content-type") ?? "";
        if (!r.ok || !ct.includes("json")) throw new Error(r.ok ? "not-deployed" : `HTTP ${r.status}`);
        const j = (await r.json()) as Payload;
        if (!dead) { setData(j); setErr(null); }
      } catch (e) {
        if (!dead) setErr(String((e as Error).message));
      }
    };
    load();
    const id = setInterval(load, REFRESH);
    return () => { dead = true; clearInterval(id); };
  }, []);

  const items = useMemo(() => (data?.items ?? []).filter((i) =>
    filter === "all" ? true : filter === "official" ? i.tier === "official" : filter === "macro" ? i.macro : filter === "crypto" ? i.cat === "crypto" : i.coins.includes(base),
  ), [data, filter, base]);
  const down = data?.sources.filter((s) => !s.ok) ?? [];
  const removed = data?.sources.reduce((a, s) => a + (s.sponsoredRemoved ?? 0), 0) ?? 0;

  return (
    <section className="pnl news">
      <PanelHead code="NW" title="News" learn="news" status={data ? `updated ${ago(data.updated, now)} ago` : err ? "unavailable" : "loading…"}>
        <div className="tabs" role="tablist" aria-label="Filter news">
          {([["all", "All"], ["official", "Official"], ["macro", "Macro"], ["crypto", "Crypto"], ["coin", base]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </PanelHead>
      <div className="scroll">
        {err && !data ? (
          <p className="note">{err === "not-deployed" ? "Headlines load on the deployed site (desk101.vercel.app). They are not available in local preview or demo mode." : `Headlines could not be loaded (${err}). The feed retries every 5 minutes.`}</p>
        ) : !data ? <p className="note">Loading headlines…</p> : items.length ? (
          <ul className="nlist">
            {items.slice(0, 60).map((i) => (
              <li key={i.id}>
                <span className="n-time">{ago(i.ts, now)}</span>
                <div className="n-body">
                  <a href={i.link} target="_blank" rel="noopener noreferrer" title={i.tier === "official" ? `Official press release from ${i.source}` : `Published by ${i.source}. Third-party headline, not verified by Desk101.`}>{i.title}</a>
                  <div className="n-meta">
                    {i.tier === "official"
                      ? <span className="badge official" title="The institution's own press release">✓ Official · {i.source}</span>
                      : <span className="badge media" title="Third-party journalism">Media · {i.source}</span>}
                    {i.macro && i.cat === "crypto" && <span className="tag">macro</span>}
                    {i.coins.slice(0, 3).map((c) => <span key={c} className={`tag ${c === base ? "on" : ""}`}>{c}</span>)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="note">No recent headlines {filter === "coin" ? `mention ${base}` : "in this category"}.</p>}
      </div>
      <p className="note">
        <b>Official</b> items are press releases from the Federal Reserve and the ECB. <b>Media</b> headlines come from third-party publishers (CoinDesk, Cointelegraph, Decrypt, The Block), are shown as published and are not verified by Desk101; read the article before acting on a headline.
        {removed ? ` ${removed} sponsored post${removed === 1 ? "" : "s"} and press release${removed === 1 ? "" : "s"} filtered out.` : ""}
        {down.length ? ` Currently unreachable: ${down.map((d) => d.name).join(", ")}.` : ""}
      </p>
    </section>
  );
}
