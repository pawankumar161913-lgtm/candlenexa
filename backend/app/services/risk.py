"""Risk model: position sizing and a documented stop/target proposal."""
from __future__ import annotations

import math


def position_size(
    balance: float,
    risk_pct: float,
    entry: float,
    stop: float,
    target: float | None = None,
    *,
    side: str = "long",
    spread_bps: float = 1.0,
    commission_bps: float = 0.5,
    slippage_bps: float = 1.0,
    pip_size: float = 0.0001,
) -> dict:
    warnings: list[str] = []
    if balance <= 0:
        raise ValueError("Account balance must be greater than zero.")
    if risk_pct <= 0 or risk_pct > 100:
        raise ValueError("Risk per trade must be between 0 and 100 percent.")
    if entry <= 0 or stop <= 0:
        raise ValueError("Entry and stop prices must be positive.")

    side = side.lower()
    if side == "long" and stop >= entry:
        raise ValueError("For a long position the stop must be below the entry.")
    if side == "short" and stop <= entry:
        raise ValueError("For a short position the stop must be above the entry.")

    stop_distance = abs(entry - stop)
    risk_amount = balance * risk_pct / 100
    costs_per_unit = entry * (spread_bps + commission_bps + slippage_bps) / 10000
    risk_per_unit = stop_distance + costs_per_unit
    qty = risk_amount / risk_per_unit if risk_per_unit > 0 else 0.0
    notional = qty * entry
    leverage = notional / balance if balance else 0.0

    result = {
        "side": side,
        "entry": entry,
        "stop": stop,
        "stop_distance": round(stop_distance, 8),
        "stop_distance_pips": round(stop_distance / pip_size, 1) if pip_size else None,
        "risk_amount": round(risk_amount, 2),
        "position_size_units": round(qty, 4),
        "notional_value": round(notional, 2),
        "leverage_used": round(leverage, 2),
        "estimated_costs": round(qty * costs_per_unit, 2),
        "risk_pct_of_balance": risk_pct,
        "warnings": warnings,
    }

    if target is not None:
        if side == "long" and target <= entry:
            raise ValueError("For a long position the target must be above the entry.")
        if side == "short" and target >= entry:
            raise ValueError("For a short position the target must be below the entry.")
        reward_per_unit = abs(target - entry) - costs_per_unit
        rr = abs(target - entry) / stop_distance if stop_distance else None
        result.update({
            "target": target,
            "potential_gain": round(max(reward_per_unit, 0.0) * qty, 2),
            "potential_loss": round((stop_distance + costs_per_unit) * qty, 2),
            "risk_reward_ratio": round(rr, 2) if rr else None,
            "breakeven_win_rate_pct": round(100 / (1 + rr), 1) if rr else None,
        })

    if leverage > 10:
        warnings.append("Implied leverage above 10x. A small adverse move can wipe out the account.")
    elif leverage > 3:
        warnings.append("Implied leverage above 3x - size down if you are new to this market.")
    if risk_pct > 2:
        warnings.append("Risking more than 2% per trade compounds drawdowns quickly.")
    if result.get("risk_reward_ratio") and result["risk_reward_ratio"] < 1:
        warnings.append("Reward is smaller than the risk; you need a high win rate to profit.")
    warnings.append("A stop-loss does not guarantee an exit at that price - gaps and slippage can fill worse.")
    return result


def propose_levels(price: float, atr: float, direction: str, rr: float = 1.5, sl_atr: float = 1.5,
                   support: float | None = None, resistance: float | None = None) -> dict:
    """Documented ATR-based entry/stop/target proposal (not a recommendation)."""
    if direction not in ("bullish", "bearish"):
        return {"available": False, "reason": "No directional forecast to anchor a level proposal."}
    if not atr or atr <= 0 or math.isnan(atr):
        return {"available": False, "reason": "ATR unavailable; cannot size a volatility-based stop."}
    stop_distance = atr * sl_atr
    if direction == "bullish":
        entry_low, entry_high = price - 0.25 * atr, price + 0.1 * atr
        stop = price - stop_distance
        if support and support < price and support > stop:
            stop = min(stop, support - 0.25 * atr)
        target = price + stop_distance * rr
        if resistance and resistance > price:
            target = min(target, resistance)
    else:
        entry_low, entry_high = price - 0.1 * atr, price + 0.25 * atr
        stop = price + stop_distance
        if resistance and resistance > price and resistance < stop:
            stop = max(stop, resistance + 0.25 * atr)
        target = price - stop_distance * rr
        if support and 0 < support < price:
            target = max(target, support)
    risk = abs(price - stop)
    reward = abs(target - price)
    return {
        "available": True,
        "entry_zone": [round(entry_low, 6), round(entry_high, 6)],
        "stop_loss": round(stop, 6),
        "take_profit": round(target, 6),
        "risk_reward_ratio": round(reward / risk, 2) if risk else None,
        "method": f"Entry = price +/- 0.25*ATR; stop = {sl_atr}x ATR (adjusted to nearest S/R); target = {rr}x risk.",
    }
