export const TIMEFRAMES = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
]

export const CATEGORY_META = {
  forex: { label: 'Forex', accent: 'text-sky-400', icon: 'FX' },
  metals: { label: 'Metals', accent: 'text-amber-400', icon: 'Au' },
  crypto: { label: 'Crypto', accent: 'text-ai', icon: '₿' },
  indices: { label: 'Indices', accent: 'text-emerald-400', icon: 'IDX' },
  stocks: { label: 'Stocks', accent: 'text-rose-400', icon: 'STK' },
}

export function fmtPrice(v, digits) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const d = digits ?? (Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 10 ? 3 : Math.abs(v) >= 1 ? 5 : 6)
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function fmtPct(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${v > 0 ? '+' : ''}${Number(v).toFixed(digits)}%`
}

export function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function fmtMoney(v, currency = 'USD') {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v)
}

// All timestamps are shown in the user's local timezone.
export function fmtTime(iso, opts = {}) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
}

export function fmtRelative(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const s = Math.round((Date.now() - then) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function tzName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'local time'
  }
}

export const DIRECTION_META = {
  bullish: { label: 'Bullish', className: 'badge bg-bull/10 text-bull border-bull/40' },
  bearish: { label: 'Bearish', className: 'badge bg-bear/10 text-bear border-bear/40' },
  neutral: { label: 'Neutral', className: 'badge bg-slate-500/10 text-slate-300 border-slate-500/40' },
  no_signal: { label: 'No signal', className: 'badge bg-ai/10 text-ai border-ai/40' },
}

export const CONFIDENCE_META = {
  high: { label: 'High (validated)', className: 'badge bg-bull/10 text-bull border-bull/40' },
  medium: { label: 'Medium', className: 'badge bg-amber-500/10 text-amber-400 border-amber-500/40' },
  low: { label: 'Low', className: 'badge bg-orange-500/10 text-orange-400 border-orange-500/40' },
  uncalibrated: { label: 'Uncalibrated', className: 'badge bg-slate-500/10 text-slate-400 border-slate-500/40' },
  none: { label: 'None', className: 'badge bg-slate-500/10 text-slate-400 border-slate-500/40' },
}

export const DISCLAIMER =
  'Market predictions are uncertain and losses are possible. This platform provides analytical information, not guaranteed profits or personalized financial advice.'

export function classNames(...xs) {
  return xs.filter(Boolean).join(' ')
}
