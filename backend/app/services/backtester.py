"""Strategy, risk model and backtester.

Strategy (documented, deterministic):
  * Enter in the direction of the model's probability edge when it exceeds
    `min_edge` and the model is not abstaining.
  * Stop loss = `sl_atr` x ATR(14) beyond entry.
  * Take profit = `rr` x stop distance.
  * One position at a time; the position is resolved bar-by-bar in order:
    the stop is checked before the target (conservative assumption).
  * Costs: spread + commission are charged on entry and exit, and an extra
    slippage fraction is applied to stop-loss exits.

No look-ahead: signals are computed on bar t, entry happens at the OPEN of
bar t+1, and exits are evaluated on bars t+1..t+horizon only.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .indicators import compute_indicators
from .predictor import FEATURE_COLUMNS, build_features, make_labels


@dataclass
class BacktestConfig:
    horizon: int = 4
    band_atr: float = 0.35
    min_edge: float = 0.05
    sl_atr: float = 1.5
    rr: float = 1.5
    spread_bps: float = 1.0
    commission_bps: float = 0.5
    slippage_bps: float = 1.0
    train_min: int = 250
    step: int = 1


def _rule_signals(ind: pd.DataFrame) -> np.ndarray:
    """Baseline rule strategy: EMA21/EMA50 cross with RSI filter."""
    ema_fast = ind["ema_21"].to_numpy()
    ema_slow = ind["ema_50"].to_numpy()
    rsi = ind["rsi_14"].to_numpy()
    sig = np.zeros(len(ind), dtype=int)
    sig[(ema_fast > ema_slow) & (rsi < 70)] = 1
    sig[(ema_fast < ema_slow) & (rsi > 30)] = -1
    return sig


def run_backtest(df: pd.DataFrame, cfg: BacktestConfig | None = None) -> dict:
    cfg = cfg or BacktestConfig()
    feats = build_features(df)
    feats["label"] = make_labels(feats, cfg.horizon, cfg.band_atr)
    ind = compute_indicators(df)

    # re-attach raw OHLC: build_features() drops the price columns
    for col in ("open", "high", "low", "close", "volume"):
        feats[col] = df[col].to_numpy()

    data = feats.reset_index(drop=True)
    ind = ind.reset_index(drop=True)
    n = len(data)
    if n < cfg.train_min + cfg.horizon + 20:
        return {"error": "not_enough_data", "rows": n, "required": cfg.train_min + cfg.horizon + 20}

    feature_ok = data[FEATURE_COLUMNS].notna().all(axis=1) & data["label"].notna()
    valid_idx = np.where(feature_ok.to_numpy())[0]
    X_all = data[FEATURE_COLUMNS].to_numpy(dtype=float)
    y_all = data["label"].to_numpy(dtype=float)

    rule_sig = _rule_signals(ind)

    trades: list[dict] = []
    signals: list[dict] = []
    fold_log: list[dict] = []

    from .predictor import _class_order, _fit_model, _predict_proba  # local import to avoid cycles

    folds = 4
    block = max(50, (len(valid_idx) - cfg.train_min) // folds) if len(valid_idx) > cfg.train_min else 0

    for f in range(folds):
        test_start_pos = cfg.train_min + f * block
        test_end_pos = min(len(valid_idx), test_start_pos + block)
        if test_start_pos >= len(valid_idx) or block == 0:
            break
        train_idx = valid_idx[:test_start_pos]
        test_idx = valid_idx[test_start_pos:test_end_pos]
        if len(train_idx) < cfg.train_min or len(test_idx) < 5:
            continue
        model, scaler, name = _fit_model(X_all[train_idx], y_all[train_idx].astype(int), prefer_gbm=True)
        if model is None:
            continue
        probs = _predict_proba(model, scaler, X_all[test_idx], _class_order(y_all[train_idx].astype(int)))
        oos_acc = float((np.take(np.array([-1, 0, 1]), probs.argmax(axis=1)) == y_all[test_idx]).mean())
        fold_log.append({
            "fold": f + 1,
            "train_rows": int(len(train_idx)),
            "test_rows": int(len(test_idx)),
            "test_from": str(data["datetime"].iloc[test_idx[0]])[:19],
            "test_to": str(data["datetime"].iloc[test_idx[-1]])[:19],
            "model": name,
            "oos_accuracy": round(oos_acc, 4),
        })

        for j, i in enumerate(test_idx):
            if j % max(1, cfg.step) != 0:
                continue
            p_down, p_neutral, p_up = probs[j]
            edge = p_up - p_down
            direction = 1 if edge > cfg.min_edge else -1 if edge < -cfg.min_edge else 0
            if direction == 0:
                continue
            entry_i = i + 1
            if entry_i >= n:
                continue
            entry = float(data["open"].iloc[entry_i])
            atr_val = float(data["atr_14"].iloc[i]) if not np.isnan(data["atr_14"].iloc[i]) else entry * 0.005
            if atr_val <= 0:
                continue
            stop = entry - direction * cfg.sl_atr * atr_val
            target = entry + direction * cfg.sl_atr * atr_val * cfg.rr
            exit_i, exit_price, reason = None, None, None
            for k in range(entry_i, min(n, entry_i + cfg.horizon + 1)):
                hi, lo = float(data["high"].iloc[k]), float(data["low"].iloc[k])
                if direction == 1:
                    if lo <= stop:
                        exit_i, exit_price, reason = k, stop * (1 - cfg.slippage_bps / 10000), "stop_loss"
                        break
                    if hi >= target:
                        exit_i, exit_price, reason = k, target, "take_profit"
                        break
                else:
                    if hi >= stop:
                        exit_i, exit_price, reason = k, stop * (1 + cfg.slippage_bps / 10000), "stop_loss"
                        break
                    if lo <= target:
                        exit_i, exit_price, reason = k, target, "take_profit"
                        break
            if exit_i is None:
                exit_i = min(n - 1, entry_i + cfg.horizon)
                exit_price, reason = float(data["close"].iloc[exit_i]), "horizon_exit"

            cost_bps = cfg.spread_bps + cfg.commission_bps
            gross = direction * (exit_price - entry) / entry
            net = gross - cost_bps / 10000
            trades.append({
                "entry_time": str(data["datetime"].iloc[entry_i])[:19],
                "exit_time": str(data["datetime"].iloc[exit_i])[:19],
                "side": "long" if direction == 1 else "short",
                "entry": round(entry, 6),
                "exit": round(exit_price, 6),
                "stop": round(stop, 6),
                "target": round(target, 6),
                "exit_reason": reason,
                "gross_return_pct": round(gross * 100, 4),
                "net_return_pct": round(net * 100, 4),
                "prob_up": round(float(p_up), 4),
                "bars_held": int(exit_i - entry_i),
            })
            signals.append({
                "time": str(data["datetime"].iloc[i])[:19],
                "prob_up": round(float(p_up), 4),
                "prob_down": round(float(p_down), 4),
                "rule_signal": int(rule_sig[i]),
            })

    # ---- rule baseline evaluated on the same out-of-sample window
    baseline_trades = []
    oos_start = cfg.train_min
    for pos in range(oos_start, len(valid_idx) - 1):
        i = valid_idx[pos]
        d = rule_sig[i]
        if d == 0:
            continue
        entry_i = i + 1
        if entry_i >= n:
            continue
        entry = float(data["open"].iloc[entry_i])
        atr_val = float(data["atr_14"].iloc[i]) if not np.isnan(data["atr_14"].iloc[i]) else entry * 0.005
        if atr_val <= 0:
            continue
        stop = entry - d * cfg.sl_atr * atr_val
        target = entry + d * cfg.sl_atr * atr_val * cfg.rr
        exit_price, reason = float(data["close"].iloc[min(n - 1, entry_i + cfg.horizon)]), "horizon_exit"
        for k in range(entry_i, min(n, entry_i + cfg.horizon + 1)):
            hi, lo = float(data["high"].iloc[k]), float(data["low"].iloc[k])
            if d == 1:
                if lo <= stop:
                    exit_price, reason = stop, "stop_loss"
                    break
                if hi >= target:
                    exit_price, reason = target, "take_profit"
                    break
            else:
                if hi >= stop:
                    exit_price, reason = stop, "stop_loss"
                    break
                if lo <= target:
                    exit_price, reason = target, "take_profit"
                    break
        cost_bps = cfg.spread_bps + cfg.commission_bps
        net = d * (exit_price - entry) / entry - cost_bps / 10000
        baseline_trades.append({"net_return_pct": round(net * 100, 4), "exit_reason": reason})

    def stats(rows: list[dict], key: str = "net_return_pct") -> dict:
        if not rows:
            return {"trades": 0}
        r = np.array([x[key] for x in rows], dtype=float)
        wins, losses = r[r > 0], r[r <= 0]
        equity = np.cumprod(1 + r / 100)
        peak = np.maximum.accumulate(equity)
        dd = (equity / peak - 1) * 100
        gross_win = wins.sum() if len(wins) else 0.0
        gross_loss = abs(losses.sum()) if len(losses) else 0.0
        return {
            "trades": int(len(r)),
            "win_rate_pct": round(100 * len(wins) / len(r), 2),
            "avg_win_pct": round(float(wins.mean()), 4) if len(wins) else 0.0,
            "avg_loss_pct": round(float(losses.mean()), 4) if len(losses) else 0.0,
            "profit_factor": round(gross_win / gross_loss, 3) if gross_loss > 0 else None,
            "net_return_pct_sum": round(float(r.sum()), 2),
            "compounded_return_pct": round(float((equity[-1] - 1) * 100), 2),
            "max_drawdown_pct": round(float(dd.min()), 2),
            "avg_bars_held": round(float(np.mean([x.get("bars_held", 0) for x in rows])), 2) if "bars_held" in rows[0] else None,
            "stop_exits": sum(1 for x in rows if x.get("exit_reason") == "stop_loss"),
            "target_exits": sum(1 for x in rows if x.get("exit_reason") == "take_profit"),
        }

    model_stats = stats(trades)
    base_stats = stats(baseline_trades)
    period_from = str(data["datetime"].iloc[0])[:19]
    period_to = str(data["datetime"].iloc[-1])[:19]

    return {
        "config": cfg.__dict__,
        "period": {"from": period_from, "to": period_to, "bars": int(n)},
        "folds": fold_log,
        "model_strategy": model_stats,
        "rule_baseline": base_stats,
        "trades": trades[-60:],
        "trade_count_total": len(trades),
        "assumptions": [
            f"Spread {cfg.spread_bps} bps + commission {cfg.commission_bps} bps charged per round trip.",
            f"Stop-loss fills assume {cfg.slippage_bps} bps of adverse slippage; real fills can be worse.",
            "Stop is checked before target inside the same bar (conservative).",
            "Signals on bar t are executed at the open of bar t+1 - no look-ahead.",
            "One position at a time, no leverage, fixed fractional risk assumed by the caller.",
        ],
        "limitations": [
            "Walk-forward folds reuse the same symbol history; regime changes can still surprise the model.",
            "Backtested performance is not a promise of future results.",
            "Slippage, gaps and weekend liquidity are only approximated.",
        ],
    }
