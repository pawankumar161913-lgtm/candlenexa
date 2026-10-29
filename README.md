# CandleNexa — AI Market Intelligence Platform

**CandleNexa** is a full-stack, AI-assisted market analysis platform: live candles from **Twelve Data**,
transparent technical indicators, walk-forward-validated statistical forecasts, backtests, risk tools,
a grounded market assistant, paper trading, watchlists and alerts.

> **Disclaimer:** Market predictions are uncertain and losses are possible. This platform provides
> analytical information, not guaranteed profits or personalized financial advice.

---

## 1. Features

| Area | What it does |
|---|---|
| **Markets** | Forex (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD + crosses), Gold XAU/USD, Silver XAG/USD*, Crypto (BTC, ETH, SOL, XRP…), Indices via ETFs (SPY, QQQ, DIA…), large-cap stocks |
| **Live data** | Real OHLC candles (1m → 1D) from Twelve Data; provider + last-bar timestamp on every screen; cached + throttled; explicit **DEMO mode** when live data is unavailable |
| **Indicators** | EMA/SMA, RSI, MACD, Bollinger, ATR, ADX/±DI, Stochastic, OBV, ROC, swing-cluster S/R zones, candlestick patterns — all computed server-side, causally |
| **AI prediction** | Gradient-boosting + logistic baseline, walk-forward validated (4 expanding-window folds), edge vs. naive baseline, Brier score; **abstains** when evidence is weak |
| **Backtesting** | No look-ahead (signals execute at next open), stop-before-target, spread/commission/slippage costs, model vs. EMA-rule baseline, folds + equity curve |
| **Risk** | Position sizing from balance/risk %/entry/stop, R:R, breakeven win-rate, leverage + drawdown warnings, ATR-based level proposals |
| **Assistant** | Grounded Q&A ("why is gold falling?") computed from the live snapshot — never a free-form LLM guess |
| **Accounts** | JWT + bcrypt auth, per-user watchlist, price/RSI alerts, saved snapshots, paper-trading wallet with full history |

\* Silver spot and cash indices (SPX/NDX) require a paid Twelve Data plan; the API surfaces the
provider's own upgrade message instead of inventing prices.

## 2. Project structure

```
candlenexa/
├── backend/                 # FastAPI API (Python)
│   ├── app/
│   │   ├── main.py          # app wiring, CORS, logging (API key never logged)
│   │   ├── config.py        # env-driven settings (SECRET_KEY, DB, provider, limits)
│   │   ├── models.py db.py  # SQLAlchemy models + session (SQLite default, Postgres-ready)
│   │   ├── security.py deps.py
│   │   ├── symbols.py       # supported-symbol catalogue + aliases
│   │   ├── routers/         # auth, markets, analytics (backtest/risk/assistant), user
│   │   └── services/        # market_data, indicators, predictor, backtester, risk,
│   │                        # analysis orchestration, assistant
│   ├── tests/               # 25 pytest tests (offline engine + API in demo mode)
│   ├── requirements.txt
│   ├── .env.example         # copy → .env, fill in (API key lives ONLY here)
│   └── run_dev.bat          # Windows: creates venv, installs, starts API :8000
├── frontend/                # React 18 + Vite + Tailwind + lightweight-charts
│   └── src/pages/           # Landing, Dashboard, Explorer, MarketAnalysis, Predictions,
│                            # Indicators, Backtest, RiskCalculator, Watchlist, PaperTrading,
│                            # Profile, Auth, Help
├── docs/status.md
└── start-all.bat            # Windows: starts API + UI, opens the browser
```

## 3. Quick start (Windows)

**Prerequisites:** Python 3.11+, Node.js 18+ (npm).

1. **Backend — API key**
   ```bat
   cd candlenexa\backend
   copy .env.example .env
   ```
   Edit `.env` and set `TWELVE_DATA_API_KEY=your_key` (free key at https://twelvedata.com).
   A key is already configured in the local `.env` for this machine.
   Without a key the API serves clearly-labelled DEMO data.

2. **Start everything (easiest)**
   ```bat
   cd candlenexa
   start-all.bat
   ```
   Opens the UI at http://localhost:5173 (API at http://127.0.0.1:8000, docs at `/docs`).

3. **Or start each side manually**
   ```bat
   cd candlenexa\backend  && run_dev.bat     :: API on :8000
   cd candlenexa\frontend && run_dev.bat     :: UI on :5173 (proxies /api → :8000)
   ```

4. **Run backend tests** — `cd backend && ..\.venv\Scripts\python -m pytest tests -q` (25 passed).

## 4. How the forecast works (honest summary)

1. **Outcome:** over next N bars (default 4), close is UP if ≥ +0.35·ATR, DOWN if ≤ −0.35·ATR, else NEUTRAL.
2. **Features (15):** 1/3/5/10-bar returns, RSI deviation, ATR-normalised MACD histogram,
   EMA21–50 spread, price vs SMA200, Bollinger %B/width, ATR%, ADX, ±DI spread, volume ratio, Stochastic %K.
3. **Models:** standardised logistic regression always; histogram gradient-boosting when ≥600 rows.
4. **Validation:** 4-fold expanding-window walk-forward — metrics shown are out-of-sample only.
5. **Confidence** is labelled only when edge-over-baseline ≥ 2 pts on ≥ 80 scored bars.
6. **Abstention** (`no_signal`) when history is insufficient, folds can't form, or the model loses
   to the majority-class baseline — the reason is displayed, not hidden.

See **Help → Methodology** in the app for the full write-up (assumptions, costs, limitations).

## 5. API overview (base `/api`)

- `GET /health`, `/markets`, `/markets/search?q=`, `/markets/status`, `/disclaimer`
- `GET /markets/{symbol}/candles|analysis|prediction|indicators?timeframe=…`
- `GET /backtest?symbol=…&timeframe=…&horizon=&sl_atr=&rr=&min_edge=&spread_bps=&…`
- `POST /risk/calculate`, `GET /risk/levels?symbol=…`, `POST /assistant/ask`
- Auth: `POST /auth/register|login|token`, `GET|PATCH /auth/me`, `POST /auth/password`
- User (JWT): `/watchlist…`, `/alerts…`, `/analyses…`, `/paper/wallet|trades|stats|reset`

Interactive docs: http://127.0.0.1:8000/docs

## 6. Security notes

- API key lives in `backend/.env` (git-ignored), used server-side only — never sent to the browser,
  never included in logs or error responses (request URLs are redacted from exceptions).
- Bcrypt password hashing, signed JWTs, Pydantic validation on every input,
  per-IP rate limiting, CORS restricted to local dev origins.

## 7. Known limitations

- No news / economic-calendar / order-flow inputs — event risk is invisible to the model.
- Free-tier data is end-of-bar and rate-limited (≈ 8 credits/min, 800/day); quotes arrive in batches.
- Statistical edge on liquid instruments is usually small; `no_signal` is a normal outcome.
- Paper trading fills at mid with a 2 bps fee — stops/targets are a journal, not auto-execution.
- Backtests describe the past under stated assumptions; they do not predict the future.
