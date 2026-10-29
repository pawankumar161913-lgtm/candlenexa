"""Backtesting, risk calculator and the grounded AI assistant."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..deps import get_optional_user
from ..services.analysis import DISCLAIMER, resolve_or_raise
from ..services.assistant import answer as assistant_answer
from ..services.backtester import BacktestConfig, run_backtest
from ..services.market_data import ProviderError, get_series
from ..services.risk import position_size, propose_levels
from ..services.indicators import snapshot
from ..symbols import TIMEFRAMES, resolve_symbol

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/backtest")
def backtest(
    symbol: str,
    timeframe: str = "1h",
    horizon: int = Query(default=4, ge=1, le=24),
    sl_atr: float = Query(default=1.5, gt=0.1, le=6),
    rr: float = Query(default=1.5, gt=0.2, le=6),
    min_edge: float = Query(default=0.05, ge=0, le=0.5),
    spread_bps: float = Query(default=1.0, ge=0, le=100),
    commission_bps: float = Query(default=0.5, ge=0, le=100),
    slippage_bps: float = Query(default=1.0, ge=0, le=100),
):
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=422, detail="Unsupported timeframe.")
    info = resolve_symbol(symbol)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' is not supported.")
    try:
        series = get_series(info, timeframe)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    cfg = BacktestConfig(
        horizon=horizon, sl_atr=sl_atr, rr=rr, min_edge=min_edge,
        spread_bps=spread_bps, commission_bps=commission_bps, slippage_bps=slippage_bps,
    )
    result = run_backtest(series.frame, cfg)
    if result.get("error") == "not_enough_data":
        raise HTTPException(
            status_code=422,
            detail=f"Not enough candles for a walk-forward backtest ({result['rows']} available, "
                   f"{result['required']} required). Try a larger timeframe.",
        )
    return {
        "symbol": info.symbol,
        "name": info.name,
        "timeframe": timeframe,
        "data_source": series.source,
        "is_demo": series.is_demo,
        "result": result,
        "disclaimer": DISCLAIMER,
    }


class RiskIn(BaseModel):
    balance: float = Field(gt=0, le=1_000_000_000)
    risk_pct: float = Field(gt=0, le=100)
    entry: float = Field(gt=0)
    stop: float = Field(gt=0)
    target: float | None = None
    side: str = Field(default="long", pattern="^(long|short)$")
    spread_bps: float = Field(default=1.0, ge=0, le=200)
    commission_bps: float = Field(default=0.5, ge=0, le=200)
    slippage_bps: float = Field(default=1.0, ge=0, le=200)
    pip_size: float = Field(default=0.0001, gt=0)


@router.post("/risk/calculate")
def calculate_risk(payload: RiskIn):
    try:
        return position_size(
            payload.balance, payload.risk_pct, payload.entry, payload.stop, payload.target,
            side=payload.side, spread_bps=payload.spread_bps, commission_bps=payload.commission_bps,
            slippage_bps=payload.slippage_bps, pip_size=payload.pip_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/risk/levels")
def suggested_levels(symbol: str, timeframe: str = "1h", rr: float = Query(default=1.5, gt=0.2, le=6)):
    info = resolve_symbol(symbol)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' is not supported.")
    try:
        series = get_series(info, timeframe)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    snap = snapshot(series.frame)
    from ..services.predictor import predict

    pred = predict(series.frame, timeframe_label=TIMEFRAMES[timeframe]["label"])
    levels = propose_levels(
        snap["price"], snap.get("atr_14") or 0.0, pred.direction, rr=rr,
        support=(snap.get("support_resistance") or {}).get("nearest_support"),
        resistance=(snap.get("support_resistance") or {}).get("nearest_resistance"),
    )
    return {
        "symbol": info.symbol,
        "timeframe": timeframe,
        "price": snap["price"],
        "pip_size": info.pip_size,
        "direction": pred.direction,
        "levels": levels,
        "disclaimer": DISCLAIMER,
    }


class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    symbol: str | None = None
    timeframe: str | None = None


@router.post("/assistant/ask")
def ask(payload: AskIn, user=Depends(get_optional_user)):
    default_symbol = payload.symbol or (user.default_symbol if user else "EUR/USD")
    default_tf = payload.timeframe or (user.default_timeframe if user else "1h")
    return assistant_answer(payload.question, default_symbol, default_tf)


@router.get("/assistant/suggestions")
def suggestions():
    return {
        "suggestions": [
            "Why is EUR/USD moving the way it is right now?",
            "What indicators currently support a bearish outlook on gold?",
            "What are the main risks trading Bitcoin today?",
            "What would invalidate the current forecast for SPY?",
            "How did the model perform on historical data for USD/JPY?",
            "Is the available evidence too weak to produce a signal on ETH/USD?",
        ]
    }
