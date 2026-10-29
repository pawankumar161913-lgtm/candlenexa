import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CandleChart } from '../components/Charts'
import {
  Badge,
  Card,
  CardHeader,
  DataStamp,
  DemoBanner,
  Disclaimer,
  ErrorState,
  KeyValue,
  Loading,
  ProbabilityBar,
  SectionTitle,
  Stat,
} from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  CONFIDENCE_META,
  DIRECTION_META,
  TIMEFRAMES,
  fmtNum,
  fmtPrice,
  fmtTime,
} from '../lib/format'

function IndicatorGrid({ ind }) {
  const rows = [
    ['Trend structure', ind.trend, ind.trend === 'bullish' ? 'bull' : ind.trend === 'bearish' ? 'bear' : null],
    ['RSI (14)', `${fmtNum(ind.rsi_14, 1)} · ${ind.rsi_state}`, ind.rsi_state === 'overbought' ? 'bear' : ind.rsi_state === 'oversold' ? 'bull' : null],
    ['MACD histogram', `${fmtNum(ind.macd?.histogram, 6)} · ${ind.macd?.state}`, ind.macd?.state === 'bullish' ? 'bull' : 'bear'],
    ['EMA 21 / 50', `${fmtPrice(ind.ma?.ema_21)} / ${fmtPrice(ind.ma?.ema_50)}`],
    ['SMA 200', fmtPrice(ind.ma?.sma_200)],
    ['Bollinger %B', fmtNum(ind.bollinger?.percent_b, 2)],
    ['ATR (14)', `${fmtNum(ind.atr_14, 5)} · ${fmtNum(ind.atr_pct, 2)}%`],
    ['ADX / +DI / -DI', `${fmtNum(ind.adx, 1)} / ${fmtNum(ind.di?.plus, 1)} / ${fmtNum(ind.di?.minus, 1)}`],
    ['Stochastic %K / %D', `${fmtNum(ind.stochastic?.k, 1)} / ${fmtNum(ind.stochastic?.d, 1)}`],
    ['Volume (last / avg20)', `${fmtNum(ind.volume?.last, 0)} / ${fmtNum(ind.volume?.avg_20, 0)}`],
  ]
  return (
    <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
      {rows.map(([k, v, tone]) => (
        <KeyValue key={k} label={k} value={v} tone={tone} />
      ))}
    </div>
  )
}

function LevelsTable({ sr, price }) {
  const rows = [
    ...(sr?.resistance || []).slice().reverse().map((r) => ({ ...r, type: 'resistance' })),
    ...(sr?.support || []).map((r) => ({ ...r, type: 'support' })),
  ]
  if (!rows.length) return <p className="text-xs text-slate-500">No swing clusters detected in the lookback window.</p>
  return (
    <table className="table-base">
      <thead>
        <tr>
          <th>Level</th>
          <th className="text-right">Price</th>
          <th className="text-right">Distance</th>
          <th className="text-right">Touches</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const dist = ((r.level - price) / price) * 100
          return (
            <tr key={`${r.type}-${i}`}>
              <td>
                <span className={r.type === 'resistance' ? 'text-bear' : 'text-bull'}>
                  {r.type === 'resistance' ? 'Resistance' : 'Support'}
                </span>
              </td>
              <td className="text-right mono text-white">{fmtPrice(r.level)}</td>
              <td className="text-right mono text-slate-400">{dist > 0 ? '+' : ''}{dist.toFixed(2)}%</td>
              <td className="text-right mono text-slate-400">{r.touches}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function MarketAnalysis() {
  const { symbol: rawSymbol } = useParams()
  const symbol = decodeURIComponent(rawSymbol)
  const { user } = useAuth()
  const [timeframe, setTimeframe] = useState(user?.default_timeframe || '1h')
  const [analysis, setAnalysis] = useState(null)
  const [candles, setCandles] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [saved, setSaved] = useState(null)

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setRefreshing(true) : setLoading(true)
      setError(null)
      try {
        const [a, c] = await Promise.all([api.analysis(symbol, timeframe, refresh), api.candles(symbol, timeframe, 400)])
        setAnalysis(a)
        setCandles(c)
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

  const save = async () => {
    try {
      const r = await api.saveAnalysis(symbol, timeframe, `${symbol} ${timeframe} snapshot`)
      setSaved(`Saved as "${r.title}".`)
    } catch (e) {
      setSaved(e.status === 401 ? 'Sign in to save analyses.' : e.message)
    }
    setTimeout(() => setSaved(null), 4000)
  }

  const addWatch = async () => {
    try {
      await api.addWatch({ symbol })
      setSaved('Added to watchlist.')
    } catch (e) {
      setSaved(e.status === 401 ? 'Sign in to use the watchlist.' : e.message)
    }
    setTimeout(() => setSaved(null), 4000)
  }

  if (loading) return <Loading label={`Analysing ${symbol} on ${timeframe}…`} rows={6} />
  if (error) return <ErrorState error={error} onRetry={() => load(true)} />

  const p = analysis.prediction
  const ind = analysis.indicators
  const dir = DIRECTION_META[p.direction] || DIRECTION_META.neutral
  const conf = CONFIDENCE_META[p.confidence_label] || CONFIDENCE_META.none
  const digits = analysis.category === 'forex' ? 5 : 2
  const levels = [
    { label: 'R', price: ind.support_resistance?.nearest_resistance, color: 'rgba(239,68,68,0.5)' },
    { label: 'S', price: ind.support_resistance?.nearest_support, color: 'rgba(34,197,94,0.5)' },
    ...(analysis.levels?.available
      ? [
          { label: 'SL', price: analysis.levels.stop_loss, color: 'rgba(239,68,68,0.9)' },
          { label: 'TP', price: analysis.levels.take_profit, color: 'rgba(34,197,94,0.9)' },
        ]
      : []),
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{analysis.symbol}</h1>
            <Badge className="border-ink-600 bg-ink-800 text-slate-300">{analysis.category}</Badge>
            <Badge className={dir.className}>{dir.label}</Badge>
            <Badge className={conf.className}>{conf.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {analysis.name} · {analysis.market_status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <button className="btn-ghost" onClick={addWatch}>
            + Watchlist
          </button>
          <button className="btn-ghost" onClick={save}>
            Save snapshot
          </button>
          <button className="btn-primary" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {saved && <div className="rounded-xl border border-ai/40 bg-ai/10 px-4 py-2.5 text-xs text-ai">{saved}</div>}
      <DemoBanner isDemo={analysis.data.is_demo} warning={analysis.data.warning} source={analysis.data.provider} lastBar={analysis.data.last_bar_time} />
      {analysis.plan_note && !analysis.data.is_demo && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-300">
          {analysis.plan_note}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-3xl font-extrabold mono text-white">{fmtPrice(analysis.price, digits)}</p>
              <DataStamp
                provider={analysis.data.provider}
                lastBar={analysis.data.last_bar_time}
                fetchedAt={analysis.data.fetched_at}
                isDemo={analysis.data.is_demo}
              />
            </div>
            <p className="text-[11px] text-slate-500">{analysis.data.bars} bars loaded</p>
          </div>
          <CandleChart candles={candles?.candles || []} levels={levels} height={420} />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Forecast" subtitle={p.horizon_label} right={<Badge className={conf.className}>{conf.label}</Badge>} />
            <ProbabilityBar up={p.prob_up} down={p.prob_down} neutral={p.prob_neutral} />
            {p.abstain_reason && (
              <p className="mt-3 rounded-lg border border-ai/30 bg-ai/5 px-3 py-2 text-[11px] leading-relaxed text-ai">
                <strong>Abstained.</strong> {p.abstain_reason}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="OOS accuracy" value={p.metrics?.accuracy != null ? `${(p.metrics.accuracy * 100).toFixed(1)}%` : '—'} />
              <Stat label="Majority baseline" value={p.metrics?.majority_baseline_accuracy != null ? `${(p.metrics.majority_baseline_accuracy * 100).toFixed(1)}%` : '—'} />
              <Stat label="Edge" value={p.metrics?.edge_vs_baseline != null ? `${(p.metrics.edge_vs_baseline * 100).toFixed(1)} pts` : '—'} tone={p.metrics?.edge_vs_baseline > 0 ? 'bull' : 'bear'} />
              <Stat label="Scored bars" value={p.metrics?.sample_size ?? '—'} hint={`${p.metrics?.folds ?? 0} folds`} />
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              Model: {p.model_type?.replace('_', ' ')}. Probabilities are estimates from historical patterns; they are not
              certainties.
            </p>
          </Card>

          <Card>
            <CardHeader title="Levels" subtitle="ATR-based proposal, only with a directional forecast" />
            {analysis.levels?.available ? (
              <>
                <KeyValue label="Entry zone" value={`${fmtPrice(analysis.levels.entry_zone[0], digits)} – ${fmtPrice(analysis.levels.entry_zone[1], digits)}`} />
                <KeyValue label="Stop loss" value={fmtPrice(analysis.levels.stop_loss, digits)} tone="bear" />
                <KeyValue label="Take profit" value={fmtPrice(analysis.levels.take_profit, digits)} tone="bull" />
                <KeyValue label="Risk : reward" value={analysis.levels.risk_reward_ratio} />
                <p className="mt-2 text-[10px] text-slate-500">{analysis.levels.method}</p>
              </>
            ) : (
              <p className="text-xs text-slate-500">{analysis.levels?.reason}</p>
            )}
            <div className="mt-3 border-t border-ink-700 pt-3">
              <KeyValue label="Volatility" value={`${fmtNum(analysis.volatility.atr_pct, 2)}% ATR · ${analysis.volatility.level}`} />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Why this read" subtitle="Computed from the candles above" />
          <ul className="space-y-2">
            {analysis.reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ai" />
                {r}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="What would invalidate it" subtitle="Conditions that flip or void the forecast" />
          <ul className="space-y-2">
            {analysis.invalidation.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-bear" />
                {r}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Model feature contributions" subtitle="Signed effect on the up-probability" />
          <div className="space-y-2">
            {(p.features || []).map((f) => {
              const max = Math.max(...(p.features || []).map((x) => Math.abs(x.contribution)), 1e-6)
              const w = (Math.abs(f.contribution) / max) * 100
              return (
                <div key={f.feature}>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">{f.label}</span>
                    <span className={f.contribution >= 0 ? 'text-bull mono' : 'text-bear mono'}>
                      {f.contribution >= 0 ? '+' : ''}
                      {f.contribution.toFixed(3)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-ink-700">
                    <div
                      className={`h-1.5 rounded-full ${f.contribution >= 0 ? 'bg-bull' : 'bg-bear'}`}
                      style={{ width: `${Math.max(w, 4)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {p.features?.[0]?.method && <p className="mt-3 text-[10px] text-slate-500">Method: {p.features[0].method}</p>}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Technical indicators" subtitle="Latest bar values" />
          <IndicatorGrid ind={ind} />
        </Card>
        <Card>
          <CardHeader title="Support & resistance" subtitle="Swing clusters in the last 200 bars" />
          <LevelsTable sr={ind.support_resistance} price={analysis.price} />
          <h4 className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Candlestick patterns
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {(ind.candle_patterns || []).length === 0 && <p className="text-xs text-slate-500">None detected.</p>}
            {(ind.candle_patterns || []).map((c, i) => (
              <Badge
                key={i}
                className={
                  c.bias === 'bullish'
                    ? 'bg-bull/10 text-bull border-bull/40'
                    : c.bias === 'bearish'
                      ? 'bg-bear/10 text-bear border-bear/40'
                      : 'bg-slate-500/10 text-slate-300 border-slate-500/40'
                }
              >
                {c.name}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Forecast limitations" subtitle="Read before acting on any signal" />
        <ul className="grid gap-2 sm:grid-cols-2">
          {p.limitations.map((l, i) => (
            <li key={i} className="text-xs text-slate-400">
              • {l}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-slate-500">Generated {fmtTime(analysis.generated_at)} ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
      </Card>

      <Disclaimer />
    </div>
  )
}
