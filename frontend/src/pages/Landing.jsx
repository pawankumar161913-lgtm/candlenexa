import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CandleChart } from '../components/Charts'
import { ProbabilityBar, Badge, Spinner } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { DIRECTION_META, CONFIDENCE_META, TIMEFRAMES, fmtPrice, fmtPct, fmtRelative, fmtTime } from '../lib/format'

function HeroPreview() {
  const [candles, setCandles] = useState([])
  const [err, setErr] = useState(null)
  useEffect(() => {
    api
      .candles('EUR/USD', '1h', 180)
      .then((d) => setCandles(d.candles || []))
      .catch(setErr)
  }, [])
  if (err)
    return <div className="flex h-[300px] items-center justify-center text-xs text-slate-500">chart unavailable</div>
  if (!candles.length)
    return (
      <div className="flex h-[300px] items-center justify-center gap-2 text-xs text-slate-500">
        <Spinner className="text-ai" /> loading live candles…
      </div>
    )
  return <CandleChart candles={candles} height={300} />
}

function MiniSignal() {
  const [a, setA] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    api.analysis('EUR/USD', '1h').then(setA).catch(setErr)
  }, [])
  if (err) return <p className="text-xs text-slate-500">Signal preview unavailable.</p>
  if (!a) return <div className="skeleton h-24" />
  const d = DIRECTION_META[a.prediction.direction] || DIRECTION_META.neutral
  const c = CONFIDENCE_META[a.prediction.confidence_label] || CONFIDENCE_META.none
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">EUR/USD · 1H</p>
          <p className="text-xl font-bold text-white mono">{fmtPrice(a.price, 5)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge className={d.className}>{d.label}</Badge>
          <Badge className={c.className}>{c.label}</Badge>
        </div>
      </div>
      <ProbabilityBar
        up={a.prediction.prob_up}
        down={a.prediction.prob_down}
        neutral={a.prediction.prob_neutral}
      />
      <p className="text-[11px] text-slate-500">
        {a.prediction.horizon_label} · accuracy{' '}
        {a.prediction.metrics?.accuracy != null ? `${(a.prediction.metrics.accuracy * 100).toFixed(1)}%` : 'n/a'} vs
        baseline{' '}
        {a.prediction.metrics?.majority_baseline_accuracy != null
          ? `${(a.prediction.metrics.majority_baseline_accuracy * 100).toFixed(1)}%`
          : 'n/a'}
      </p>
    </div>
  )
}

const FEATURES = [
  {
    title: 'Live market data',
    body: 'Real OHLC candles from Twelve Data across 1m to 1D, with the provider and last-bar timestamp on every screen. If live data fails you get an explicit DEMO label — never a silent fake price.',
    icon: '📈',
  },
  {
    title: 'Transparent indicators',
    body: 'EMA/SMA stacks, RSI, MACD, Bollinger Bands, ATR, ADX, Stochastic, OBV, swing-based support/resistance zones and candlestick patterns — all computed server-side from the same candles you see.',
    icon: '🧮',
  },
  {
    title: 'Walk-forward predictions',
    body: 'A gradient-boosting / logistic model is retrained fold-by-fold and scored only on data it has never seen. Confidence is reported only when that out-of-sample edge is real — otherwise the engine abstains.',
    icon: '🤖',
  },
  {
    title: 'Backtests without look-ahead',
    body: 'Signals on bar t execute at the open of t+1, stops fill before targets, and spread, commission and slippage are charged. Compared against a simple rule baseline, with the period and sample size stated.',
    icon: '🔍',
  },
  {
    title: 'Risk first',
    body: 'Position sizing from balance, risk %, entry and stop, with cost and slippage assumptions, R-multiple, breakeven win rate and leverage warnings.',
    icon: '🛡️',
  },
  {
    title: 'Grounded assistant',
    body: 'Ask "why is gold moving?" or "is the evidence too weak?" and get an answer built from the current computed snapshot — with sources and an explicit note when data is unavailable.',
    icon: '💬',
  },
]

export default function Landing() {
  const { isAuthed } = useAuth()
  const [markets, setMarkets] = useState(null)
  useEffect(() => {
    api.markets().then(setMarkets).catch(() => {})
  }, [])

  return (
    <div className="space-y-16">
      {/* hero */}
      <section className="grid items-center gap-8 pt-6 lg:grid-cols-2 lg:pt-12">
        <div className="animate-fade-up">
          <span className="badge border-ai/40 bg-ai/10 text-ai">
            <span className="h-1.5 w-1.5 rounded-full bg-ai animate-pulse-soft" />
            Analytical workspace · estimates, not advice
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
            See the market with
            <span className="bg-gradient-to-r from-ai via-ai-cyan to-bull bg-clip-text text-transparent"> measurable clarity</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
            CandleNexa turns live candles into a complete analytical picture: trend structure, momentum, volatility,
            support and resistance, a walk-forward validated probability forecast, and the risk maths to size it. Every
            number is traceable to data and a documented method.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to={isAuthed ? '/dashboard' : '/register'} className="btn-primary px-5 py-3">
              {isAuthed ? 'Open dashboard' : 'Create free account'}
            </Link>
            <Link to="/markets" className="btn-ghost px-5 py-3">
              Explore markets
            </Link>
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[
              { k: markets?.symbols?.length ?? '—', v: 'instruments' },
              { k: '6', v: 'timeframes' },
              { k: '10+', v: 'indicators' },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-ink-700 bg-ink-900/60 py-3">
                <dt className="text-lg font-bold text-white">{s.k}</dt>
                <dd className="text-[11px] uppercase tracking-wider text-slate-500">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card animate-fade-up p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              {TIMEFRAMES.map((t) => (
                <span
                  key={t.id}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    t.id === '1h' ? 'bg-ai/20 text-ai' : 'text-slate-500'
                  }`}
                >
                  {t.label}
                </span>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">EUR/USD · live</span>
          </div>
          <HeroPreview />
          <div className="mt-4 rounded-xl border border-ink-700 bg-ink-850/70 p-4">
            <MiniSignal />
          </div>
        </div>
      </section>

      {/* feature grid */}
      <section>
        <h2 className="text-2xl font-bold text-white">Built to be checked, not believed</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          No black boxes and no promises. Each component states its inputs, its assumptions and its limits — including
          the times it refuses to produce a signal.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-ink-800 text-lg">
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* markets strip */}
      {markets?.symbols && (
        <section>
          <h2 className="text-2xl font-bold text-white">Markets covered</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {markets.categories.map((cat) => {
              const list = markets.symbols.filter((s) => s.category === cat)
              if (!list.length) return null
              return (
                <div key={cat} className="card p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ai">{cat}</h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {list.slice(0, 12).map((s) => (
                      <Link
                        key={s.symbol}
                        to={`/market/${encodeURIComponent(s.symbol)}`}
                        className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-ai/50 hover:text-white"
                      >
                        {s.symbol}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* how it works */}
      <section className="card p-6">
        <h2 className="text-xl font-bold text-white">How a forecast is produced</h2>
        <ol className="mt-5 grid gap-5 md:grid-cols-4">
          {[
            ['01', 'Fetch candles', 'Provider OHLC series for the chosen symbol and timeframe, cached and throttled.'],
            ['02', 'Compute features', 'Indicators and price structure, using only bars up to now — no future data.'],
            ['03', 'Walk-forward score', 'The model is refit on an expanding window and scored on unseen blocks.'],
            ['04', 'Decide or abstain', 'Direction, probabilities and confidence — or an explicit "no signal".'],
          ].map(([n, t, b]) => (
            <li key={n}>
              <span className="font-mono text-xs text-ai">{n}</span>
              <p className="mt-1 text-sm font-semibold text-white">{t}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-ai/30 bg-gradient-to-br from-ai/15 via-ink-900 to-ink-900 p-8 text-center">
        <h2 className="text-2xl font-bold text-white">Start with a virtual wallet, not real money</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-300">
          Paper trading is built in: open simulated positions with virtual funds, log the trade, and let the platform
          track P&amp;L, win rate and drawdown. CandleNexa never connects to a brokerage.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to={isAuthed ? '/paper' : '/register'} className="btn-primary px-5 py-3">
            {isAuthed ? 'Go to paper trading' : 'Create account'}
          </Link>
          <Link to="/help" className="btn-ghost px-5 py-3">
            Read the methodology
          </Link>
        </div>
      </section>
    </div>
  )
}
