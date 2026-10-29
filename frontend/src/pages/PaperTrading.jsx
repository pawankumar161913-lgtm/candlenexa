import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, CardHeader, Disclaimer, EmptyState, ErrorState, Loading, Stat } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { fmtMoney, fmtNum, fmtPct, fmtPrice, fmtTime } from '../lib/format'

export default function PaperTrading() {
  const { user, refresh } = useAuth()
  const [wallet, setWallet] = useState(null)
  const [trades, setTrades] = useState([])
  const [stats, setStats] = useState(null)
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [form, setForm] = useState({ symbol: 'EUR/USD', side: 'long', quantity: 1000, stop_loss: '', take_profit: '', note: '' })
  const [reset, setReset] = useState(10000)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [w, t, s] = await Promise.all([api.wallet(), api.trades(), api.paperStats()])
      setWallet(w)
      setTrades(t || [])
      setStats(s)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
    api.markets().then((m) => setMarkets(m.symbols)).catch(() => {})
  }, [load])

  const flash = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 4000)
  }

  const open = async (e) => {
    e.preventDefault()
    try {
      await api.openTrade({
        symbol: form.symbol,
        side: form.side,
        quantity: Number(form.quantity),
        stop_loss: form.stop_loss ? Number(form.stop_loss) : null,
        take_profit: form.take_profit ? Number(form.take_profit) : null,
        note: form.note,
      })
      flash('Simulated position opened.')
      load()
    } catch (err) {
      flash(err.message)
    }
  }

  const close = async (id) => {
    try {
      await api.closeTrade(id)
      flash('Position closed and P&L booked.')
      load()
      refresh()
    } catch (err) {
      flash(err.message)
    }
  }

  if (!user)
    return (
      <Card>
        <EmptyState
          title="Sign in to use paper trading"
          hint="Virtual funds only. CandleNexa never connects to a brokerage or places real orders."
          action={<Link to="/login" className="btn-primary">Log in</Link>}
        />
      </Card>
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Paper trading</h1>
          <p className="text-sm text-slate-400">
            Virtual wallet, simulated fills at the live mid price, and a complete trade history. No real money, no broker.
          </p>
        </div>
        {wallet && (
          <div className="flex items-center gap-2">
            <input type="number" value={reset} onChange={(e) => setReset(e.target.value)} className="w-32 text-sm" />
            <button
              className="btn-ghost text-xs"
              onClick={async () => {
                await api.resetWallet(Number(reset))
                flash('Wallet reset.')
                load()
                refresh()
              }}
            >
              Reset wallet
            </button>
          </div>
        )}
      </div>

      {notice && <div className="rounded-xl border border-ai/40 bg-ai/10 px-4 py-2.5 text-xs text-ai">{notice}</div>}
      {error && <ErrorState error={error} onRetry={load} />}
      {loading && <Loading label="Loading wallet…" rows={3} />}

      {wallet && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card><Stat label="Equity" value={fmtMoney(wallet.equity)} hint={`balance ${fmtMoney(wallet.balance)}`} /></Card>
          <Card><Stat label="Return" value={fmtPct(wallet.return_pct)} tone={wallet.return_pct >= 0 ? 'bull' : 'bear'} /></Card>
          <Card><Stat label="Unrealized" value={fmtMoney(wallet.unrealized_pnl)} tone={wallet.unrealized_pnl >= 0 ? 'bull' : 'bear'} /></Card>
          <Card><Stat label="Open positions" value={wallet.open_positions.length} /></Card>
          <Card><Stat label="Daily loss limit" value={`${wallet.daily_loss_limit_pct}%`} hint={fmtMoney((wallet.equity * wallet.daily_loss_limit_pct) / 100)} /></Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title="Open simulated position" subtitle="Fills at the latest available price" />
          <form onSubmit={open} className="space-y-3">
            <div>
              <label className="label">Symbol</label>
              <select value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="w-full">
                {markets.map((m) => (
                  <option key={m.symbol} value={m.symbol}>{m.symbol}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Side</label>
                <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} className="w-full">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div>
                <label className="label">Quantity (units)</label>
                <input type="number" step="any" min="0.0001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full" />
              </div>
              <div>
                <label className="label">Stop-loss</label>
                <input type="number" step="any" value={form.stop_loss} onChange={(e) => setForm({ ...form, stop_loss: e.target.value })} className="w-full" placeholder="optional" />
              </div>
              <div>
                <label className="label">Take-profit</label>
                <input type="number" step="any" value={form.take_profit} onChange={(e) => setForm({ ...form, take_profit: e.target.value })} className="w-full" placeholder="optional" />
              </div>
            </div>
            <div>
              <label className="label">Note</label>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full" placeholder="thesis" />
            </div>
            <button className={form.side === 'long' ? 'btn-bull w-full' : 'btn-bear w-full'}>
              Open {form.side} position
            </button>
            <p className="text-[10px] leading-relaxed text-slate-500">
              A 2 bps simulated fee is charged per side. Stops and targets are recorded for the journal; fills happen when
              you close the position manually, at the then-current price.
            </p>
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="p-0">
            <div className="border-b border-ink-700 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">Open positions</h3>
            </div>
            {!wallet?.open_positions?.length ? (
              <EmptyState title="No open positions" hint="Open a simulated trade to start tracking P&L." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base min-w-[760px]">
                  <thead>
                    <tr className="bg-ink-850/60">
                      <th className="px-4 py-2">Symbol</th>
                      <th className="px-4 py-2">Side</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Entry</th>
                      <th className="px-4 py-2 text-right">Now</th>
                      <th className="px-4 py-2 text-right">Unrealized</th>
                      <th className="px-4 py-2 text-right">Opened</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.open_positions.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 font-semibold text-white">{p.symbol}</td>
                        <td className="px-4">
                          <Badge className={p.side === 'long' ? 'bg-bull/10 text-bull border-bull/40' : 'bg-bear/10 text-bear border-bear/40'}>{p.side}</Badge>
                        </td>
                        <td className="px-4 text-right mono">{fmtNum(p.quantity, 4)}</td>
                        <td className="px-4 text-right mono">{fmtPrice(p.entry_price)}</td>
                        <td className="px-4 text-right mono">{fmtPrice(p.current_price)}</td>
                        <td className={`px-4 text-right mono ${p.unrealized_pnl >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtMoney(p.unrealized_pnl)}</td>
                        <td className="px-4 text-right text-[11px] text-slate-500">{fmtTime(p.opened_at)}</td>
                        <td className="px-4 text-right">
                          <button onClick={() => close(p.id)} className="btn-ghost px-2 py-1 text-[11px]">Close</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {stats && stats.trades > 0 && (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Card><Stat label="Closed" value={stats.trades} /></Card>
              <Card><Stat label="Win rate" value={`${fmtNum(stats.win_rate_pct, 1)}%`} tone={stats.win_rate_pct >= 50 ? 'bull' : 'bear'} /></Card>
              <Card><Stat label="Net P&L" value={fmtMoney(stats.net_pnl)} tone={stats.net_pnl >= 0 ? 'bull' : 'bear'} /></Card>
              <Card><Stat label="Profit factor" value={stats.profit_factor ?? '—'} /></Card>
              <Card><Stat label="Avg win" value={fmtMoney(stats.avg_win)} tone="bull" /></Card>
              <Card><Stat label="Max DD" value={`${fmtNum(stats.max_drawdown_pct, 2)}%`} tone="bear" /></Card>
            </div>
          )}

          <Card className="p-0">
            <div className="border-b border-ink-700 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">Trade history</h3>
            </div>
            {trades.length === 0 ? (
              <EmptyState title="No trades yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base min-w-[860px]">
                  <thead>
                    <tr className="bg-ink-850/60">
                      <th className="px-4 py-2">Symbol</th>
                      <th className="px-4 py-2">Side</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Entry</th>
                      <th className="px-4 py-2 text-right">Exit</th>
                      <th className="px-4 py-2 text-right">P&L</th>
                      <th className="px-4 py-2 text-right">Fees</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 font-semibold text-white">{t.symbol}</td>
                        <td className="px-4 text-slate-300">{t.side}</td>
                        <td className="px-4 text-right mono">{fmtNum(t.quantity, 4)}</td>
                        <td className="px-4 text-right mono">{fmtPrice(t.entry_price)}</td>
                        <td className="px-4 text-right mono">{t.exit_price ? fmtPrice(t.exit_price) : '—'}</td>
                        <td className={`px-4 text-right mono ${t.realized_pnl == null ? 'text-slate-500' : t.realized_pnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {t.realized_pnl == null ? '—' : fmtMoney(t.realized_pnl)}
                        </td>
                        <td className="px-4 text-right mono text-slate-400">{fmtMoney(t.fees_paid)}</td>
                        <td className="px-4">
                          <Badge className={t.status === 'open' ? 'bg-ai/10 text-ai border-ai/40' : 'bg-slate-500/10 text-slate-400 border-slate-500/40'}>{t.status}</Badge>
                        </td>
                        <td className="px-4 text-right text-[11px] text-slate-500">{t.closed_at ? fmtTime(t.closed_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
      <Disclaimer />
    </div>
  )
}
