import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from '../components/Charts'
import { Badge, Card, CardHeader, Disclaimer, EmptyState, ErrorState, Loading } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { TIMEFRAMES, fmtPct, fmtPrice, fmtRelative, fmtTime } from '../lib/format'

function AlertForm({ onCreated, symbols }) {
  const [form, setForm] = useState({ symbol: 'EUR/USD', condition: 'above', threshold: '', timeframe: '1h', note: '' })
  const [err, setErr] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    try {
      await api.addAlert({ ...form, threshold: Number(form.threshold) })
      setForm({ ...form, threshold: '', note: '' })
      onCreated()
    } catch (e2) {
      setErr(e2.message)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Symbol</label>
          <select value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="w-full">
            {symbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>{s.symbol}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Condition</label>
          <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="w-full">
            <option value="above">Price rises above</option>
            <option value="below">Price falls below</option>
            <option value="pct_change">Absolute % move ≥</option>
            <option value="rsi_above">RSI above</option>
            <option value="rsi_below">RSI below</option>
          </select>
        </div>
        <div>
          <label className="label">Threshold</label>
          <input type="number" step="any" required value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className="w-full" />
        </div>
        <div>
          <label className="label">Check on timeframe</label>
          <select value={form.timeframe} onChange={(e) => setForm({ ...form, timeframe: e.target.value })} className="w-full">
            {TIMEFRAMES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Note (optional)</label>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full" placeholder="e.g. breakout retest" />
      </div>
      {err && <p className="text-xs text-bear">{err}</p>}
      <button className="btn-primary w-full">Create alert</button>
    </form>
  )
}

export default function Watchlist() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [alerts, setAlerts] = useState([])
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [symbolToAdd, setSymbolToAdd] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [w, a] = await Promise.all([api.watchlistQuotes(), api.alerts()])
      setItems(w.items || [])
      setAlerts(a || [])
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    load()
    api.markets().then((m) => setMarkets(m.symbols)).catch(() => {})
  }, [user, load])

  if (!user)
    return (
      <Card>
        <EmptyState
          title="Sign in to use the watchlist"
          hint="Watchlists, price alerts and saved analyses are stored per account."
          action={<Link to="/login" className="btn-primary">Log in</Link>}
        />
      </Card>
    )

  const addSymbol = async () => {
    if (!symbolToAdd) return
    try {
      await api.addWatch({ symbol: symbolToAdd })
      setSymbolToAdd('')
      load()
    } catch (e) {
      setError(e)
    }
  }

  const remove = async (id) => {
    await api.removeWatch(id)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Watchlist & alerts</h1>
          <p className="text-sm text-slate-400">Track instruments and get in-app notifications when conditions are met.</p>
        </div>
        <div className="flex gap-2">
          <select value={symbolToAdd} onChange={(e) => setSymbolToAdd(e.target.value)} className="text-sm">
            <option value="">Add instrument…</option>
            {markets
              .filter((m) => !items.some((i) => i.symbol === m.symbol))
              .map((m) => (
                <option key={m.symbol} value={m.symbol}>{m.symbol} — {m.name}</option>
              ))}
          </select>
          <button className="btn-primary" onClick={addSymbol} disabled={!symbolToAdd}>Add</button>
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={load} />}
      {loading ? (
        <Loading label="Loading watchlist quotes…" rows={4} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Card className="p-0">
            <div className="border-b border-ink-700 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">Watched instruments ({items.length})</h3>
            </div>
            {items.length === 0 ? (
              <EmptyState title="Nothing watched yet" hint="Add an instrument above to start tracking it." />
            ) : (
              <div className="divide-y divide-ink-700/70">
                {items.map((i) => (
                  <div key={i.item_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/market/${encodeURIComponent(i.symbol)}`} className="text-sm font-semibold text-white hover:text-ai-cyan">
                        {i.symbol}
                      </Link>
                      <p className="truncate text-[11px] text-slate-500">{i.name}</p>
                    </div>
                    <Sparkline data={i.sparkline} positive={(i.change_pct ?? 0) >= 0} width={90} height={28} />
                    <div className="w-24 text-right">
                      <p className="text-sm font-semibold mono text-white">{fmtPrice(i.price)}</p>
                      <p className={`text-[11px] mono ${i.change_pct >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtPct(i.change_pct)}</p>
                    </div>
                    <Badge className={i.is_demo ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'bg-bull/10 text-bull border-bull/40'}>
                      {i.is_demo ? 'demo' : 'live'}
                    </Badge>
                    <button onClick={() => remove(i.item_id)} className="text-[11px] text-slate-500 hover:text-bear">remove</button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title="New price alert" />
              <AlertForm symbols={markets} onCreated={load} />
            </Card>
            <Card className="p-0">
              <div className="border-b border-ink-700 px-4 py-3">
                <h3 className="text-sm font-semibold text-white">Your alerts ({alerts.length})</h3>
              </div>
              {alerts.length === 0 ? (
                <p className="px-4 py-6 text-xs text-slate-500">No alerts yet.</p>
              ) : (
                <ul className="divide-y divide-ink-700/70">
                  {alerts.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white">
                          {a.symbol} · {a.condition.replace('_', ' ')} {a.threshold}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {a.timeframe} · {a.triggered_at ? `triggered ${fmtRelative(a.triggered_at)}` : a.last_checked_at ? `checked ${fmtRelative(a.last_checked_at)}` : 'pending'}
                          {a.last_value != null && ` · last ${a.last_value.toFixed(5)}`}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          await api.toggleAlert(a.id)
                          load()
                        }}
                        className={`badge ${a.is_active ? 'bg-bull/10 text-bull border-bull/40' : 'bg-slate-500/10 text-slate-400 border-slate-500/40'}`}
                      >
                        {a.is_active ? 'active' : 'paused'}
                      </button>
                      <button
                        onClick={async () => {
                          await api.deleteAlert(a.id)
                          load()
                        }}
                        className="text-[11px] text-slate-500 hover:text-bear"
                      >
                        delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
      <Disclaimer />
    </div>
  )
}
