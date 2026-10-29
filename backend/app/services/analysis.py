"""Market analysis orchestration: data -> indicators -> prediction -> signal."""
from __future__ import annotations

import datetime as dt
import logging

import numpy as np
import pandas as pd

from ..symbols import SymbolInfo, TIMEFRAMES, resolve_symbol
from . import indicators as ind_lib
from .market_data import CandleSeries, get_series
from .predictor import predict
from .risk import propose_levels

log = logging.getLogger("candlenexa.analysis")

DISCLAIMER = (
    "Market predictions are uncertain and losses are possible. This platform provides "
    "analytical information, not guaranteed profits or personalized financial advice."
)

MARKET_STATUS = {
    "forex": "24/5 (closed weekends)",
    "metals": "24/5 (closed weekends)",
    "crypto": "24/7",
    "indices": "Exchange hours (US cash session)",
    "stocks": "Exchange hours (US cash session)",
}


def _fmt(ts) -> str | None:
    if ts is None:
        return None
    try:
        return pd.Timestamp(ts).isoformat()
    except Exception:
        return str(ts)


def reason_lines(snapshot: dict, prediction, timeframe: str) -> list[str]:
    out: list[str] = []
    t = snapshot["trend"]
    if t == "bullish":
        out.append("Price is above its 21/50 EMA stack and its 200-period average (uptrend structure).")
    elif t == "bearish":
        out.append("Price is below its 21/50 EMA stack and its 200-period average (downtrend structure).")
    else:
        out.append("Moving averages are mixed, so the trend structure gives no clear edge.")

    rsi = snapshot.get("rsi_14")
    if rsi is not None:
        state = snapshot.get("rsi_state")
        out.append(f"RSI(14) is {rsi:.1f} ({state}).")
    macd = snapshot.get("macd") or {}
    if macd.get("histogram") is not None:
        out.append(
            f"MACD histogram is {macd['histogram']:.6g} ({macd.get('state')}), "
            f"{'supporting' if macd.get('state') == 'bullish' else 'weighing on'} upside momentum."
        )
    adx = snapshot.get("adx")
    if adx is not None:
        out.append(
            f"ADX {adx:.1f} suggests {'a trending' if adx >= 25 else 'a range-bound'} market."
        )
    sr = snapshot.get("support_resistance") or {}
    if sr.get("nearest_support") or sr.get("nearest_resistance"):
        out.append(
            "Nearest support ~{} / resistance ~{}.".format(
                round(sr.get("nearest_support"), 6) if sr.get("nearest_support") else "n/a",
                round(sr.get("nearest_resistance"), 6) if sr.get("nearest_resistance") else "n/a",
            )
        )
    patterns = snapshot.get("candle_patterns") or []
    if patterns:
        out.append("Recent candlestick pattern: " + ", ".join(p["name"] for p in patterns[:2]) + ".")
    if prediction.features:
        top = prediction.features[0]
        out.append(
            f"Largest model contribution: {top['label']} ({top['direction'].replace('_', ' ')})."
        )
    out.append(f"Forecast horizon: {prediction.horizon_label}.")
    return out


def invalidation_lines(snapshot: dict, prediction, levels: dict, price: float) -> list[str]:
    lines: list[str] = []
    if levels.get("available"):
        lines.append(
            f"A close beyond the proposed stop level ({levels['stop_loss']}) invalidates the setup."
        )
    sr = snapshot.get("support_resistance") or {}
    if prediction.direction == "bullish" and sr.get("nearest_support"):
        lines.append(f"A decisive break below support at {round(sr['nearest_support'], 6)} would flip structure bearish.")
    if prediction.direction == "bearish" and sr.get("nearest_resistance"):
        lines.append(f"A decisive break above resistance at {round(sr['nearest_resistance'], 6)} would flip structure bullish.")
    if snapshot.get("atr_pct") is not None:
        lines.append(
            f"Volatility expansion well beyond the current ATR ({snapshot['atr_pct']:.2f}% per bar) invalidates the risk assumptions."
        )
    lines.append("A scheduled high-impact economic event or news shock overrides the statistical forecast.")
    lines.append("If the model's out-of-sample edge disappears on the next retrain, the signal should be disregarded.")
    return lines


def analyse(info: SymbolInfo, timeframe: str, *, force_refresh: bool = False,
            horizon: int | None = None, allow_demo: bool = True) -> dict:
    series: CandleSeries = get_series(info, timeframe, force_refresh=force_refresh, allow_demo=allow_demo)
    df = series.frame
    snap = ind_lib.snapshot(df)
    price = snap["price"]
    atr_val = snap.get("atr_14")
    hb = horizon or {"1m": 5, "5m": 4, "15m": 4, "1h": 4, "4h": 3, "1d": 3}[timeframe]

    prediction = predict(
        df,
        timeframe_label=TIMEFRAMES[timeframe]["label"],
        horizon_bars=hb,
    )
    levels = propose_levels(
        price,
        atr_val or 0.0,
        prediction.direction,
        support=(snap.get("support_resistance") or {}).get("nearest_support"),
        resistance=(snap.get("support_resistance") or {}).get("nearest_resistance"),
    )

    pips = info.pip_size
    return {
        "symbol": info.symbol,
        "name": info.name,
        "category": info.category,
        "timeframe": timeframe,
        "timeframe_label": TIMEFRAMES[timeframe]["label"],
        "quote_currency": info.quote_currency,
        "pip_size": pips,
        "plan_note": info.plan_note,
        "price": price,
        "market_status": MARKET_STATUS.get(info.category, "unknown"),
        "data": {
            "source": series.source,
            "provider": series.provider_name,
            "is_demo": series.is_demo,
            "warning": series.warning,
            "fetched_at": series.fetched_at.isoformat(),
            "last_bar_time": _fmt(series.last_bar_time),
            "bars": int(len(df)),
        },
        "indicators": snap,
        "prediction": {
            "direction": prediction.direction,
            "prob_up": prediction.prob_up,
            "prob_down": prediction.prob_down,
            "prob_neutral": prediction.prob_neutral,
            "confidence": prediction.confidence,
            "confidence_label": prediction.confidence_label,
            "horizon_bars": prediction.horizon_bars,
            "horizon_label": prediction.horizon_label,
            "model_type": prediction.model_type,
            "expected_move_atr": prediction.expected_move_atr,
            "abstain_reason": prediction.abstain_reason,
            "metrics": prediction.metrics,
            "features": prediction.features,
            "baseline": prediction.baseline,
            "limitations": prediction.limitations,
            "is_estimate": True,
        },
        "levels": levels,
        "reasons": reason_lines(snap, prediction, timeframe),
        "invalidation": invalidation_lines(snap, prediction, levels, price),
        "volatility": {
            "atr": atr_val,
            "atr_pct": snap.get("atr_pct"),
            "level": snap.get("volatility_level"),
        },
        "disclaimer": DISCLAIMER,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def candles_payload(series: CandleSeries, limit: int = 500) -> dict:
    df = series.frame.tail(limit)
    rows = []
    for _, r in df.iterrows():
        rows.append({
            "time": int(pd.Timestamp(r["datetime"]).timestamp()),
            "datetime": _fmt(r["datetime"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": None if pd.isna(r["volume"]) else float(r["volume"]),
        })
    return {
        "symbol": series.symbol,
        "timeframe": series.timeframe,
        "interval": series.interval,
        "source": series.source,
        "provider": series.provider_name,
        "is_demo": series.is_demo,
        "warning": series.warning,
        "fetched_at": series.fetched_at.isoformat(),
        "last_bar_time": _fmt(series.last_bar_time),
        "candles": rows,
    }


def quick_quote(info: SymbolInfo, timeframe: str = "1h") -> dict:
    """Cheap quote for the watchlist/alerts: latest close + change, from cache."""
    try:
        series = get_series(info, timeframe, allow_demo=True, min_bars=30)
    except Exception as exc:  # noqa: BLE001
        return {"symbol": info.symbol, "error": str(exc)}
    df = series.frame
    last = float(df["close"].iloc[-1])
    prev = float(df["close"].iloc[-2]) if len(df) > 1 else last
    change_pct = (last - prev) / prev * 100 if prev else 0.0
    spark = [float(x) for x in df["close"].tail(40)]
    return {
        "symbol": info.symbol,
        "name": info.name,
        "category": info.category,
        "price": last,
        "change_pct": round(change_pct, 3),
        "sparkline": spark,
        "source": series.source,
        "is_demo": series.is_demo,
        "last_bar_time": _fmt(series.last_bar_time),
    }


def resolve_or_raise(raw: str) -> SymbolInfo:
    info = resolve_symbol(raw)
    if info is None:
        raise ValueError(f"Unsupported symbol '{raw}'.")
    return info
