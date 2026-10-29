import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, Disclaimer, EmptyState, ErrorState, Loading } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { TIMEFRAMES, fmtTime } from '../lib/format'

export default function Profile() {
  const { user, refresh, logout, patchUser } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [saved, setSaved] = useState([])
  const [markets, setMarkets] = useState([])
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [s] = await Promise.all([api.savedAnalyses()])
      setSaved(s || [])
      setProfile({
        full_name: user.full_name || '',
        base_currency: user.base_currency,
        risk_per_trade_pct: user.risk_per_trade_pct,
        max_daily_loss_pct: user.max_daily_loss_pct,
        default_timeframe: user.default_timeframe,
        default_symbol: user.default_symbol,
        email_alerts: user.email_alerts,
      })
    } catch (e) {
      setErr(e)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
    api.markets().then((m) => setMarkets(m.symbols)).catch(() => {})
  }, [load])

  if (!user)
    return (
      <Card>
        <EmptyState title="You are not signed in" action={<button className="btn-primary" onClick={() => navigate('/login')}>Log in</button>} />
      </Card>
    )

  const saveProfile = async (e) => {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    try {
      const updated = await api.updateProfile({
        ...profile,
        risk_per_trade_pct: Number(profile.risk_per_trade_pct),
        max_daily_loss_pct: Number(profile.max_daily_loss_pct),
      })
      patchUser(updated)
      setMsg('Preferences saved.')
    } catch (e2) {
      setErr(e2)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    try {
      await api.changePassword(pw)
      setPw({ current_password: '', new_password: '' })
      setMsg('Password updated.')
    } catch (e2) {
      setErr(e2)
    }
  }

  const removeSaved = async (id) => {
    await api.deleteSaved(id)
    setSaved((s) => s.filter((x) => x.id !== id))
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Profile & settings</h1>
        <p className="text-sm text-slate-400">{user.email} · member since {fmtTime(user.created_at, { year: 'numeric' })}</p>
      </div>

      {msg && <div className="rounded-xl border border-bull/40 bg-bull/10 px-4 py-2.5 text-xs text-bull">{msg}</div>}
      {err && <ErrorState error={err} />}
      {loading && !profile && <Loading />}

      <div className="grid gap-5 lg:grid-cols-2">
        {profile && (
          <Card>
            <CardHeader title="Trading preferences" subtitle="Used as defaults across the platform" />
            <form onSubmit={saveProfile} className="space-y-3">
              <div>
                <label className="label">Full name</label>
                <input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Default symbol</label>
                  <select value={profile.default_symbol} onChange={(e) => setProfile({ ...profile, default_symbol: e.target.value })} className="w-full">
                    {markets.map((m) => (
                      <option key={m.symbol} value={m.symbol}>{m.symbol}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Default timeframe</label>
                  <select value={profile.default_timeframe} onChange={(e) => setProfile({ ...profile, default_timeframe: e.target.value })} className="w-full">
                    {TIMEFRAMES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Risk per trade %</label>
                  <input type="number" step="0.1" min="0.1" max="10" value={profile.risk_per_trade_pct} onChange={(e) => setProfile({ ...profile, risk_per_trade_pct: e.target.value })} className="w-full" />
                </div>
                <div>
                  <label className="label">Max daily loss %</label>
                  <input type="number" step="0.5" min="0.5" max="50" value={profile.max_daily_loss_pct} onChange={(e) => setProfile({ ...profile, max_daily_loss_pct: e.target.value })} className="w-full" />
                </div>
                <div>
                  <label className="label">Base currency</label>
                  <input value={profile.base_currency} onChange={(e) => setProfile({ ...profile, base_currency: e.target.value.toUpperCase() })} className="w-full" maxLength={8} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={profile.email_alerts}
                      onChange={(e) => setProfile({ ...profile, email_alerts: e.target.checked })}
                      className="h-4 w-4 rounded border-ink-600 bg-ink-850"
                    />
                    Email alerts (requires SMTP setup)
                  </label>
                </div>
              </div>
              <button className="btn-primary">Save preferences</button>
            </form>
          </Card>
        )}

        <div className="space-y-5">
          <Card>
            <CardHeader title="Change password" />
            <form onSubmit={changePassword} className="space-y-3">
              <div>
                <label className="label">Current password</label>
                <input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className="w-full" required />
              </div>
              <div>
                <label className="label">New password</label>
                <input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className="w-full" minLength={8} required />
                <p className="mt-1 text-[10px] text-slate-500">At least 8 characters, letters and numbers.</p>
              </div>
              <button className="btn-ghost">Update password</button>
            </form>
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">Saved analyses ({saved.length})</h3>
            </div>
            {saved.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-500">Nothing saved yet. Use “Save snapshot” on any market page.</p>
            ) : (
              <ul className="divide-y divide-ink-700/70">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-white">{s.title}</p>
                      <p className="text-[11px] text-slate-500">{s.symbol} · {s.timeframe} · {fmtTime(s.created_at)}</p>
                    </div>
                    <button onClick={() => removeSaved(s.id)} className="text-[11px] text-slate-500 hover:text-bear">delete</button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Session" />
            <p className="text-xs text-slate-400">
              Tokens are stored in this browser only and expire after {7} days. Passwords are hashed with bcrypt on the
              server and never logged.
            </p>
            <button
              className="btn-bear mt-3"
              onClick={() => {
                logout()
                navigate('/')
              }}
            >
              Log out
            </button>
          </Card>
        </div>
      </div>
      <Disclaimer />
    </div>
  )
}
