import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CandleChart } from '../components/Charts'
import { Badge, Card, DataStamp, DemoBanner, ErrorState, KeyValue, Loading, ProbabilityBar, Stat, Disclaimer } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  CONFIDENCE_META,
  DIRECTION_META,
  TIMEFRAMES,
  fmtPct,
  fmtPrice,
  fmtRelative,
  fmtTime,
} from '../lib/format'

const WATCH_DEFAULT = ['EUR/USD', 'GBP/USD', 'XAU/USD', 'BTC/USD', 'SPY', 'USD/JPY']

function MarketRow({ item, onPick, active }) {
  const up = (item.change_pct ?? 0) >= 0
  return (
    <button
      onClick={() => onPick(item.symbol)}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${
        active ? 'bg-ai/15 border border-ai/40' : 'hover:bg-ink-800 border border-transparent'
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{item.symbol}</p>
        <p className="truncate text-[11px] text-slate-500">{item.name}</p>
      </div>
      <div className="ml-2 text-right">
        <p className="text-sm font-semibold mono text-white">{fmtPrice(item.price)}</p>
        <p className={`text-[11px] font-medium mono ${up ? 'text-bull' : 'text-bear'}`}>{fmtPct(item.change_pct)}</p>
      </div>
    </button>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [symbol, setSymbol] = useState(user?.default_symbol || 'EUR/USD')
  const [timeframe, setTimeframe] = useState(user?.default_timeframe || '1h')
  const [candles, setCandles] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [wallet, setWallet] = useState(null)

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setRefreshing(true) : setLoading(true)
      setError(null)
      try {
        const [c, a] = await Promise.all([
          api.candles(symbol, timeframe, 300),
          api.analysis(symbol, timeframe, refresh),
        ])
        setCandles(c)
        setAnalysis(a)
      } catch (e) {
        setError(e)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [symbol, timeframe],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const list = user ? null : WATCH_DEFAULT
    const run = async () => {
      try {
        if (user) {
          const r = await api.watchlistQuotes()
          setQuotes(r.items || [])
        } else {
          const rs = await Promise.all(list.map((s) => api.quote(s, '1h').catch(() => null)))
          setQuotes(rs.filter(Boolean))
        }
      } catch {
        setQuotes([])
      }
    }
    run()
  }, [user])

  useEffect(() => {
    if (!user) return
    api.wallet().then(setWallet).catch(() => {})
  }, [user])

  const overlays = analysis
    ? [
        { label: 'EMA21', color: '#22d3ee', data: [] },
        { label: 'EMA50', color: '#8b5cf6', data: [] },
      ]
    : []

  const levels = analysis
    ? [
        { label: 'R', price: analysis.indicators.support_resistance?.nearest_resistance, color: 'rgba(239,68,68,0.55)' },
        { label: 'S', price: analysis.indicators.support_resistance?.nearest_support, color: 'rgba(34,197,94,0.55)' },
        ...(analysis.levels?.available
          ? [
              { label: 'SL', price: analysis.levels.stop_loss, color: 'rgba(239,68,68,0.85)' },
              { label: 'TP', price: analysis.levels.take_profit, color: 'rgba(34,197,94,0.85)' },
            ]
          : []),
      ]
    : []

  const p = analysis?.prediction
  const dir = p ? DIRECTION_META[p.direction] : null
  const conf = p ? CONFIDENCE_META[p.confidence_label] : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading dashboard</h1>
          <p className="text-sm text-slate-400">
            {user ? `Welcome back, ${user.full_name || user.email.split('@')[0]}.` : 'Public preview — sign in for watchlists, alerts and paper trading.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="text-sm">
            {[...new Set([symbol, ...WATCH_DEFAULT, ...quotes.map((q) => q.symbol)])].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-ink-600 bg-ink-850 p-0.5">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeframe(t.id)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  timeframe === t.id ? 'bg-ai text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {analysis?.data?.is_demo && (
        <DemoBanner isDemo warning={analysis.data.warning} source={analysis.data.provider} lastBar={analysis.data.last_bar_time} />
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{symbol}</h2>
                  <Badge className="border-ink-600 bg-ink-800 text-slate-300">{timeframe.toUpperCase()}</Badge>
                  {analysis?.market_status && (
                    <span className="text-[11px] text-slate-500">{analysis.market_status}</span>
                  )}
                </div>
                {analysis && (
                  <p className="mt-1 text-3xl font-extrabold mono text-white">{fmtPrice(analysis.price, symbol.includes('/') ? 5 : 2)}</p>
                )}
              </div>
              <div className="text-right">
                <DataStamp
                  provider={analysis?.data?.provider}
                  lastBar={analysis?.data?.last_bar_time}
                  fetchedAt={analysis?.data?.fetched_at}
                  isDemo={analysis?.data?.is_demo}
                  onRefresh={() => load(true)}
                  refreshing={refreshing}
                />
              </div>
            </div>
            {loading ? (
              <div className="skeleton h-[380px] w-full" />
            ) : error ? (
              <ErrorState error={error} onRetry={() => load(true)} />
            ) : (
              <CandleChart candles={candles?.candles || []} overlays={overlays} levels={levels} height={380} />
            )}
          </Card>

          {p && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">AI forecast — estimate only</h3>
                  <p className="text-xs text-slate-500">{p.horizon_label} · model: {p.model_type?.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={dir.className}>{dir.label}</Badge>
                  <Badge className={conf.className}>{conf.label}</Badge>
                </div>
              </div>
              <div className="mt-4 grid gap-5 md:grid-cols-[1fr_240px]">
                <div>
                  <ProbabilityBar up={p.prob_up} down={p.prob_down} neutral={p.prob_neutral} />
                  {p.abstain_reason && (
                    <p className="mt-3 rounded-lg border border-ai/30 bg-ai/5 px-3 py-2 text-xs text-ai">
                      Engine abstained: {p.abstain_reason}
                    </p>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="OOS accuracy" value={p.metrics?.accuracy != null ? `${(p.metrics.accuracy * 100).toFixed(1)}%` : '—'} hint="walk-forward" />
                    <Stat label="Baseline" value={p.metrics?.majority_baseline_accuracy != null ? `${(p.metrics.majority_baseline_accuracy * 100).toFixed(1)}%` : '—'} hint="majority class" />
                    <Stat label="Edge" value={p.metrics?.edge_vs_baseline != null ? `${(p.metrics.edge_vs_baseline * 100).toFixed(1)} pts` : '—'} tone={p.metrics?.edge_vs_baseline > 0 ? 'bull' : 'bear'} />
                    <Stat label="Brier" value={p.metrics?.brier_score ?? '—'} hint="lower is better" />
                  </div>
                </div>
                <div className="space-y-1">
                  {analysis.levels?.available ? (
                    <>
                      <KeyValue label="Entry zone" value={`${fmtPrice(analysis.levels.entry_zone[0])} – ${fmtPrice(analysis.levels.entry_zone[1])}`} />
                      <KeyValue label="Stop loss" value={fmtPrice(analysis.levels.stop_loss)} tone="bear" />
                      <KeyValue label="Take profit" value={fmtPrice(analysis.levels.take_profit)} tone="bull" />
                      <KeyValue label="R : R" value={analysis.levels.risk_reward_ratio} />
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">
                      No entry/stop/target proposal: {analysis?.levels?.reason || 'no directional forecast'}.
                    </p>
                  )}
                  <KeyValue label="Volatility (ATR%)" value={analysis?.volatility?.atr_pct != null ? `${analysis.volatility.atr_pct.toFixed(2)}%` : '—'} />
                  <KeyValue label="Regime" value={analysis?.volatility?.level} />
                </div>
              </div>
              <Link to={`/market/${encodeURIComponent(symbol)}`} className="mt-4 inline-block text-xs font-semibold text-ai-cyan hover:underline">
                Full analysis →
              </Link>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">{user ? 'Your watchlist' : 'Popular markets'}</h3>
            <div className="space-y-1">
              {quotes.length === 0 && <p className="text-xs text-slate-500">No quotes available.</p>}
              {quotes.map((q) => (
                <MarketRow key={q.symbol} item={q} active={q.symbol === symbol} onPick={setSymbol} />
              ))}
            </div>
            {!user && (
              <Link to="/register" className="mt-3 block text-center text-[11px] text-ai-cyan hover:underline">
                Create an account to save your own watchlist
              </Link>
            )}
          </Card>

          {user && wallet && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-white">Paper wallet</h3>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Equity" value={`$${wallet.equity.toLocaleString()}`} />
                <Stat label="Return" value={fmtPct(wallet.return_pct)} tone={wallet.return_pct >= 0 ? 'bull' : 'bear'} />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {wallet.open_positions.length} open position{wallet.open_positions.length === 1 ? '' : 's'} · unrealized $
                {wallet.unrealized_pnl.toLocaleString()}
              </p>
              <Link to="/paper" className="mt-3 inline-block text-xs font-semibold text-ai-cyan hover:underline">
                Manage paper trades →
              </Link>
            </Card>
          )}

          {analysis && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-white">Why the model leans this way</h3>
              <ul className="space-y-2">
                {analysis.reasons.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ai" />
                    {r}
                  </li>
                ))}
              </ul>
              {analysis.invalidation?.length > 0 && (
                <>
                  <h4 className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    What would invalidate it
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.invalidation.slice(0, 3).map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-400">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-bear" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          <Disclaimer compact />
        </div>
      </div>
    </div>
  )
}
