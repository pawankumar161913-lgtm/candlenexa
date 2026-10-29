import { Link } from 'react-router-dom'
import { classNames } from '../lib/format'

export function Card({ children, className = '', hover = false, ...rest }) {
  return (
    <div className={classNames('card p-5', hover && 'card-hover', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, right, icon }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Badge({ children, className = '', dot }) {
  return (
    <span className={classNames('badge', className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Stat({ label, value, hint, tone = 'default', mono = true }) {
  const toneClass =
    tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : tone === 'ai' ? 'text-ai' : 'text-white'
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={classNames('text-xl font-bold tabular-nums mt-1', toneClass, mono && 'font-mono')}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  )
}

export function Spinner({ size = 18, className = '' }) {
  return (
    <svg className={classNames('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Loading({ label = 'Loading…', rows = 3 }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Spinner className="text-ai" /> {label}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  const msg = typeof error === 'string' ? error : error?.message || 'Unknown error'
  return (
    <div className="card p-5 border-bear/40 bg-bear/5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-bear/15 text-bear text-sm font-bold">
          !
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-sm text-slate-300 mt-1">{msg}</p>
          {onRetry && (
            <button className="btn-ghost mt-3" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="text-center py-10">
      <div className="mx-auto h-10 w-10 rounded-xl bg-ink-800 border border-ink-600 flex items-center justify-center text-slate-500">
        ∅
      </div>
      <p className="mt-3 text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function DemoBanner({ isDemo, warning, source, lastBar, fetchedAt }) {
  if (!isDemo) return null
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <div className="font-semibold flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse-soft" /> DEMO MODE — synthetic data, not real
        market prices
      </div>
      <p className="text-amber-200/80 text-xs mt-1">
        {warning || 'Live market data is unavailable.'} Every number on this page is generated locally for
        demonstration only.
      </p>
      {source && (
        <p className="text-amber-200/60 text-[11px] mt-1">
          source: {source} {lastBar ? `· last bar ${new Date(lastBar).toLocaleString()}` : ''}
        </p>
      )}
    </div>
  )
}

export function DataStamp({ provider, lastBar, fetchedAt, isDemo, onRefresh, refreshing }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={classNames('h-1.5 w-1.5 rounded-full', isDemo ? 'bg-amber-400' : 'bg-bull animate-pulse-soft')}
        />
        {isDemo ? 'DEMO data' : `Live · ${provider || 'Twelve Data'}`}
      </span>
      {lastBar && <span>last bar: {new Date(lastBar).toLocaleString()} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>}
      {fetchedAt && <span>fetched: {new Date(fetchedAt).toLocaleTimeString()}</span>}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="text-ai-cyan hover:underline underline-offset-2 disabled:opacity-50"
          disabled={refreshing}
        >
          {refreshing ? 'refreshing…' : 'refresh'}
        </button>
      )}
    </div>
  )
}

export function Disclaimer({ compact = false }) {
  return (
    <div
      className={classNames(
        'rounded-xl border border-ai/30 bg-ai/5 text-slate-300',
        compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-3 text-xs',
      )}
    >
      <span className="font-semibold text-ai">Risk disclosure:</span> Market predictions are uncertain and losses are
      possible. This platform provides analytical information, not guaranteed profits or personalized financial advice.
    </div>
  )
}

export function ProbabilityBar({ up, down, neutral }) {
  const u = Math.round((up || 0) * 100)
  const d = Math.round((down || 0) * 100)
  const n = Math.max(0, 100 - u - d)
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-700">
        <div className="bg-bull transition-all duration-500" style={{ width: `${u}%` }} title={`Up ${u}%`} />
        <div className="bg-slate-600 transition-all duration-500" style={{ width: `${n}%` }} title={`Neutral ${n}%`} />
        <div className="bg-bear transition-all duration-500" style={{ width: `${d}%` }} title={`Down ${d}%`} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-medium">
        <span className="text-bull">Up {u}%</span>
        <span className="text-slate-500">Neutral {n}%</span>
        <span className="text-bear">Down {d}%</span>
      </div>
    </div>
  )
}

export function SectionTitle({ children, right }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="text-lg font-bold text-white">{children}</h2>
      {right}
    </div>
  )
}

export function KeyValue({ label, value, mono = true, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-ink-700/60 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span
        className={classNames(
          'text-sm font-semibold',
          mono && 'font-mono tabular-nums',
          tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-slate-100',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function CTA({ to, children, variant = 'primary', className = '', ...rest }) {
  const cls = variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : 'btn-bull'
  return (
    <Link to={to} className={classNames(cls, className)} {...rest}>
      {children}
    </Link>
  )
}
