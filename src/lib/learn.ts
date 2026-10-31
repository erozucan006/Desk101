// Learn mode content. Every on-screen metric carries a data-learn key that maps here.
// `now` turns the live value into a plain-English reading; it must stay descriptive,
// never a buy/sell recommendation.
import type { LiveCtx } from "./live";
import { pct, price } from "./format";

export type LearnEntry = {
  title: string;
  what: string;
  read: string;
  mistake?: string;
  now?: (c: LiveCtx) => string | null;
};

const pair = (c: LiveCtx) => `${c.symbol}/${c.quote}`;

export const LEARN: Record<string, LearnEntry> = {
  last_price: {
    title: "Last price",
    what: "The price of the most recent trade on the exchange. It is not the price you will get: buying fills at the ask, selling at the bid.",
    read: "Compare it with the bid and ask. If last sits at the ask, recent trades were buyers lifting offers; at the bid, sellers hitting bids.",
    now: (c) => c.ticker ? `${pair(c)} last traded at ${price(c.ticker.last)}. Bid ${price(c.ticker.bid)}, ask ${price(c.ticker.ask)}.` : null,
  },
  change_24h: {
    title: "24h change",
    what: "How far the price moved compared with exactly 24 hours ago (a rolling window, not since midnight).",
    read: "Use it for context, not as a signal. A big number tells you where attention is; it says nothing about what happens next.",
    mistake: "Buying the top gainer because it is green. By the time a coin leads the list, much of the move has often happened.",
    now: (c) => c.ticker ? `${pair(c)} is ${pct(c.ticker.changePct)} over 24h. ${Math.abs(c.ticker.changePct) > 5 ? "That is a large move for one day." : Math.abs(c.ticker.changePct) < 1 ? "A quiet day so far." : "A normal-sized move."}` : null,
  },
  range_24h: {
    title: "24h high / low",
    what: "The highest and lowest traded prices in the last 24 hours.",
    read: "Where the price sits inside the range tells you who has been in control. Near the high: buyers; near the low: sellers. Many traders watch these levels for breakouts.",
    now: (c) => {
      const t = c.ticker; if (!t || t.high === t.low) return null;
      const pos = (t.last - t.low) / (t.high - t.low);
      return `Price is at ${Math.round(pos * 100)}% of today's range (0% = low, 100% = high).`;
    },
  },
  volume_24h: {
    title: "24h volume",
    what: "The total value traded in the last 24 hours, shown in the quote currency.",
    read: "Volume is participation. Moves on high volume are taken more seriously than moves on thin volume. Low volume also means wider spreads and more slippage for you.",
  },
  vwap: {
    title: "VWAP (24h)",
    what: "Volume-weighted average price: the average price paid per coin over 24 hours, weighted by how much traded at each price.",
    read: "Institutions use it as a fair-value benchmark. Price above VWAP means the average buyer today is in profit; below means they are underwater.",
    now: (c) => c.ticker ? `Price is ${c.ticker.last >= c.ticker.vwap ? "above" : "below"} the 24h VWAP of ${price(c.ticker.vwap)} by ${pct((c.ticker.last / c.ticker.vwap - 1) * 100)}.` : null,
  },
  spread: {
    title: "Spread",
    what: "The gap between the best price someone will sell at (ask) and the best price someone will buy at (bid). Shown in basis points: 1 bp = 0.01%.",
    read: "It is a hidden cost. Buying at the ask and selling at the bid instantly loses the spread. Big coins have tiny spreads; small coins can have wide ones.",
    mistake: "Using market orders on illiquid pairs. A 30 bp spread on every round trip adds up fast.",
    now: (c) => c.spreadBps != null ? `The spread on ${pair(c)} is ${c.spreadBps.toFixed(2)} bp. ${c.spreadBps < 2 ? "Very tight: this pair is liquid." : c.spreadBps < 10 ? "Moderate." : "Wide: trading costs are high here."}` : null,
  },
  order_book: {
    title: "Order book",
    what: "All resting limit orders waiting to be filled. Bids (green) are buyers below the price, asks (red) are sellers above it. Bar length shows size.",
    read: "Large walls can act like short-term support or resistance, but they can be pulled in a second. Watch how the book reacts when price approaches a wall.",
    mistake: "Trusting a single big order. Spoofing (placing orders you never intend to fill) is common in crypto.",
  },
  imbalance: {
    title: "Book imbalance",
    what: "The share of size on the bid side among the visible levels. 50% is balanced.",
    read: "A heavy bid side suggests more passive buying interest near the price. It is a very short-term reading and changes constantly.",
    now: (c) => c.imbalance != null ? `${Math.round(c.imbalance * 100)}% of visible size is on the bid side. ${c.imbalance > 0.6 ? "Buyers are stacked closer to the price." : c.imbalance < 0.4 ? "Sellers are stacked closer to the price." : "Roughly balanced."}` : null,
  },
  candles: {
    title: "Candlestick chart",
    what: "Each candle is one time period. The body spans open to close; the thin wicks show the high and low. Green closed higher than it opened, red lower.",
    read: "Long wicks show rejection: price went there and got pushed back. Big bodies show conviction. Read candles together, not one by one.",
  },
  timeframe: {
    title: "Timeframe",
    what: "How much time one candle covers. 15M is fifteen minutes, 1D is one day.",
    read: "Start from a higher timeframe to see the trend, then zoom in to time entries. A downtrend on 1D can look like an uptrend on 15M.",
    now: (c) => `You are looking at ${c.timeframe} candles.`,
  },
  ema: {
    title: "EMA 9 / 21",
    what: "Exponential moving averages: the average closing price of the last 9 and 21 candles, weighted toward recent candles.",
    read: "When the fast line (9) is above the slow line (21), short-term momentum is up. Crosses are popular signals but lag the price, and they whipsaw in sideways markets.",
    mistake: "Treating every cross as a trade. In a range, crosses mostly lose money.",
    now: (c) => c.ema9 != null && c.ema21 != null ? `EMA 9 (${price(c.ema9)}) is ${c.ema9 >= c.ema21 ? "above" : "below"} EMA 21 (${price(c.ema21)}): short-term trend is ${c.ema9 >= c.ema21 ? "up" : "down"} on ${c.timeframe}.` : null,
  },
  rsi: {
    title: "RSI 14",
    what: "Relative Strength Index compares the size of recent up moves to recent down moves, on a 0 to 100 scale.",
    read: "Above 70 is called overbought, below 30 oversold. In strong trends RSI can stay extreme for a long time, so it describes momentum more than it predicts reversals.",
    mistake: "Shorting just because RSI is above 70. Strong uptrends live there.",
    now: (c) => c.rsi != null ? `RSI is ${c.rsi.toFixed(1)} on ${c.timeframe}. ${c.rsi >= 70 ? "Momentum is stretched to the upside." : c.rsi <= 30 ? "Momentum is stretched to the downside." : "Momentum is in the neutral zone."}` : null,
  },
  volume_bars: {
    title: "Volume bars",
    what: "The bars at the bottom of the chart show how much traded in each candle.",
    read: "A breakout on rising volume is more convincing than one on falling volume. Spikes often mark exhaustion or the start of a new move.",
  },
  tape: {
    title: "Time & sales (the tape)",
    what: "Every individual trade as it happens: time, price, size. Green trades hit the ask (aggressive buyers), red trades hit the bid (aggressive sellers).",
    read: "The tape shows who is in a hurry. A burst of large green prints means someone wants in now.",
  },
  buy_share: {
    title: "Buy / sell pressure",
    what: "Of the recent trades on the tape, the share of volume that came from aggressive buyers.",
    read: "Above 60% means buyers are crossing the spread more often than sellers. It is a short-term reading of urgency, not of direction tomorrow.",
    now: (c) => c.buyShare != null ? `${Math.round(c.buyShare * 100)}% of recent volume was aggressive buying.` : null,
  },
  big_trades: {
    title: "Large prints",
    what: "Trades highlighted in amber are the largest 10% of recent trades by value (minimum $10k).",
    read: "Large prints show where bigger players are active. A cluster of them at one price can become a level the market remembers.",
  },
  scanner: {
    title: "Market scanner",
    what: "A live ranking of popular pairs by 24h change or by traded volume.",
    read: "Use it to see where money and attention are flowing today, then open the chart and decide calmly.",
    mistake: "Treating the gainers list as a shopping list.",
  },
  sessions: {
    title: "Market sessions",
    what: "Crypto trades 24/7, but liquidity follows people. Volume usually rises when Europe and the US are both awake.",
    read: "Moves during thin hours (late night Europe, weekends) can reverse when the big sessions open.",
  },
  quote: {
    title: "Quote currency",
    what: "The currency the price is measured in. BTC/EUR is the price of one bitcoin in euros.",
    read: "If you hold euros, a EUR pair shows your real result. A USD pair mixes in the EUR/USD exchange rate.",
  },
  unrealized: {
    title: "Unrealized P&L",
    what: "Profit or loss on positions you still hold, valued at the current price. It is not money yet.",
    read: "It moves every second. Decide your exit plan before entry so this number does not make the decision for you.",
    now: (c) => c.openCount ? `You have ${c.openCount} open position${c.openCount === 1 ? "" : "s"}.` : "You have no open positions.",
  },
  realized: {
    title: "Realized P&L",
    what: "The total profit or loss of positions you have closed, after the fees you logged.",
    read: "This is your actual result. Judge your trading on this over many trades, not on single wins.",
  },
  win_rate: {
    title: "Win rate",
    what: "The share of closed trades that made money.",
    read: "On its own it means little. A 30% win rate can be very profitable if winners are much bigger than losers, and 80% can lose money.",
    now: (c) => c.winRate != null ? `Your win rate is ${Math.round(c.winRate * 100)}%.` : null,
  },
  profit_factor: {
    title: "Profit factor",
    what: "Gross profit divided by gross loss over your closed trades.",
    read: "Above 1.0 you make money overall. Above 1.5 is solid; above 2 is strong, if the sample is large enough.",
    now: (c) => c.profitFactor != null && isFinite(c.profitFactor) ? `Your profit factor is ${c.profitFactor.toFixed(2)}.` : null,
  },
  expectancy: {
    title: "Expectancy",
    what: "Average result per closed trade.",
    read: "If positive and stable over many trades, your process has an edge. If negative, more trades means more losses.",
  },
  long_short: {
    title: "Long and short",
    what: "Long: you profit if the price rises. Short: you profit if the price falls.",
    read: "Shorting has open-ended risk because price can rise without limit. Beginners usually learn on longs first.",
  },
  setup: {
    title: "Setup tag",
    what: "A label for why you took the trade: breakout, pullback, reversal and so on.",
    read: "Tagging every trade lets the coach show which of your setups actually make money.",
  },
  coach: {
    title: "Coach",
    what: "Rules that look for behaviour patterns in your closed trades: holding losers too long, chasing overbought moves, fighting the trend.",
    read: "It looks at your behaviour, not at the market. It never tells you what to buy.",
  },
};
