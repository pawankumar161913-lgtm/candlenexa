# CandleNexa - build status

## Verified working (Oct 26, 2026)
- **Backend boots**: FastAPI + 10 route groups, health `{"status":"ok","service":"CandleNexa"}`.
- **Live Twelve Data**: XAU/USD 1h analysis returns `source: twelve_data` with a real spot price; EUR/USD 1h -> 900 real candles, cached, throttled at 8 s between upstream calls.
- **Prediction engine**: walk-forward gradient boosting + logistic baseline, OOS metrics, abstain logic.
  Observed: EUR/USD 1h accuracy 36.8% vs 39.9% majority baseline -> engine correctly returns `no_signal` (honest abstention, not a fake forecast).
- **Backtest**: `GET /api/backtest?symbol=EUR/USD&timeframe=1h` -> 200, no look-ahead, costs charged, folds + equity + rule baseline.
- **Tests**: 25 passed (`backend`: `..\\.venv\\Scripts\\python -m pytest tests -q`).
- **Frontend**: React 18 + Vite + Tailwind, all 13 pages, Lightweight Charts candles + EMA/BB overlays + S/R and SL/TP price lines, production build succeeds (`vite build`, dist/ present).
- **Security**: API key server-side only, never logged (httpx logging silenced, exception messages redacted), per-IP rate limits, JWT + bcrypt.

## How to run (Windows)
1. `cd candlenexa\backend` -> ensure `.env` has `TWELVE_DATA_API_KEY`.
2. `cd candlenexa` -> `start-all.bat` (API :8000, UI :5173, browser opens).
   Manual: `backend\run_dev.bat` then `frontend\run_dev.bat`.
3. Docs/demo: API docs at http://127.0.0.1:8000/docs ; try EUR/USD 1h analysis, Predictions board, Backtest, Risk, Paper Trading.
