import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { classNames } from '../lib/format'

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/markets', label: 'Markets' },
  { to: '/predictions', label: 'AI Predictions' },
  { to: '/indicators', label: 'Indicators' },
  { to: '/backtest', label: 'Backtest' },
  { to: '/risk', label: 'Risk' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/paper', label: 'Paper Trade' },
  { to: '/help', label: 'Help' },
]

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-ink-800 border border-ink-600 group-hover:border-ai/60 transition">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="9" width="2.5" height="7" rx="1" fill="#22c55e" />
          <rect x="4" y="6" width="0.5" height="13" fill="#22c55e" />
          <rect x="10" y="6" width="2.5" height="9" rx="1" fill="#8b5cf6" />
          <rect x="17" y="11" width="2.5" height="7" rx="1" fill="#ef4444" />
        </svg>
      </span>
      <span className="text-[17px] font-extrabold tracking-tight text-white">
        Candle<span className="text-ai">Nexa</span>
      </span>
    </Link>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [showAlerts, setShowAlerts] = useState(false)
  const [status, setStatus] = useState(null)
  const boxRef = useRef(null)
  const loc = useLocation()

  useEffect(() => {
    setOpen(false)
    setShowAlerts(false)
  }, [loc.pathname])

  useEffect(() => {
    api.providerStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await api.search(query.trim())
        setResults(r.results || [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setResults([])
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // poll alerts for signed-in users (in-app notifications)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const tick = async () => {
      try {
        const r = await api.checkAlerts()
        if (!cancelled && r.triggered?.length) setAlerts((a) => [...r.triggered, ...a].slice(0, 20))
      } catch {
        /* silent */
      }
    }
    tick()
    const id = setInterval(tick, 120000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user])

  const alertCount = useMemo(() => alerts.length, [alerts])

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-ink-700/80 bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 lg:px-6">
          <Logo />

          <div ref={boxRef} className="relative hidden md:block w-72">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search EUR/USD, gold, BTC…"
              className="w-full pl-9 py-2 text-sm"
              aria-label="Search symbols"
            />
            <svg
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            {(results.length > 0 || searching) && (
              <div className="absolute mt-2 w-full overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl animate-fade-up">
                {searching && <div className="px-3 py-2 text-xs text-slate-500">searching…</div>}
                {results.map((r) => (
                  <Link
                    key={r.symbol}
                    to={`/market/${encodeURIComponent(r.symbol)}`}
                    onClick={() => setQuery('')}
                    className="flex items-center justify-between px-3 py-2 text-sm hover:bg-ink-700"
                  >
                    <span className="font-semibold text-white">{r.symbol}</span>
                    <span className="truncate pl-3 text-xs text-slate-400">{r.name}</span>
                  </Link>
                ))}
                {!searching && results.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500">No supported symbol matches.</div>
                )}
              </div>
            )}
          </div>

          <nav className="ml-auto hidden items-center gap-1 xl:flex">
            {NAV.slice(0, 6).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  classNames(
                    'rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive ? 'bg-ai/15 text-white' : 'text-slate-400 hover:text-white hover:bg-ink-800',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 xl:ml-0">
            {status && (
              <span
                className={classNames(
                  'hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                  status.configured
                    ? 'border-bull/40 bg-bull/10 text-bull'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-400',
                )}
                title={status.configured ? 'Twelve Data connected' : 'Live provider not configured — DEMO mode'}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {status.configured ? 'LIVE' : 'DEMO'}
              </span>
            )}

            {user && (
              <div className="relative">
                <button
                  onClick={() => setShowAlerts((s) => !s)}
                  className="relative rounded-lg border border-ink-600 bg-ink-800 p-2 text-slate-300 hover:text-white"
                  aria-label="Alerts"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                    <path d="M10.3 21a2 2 0 0 0 3.4 0" />
                  </svg>
                  {alertCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bear px-1 text-[10px] font-bold text-white">
                      {alertCount}
                    </span>
                  )}
                </button>
                {showAlerts && (
                  <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl animate-fade-up">
                    <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Alert notifications
                      </span>
                      <button className="text-[11px] text-ai-cyan" onClick={() => setAlerts([])}>
                        clear
                      </button>
                    </div>
                    {alerts.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-slate-500">No alerts triggered yet.</p>
                    ) : (
                      <ul className="max-h-72 overflow-auto">
                        {alerts.map((a, i) => (
                          <li key={`${a.id}-${i}`} className="border-b border-ink-700/60 px-3 py-2 text-xs">
                            <span className="font-semibold text-white">{a.symbol}</span>{' '}
                            <span className="text-slate-400">
                              {a.condition.replace('_', ' ')} {a.threshold} → {a.value}
                            </span>
                            {a.is_demo && <span className="ml-1 text-amber-400">(demo)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {user ? (
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-800 py-1.5 pl-1.5 pr-3 hover:border-ai/50"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ai/20 text-[11px] font-bold text-ai">
                  {(user.full_name || user.email).slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden max-w-[120px] truncate text-xs font-medium text-slate-200 sm:block">
                  {user.full_name || user.email}
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-ghost hidden sm:inline-flex">
                  Log in
                </Link>
                <Link to="/register" className="btn-primary">
                  Get started
                </Link>
              </div>
            )}

            <button
              className="rounded-lg border border-ink-600 bg-ink-800 p-2 text-slate-300 xl:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label="Menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-ink-700 bg-ink-900 px-4 py-3 xl:hidden">
            <div className="grid grid-cols-2 gap-1">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    classNames(
                      'rounded-lg px-3 py-2 text-sm',
                      isActive ? 'bg-ai/15 text-white' : 'text-slate-300 hover:bg-ink-800',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              <NavLink to="/profile" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-ink-800">
                Profile
              </NavLink>
              {user ? (
                <button
                  onClick={logout}
                  className="rounded-lg px-3 py-2 text-left text-sm text-bear hover:bg-ink-800"
                >
                  Log out
                </button>
              ) : (
                <NavLink to="/login" className="rounded-lg px-3 py-2 text-sm text-ai-cyan hover:bg-ink-800">
                  Log in
                </NavLink>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">{children}</main>

      <footer className="mt-12 border-t border-ink-700/70 bg-ink-950/60">
        <div className="mx-auto max-w-[1600px] px-4 py-8 lg:px-6">
          <div className="grid gap-6 md:grid-cols-4">
            <div className="md:col-span-2">
              <Logo />
              <p className="mt-3 max-w-md text-xs leading-relaxed text-slate-500">
                CandleNexa is an analytics workspace: live candles from Twelve Data, transparent technical indicators,
                walk-forward validated statistical forecasts, backtests and risk tools. It is not a broker and never
                places real trades.
              </p>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Product</p>
              <ul className="space-y-1.5 text-xs text-slate-500">
                <li><Link className="hover:text-white" to="/dashboard">Dashboard</Link></li>
                <li><Link className="hover:text-white" to="/markets">Market explorer</Link></li>
                <li><Link className="hover:text-white" to="/backtest">Backtesting</Link></li>
                <li><Link className="hover:text-white" to="/risk">Risk calculator</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Learn</p>
              <ul className="space-y-1.5 text-xs text-slate-500">
                <li><Link className="hover:text-white" to="/help">Methodology</Link></li>
                <li><Link className="hover:text-white" to="/help#disclosures">Risk disclosures</Link></li>
                <li><Link className="hover:text-white" to="/help#limitations">Limitations</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 rounded-xl border border-ai/25 bg-ai/5 px-4 py-3 text-[11px] leading-relaxed text-slate-400">
            <span className="font-semibold text-ai">Disclaimer:</span> Market predictions are uncertain and losses are
            possible. This platform provides analytical information, not guaranteed profits or personalized financial
            advice.
          </div>
          <p className="mt-4 text-[11px] text-slate-600">
            © {new Date().getFullYear()} CandleNexa. Market data by Twelve Data. Built for research and education.
          </p>
        </div>
      </footer>
    </div>
  )
}
