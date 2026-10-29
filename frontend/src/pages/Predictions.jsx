import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, CardHeader, Disclaimer, ErrorState, Loading, ProbabilityBar, Stat } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { CONFIDENCE_META, DIRECTION_META, TIMEFRAMES, fmtNum, fmtPrice } from '../lib/format'

const DEFAULT_SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'ETH/USD', 'SPY', 'QQQ']

function Row({ symbol, timeframe }) {
  const [a, setA] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .analysis(symbol, timeframe)
      .then((r) => alive && setA(r))
      .catch((e) => alive && setErr(e))
    return () => {
      alive = false
    }
  }, [symbol, timeframe])

  if (err)
    return (
      <tr>
        <td className="font-semibold text-white">{symbol}</td>
        <td colSpan={7} className="text-[11px] text-slate-500">
          {err.message}
        </td>
      </tr>
    )
  if (!a)
    return (
      <tr>
        <td className="font-semibold text-white">{symbol}</td>
        <td colSpan={7}>
          <div className="skeleton h-4 w-40" />
        </td>
      </tr>
    )
  const p = a.prediction
  const dir = DIRECTION_META[p.direction] || DIRECTION_META.neutral
  const conf = CONFIDENCE_META[p.confidence_label] || CONFIDENCE_META.none
  const edge = p.metrics?.edge_vs_baseline
  return (
    <tr className="hover:bg-ink-800/50">
      <td>
        <Link to={`/market/${encodeURIComponent(symbol)}`} className="font-semibold text-white hover:text-ai-cyan">
          {symbol}
        </Link>
        <div className="text-[11px] text-slate-500">{a.name}</div>
      </td>
      <td className="text-right mono text-white">{fmtPrice(a.price, a.category === 'forex' ? 5 : 2)}</td>
      <td className="text-center">
        <Badge className={dir.className}>{dir.label}</Badge>
      </td>
      <td className="w-40">
        <ProbabilityBar up={p.prob_up} down={p.prob_down} neutral={p.prob_neutral} />
      </td>
      <td className="text-center">
        <Badge className={conf.className}>{conf.label}</Badge>
      </td>
      <td className={`text-right mono ${edge > 0 ? 'text-bull' : edge < 0 ? 'text-bear' : 'text-slate-400'}`}>
        {edge != null ? `${(edge * 100).toFixed(1)} pts` : '—'}
      </td>
      <td className="text-right mono text-slate-300">
        {p.metrics?.accuracy != null ? `${(p.metrics.accuracy * 100).toFixed(1)}%` : '—'}
      </td>
      <td className="text-right text-[11px] text-slate-500">{p.abstain_reason ? 'abstained' : p.horizon_label}</td>
    </tr>
  )
}

export default function Predictions() {
  const { user } = useAuth()
  const [timeframe, setTimeframe] = useState(user?.default_timeframe || '1h')
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)
  const [custom, setCustom] = useState('')
  const [markets, setMarkets] = useState(null)
  const [q, setQ] = useState({ q: '', loading: false, answer: null, error: null })

  useEffect(() => {
    api.markets().then(setMarkets).catch(() => {})
  }, [])

  const addSymbol = () => {
    const s = custom.trim().toUpperCase()
    if (!s) return
    const resolved = markets?.symbols.find((m) => m.symbol === s || m.name.toUpperCase().includes(s))
    const target = resolved?.symbol || s
    if (!symbols.includes(target)) setSymbols((prev) => [target, ...prev])
    setCustom('')
  }

  const ask = async (question) => {
    setQ({ q: question, loading: true, answer: null, error: null })
    try {
      const res = await api.ask({ question, timeframe })
      setQ({ q: question, loading: false, answer: res, error: null })
    } catch (e) {
      setQ({ q: question, loading: false, answer: null, error: e })
    }
  }

  const [suggestions, setSuggestions] = useState([])
  useEffect(() => {
    api.suggestions().then((r) => setSuggestions(r.suggestions || [])).catch(() => {})
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">AI predictions</h1>
          <p className="text-sm text-slate-400">
            Walk-forward validated probability forecasts across markets. Confidence appears only when the model beats a
            naive baseline out of sample.
          </p>
        </div>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat label="Method" value="Walk-forward" hint="expanding window, 4 folds" />
        </Card>
        <Card>
          <Stat label="Models" value="GBM + logistic" hint="chosen by data size" />
        </Card>
        <Card>
          <Stat label="Abstention" value="Built in" hint="no signal when evidence is weak" />
        </Card>
        <Card>
          <Stat label="Horizon" value="4 bars" hint="configurable per timeframe" />
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Forecast board · {timeframe.toUpperCase()}</h3>
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
              placeholder="Add symbol (e.g. AUD/USD)"
              className="w-52 text-xs"
            />
            <button className="btn-ghost text-xs" onClick={addSymbol}>
              Add
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base min-w-[900px]">
            <thead>
              <tr className="bg-ink-850/60">
                <th className="px-4 py-3">Instrument</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-center">Direction</th>
                <th className="px-4 py-3">Probabilities</th>
                <th className="px-4 py-3 text-center">Confidence</th>
                <th className="px-4 py-3 text-right">Edge</th>
                <th className="px-4 py-3 text-right">OOS acc.</th>
                <th className="px-4 py-3 text-right">Horizon</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((s) => (
                <Row key={s} symbol={s} timeframe={timeframe} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Ask the market assistant"
          subtitle="Answers are generated from the current computed snapshot — not from an external language model"
        />
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5 text-[11px] text-slate-300 hover:border-ai/50 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = e.target.elements.q.value.trim()
            if (v) ask(v)
          }}
        >
          <input name="q" placeholder="e.g. What would invalidate the forecast for gold?" className="flex-1 text-sm" />
          <button className="btn-primary" disabled={q.loading}>
            {q.loading ? 'Analysing…' : 'Ask'}
          </button>
        </form>
        {q.loading && <div className="mt-4"><Loading label="Retrieving data and computing…" rows={2} /></div>}
        {q.error && <div className="mt-4"><ErrorState error={q.error} /></div>}
        {q.answer && (
          <div className="mt-4 rounded-xl border border-ai/30 bg-ai/5 p-4 animate-fade-up">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{q.answer.answer}</p>
            {q.answer.used_data?.length > 0 && (
              <div className="mt-3 border-t border-ai/20 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Grounded in</p>
                <ul className="mt-1 space-y-0.5">
                  {q.answer.used_data.map((u, i) => (
                    <li key={i} className="text-[11px] text-slate-400">• {u}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <Disclaimer />
    </div>
  )
}
