// Product-level settings. Change the name here once it is decided.
export const APP_NAME = "Desk101";
export const APP_TAGLINE = "The trading terminal that explains itself.";

export type Quote = "USD" | "EUR";

// Bases shown in the scanner universe. Pairs Kraken does not list are skipped automatically.
export const UNIVERSE = [
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT", "LINK", "AVAX", "LTC",
  "BCH", "ATOM", "UNI", "AAVE", "XLM", "NEAR", "ARB", "OP", "SUI", "PEPE",
  "SHIB", "APT", "INJ", "FET", "RENDER", "ALGO", "TRX", "POL", "TIA", "SEI",
];

export const DEFAULT_WATCH = ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "LINK", "AVAX"];

export const TIMEFRAMES: { label: string; minutes: number }[] = [
  { label: "15M", minutes: 15 },
  { label: "1H", minutes: 60 },
  { label: "4H", minutes: 240 },
  { label: "1D", minutes: 1440 },
];

export const KRAKEN_WS = "wss://ws.kraken.com/v2";
