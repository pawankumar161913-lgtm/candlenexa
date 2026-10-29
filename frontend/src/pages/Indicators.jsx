import { useCallback, useEffect, useState } from 'react'
import { CandleChart } from '../components/Charts'
import { Badge, Card, CardHeader, Disclaimer, ErrorState, KeyValue, Loading } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { TIMEFRAMES, fmtNum } from '../lib/format'

function MiniBar({ value, min = -1, max = 1, color = 'bg-ai' }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
  return (
    <div className="h-1.5 w-full rounded-full bg-ink-700">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function Indicators() {
  const { user } = useAuth()
  const [symbol, setSymbol] = useState(user?.default_symbol || 'EUR/USD')
  const [timeframe, setTimeframe] = useState(user?.default_timeframe || '1h')
  const [markets, setMarkets] = useState([])
  const [data, setData] = useState(null)
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.markets().then((m) => setMarkets(m.symbols)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [i, c] = await Promise.all([api.indicators(symbol, timeframe), api.candles(symbol, timeframe, 300)])
      setData(i)
      setCandles(c.candles || [])
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [symbol, timeframe])

  useEffect(() => {
    load()
  }, [load])

  const ind = data?.snapshot
  const series = data?.series || []
  const overlays = [
    { label: 'EMA21', color: '#22d3ee', data: series.filter((s) => s.ema_21).map((s) => ({ time: s.time, value: s.ema_21 })) },
    { label: 'EMA50', color: '#8b5cf6', data: series.filter((s) => s.ema_50).map((s) => ({ time: s.time, value: s.ema_50 })) },
    { label: 'BB upper', color: 'rgba(148,163,184,0.45)', data: series.filter((s) => s.bb_upper).map((s) => ({ time: s.time, value: s.bb_upper })) },
    { label: 'BB lower', color: 'rgba(148,163,184,0.45)', data: series.filter((s) => s.bb_lower).map((s) => ({ time: s.time, value: s.bb_lower })) },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Technical indicators</h1>
          <p className="text-sm text-slate-400">Every value computed server-side from the candles below, using only past bars.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="text-sm">
            {markets.map((m) => (
              <option key={m.symbol} value={m.symbol}>
                {m.symbol}
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

      {loading ? (
        <Loading label="Computing indicators…" rows={5} />
      ) : error ? (
        <ErrorState error={error} onRetry={load} />
      ) : (
        <>
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                {symbol} · {timeframe.toUpperCase()} price with EMA21/50 and Bollinger Bands
              </h3>
              <Badge className={data.is_demo ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'bg-bull/10 text-bull border-bull/40'}>
                {data.is_demo ? 'DEMO' : 'LIVE'}
              </Badge>
            </div>
            <CandleChart candles={candles} overlays={overlays} height={360} />
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Momentum" />
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">RSI (14)</span>
                    <span className="font-semibold text-white mono">{fmtNum(ind.rsi_14, 1)} · {ind.rsi_state}</span>
                  </div>
                  <MiniBar value={ind.rsi_14 || 0} min={0} max={100} color={ind.rsi_14 > 70 ? 'bg-bear' : ind.rsi_14 < 30 ? 'bg-bull' : 'bg-ai'} />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                    <span>oversold 30</span>
                    <span>overbought 70</span>
                  </div>
                </div>
                <KeyValue label="MACD line" value={fmtNum(ind.macd?.line, 6)} />
                <KeyValue label="MACD signal" value={fmtNum(ind.macd?.signal, 6)} />
                <KeyValue label="Histogram" value={fmtNum(ind.macd?.histogram, 6)} tone={ind.macd?.histogram > 0 ? 'bull' : 'bear'} />
                <KeyValue label="ROC (10)" value={`${fmtNum(ind.roc_10, 3)}%`} tone={ind.roc_10 > 0 ? 'bull' : 'bear'} />
                <KeyValue label="Stochastic %K / %D" value={`${fmtNum(ind.stochastic?.k, 1)} / ${fmtNum(ind.stochastic?.d, 1)}`} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Trend & volatility" />
              <div className="space-y-3">
                <KeyValue label="Trend structure" value={ind.trend} tone={ind.trend === 'bullish' ? 'bull' : ind.trend === 'bearish' ? 'bear' : undefined} />
                <KeyValue label="ADX" value={`${fmtNum(ind.adx, 1)} (${ind.adx >= 25 ? 'trending' : 'range'})`} />
                <KeyValue label="+DI / -DI" value={`${fmtNum(ind.di?.plus, 1)} / ${fmtNum(ind.di?.minus, 1)}`} />
                <KeyValue label="ATR (14)" value={fmtNum(ind.atr_14, 5)} />
                <KeyValue label="ATR %" value={`${fmtNum(ind.atr_pct, 3)}%`} />
                <KeyValue label="Volatility regime" value={ind.volatility_level} />
                <KeyValue label="Bollinger width" value={`${fmtNum(ind.bollinger?.width_pct, 3)}%`} />
                <KeyValue label="%B" value={fmtNum(ind.bollinger?.percent_b, 2)} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Moving averages" />
              <div className="space-y-0">
                <KeyValue label="EMA 9" value={fmtNum(ind.ma?.ema_9, 5)} />
                <KeyValue label="EMA 21" value={fmtNum(ind.ma?.ema_21, 5)} />
                <KeyValue label="EMA 50" value={fmtNum(ind.ma?.ema_50, 5)} />
                <KeyValue label="EMA 200" value={fmtNum(ind.ma?.ema_200, 5)} />
                <KeyValue label="SMA 20" value={fmtNum(ind.ma?.sma_20, 5)} />
                <KeyValue label="SMA 50" value={fmtNum(ind.ma?.sma_50, 5)} />
                <KeyValue label="SMA 200" value={fmtNum(ind.ma?.sma_200, 5)} />
              </div>
              <div className="mt-3 border-t border-ink-700 pt-3">
                <p className="text-[11px] text-slate-500">
                  Price {fmtNum(ind.price, 5)} vs SMA200: {' '}
                  <span className={ind.price > ind.ma?.sma_200 ? 'text-bull' : 'text-bear'}>
                    {ind.ma?.sma_200 ? `${(((ind.price - ind.ma.sma_200) / ind.ma.sma_200) * 100).toFixed(2)}%` : 'n/a'}
                  </span>
                </p>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Support & resistance" subtitle="Swing high/low clusters, last 200 bars" />
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th className="text-right">Level</th>
                    <th className="text-right">Touches</th>
                    <th className="text-right">Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(ind.support_resistance?.resistance || []), ...(ind.support_resistance?.support || [])].map((l, i) => {
                    const isRes = i < (ind.support_resistance?.resistance || []).length
                    return (
                      <tr key={i}>
                        <td className={isRes ? 'text-bear' : 'text-bull'}>{isRes ? 'Resistance' : 'Support'}</td>
                        <td className="text-right mono text-white">{fmtNum(l.level, 5)}</td>
                        <td className="text-right mono text-slate-400">{l.touches}</td>
                        <td className="text-right mono text-slate-400">{l.strength}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>

            <Card>
              <CardHeader title="Candlestick patterns" subtitle="Detected on recent bars" />
              {(ind.candle_patterns || []).length === 0 && <p className="text-xs text-slate-500">No classic patterns detected in the last bars.</p>}
              <ul className="space-y-2">
                {(ind.candle_patterns || []).map((p, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2">
                    <span className="text-xs font-medium text-white">{p.name}</span>
                    <Badge
                      className={
                        p.bias === 'bullish'
                          ? 'bg-bull/10 text-bull border-bull/40'
                          : p.bias === 'bearish'
                            ? 'bg-bear/10 text-bear border-bear/40'
                            : 'bg-slate-500/10 text-slate-300 border-slate-500/40'
                      }
                    >
                      {p.bias}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
      <Disclaimer />
    </div>
  )
}
