import { useEffect, useState } from "react";
import { UNIVERSE } from "../config";

// Kraken's legacy asset codes → the tickers people know (and the WS v2 API uses).
const ALIAS: Record<string, string> = { XBT: "BTC", XDG: "DOGE" };

/** Bases that trade against `quote` on Kraken, from the public AssetPairs endpoint. */
export function parseAssetPairs(json: unknown, quote: string): string[] {
  const res = (json as { result?: Record<string, { wsname?: string; status?: string }> })?.result ?? {};
  const out = new Set<string>();
  for (const p of Object.values(res)) {
    if (!p.wsname || (p.status && p.status !== "online")) continue;
    const [b, q] = p.wsname.split("/");
    if ((ALIAS[q] ?? q) !== quote) continue;
    out.add(ALIAS[b] ?? b);
  }
  return [...out].sort();
}

const cache: Record<string, Promise<string[]>> = {};

function load(quote: string): Promise<string[]> {
  if (!cache[quote]) {
    cache[quote] = (async () => {
      const key = `d101.pairs.${quote}`;
      try { const s = sessionStorage.getItem(key); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ }
      const r = await fetch("https://api.kraken.com/0/public/AssetPairs");
      const list = parseAssetPairs(await r.json(), quote);
      if (!list.length) throw new Error("empty");
      try { sessionStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ }
      return list;
    })().catch(() => { delete cache[quote]; return [...UNIVERSE]; });
  }
  return cache[quote];
}

/** All coins that can be added for this quote currency; starts with the built-in list. */
export function usePairs(quote: string, enabled = true) {
  const [list, setList] = useState<string[]>([...UNIVERSE]);
  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    load(quote).then((l) => { if (!dead) setList(l); });
    return () => { dead = true; };
  }, [quote, enabled]);
  return list;
}

/** Ranked search: exact match, then prefix, then contains; popular coins first within a group. */
export function searchPairs(list: string[], q: string, exclude: string[], limit = 8): string[] {
  const s = q.trim().toUpperCase();
  const pop = (b: string) => { const i = UNIVERSE.indexOf(b); return i < 0 ? 999 : i; };
  const pool = list.filter((b) => !exclude.includes(b));
  if (!s) return pool.filter((b) => UNIVERSE.includes(b)).sort((a, b) => pop(a) - pop(b)).slice(0, limit);
  const rank = (b: string) => (b === s ? 0 : b.startsWith(s) ? 1 : b.includes(s) ? 2 : 3);
  return pool.filter((b) => rank(b) < 3).sort((a, b) => rank(a) - rank(b) || pop(a) - pop(b) || a.localeCompare(b)).slice(0, limit);
}
