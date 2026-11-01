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
  paper_account: {
    title: "Paper account",
    what: "A practice account with 10,000 in virtual money. Orders fill against real Kraken prices, with real-world fees, but no money is at risk.",
    read: "Treat it like real money. The habits you build here (sizing, stops, patience) carry over; reckless paper trading teaches nothing.",
    mistake: "Going all-in because it is not real. Size each trade as if it were your own savings.",
  },
  equity: {
    title: "Equity",
    what: "What the account is worth right now: cash plus the current value of every open position.",
    read: "This is the number that matters. Compare it with the 10,000 starting balance to see how you are doing overall.",
  },
  buying_power: {
    title: "Buying power",
    what: "How much more you can put into positions. Paper accounts use no leverage, so open positions can never be worth more than your equity.",
    read: "Leverage multiplies both gains and losses. Learn to trade profitably without it before considering it anywhere else.",
  },
  order_type: {
    title: "Order types",
    what: "Market: fill now at the best available price. Limit: fill only at your price or better, and wait in the book until then. Stop: do nothing until the price reaches a trigger, then fill at market.",
    read: "Market orders buy certainty of execution and pay the spread and the higher fee. Limit orders get your price but may never fill. Stops are mostly used to get out when you are wrong.",
    mistake: "Using a stop order to buy a dip. A buy stop triggers when price rises to it; to buy lower, use a buy limit.",
  },
  fees: {
    title: "Trading fees",
    what: "The exchange charges a percentage of each trade. Desk101 uses Kraken Pro's entry tier: 0.40% for taker orders (market, stops, limits that fill immediately) and 0.25% for maker orders (limits that rest in the book first).",
    read: "A round trip with market orders costs about 0.8% plus the spread. A trade has to move more than that just to break even.",
    mistake: "Trading very often for small moves. Fees quietly eat most of the profit.",
  },
  bracket: {
    title: "Exit plan (stop-loss and take-profit)",
    what: "Two orders attached to your entry. The stop-loss closes the position if price moves against you; the take-profit closes it at your target. When one fills, the other is cancelled (one-cancels-the-other).",
    read: "Deciding your exits before entering removes most emotional decisions later. Professionals know where they are wrong before they get in.",
    mistake: "Moving the stop further away when price approaches it. That turns a small planned loss into a large unplanned one.",
  },
  risk_reward: {
    title: "Risk and reward",
    what: "Risk is what you lose if the stop-loss fills, including fees. Reward is what you gain at the take-profit. The ratio between them is often written as R, e.g. 2R means the target is twice the risk.",
    read: "Many traders risk 1% or less of equity per trade. With a 2R target you can be wrong more than half the time and still grow the account.",
    now: (c) => c.ticker ? `Example: risking 1% of a 10,000 account is 100. If your stop is 2% below entry, the position can be about 5,000 in size.` : null,
  },
  avg_entry: {
    title: "Average entry",
    what: "When you add to a position, the entry becomes the size-weighted average of all your buys (or sells, for a short).",
    read: "Adding to a losing position lowers the average but increases the risk. Be deliberate about it.",
  },
  calendar: {
    title: "Economic calendar",
    what: "Scheduled releases that regularly move markets: central bank decisions, inflation, jobs and growth data. Times are shown in your own time zone.",
    read: "Crypto trades around the clock but reacts to the same macro news as stocks and currencies. In the minutes around a high-impact release, spreads widen and price can jump in either direction.",
    mistake: "Holding a large position with a tight stop into a release. A sudden spike can trigger the stop and then reverse.",
  },
  cal_fomc: {
    title: "Fed rate decision (FOMC)",
    what: "The US Federal Reserve's committee sets the target for short-term interest rates eight times a year. The statement comes at 14:00 New York time and the Chair's press conference at 14:30. Four meetings a year also publish economic projections, including the 'dot plot'.",
    read: "Lower rates and softer language usually support risk assets like crypto; higher rates or a hawkish tone usually weigh on them. Markets often price the decision in advance, so the surprise matters more than the decision itself.",
    mistake: "Trading the first move. The statement and the press conference can push price in opposite directions within the same hour.",
  },
  cal_ecb: {
    title: "ECB rate decision",
    what: "The European Central Bank sets euro-area interest rates. The decision is published at 14:15 Frankfurt time, followed by a press conference at 14:45.",
    read: "It moves EUR first. For crypto it matters most through EUR/USD and through BTC/EUR pairs: if you hold euros, your result depends on the euro too.",
  },
  cal_cpi: {
    title: "US CPI (consumer price inflation)",
    what: "The monthly change in prices paid by US consumers, published by the Bureau of Labor Statistics at 08:30 New York time. 'Core' CPI leaves out food and energy.",
    read: "Higher-than-expected inflation makes rate cuts less likely, which tends to push crypto down; lower-than-expected does the opposite. It is often the most volatile release of the month for BTC.",
    mistake: "Reading only the headline number. Traders focus on core CPI and on the gap between the result and the forecast.",
  },
  cal_nfp: {
    title: "US jobs report (Nonfarm payrolls)",
    what: "Released on the first Friday of most months at 08:30 New York time: how many jobs the US economy added, the unemployment rate and wage growth.",
    read: "A very strong labour market can keep rates higher for longer; a sharp slowdown raises fears of recession. Both can move crypto, and the reaction is often fast and noisy.",
  },
  cal_pce: {
    title: "US PCE inflation",
    what: "Personal Consumption Expenditures prices, published by the Bureau of Economic Analysis. It is the inflation measure the Fed itself targets at 2%.",
    read: "It usually arrives after CPI, so markets can partly anticipate it. A surprise in core PCE still moves rate expectations.",
  },
  cal_gdp: {
    title: "US GDP",
    what: "The growth of the US economy over a quarter, published in three rounds: an advance estimate about a month after the quarter, then second and third estimates.",
    read: "The advance estimate moves markets most. Later revisions rarely do unless they change the picture a lot.",
  },
  cal_hicp: {
    title: "Euro area inflation (flash)",
    what: "Eurostat's first estimate of consumer price inflation for the euro area, published at 11:00 Frankfurt time around the turn of each month.",
    read: "It shapes expectations for the next ECB decision and moves EUR. Check it if you trade BTC/EUR or hold euros.",
  },
  cal_expiry: {
    title: "Options expiry",
    what: "Bitcoin and Ether options on Deribit, the largest crypto options exchange, expire on the last Friday of each month at 08:00 UTC. Quarterly expiries (March, June, September, December) are the largest.",
    read: "Large open positions near one price can pull the market toward it before expiry ('max pain'), and volatility can change once the options are gone. The effect is real but unreliable.",
  },
  news: {
    title: "Official news",
    what: "Press releases straight from the institutions that move markets: the Federal Reserve and the ECB (interest rates, speeches), the US Bureau of Labor Statistics (inflation and jobs data), and the SEC and ESMA (the US and EU market regulators, including crypto rules such as MiCA). Each headline links to the original.",
    read: "Official releases are the primary source: news articles about them come later and add interpretation. Speeches by central bankers often hint at the next rate decision. Regulator releases matter for crypto when they approve, restrict or fine.",
    mistake: "Trading on someone else's summary of an official release. Go to the source: the exact wording often matters more than the headline.",
  },
  coach: {
    title: "Coach",
    what: "Rules that look for behaviour patterns in your closed trades: holding losers too long, chasing overbought moves, fighting the trend.",
    read: "It looks at your behaviour, not at the market. It never tells you what to buy.",
  },
};
