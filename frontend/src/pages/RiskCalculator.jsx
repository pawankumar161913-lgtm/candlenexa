import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, Disclaimer, KeyValue, Stat } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { TIMEFRAMES, fmtMoney, fmtNum, fmtPrice } from '../lib/format'

export default function RiskCalculator() {
  const { user } = useAuth()
  const [symbols, setSymbols] = useState([])
  const [form, setForm] = useState({
    symbol: user?.default_symbol || 'EUR/USD',
    side: 'long',
    balance: 10000,
    risk_pct: user?.risk_per_trade_pct ?? 1,
    entry: '',
    stop: '',
    target: '',
    spread_bps: 1,
    commission_bps: 0.5,
    slippage_bps: 1,
    pip_size: 0.0001,
  })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [suggestion, setSuggestion] = useState(null)

  useEffect(() => {
    api.markets().then((m) => setSymbols(m.symbols)).catch(() => {})
  }, [])

  useEffect(() => {
    const info = symbols.find((s) => s.symbol === form.symbol)
    if (info) setForm((f) => ({ ...f, pip_size: info.pip_size }))
  }, [form.symbol, symbols])

  const calc = async (e) => {
    e?.preventDefault()
    setError(null)
    setResult(null)
    try {
      const r = await api.risk({
        balance: Number(form.balance),
        risk_pct: Number(form.risk_pct),
        entry: Number(form.entry),
        stop: Number(form.stop),
        target: form.target ? Number(form.target) : null,
        side: form.side,
        spread_bps: Number(form.spread_bps),
        commission_bps: Number(form.commission_bps),
        slippage_bps: Number(form.slippage_bps),
        pip_size: Number(form.pip_size),
      })
      setResult(r)
    } catch (err) {
      setError(err.message)
    }
  }

  const loadLevels = async () => {
    try {
      const r = await api.riskLevels(form.symbol, '1h', 1.5)
      if (!r.levels?.available) {
        setSuggestion({ unavailable: r.levels?.reason || 'No directional forecast.' })
        return
      }
      const entryMid = (r.levels.entry_zone[0] + r.levels.entry_zone[1]) / 2
      setSuggestion({ ...r.levels, direction: r.direction, price: r.price })
      setForm((f) => ({
        ...f,
        side: r.direction === 'bearish' ? 'short' : 'long',
        entry: entryMid.toFixed(r.pip_size < 0.01 ? 5 : 2),
        stop: r.levels.stop_loss.toFixed(r.pip_size < 0.01 ? 5 : 2),
        target: r.levels.take_profit.toFixed(r.pip_size < 0.01 ? 5 : 2),
      }))
    } catch (e) {
      setSuggestion({ unavailable: e.message })
    }
  }

  const maxDailyLoss = useMemo(
    () => (Number(form.balance) * (user?.max_daily_loss_pct ?? 3)) / 100,
    [form.balance, user],
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Risk calculator</h1>
        <p className="text-sm text-slate-400">
          Position sizing from a defined stop, with spread, commission and slippage charged to the risk budget.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <Card>
          <form onSubmit={calc} className="space-y-3">
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
                <label className="label">Side</label>
                <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} className="w-full">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div>
                <label className="label">Account balance</label>
                <input type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className="w-full" />
              </div>
              <div>
                <label className="label">Risk per trade %</label>
                <input type="number" step="0.1" value={form.risk_pct} onChange={(e) => setForm({ ...form, risk_pct: e.target.value })} className="w-full" />
              </div>
              <div>
                <label className="label">Entry price</label>
                <input type="number" step="any" value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} className="w-full" required />
              </div>
              <div>
                <label className="label">Stop-loss price</label>
                <input type="number" step="any" value={form.stop} onChange={(e) => setForm({ ...form, stop: e.target.value })} className="w-full" required />
              </div>
              <div>
                <label className="label">Target price (optional)</label>
                <input type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="w-full" />
              </div>
              <div>
                <label className="label">Pip size</label>
                <input type="number" step="any" value={form.pip_size} onChange={(e) => setForm({ ...form, pip_size: e.target.value })} className="w-full" />
              </div>
              <div>
                <label className="label">Spread (bps)</label>
                <input type="number" step="0.1" value={form.spread_bps} onChange={(e) => setForm({ ...form, spread_bps: e.target.value })} className="w-full" />
              </div>
              <div>
                <label className="label">Commission (bps)</label>
                <input type="number" step="0.1" value={form.commission_bps} onChange={(e) => setForm({ ...form, commission_bps: e.target.value })} className="w-full" />
              </div>
              <div>
                <label className="label">Slippage (bps)</label>
                <input type="number" step="0.1" value={form.slippage_bps} onChange={(e) => setForm({ ...form, slippage_bps: e.target.value })} className="w-full" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary flex-1">Calculate</button>
              <button type="button" className="btn-ghost" onClick={loadLevels} title="Use the platform's ATR-based proposal">
                Use AI levels
              </button>
            </div>
            {suggestion?.unavailable && (
              <p className="text-[11px] text-amber-400">Level proposal unavailable: {suggestion.unavailable}</p>
            )}
            {error && <p className="rounded-lg border border-bear/40 bg-bear/10 px-3 py-2 text-xs text-bear">{error}</p>}
          </form>
        </Card>

        <div className="space-y-4">
          {!result && (
            <Card>
              <CardHeader title="Position sizing" subtitle="Enter your levels to see the sizing maths" />
              <p className="text-sm text-slate-400">
                The calculator divides your risk budget (balance × risk %) by the distance to the stop plus trading costs.
                It never assumes the stop will fill exactly at your price.
              </p>
            </Card>
          )}
          {result && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card><Stat label="Position size" value={fmtNum(result.position_size_units, 4)} hint="units" /></Card>
                <Card><Stat label="Notional" value={fmtMoney(result.notional_value)} hint={`${result.leverage_used}× balance`} /></Card>
                <Card><Stat label="Risk at stop" value={fmtMoney(result.risk_amount)} hint={`${result.risk_pct_of_balance}% of balance`} tone="bear" /></Card>
                <Card><Stat label="Estimated costs" value={fmtMoney(result.estimated_costs)} hint="spread + commission + slippage" /></Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Trade maths" />
                  <KeyValue label="Side" value={result.side} />
                  <KeyValue label="Entry" value={fmtPrice(result.entry, 5)} />
                  <KeyValue label="Stop" value={fmtPrice(result.stop, 5)} tone="bear" />
                  <KeyValue label="Stop distance" value={`${fmtPrice(result.stop_distance, 5)} (${result.stop_distance_pips} pips)`} />
                  {result.target && (
                    <>
                      <KeyValue label="Target" value={fmtPrice(result.target, 5)} tone="bull" />
                      <KeyValue label="Potential gain" value={fmtMoney(result.potential_gain)} tone="bull" />
                      <KeyValue label="Potential loss" value={fmtMoney(result.potential_loss)} tone="bear" />
                      <KeyValue label="Risk : reward" value={result.risk_reward_ratio} />
                      <KeyValue label="Breakeven win rate" value={`${result.breakeven_win_rate_pct}%`} />
                    </>
                  )}
                </Card>
                <Card>
                  <CardHeader title="Warnings & limits" />
                  <ul className="space-y-2">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed text-amber-200/90">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                        {w}
                      </li>
                    ))}
                  </ul>
                  {user && (
                    <div className="mt-4 rounded-lg border border-ink-700 bg-ink-850/60 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Daily risk limit</p>
                      <p className="mt-1 text-sm text-white">
                        {user.max_daily_loss_pct}% of {fmtMoney(Number(form.balance))} = {fmtMoney(maxDailyLoss)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Stop trading for the day once realized losses reach this figure.
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}

          <Card>
            <CardHeader title="Sizing guidance" />
            <ul className="space-y-1.5 text-xs text-slate-400">
              <li>• Risk 0.5–1% of equity per idea; 2% is an aggressive ceiling for most retail accounts.</li>
              <li>• A stop-loss caps intended risk, not realized risk: gaps, news and thin liquidity can fill far worse.</li>
              <li>• Leverage multiplies both the position and the cost of being wrong. Size from the stop, not from the leverage offered.</li>
              <li>• Crypto and metals can move several ATRs in minutes; assume slippage above the configured figure.</li>
            </ul>
          </Card>
        </div>
      </div>
      <Disclaimer />
    </div>
  )
}
