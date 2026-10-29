import { Card, CardHeader, Disclaimer } from '../components/UI'

const SECTIONS = [
  {
    id: 'what',
    title: 'What CandleNexa does',
    body: [
      'CandleNexa is an analytics workspace. It retrieves market candles from a licensed data provider, computes technical indicators from those candles, fits a statistical model on historical data, validates it on unseen data, and presents the result with its uncertainty and its limits.',
      'It does not place trades, connect to a brokerage, manage money, or tell you what to buy. The paper-trading module is a simulator with virtual funds.',
    ],
  },
  {
    id: 'data',
    title: 'Market data & providers',
    body: [
      'Live prices and OHLC candles come from Twelve Data. Every screen shows the provider, the last-bar timestamp and the fetch time in your local timezone.',
      'Requests are cached (60s quotes, 5 min series) and spaced at least 8 seconds apart to stay inside the free plan (~8 credits/minute, 800/day). Quotes on the explorer therefore arrive in small batches.',
      'Symbol access depends on the provider plan. If a symbol is not included in your plan the API returns an upgrade error and the platform displays it verbatim — it never fabricates a price. Cash indices (SPX, NDX) and silver spot are typical examples; ETFs such as SPY/QQQ track the same benchmarks and work on the free tier.',
      'If the provider is unreachable, misconfigured, or out of credits, the platform switches to an explicitly labelled DEMO mode with synthetic series so the interface remains explorable. Demo numbers are never presented as market data.',
    ],
  },
  {
    id: 'indicators',
    title: 'Indicators and market structure',
    body: [
      'Every indicator is computed server-side, causally: the value at bar t uses only bars ≤ t. Included: EMA(9/21/50/200), SMA(20/50/100/200), RSI(14), MACD(12,26,9), Bollinger(20, 2σ), ATR(14), ADX/±DI(14), Stochastic(14,3), OBV, ROC(10) and 20-bar realised volatility.',
      'Support and resistance levels come from swing-point clustering: swing highs and lows over the last 200 bars are grouped within 0.75 × ATR and scored by the number of touches. Candlestick patterns (hammer, shooting star, engulfing, doji, marubozu, outside bar) are detected on the most recent bars.',
    ],
  },
  {
    id: 'model',
    title: 'How the forecast is produced',
    body: [
      'Outcome definition: over the next N bars (default 4) the close is labelled UP if it rises at least 0.35 × ATR(14) above the current close, DOWN if it falls at least 0.35 × ATR below, and NEUTRAL otherwise. The band is stated so that a tiny drift is not counted as a directional win.',
      'Features (15): 1/3/5/10-bar returns, RSI deviation, ATR-normalised MACD histogram, EMA21-EMA50 spread, price vs SMA200, Bollinger %B and width, ATR%, ADX, ±DI spread, volume vs 20-bar average, Stochastic %K.',
      'Two model families are used: a standardised multinomial logistic regression (transparent, additive contributions) and, when ≥600 usable rows exist, a histogram gradient-boosting classifier. A transparent ATR-scaled momentum baseline is always reported alongside.',
      'Validation is walk-forward: the model is refit on an expanding window and scored only on the block that immediately follows, four times over. The metrics shown on every screen (accuracy, majority-class baseline, edge, Brier score, per-class precision/recall) come from those out-of-sample predictions. The live forecast is produced by a final refit on all labelled history.',
    ],
  },
  {
    id: 'confidence',
    title: 'When the engine refuses to give a signal',
    body: [
      'Confidence is only labelled when the out-of-sample edge over the naive majority-class baseline is at least 2 points and at least 80 bars were scored. Below that the confidence label reads “uncalibrated” and no claim is made.',
      'The engine abstains entirely (direction = no_signal) when: fewer than 220 usable rows exist, walk-forward folds cannot be formed, or the model did not beat the majority-class baseline out of sample. In that case the reason is displayed instead of a prediction.',
      'Probabilities are model estimates conditioned on historical patterns. They are not empirical win rates for the next trade, and they do not account for news, liquidity or gaps.',
    ],
  },
  {
    id: 'levels',
    title: 'Entry, stop and target proposals',
    body: [
      'A level proposal is only produced when there is a directional forecast. Entry zone = price ∓ 0.25 × ATR; stop = 1.5 × ATR beyond the entry, adjusted to the nearest swing level; target = 1.5 × the risk distance, capped at the nearest opposing level. The method is printed next to the numbers.',
      'A stop-loss caps intended risk, not realised risk. Gaps, thin liquidity and news can fill far beyond the stop. Position size — not the stop — is what actually limits the loss you can take.',
    ],
  },
  {
    id: 'backtest',
    title: 'Backtesting method',
    body: [
      'Signals are computed on the close of bar t and executed at the OPEN of bar t+1. Exits are evaluated bar by bar inside the horizon; when both the stop and the target are touched in the same bar the stop is assumed to fill first (conservative).',
      'Costs: spread + commission charged per round trip, plus explicit adverse slippage on stop exits. Defaults are 1 bps spread, 0.5 bps commission and 1 bps slippage — adjust them to your broker.',
      'The model strategy is compared with a simple EMA21/EMA50 crossover filtered by RSI, over the same out-of-sample window with the same costs. Reported: trades, win rate, average win/loss, profit factor, compounded net return, maximum drawdown, stop/target exits.',
      'Backtested performance is a description of the past under stated assumptions. It is not a forecast, and it does not survive every regime change.',
    ],
  },
  {
    id: 'assistant',
    title: 'The market assistant',
    body: [
      'The assistant is not a free-form language model. Questions are routed to real computations: it detects the symbol and timeframe, loads the current snapshot and model output, and renders the relevant fields. If data cannot be retrieved it says so rather than guessing, and each answer lists the data it was grounded in.',
      'This design makes answers reproducible and auditable: the same question on the same data returns the same numbers.',
    ],
  },
  {
    id: 'security',
    title: 'Accounts, security and privacy',
    body: [
      'Passwords are hashed with bcrypt; authentication uses short-lived signed JWTs; all input is validated with Pydantic; API routes are rate limited per client IP; the market-data key lives only in the backend environment and is never sent to the browser.',
      'Watchlists, alerts, saved snapshots and paper trades are stored per account in the database (SQLite by default, PostgreSQL supported). Nothing is shared between accounts.',
    ],
  },
  {
    id: 'limitations',
    title: 'Known limitations',
    body: [
      'No news, economic-calendar or order-book data is integrated, so event risk is invisible to the model.',
      'Free-tier data is end-of-bar and rate limited; intraday latency is not suitable for scalping.',
      'The statistical edge on liquid instruments is usually small — often within noise. A “no signal” result is a legitimate and common outcome.',
      'Demo mode produces synthetic prices that carry no market information whatsoever.',
    ],
  },
  {
    id: 'disclosures',
    title: 'Risk disclosures',
    body: [
      'Market predictions are uncertain and losses are possible. This platform provides analytical information, not guaranteed profits or personalized financial advice.',
      'Trading leveraged products can result in losses exceeding your deposit. Past performance, backtests and model accuracy figures do not predict future results.',
      'CandleNexa is not a registered investment adviser, broker or portfolio manager. Consult a licensed professional before making financial decisions.',
    ],
  },
]

export default function Help() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Help, methodology & risk disclosures</h1>
        <p className="text-sm text-slate-400">
          Exactly how the platform works, what it measures, and where it can be wrong.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit lg:sticky lg:top-24">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">On this page</p>
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-ink-800 hover:text-white">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          {SECTIONS.map((s) => (
            <Card key={s.id} id={s.id}>
              <CardHeader title={s.title} />
              <div className="space-y-3">
                {s.body.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-300">
                    {p}
                  </p>
                ))}
              </div>
            </Card>
          ))}
          <Disclaimer />
        </div>
      </div>
    </div>
  )
}
