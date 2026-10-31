export type Ticker = {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  high: number;
  low: number;
  changePct: number; // 24h, in percent
  volume: number; // 24h, base units
  vwap: number;
};

export type Level = { price: number; qty: number };
export type Book = { symbol: string; bids: Level[]; asks: Level[]; ts: number };

export type Trade = { symbol: string; side: "buy" | "sell"; price: number; qty: number; ts: number };

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type FeedStatus = "connecting" | "live" | "reconnecting" | "offline" | "demo";

export type Unsub = () => void;

export interface Feed {
  readonly kind: "kraken" | "demo";
  status(): FeedStatus;
  onStatus(fn: (s: FeedStatus) => void): Unsub;
  ticker(symbol: string, fn: (t: Ticker) => void, onError?: (msg: string) => void): Unsub;
  book(symbol: string, depth: number, fn: (b: Book) => void, onError?: (msg: string) => void): Unsub;
  trades(symbol: string, fn: (batch: Trade[]) => void, onError?: (msg: string) => void): Unsub;
  candles(symbol: string, minutes: number, fn: (c: Candle[]) => void, onError?: (msg: string) => void): Unsub;
}
