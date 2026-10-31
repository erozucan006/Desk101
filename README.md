# Desk101

A live crypto trading terminal that explains every number on screen. Your first trading desk. Built for students and beginners who want to learn to read markets, not just watch them.

**v0.1 demo** — crypto only, English UI, no accounts.

## What's in it

- **Live market data** from Kraken's public WebSocket API (no API key, no server): watchlist, candlestick chart with EMA 9/21 and RSI 14, order book with spread and imbalance, time & sales with buy/sell pressure, market scanner.
- **Learn mode** (`L`): click any underlined label to see what it measures, how to read it, a common mistake, and a plain-English reading of the *current* value.
- **Trade journal**: log longs and shorts, live P&L, win rate, profit factor, CSV export. Entries are marked on the chart.
- **Coach**: after 5 closed trades, rule-based insights about your behaviour (holding losers too long, chasing overbought moves, fighting the trend, best setup).
- **Command line** (`/`): `BTC 4H`, `SOL ADD`, `EUR`, `BUY BTC 0.1 @ 77500`, `CLOSE BTC`, `LEARN`, `HELP`.
- **Demo mode**: add `?demo=1` to the URL for synthetic data — useful for presenting without internet.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173  (add ?demo=1 for offline data)
npm test           # unit tests: indicators, journal math, coach, Kraken message parsing
npm run build      # production build into dist/
```

## Deploy (Vercel, free)

1. Push this repo to GitHub.
2. On vercel.com → *Add New Project* → import the repo. Framework preset: **Vite**. No environment variables needed.
3. Every push to `main` redeploys.

## Project layout

```
src/
  config.ts            product name, tagline, pair universe, timeframes
  lib/kraken.ts        Kraken WebSocket v2 client (ticker, book, trade, ohlc)
  lib/demo.ts          offline synthetic feed with the same interface
  lib/indicators.ts    EMA, RSI
  lib/journal.ts       journal store (localStorage), stats, coach, CSV
  lib/learn.ts         Learn mode content — one entry per data-learn key
  lib/live.ts          snapshot of current readings used by Learn mode
  components/          Chart, panels, journal, Learn drawer
```

To add a new explanation: put `data-learn="your_key"` on the element and add `your_key` to `LEARN` in `src/lib/learn.ts`.

## Known limits of v0.1

- Journal lives in the browser (no accounts, no sync). Export CSV to keep it.
- Crypto only. Stocks and FX need a licensed data provider before launch.
- Chart history is whatever Kraken's OHLC snapshot returns for the timeframe.

## Disclaimer

For education only. Nothing in this app is investment advice or a recommendation to buy or sell any asset.
