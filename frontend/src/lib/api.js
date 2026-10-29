// Thin API client. The browser never sees any provider key: every market
// request goes to our FastAPI backend, which owns the Twelve Data credential.
const BASE = import.meta.env.VITE_API_BASE || '/api'
const TOKEN_KEY = 'candlenexa.token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

async function request(path, { method = 'GET', body, auth = false, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if ((auth || token) && token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('Cannot reach the CandleNexa API. Is the backend running on port 8000?', 0)
  }

  if (res.status === 204) return null
  let payload = null
  const text = await res.text()
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { detail: text }
  }
  if (!res.ok) {
    const detail = payload?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
          : `Request failed (${res.status})`
    throw new ApiError(message, res.status, detail)
  }
  return payload
}

export const api = {
  // public
  health: () => request('/health'),
  markets: () => request('/markets'),
  search: (q) => request(`/markets/search?q=${encodeURIComponent(q)}`),
  providerStatus: () => request('/markets/status'),
  // NOTE: symbols like EUR/USD must NOT be encodeURIComponent'd here.
  // The `:path` converter on the backend matches the literal slash,
  // but %2F is decoded to '/' only AFTER routing, so it 404s.
  quote: (symbol, tf = '1h') => request(`/markets/${symbol}/quote?timeframe=${tf}`),
  candles: (symbol, tf = '1h', limit = 400, signal) =>
    request(`/markets/${symbol}/candles?timeframe=${tf}&limit=${limit}`, { signal }),
  analysis: (symbol, tf = '1h', refresh = false, signal) =>
    request(`/markets/${symbol}/analysis?timeframe=${tf}&refresh=${refresh}`, { signal }),
  prediction: (symbol, tf = '1h') => request(`/markets/${symbol}/prediction?timeframe=${tf}`),
  indicators: (symbol, tf = '1h') => request(`/markets/${symbol}/indicators?timeframe=${tf}`),
  backtest: (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString()
    return request(`/backtest?${qs}`)
  },
  risk: (payload) => request('/risk/calculate', { method: 'POST', body: payload }),
  riskLevels: (symbol, tf = '1h', rr = 1.5) =>
    request(`/risk/levels?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}&rr=${rr}`),
  ask: (payload) => request('/assistant/ask', { method: 'POST', body: payload }),
  suggestions: () => request('/assistant/suggestions'),
  disclaimer: () => request('/disclaimer'),

  // auth
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: true }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: true }),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),
  changePassword: (payload) => request('/auth/password', { method: 'POST', body: payload }),

  // watchlist
  watchlist: () => request('/watchlist'),
  watchlistQuotes: () => request('/watchlist/quotes'),
  addWatch: (payload) => request('/watchlist', { method: 'POST', body: payload }),
  removeWatch: (id) => request(`/watchlist/${id}`, { method: 'DELETE' }),

  // alerts
  alerts: () => request('/alerts'),
  addAlert: (payload) => request('/alerts', { method: 'POST', body: payload }),
  deleteAlert: (id) => request(`/alerts/${id}`, { method: 'DELETE' }),
  toggleAlert: (id) => request(`/alerts/${id}/toggle`, { method: 'POST' }),
  checkAlerts: () => request('/alerts/check'),

  // saved analyses
  savedAnalyses: () => request('/analyses'),
  saveAnalysis: (symbol, timeframe, title) =>
    request(`/analyses?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, {
      method: 'POST',
      body: { title },
    }),
  savedAnalysis: (id) => request(`/analyses/${id}`),
  deleteSaved: (id) => request(`/analyses/${id}`, { method: 'DELETE' }),

  // paper trading
  wallet: () => request('/paper/wallet'),
  trades: () => request('/paper/trades'),
  openTrade: (payload) => request('/paper/trades', { method: 'POST', body: payload }),
  closeTrade: (id, note = '') => request(`/paper/trades/${id}/close`, { method: 'POST', body: { note } }),
  paperStats: () => request('/paper/stats'),
  resetWallet: (starting_balance) => request('/paper/reset', { method: 'POST', body: { starting_balance } }),
}
