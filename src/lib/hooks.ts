import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Book, Candle, Feed, FeedStatus, Ticker, Trade } from "./types";
import { journal } from "./journal";
import { live } from "./live";

export function useFeedStatus(feed: Feed): FeedStatus {
  const [s, setS] = useState<FeedStatus>(feed.status());
  useEffect(() => feed.onStatus(setS), [feed]);
  return s;
}

/** Tickers for many symbols. Unsupported pairs come back in `missing`. */
export function useTickers(feed: Feed, symbols: string[]) {
  const [map, setMap] = useState<Record<string, Ticker>>({});
  const [missing, setMissing] = useState<Record<string, true>>({});
  const subs = useRef(new Map<string, () => void>());
  const key = symbols.join(",");
  // Subscribe only to symbols that were added and drop only those removed, so editing the
  // watchlist doesn't resubscribe every pair at once (Kraken rate-limits bursts).
  useEffect(() => {
    const want = new Set(symbols);
    subs.current.forEach((u, s) => { if (!want.has(s)) { u(); subs.current.delete(s); } });
    for (const s of want) {
      if (subs.current.has(s)) continue;
      subs.current.set(s, feed.ticker(s,
        (t) => { setMap((m) => ({ ...m, [s]: t })); setMissing((m) => { if (!m[s]) return m; const n = { ...m }; delete n[s]; return n; }); },
        () => setMissing((m) => ({ ...m, [s]: true }))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, key]);
  useEffect(() => () => { subs.current.forEach((u) => u()); subs.current.clear(); }, [feed]);
  return { tickers: map, missing };
}

export function useBook(feed: Feed, symbol: string, depth: number) {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setBook(null); setError(null);
    return feed.book(symbol, depth, setBook, setError);
  }, [feed, symbol, depth]);
  return { book, error };
}

export function useTrades(feed: Feed, symbol: string, keep = 80) {
  const [trades, setTrades] = useState<Trade[]>([]);
  useEffect(() => {
    setTrades([]);
    return feed.trades(symbol, (batch) => setTrades((t) => [...batch.slice().reverse(), ...t].slice(0, keep)));
  }, [feed, symbol, keep]);
  return trades;
}

export function useCandles(feed: Feed, symbol: string, minutes: number) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCandles([]); setError(null);
    if (!symbol) return;
    return feed.candles(symbol, minutes, setCandles, setError);
  }, [feed, symbol, minutes]);
  return { candles, error };
}

export function useJournal() {
  return useSyncExternalStore(journal.subscribe, journal.all, journal.all);
}

export function useLive() {
  return useSyncExternalStore(live.subscribe, live.snapshot, live.snapshot);
}

/** localStorage-backed state for per-browser preferences. */
export function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem("lt." + key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { localStorage.setItem("lt." + key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key, v]);
  return [v, setV] as const;
}

export function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** True while a CSS media query matches. */
export function useMedia(query: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query), f = () => setM(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return m;
}
