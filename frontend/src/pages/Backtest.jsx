import { useEffect, useState } from 'react'
import { Badge, Card, CardHeader, Disclaimer, ErrorState, Loading, Stat } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { TIMEFRAMES, fmtNum, fmtPct } from '../lib/format'

function StatBlock({ label, value, tone, hint }) {
  const toneClass = tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-white'
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold mono ${toneClass}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}

function EquityCurve({ trades }) {
  if (!trades?.length) return null
  let eq = 1
  const pts = [1]
  trades.forEach((t) => {
    eq *= 1 + t.net_return_pct / 100
    pts.push(eq)
  })
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const w = 640
  const h = 120
  const path = pts
    .map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / span) * (h - 10) - 5}`)
    .join(' ')
  const positive = pts[pts.length - 1] >= 1
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full">
      <polyline points={path} fill="none" stroke={positive ? '#22c55e' : '#ef4444'} strokeWidth="2" />
    </svg>
  )
}

export default function Backtest() {
  const { user } = useAuth()
  const [symbols, setSymbols] = useState([])
  const [params, setParams] = useState({
    symbol: user?.default_symbol || 'EUR/USD',
    timeframe: user?.default_timeframe || '1h',
    horizon: 4,
    sl_atr: 1.5,
    rr: 1.5,
    min_edge: 0.05,
    spread_bps: 1,
    commission_bps: 0.5,
    slippage_bps: 1,
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.markets().then((m) => setSymbols(m.symbols)).catch(() => {})
  }, [])

  const run = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await api.backtest(params)
      setResult(r)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  const res = result?.result
  const ms = res?.model_strategy
  const bs = res?.rule_baseline

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Backtesting & performance</h1>
        <p className="text-sm text-slate-400">
          Walk-forward out-of-sample simulation. Signals on bar t are executed at the open of t+1; stops fill before
          targets; costs are charged on every round trip.
        </p>
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Symbol</label>
            <select
              value={params.symbol}
              onChange={(e) => setParams({ ...params, symbol: e.target.value })}
              className="w-full"
            >
              {symbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Timeframe</label>
            <select
              value={params.timeframe}
              onChange={(e) => setParams({ ...params, timeframe: e.target.value })}
              className="w-full"
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {[
            ['horizon', 'Horizon (bars)'],
            ['sl_atr', 'Stop (× ATR)'],
            ['rr', 'Reward : risk'],
            ['min_edge', 'Min probability edge'],
            ['spread_bps', 'Spread (bps)'],
            ['commission_bps', 'Commission (bps)'],
            ['slippage_bps', 'Slippage (bps)'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input
                type="number"
                step={k === 'min_edge' ? 0.01 : k === 'horizon' ? 1 : 0.1}
                value={params[k]}
                onChange={(e) => setParams({ ...params, [k]: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          ))}
          <div className="flex items-end">
            <button className="btn-primary w-full" onClick={run} disabled={loading}>
              {loading ? 'Running…' : 'Run backtest'}
            </button>
          </div>
        </div>
      </Card>

      {loading && <Loading label="Fetching history and running walk-forward folds…" rows={4} />}
      {error && <ErrorState error={error} onRetry={run} />}

      {res && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge className={result.is_demo ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' : 'bg-bull/10 text-bull border-bull/40'}>
              {result.is_demo ? 'DEMO DATA' : 'LIVE DATA'}
            </Badge>
            <span>
              {result.symbol} · {result.timeframe} · {res.period.bars} bars · {res.period.from} → {res.period.to}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatBlock label="Trades" value={ms.trades} hint="out-of-sample only" />
            <StatBlock label="Win rate" value={`${fmtNum(ms.win_rate_pct, 1)}%`} tone={ms.win_rate_pct >= 50 ? 'bull' : 'bear'} />
            <StatBlock label="Profit factor" value={ms.profit_factor ?? '—'} tone={ms.profit_factor >= 1 ? 'bull' : 'bear'} />
            <StatBlock label="Net return" value={fmtPct(ms.compounded_return_pct)} tone={ms.compounded_return_pct >= 0 ? 'bull' : 'bear'} hint="after costs, compounded" />
            <StatBlock label="Avg win" value={fmtPct(ms.avg_win_pct)} tone="bull" />
            <StatBlock label="Avg loss" value={fmtPct(ms.avg_loss_pct)} tone="bear" />
            <StatBlock label="Max drawdown" value={`${fmtNum(ms.max_drawdown_pct, 2)}%`} tone="bear" />
            <StatBlock label="Stop / target exits" value={`${ms.stop_exits} / ${ms.target_exits}`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Model strategy vs rule baseline" subtitle="Same period, same costs" />
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="text-right">Model</th>
                    <th className="text-right">EMA/RSI rule</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Trades', ms.trades, bs.trades],
                    ['Win rate %', fmtNum(ms.win_rate_pct, 1), fmtNum(bs.win_rate_pct, 1)],
                    ['Profit factor', ms.profit_factor ?? '—', bs.profit_factor ?? '—'],
                    ['Net return %', fmtNum(ms.compounded_return_pct, 2), fmtNum(bs.compounded_return_pct, 2)],
                    ['Max drawdown %', fmtNum(ms.max_drawdown_pct, 2), fmtNum(bs.max_drawdown_pct, 2)],
                  ].map(([k, a, b]) => (
                    <tr key={k}>
                      <td className="text-slate-300">{k}</td>
                      <td className="text-right mono text-white">{a}</td>
                      <td className="text-right mono text-slate-400">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card>
              <CardHeader title="Equity curve" subtitle="Compounded trade returns (last 60 trades shown)" />
              <EquityCurve trades={res.trades} />
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <span>Folds: {res.folds.length}</span>
                <span>Total trades: {res.trade_count_total}</span>
              </div>
            </Card>
          </div>

          <Card className="p-0">
            <div className="border-b border-ink-700 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">Walk-forward folds</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base min-w-[640px]">
                <thead>
                  <tr className="bg-ink-850/60">
                    <th className="px-4 py-2">Fold</th>
                    <th className="px-4 py-2 text-right">Train rows</th>
                    <th className="px-4 py-2 text-right">Test rows</th>
                    <th className="px-4 py-2">Test window</th>
                    <th className="px-4 py-2">Model</th>
                    <th className="px-4 py-2 text-right">OOS accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {res.folds.map((f) => (
                    <tr key={f.fold}>
                      <td className="px-4 text-white">{f.fold}</td>
                      <td className="px-4 text-right mono">{f.train_rows}</td>
                      <td className="px-4 text-right mono">{f.test_rows}</td>
                      <td className="px-4 text-[11px] text-slate-400">{f.test_from} → {f.test_to}</td>
                      <td className="px-4 text-[11px] text-slate-400">{f.model.replace('_', ' ')}</td>
                      <td className="px-4 text-right mono text-white">{(f.oos_accuracy * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Assumptions" />
              <ul className="space-y-1.5">
                {res.assumptions.map((a, i) => (
                  <li key={i} className="text-xs text-slate-400">• {a}</li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Limitations" />
              <ul className="space-y-1.5">
                {res.limitations.map((a, i) => (
                  <li key={i} className="text-xs text-slate-400">• {a}</li>
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
