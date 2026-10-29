"""Grounded market assistant.

Answers are built from the same computed snapshot and model output that the
dashboard shows. There is no external LLM in the loop: the assistant routes the
question to real data and renders the numbers. When something is not available
it says so instead of guessing.
"""
from __future__ import annotations

import re

from .analysis import analyse
from ..symbols import SYMBOLS, resolve_symbol


def _fmt(v, digits=5):
    if v is None:
        return "n/a"
    if isinstance(v, float):
        if abs(v) >= 1000:
            return f"{v:,.2f}"
        return f"{v:.{digits}f}"
    return str(v)


def _detect_symbol(question: str, default: str) -> str:
    q = question.upper()
    for info in SYMBOLS:
        token = info.symbol.upper()
        if token in q or token.replace("/", "") in q.replace(" ", ""):
            return info.symbol
        if info.name.upper() in q:
            return info.symbol
        for a in info.aliases:
            if re.search(rf"\b{re.escape(a.upper())}\b", q):
                return info.symbol
    return default


def _detect_timeframe(question: str, default: str) -> str:
    q = question.lower()
    mapping = {
        "1m": ["1m", "1 min", "minute chart"],
        "5m": ["5m", "5 min"],
        "15m": ["15m", "15 min"],
        "1h": ["1h", "hourly", "1 hour"],
        "4h": ["4h", "4 hour"],
        "1d": ["1d", "daily", "day chart"],
    }
    for tf, keys in mapping.items():
        if any(k in q for k in keys):
            return tf
    return default


def answer(question: str, default_symbol: str = "EUR/USD", default_timeframe: str = "1h") -> dict:
    q = (question or "").strip()
    if not q:
        return {"answer": "Ask me about a symbol, an indicator, the model's reliability or what would invalidate a forecast.",
                "sources": [], "used_data": []}

    symbol = _detect_symbol(q, default_symbol)
    timeframe = _detect_timeframe(q, default_timeframe)
    info = resolve_symbol(symbol)
    if info is None:
        return {"answer": f"'{symbol}' is not in the supported symbol list.", "sources": [], "used_data": []}

    try:
        a = analyse(info, timeframe)
    except Exception as exc:  # noqa: BLE001
        return {
            "answer": f"I could not retrieve live data for {info.symbol} ({timeframe}): {exc}. "
                      "No answer is given rather than guessing.",
            "sources": [],
            "used_data": [],
        }

    p = a["prediction"]
    snap = a["indicators"]
    ql = q.lower()
    used = [
        f"{info.symbol} {timeframe} candles from {a['data']['provider']} ({a['data']['bars']} bars)",
        "Indicator snapshot (EMA/SMA, RSI, MACD, Bollinger, ATR, ADX, Stochastic, S/R)",
        "Walk-forward model output and out-of-sample metrics",
    ]
    if a["data"]["is_demo"]:
        used.append("DEMO synthetic series (live provider unavailable)")

    def direction_word(d):
        return {"bullish": "up", "bearish": "down", "neutral": "sideways", "no_signal": "no clear direction"}.get(d, d)

    if any(k in ql for k in ("invalidate", "invalid", "wrong", "fail")):
        body = "This forecast would be invalidated if:\n\n" + "\n".join(f"- {x}" for x in a["invalidation"])

    elif any(k in ql for k in ("risk", "danger", "careful", "volatil")):
        lines = [
            f"Volatility: ATR(14) is {_fmt(snap.get('atr_14'))} ({_fmt(snap.get('atr_pct'), 2)}% of price per bar), "
            f"which is {snap.get('volatility_level')} relative to its own recent history.",
            f"Trend strength: ADX {_fmt(snap.get('adx'), 1)} "
            f"({'trending' if (snap.get('adx') or 0) >= 25 else 'range-bound'}).",
            f"Nearest support: {_fmt((snap.get('support_resistance') or {}).get('nearest_support'))}, "
            f"nearest resistance: {_fmt((snap.get('support_resistance') or {}).get('nearest_resistance'))}.",
            "Model limits: " + " ".join(p["limitations"]),
        ]
        if info.category in ("crypto",):
            lines.append("Crypto trades 24/7 with no circuit breakers - gaps and cascades are more common.")
        if info.category in ("forex", "metals"):
            lines.append("Leverage in FX/metals magnifies both gains and losses; position sizing matters more than direction.")
        body = "\n".join(f"- {x}" for x in lines)

    elif any(k in ql for k in ("perform", "accuracy", "backtest", "reliable", "trust", "how good")):
        m = p["metrics"]
        if not m or "accuracy" not in m:
            body = "There are not enough out-of-sample predictions for this symbol/timeframe to quote an accuracy figure."
        else:
            body = (
                f"Out-of-sample walk-forward results for {info.symbol} {timeframe} "
                f"({m.get('folds')} folds, {m.get('sample_size')} scored bars):\n\n"
                f"- Accuracy: {m['accuracy']*100:.1f}% vs naive majority baseline {m['majority_baseline_accuracy']*100:.1f}%\n"
                f"- Edge over baseline: {m['edge_vs_baseline']*100:+.1f} points\n"
                f"- Brier score (up-probability): {m['brier_score']:.3f} (lower is better)\n\n"
                + ("The model's edge is too small to claim a reliable directional signal."
                   if m["edge_vs_baseline"] < 0.02 else
                   "The edge is measurable but modest - treat it as one input, not a verdict.")
            )

    elif any(k in ql for k in ("weak", "too weak", "no signal", "uncertain", "abstain")):
        if p["direction"] == "no_signal":
            body = f"Yes - the engine is abstaining on {info.symbol} {timeframe}: {p['abstain_reason']}"
        else:
            body = (
                f"The engine currently returns a {p['direction']} estimate with p(up)={p['prob_up']*100:.1f}% "
                f"and p(down)={p['prob_down']*100:.1f}%. Confidence label: {p['confidence_label']} "
                f"(edge over baseline {p['metrics'].get('edge_vs_baseline', 0)*100:+.1f} pts). "
                + ("Evidence is thin." if p["confidence_label"] in ("low", "uncalibrated", "none") else "Evidence is measurable but not certain.")
            )

    elif any(k in ql for k in ("indicator", "rsi", "macd", "support", "resistance", "bollinger", "ema", "moving average")):
        body = (
            f"{info.symbol} {timeframe} indicator snapshot (price {_fmt(a['price'])}):\n\n"
            f"- Trend: {snap['trend']} | EMA21 {_fmt(snap['ma'].get('ema_21'))}, EMA50 {_fmt(snap['ma'].get('ema_50'))}, SMA200 {_fmt(snap['ma'].get('sma_200'))}\n"
            f"- RSI(14): {_fmt(snap.get('rsi_14'), 1)} ({snap.get('rsi_state')})\n"
            f"- MACD histogram: {_fmt((snap.get('macd') or {}).get('histogram'), 6)} ({(snap.get('macd') or {}).get('state')})\n"
            f"- Bollinger: upper {_fmt((snap.get('bollinger') or {}).get('upper'))}, lower {_fmt((snap.get('bollinger') or {}).get('lower'))}, %B {_fmt((snap.get('bollinger') or {}).get('percent_b'), 2)}\n"
            f"- Stochastic %K/%D: {_fmt((snap.get('stochastic') or {}).get('k'), 1)} / {_fmt((snap.get('stochastic') or {}).get('d'), 1)}\n"
            f"- Support: {_fmt((snap.get('support_resistance') or {}).get('nearest_support'))} | Resistance: {_fmt((snap.get('support_resistance') or {}).get('nearest_resistance'))}\n"
            f"- Candlestick patterns: {', '.join(x['name'] for x in snap.get('candle_patterns', [])) or 'none detected'}"
        )

    elif any(k in ql for k in ("why", "rising", "falling", "up", "down", "bull", "bear")):
        body = (
            f"Evidence for {info.symbol} on the {timeframe} chart (price {_fmt(a['price'])}):\n\n"
            + "\n".join(f"- {r}" for r in a["reasons"])
            + f"\n\nModel estimate: {p['direction']} over {p['horizon_label']} "
              f"(p(up) {p['prob_up']*100:.1f}%, p(down) {p['prob_down']*100:.1f}%). "
              "These are probabilities from a statistical model, not a statement of what will happen."
        )

    else:
        body = (
            f"Here is the current read on {info.symbol} ({timeframe}):\n\n"
            f"- Price {_fmt(a['price'])} | trend {snap['trend']} | volatility {snap.get('volatility_level')}\n"
            f"- Model estimate: {direction_word(p['direction'])} over {p['horizon_label']}\n"
            f"- Probabilities: up {p['prob_up']*100:.1f}% / down {p['prob_down']*100:.1f}% / neutral {p['prob_neutral']*100:.1f}%\n"
            f"- Confidence: {p['confidence_label']}"
            + (f" ({p['abstain_reason']})" if p["abstain_reason"] else "")
        )

    if a["data"]["is_demo"]:
        body += "\n\nNote: live market data was unavailable, so this answer uses DEMO synthetic prices and is not a market observation."

    return {
        "answer": body,
        "symbol": info.symbol,
        "timeframe": timeframe,
        "sources": [
            {"label": a["data"]["provider"], "detail": f"last bar {a['data']['last_bar_time']}", "is_demo": a["data"]["is_demo"]},
        ],
        "used_data": used,
        "disclaimer": a["disclaimer"],
    }
