import { useEffect, useMemo, useState } from "react";
import { useNow } from "../lib/hooks";
import { PanelHead } from "./Panels";

type Cat = "central-bank" | "data" | "regulation";
type Item = { id: string; title: string; link: string; source: string; cat: Cat; kind?: string; tier: "official" | "media"; macro: boolean; crypto: boolean; coins: string[]; ts: number };
type Payload = { updated: number; items: Item[]; sources: { id: string; name: string; tier?: string; ok: boolean; count?: number; sponsoredRemoved?: number; error?: string }[] };
type Filter = "all" | Cat | "crypto";

const REFRESH = 5 * 60_000;
const TABS: [Filter, string][] = [["all", "All"], ["central-bank", "Central banks"], ["data", "Data"], ["regulation", "Regulators"], ["crypto", "Crypto"]];

function ago(ts: number, now: number) {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export function NewsPanel() {
  const now = useNow(60_000);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

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
    filter === "all" ? true : filter === "crypto" ? i.crypto : i.cat === filter,
  ), [data, filter]);
  const down = [...new Set((data?.sources ?? []).filter((s) => !s.ok).map((s) => s.name))];

  return (
    <section className="pnl news">
      <PanelHead code="NW" title="Official news" learn="news" status={data ? `updated ${ago(data.updated, now)} ago` : err ? "unavailable" : "loading…"}>
        <div className="tabs" role="tablist" aria-label="Filter news">
          {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
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
                  <a href={i.link} target="_blank" rel="noopener noreferrer" title={`Official release from ${i.source}`}>{i.title}</a>
                  <div className="n-meta">
                    <span className="badge official" title="Published by the institution itself">✓ {i.source}</span>
                    {i.kind && <span className="tag">{i.kind}</span>}
                    {i.crypto && <span className="tag on">crypto</span>}
                    {i.coins.slice(0, 3).map((c) => <span key={c} className="tag">{c}</span>)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="note">No recent official releases in this category.</p>}
      </div>
      <p className="note">
        Every headline here is an official release from the Federal Reserve, the ECB, the US Bureau of Labor Statistics, the SEC or ESMA, linked to the original. Market news from licensed providers is planned.
        {down.length ? ` Currently unreachable: ${down.join(", ")}.` : ""}
      </p>
    </section>
  );
}
