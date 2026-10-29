import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Disclaimer } from '../components/UI'
import { useAuth } from '../context/AuthContext'

function Field({ label, ...props }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input {...props} className="w-full" />
    </div>
  )
}

export default function Auth({ mode = 'login' }) {
  const isLogin = mode === 'login'
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isLogin) await login(form.email, form.password)
      else await register(form)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-8 py-8 lg:grid-cols-2">
      <div className="hidden lg:block">
        <h1 className="text-4xl font-extrabold leading-tight text-white">
          {isLogin ? 'Welcome back to' : 'Create your'} <span className="text-ai">CandleNexa</span> workspace
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
          Live candles, computed indicators, walk-forward forecasts, backtests and a virtual wallet. Nothing here is
          financial advice, and no brokerage is ever connected.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-slate-300">
          {['Personal watchlist and price alerts', 'Saved analysis snapshots', 'Paper-trading wallet with full history', 'Risk preferences applied everywhere'].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bull/15 text-[10px] text-bull">✓</span>
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-8 max-w-md">
          <Disclaimer />
        </div>
      </div>

      <div className="card p-6 animate-fade-up">
        <h2 className="text-xl font-bold text-white">{isLogin ? 'Log in' : 'Create account'}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {isLogin ? 'Use the email you registered with.' : 'No card required. You get a $10,000 virtual wallet.'}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          {!isLogin && (
            <Field
              label="Full name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Ada Lovelace"
              autoComplete="name"
            />
          )}
          <Field
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <Field
            label="Password"
            type="password"
            required
            minLength={isLogin ? 1 : 8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
          {!isLogin && <p className="text-[10px] text-slate-500">Minimum 8 characters, including letters and numbers.</p>}
          {error && (
            <div className="rounded-lg border border-bear/40 bg-bear/10 px-3 py-2 text-xs text-bear">
              <p className="font-semibold">Request failed ({error.status || 'network'})</p>
              <p className="mt-1 break-words">{error.message}</p>
              {error.status === 500 && (
                <p className="mt-1 text-bear/80">
                  If the backend just started, wait ~10s and retry. If it persists: stop the API window,
                  run <code className="mono">rm candlenexa.db</code> in candlenexa/backend, start it again.
                </p>
              )}
            </div>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          {isLogin ? (
            <>
              No account? <Link className="link" to="/register">Register</Link>
            </>
          ) : (
            <>
              Already registered? <Link className="link" to="/login">Log in</Link>
            </>
          )}
        </p>
        <p className="mt-4 text-center text-[10px] text-slate-600">
          You can explore markets, predictions and backtests without an account.
        </p>
      </div>
    </div>
  )
}
