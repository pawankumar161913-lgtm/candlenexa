"""Public market-data routes: catalogue, search, quotes, candles, analysis."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..config import settings
from ..deps import rate_limit
from ..services.analysis import DISCLAIMER, analyse, candles_payload, quick_quote, resolve_or_raise
from ..services.market_data import ProviderError, get_series, provider_status
from ..services.predictor import predict
from ..symbols import CATEGORIES, SYMBOLS, TIMEFRAMES, resolve_symbol, search_symbols

log = logging.getLogger("candlenexa.markets")
router = APIRouter(prefix="/api", tags=["markets"])


def _symbol_or_404(raw: str):
    info = resolve_symbol(raw)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{raw}' is not supported. Use /api/markets/search to find one.")
    return info


@router.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name, "env": settings.env}


@router.get("/markets")
def list_markets():
    return {
        "categories": CATEGORIES,
        "timeframes": [{"id": k, **{kk: vv for kk, vv in v.items() if kk in ("label", "minutes")}} for k, v in TIMEFRAMES.items()],
        "symbols": [
            {"symbol": s.symbol, "name": s.name, "category": s.category, "exchange": s.exchange,
             "quote_currency": s.quote_currency, "pip_size": s.pip_size, "plan_note": s.plan_note}
            for s in SYMBOLS
        ],
        "disclaimer": DISCLAIMER,
    }


@router.get("/markets/search")
def search(q: str = Query(default="", max_length=40), limit: int = Query(default=20, ge=1, le=50)):
    return {
        "query": q,
        "results": [
            {"symbol": s.symbol, "name": s.name, "category": s.category, "exchange": s.exchange}
            for s in search_symbols(q, limit)
        ],
    }


@router.get("/markets/status")
def status():
    return provider_status()


@router.get("/markets/{symbol:path}/quote")
def quote(symbol: str, timeframe: str = "1h", request: Request = None):
    if request:
        rate_limit(request, settings.rate_limit_per_minute)
    info = _symbol_or_404(symbol)
    return quick_quote(info, timeframe)


@router.get("/markets/{symbol:path}/candles")
def candles(symbol: str, timeframe: str = "1h", limit: int = Query(default=400, ge=50, le=1500), request: Request = None):
    if request:
        rate_limit(request, settings.rate_limit_per_minute)
    info = _symbol_or_404(symbol)
    try:
        series = get_series(info, timeframe)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return candles_payload(series, limit=limit)


@router.get("/markets/{symbol:path}/analysis")
def analysis(symbol: str, timeframe: str = "1h", refresh: bool = False, request: Request = None):
    if request:
        rate_limit(request, settings.rate_limit_per_minute)
    info = _symbol_or_404(symbol)
    try:
        return analyse(info, timeframe, force_refresh=refresh)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/markets/{symbol:path}/prediction")
def prediction(symbol: str, timeframe: str = "1h", horizon: int | None = Query(default=None, ge=1, le=24)):
    info = _symbol_or_404(symbol)
    try:
        series = get_series(info, timeframe)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    result = predict(series.frame, timeframe_label=TIMEFRAMES[timeframe]["label"],
                     horizon_bars=horizon or 4)
    return {
        "symbol": info.symbol,
        "timeframe": timeframe,
        "data_source": series.source,
        "is_demo": series.is_demo,
        "direction": result.direction,
        "prob_up": result.prob_up,
        "prob_down": result.prob_down,
        "prob_neutral": result.prob_neutral,
        "confidence": result.confidence,
        "confidence_label": result.confidence_label,
        "horizon_bars": result.horizon_bars,
        "horizon_label": result.horizon_label,
        "model_type": result.model_type,
        "metrics": result.metrics,
        "features": result.features,
        "baseline": result.baseline,
        "abstain_reason": result.abstain_reason,
        "limitations": result.limitations,
        "disclaimer": DISCLAIMER,
    }


@router.get("/markets/{symbol:path}/indicators")
def indicator_snapshot(symbol: str, timeframe: str = "1h"):
    info = _symbol_or_404(symbol)
    try:
        series = get_series(info, timeframe)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    from ..services.indicators import snapshot

    snap = snapshot(series.frame)
    # attach a compact series of the main indicator lines for charting
    from ..services.indicators import compute_indicators

    ind = compute_indicators(series.frame).tail(300)
    lines = [
        {
            "time": int(ts.timestamp()),
            "close": float(r["close"]),
            "ema_21": None if r["ema_21"] != r["ema_21"] else float(r["ema_21"]),
            "ema_50": None if r["ema_50"] != r["ema_50"] else float(r["ema_50"]),
            "rsi_14": None if r["rsi_14"] != r["rsi_14"] else float(r["rsi_14"]),
            "macd_hist": None if r["macd_hist"] != r["macd_hist"] else float(r["macd_hist"]),
            "bb_upper": None if r["bb_upper"] != r["bb_upper"] else float(r["bb_upper"]),
            "bb_lower": None if r["bb_lower"] != r["bb_lower"] else float(r["bb_lower"]),
        }
        for ts, r in zip(ind["datetime"], ind.to_dict("records"))
    ]
    return {
        "symbol": info.symbol,
        "timeframe": timeframe,
        "source": series.source,
        "is_demo": series.is_demo,
        "snapshot": snap,
        "series": lines,
        "disclaimer": DISCLAIMER,
    }
