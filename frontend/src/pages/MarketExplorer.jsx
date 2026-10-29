import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from '../components/Charts'
import { Badge, Card, Loading, ErrorState, Disclaimer } from '../components/UI'
import { api } from '../lib/api'
import { CATEGORY_META, fmtPct, fmtPrice } from '../lib/format'

function Row({ q, onAdd }) {
  const up = (q.change_pct ?? 0) >= 0
  if (q.error) {
    return (
      <tr>
        <td className="font-semibold text-white">{q.symbol}</td>
        <td colSpan={5} className="text-xs text-slate-500">
          unavailable: {q.error}
        </td>
      </tr>
    )
  }
  return (
    <tr className="hover:bg-ink-800/50">
      <td>
        <Link to={`/market/${encodeURIComponent(q.symbol)}`} className="font-semibold text-white hover:text-ai-cyan">
          {q.symbol}
        </Link>
        <div className="text-[11px] text-slate-500">{q.name}</div>
      </td>
      <td className="text-right font-semibold mono text-white">{fmtPrice(q.price)}</td>
      <td className={`text-right font-semibold mono ${up ? 'text-bull' : 'text-bear'}`}>{fmtPct(q.change_pct)}</td>
      <td className="w-28">
        <Sparkline data={q.sparkline} positive={up} width={100} height={30} />
      </td>
      <td className="text-right">
        {q.is_demo ? (
          <span className="text-[10px] font-semibold uppercase text-amber-400">demo</span>
        ) : (
          <span className="text-[10px] font-semibold uppercase text-bull">live</span>
        )}
      </td>
      <td className="text-right">
        <button onClick={() => onAdd(q.symbol)} className="text-[11px] font-semibold text-ai-cyan hover:underline">
          + watch
        </button>
      </td>
    </tr>
  )
}

export default function MarketExplorer() {
  const [markets, setMarkets] = useState(null)
  const [quotes, setQuotes] = useState({})
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    api
      .markets()
      .then((m) => {
        setMarkets(m)
        // load quotes progressively to respect provider rate limits
        const symbols = m.symbols.map((s) => s.symbol)
        const run = async () => {
          for (let i = 0; i < symbols.length; i += 4) {
            const batch = symbols.slice(i, i + 4)
            const res = await Promise.all(batch.map((s) => api.quote(s, '1h').catch((e) => ({ symbol: s, error: e.message }))))
            setQuotes((prev) => {
              const next = { ...prev }
              res.forEach((r) => (next[r.symbol] = r))
              return next
            })
          }
          setLoading(false)
        }
        run()
      })
      .catch((e) => {
        setError(e)
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    if (!markets) return []
    return markets.symbols.filter((s) => {
      const inCat = category === 'all' || s.category === category
      const q = query.trim().toUpperCase()
      const inQuery = !q || s.symbol.includes(q) || s.name.toUpperCase().includes(q)
      return inCat && inQuery
    })
  }, [markets, category, query])

  const add = async (symbol) => {
    try {
      await api.addWatch({ symbol })
      setNotice(`${symbol} added to your watchlist.`)
    } catch (e) {
      setNotice(e.status === 401 ? 'Sign in to save a watchlist.' : e.message)
    }
    setTimeout(() => setNotice(null), 3500)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Market explorer</h1>
          <p className="text-sm text-slate-400">
            {markets ? `${markets.symbols.length} supported instruments across ${markets.categories.length} categories.` : 'Loading catalogue…'}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter symbols…"
            className="w-56 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['all', ...(markets?.categories || [])].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              category === c ? 'bg-ai text-white' : 'bg-ink-850 text-slate-400 border border-ink-600 hover:text-white'
            }`}
          >
            {c === 'all' ? 'All markets' : CATEGORY_META[c]?.label || c}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rounded-xl border border-ai/40 bg-ai/10 px-4 py-2.5 text-xs text-ai animate-fade-up">{notice}</div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => window.location.reload()} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="table-base min-w-[720px]">
              <thead>
                <tr className="bg-ink-850/60">
                  <th className="px-4 py-3">Instrument</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3">Last 40 bars</th>
                  <th className="px-4 py-3 text-right">Source</th>
                  <th className="px-4 py-3 text-right">Watchlist</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <Row key={s.symbol} q={{ symbol: s.symbol, name: s.name, ...(quotes[s.symbol] || {}) }} onAdd={add} />
                ))}
              </tbody>
            </table>
          </div>
          {loading && (
            <div className="border-t border-ink-700 p-4">
              <Loading label="Fetching quotes (throttled to respect the provider rate limit)…" rows={2} />
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-white">Why some symbols may be unavailable</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Twelve Data grants symbol access by plan. Silver spot (XAG/USD) and cash index symbols such as SPX need a
            paid tier; the platform shows the provider's own error instead of inventing a price. Index exposure is
            available through liquid ETFs (SPY, QQQ, DIA, IWM) which track the same benchmarks.
          </p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-white">Rate limits are handled server-side</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Requests are cached and spaced at least 8 seconds apart (free-plan limit ≈ 8 credits/minute). Quotes may
            therefore appear in batches rather than all at once.
          </p>
        </Card>
      </div>
      <Disclaimer />
    </div>
  )
}
