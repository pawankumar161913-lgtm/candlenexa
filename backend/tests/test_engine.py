"""Unit tests: indicators, predictor, backtester, risk model.

These run fully offline on synthetic data, so they do not consume provider
credits.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services.backtester import BacktestConfig, run_backtest
from app.services.indicators import compute_indicators, detect_patterns, rsi, snapshot, support_resistance
from app.services.predictor import build_features, make_labels, predict
from app.services.risk import position_size, propose_levels


def make_frame(n: int = 900, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2024-01-01", periods=n, freq="h", tz="UTC")
    close = 100 + np.cumsum(rng.normal(0, 0.35, n))
    open_ = np.concatenate([[close[0]], close[:-1]])
    high = np.maximum(open_, close) + np.abs(rng.normal(0, 0.2, n))
    low = np.minimum(open_, close) - np.abs(rng.normal(0, 0.2, n))
    vol = np.abs(rng.normal(1000, 100, n))
    return pd.DataFrame({"datetime": idx, "open": open_, "high": high, "low": low, "close": close, "volume": vol})


def test_indicators_are_causal():
    df = make_frame()
    full = compute_indicators(df)
    truncated = compute_indicators(df.iloc[:-50])
    # the value at a past index must not change when future bars are removed
    for col in ["rsi_14", "ema_21", "sma_50", "macd_hist", "atr_14"]:
        a = float(full[col].iloc[-51])
        b = float(truncated[col].iloc[-1])
        assert a == pytest.approx(b, rel=1e-9), col


def test_rsi_bounds():
    df = make_frame(300)
    r = rsi(df["close"]).dropna()
    assert r.min() >= 0 and r.max() <= 100


def test_snapshot_shape():
    snap = snapshot(make_frame())
    for key in ["price", "rsi_14", "macd", "bollinger", "atr_14", "support_resistance", "trend"]:
        assert key in snap
    assert snap["price"] > 0


def test_labels_use_future_only_for_target():
    df = compute_indicators(make_frame())
    labels = make_labels(df, horizon=4, band_atr=0.35)
    assert labels.isna().sum() >= 4  # last bars have no future close
    assert set(labels.dropna().unique()).issubset({-1, 0, 1})


def test_features_have_no_nan_in_latest_row():
    feats = build_features(make_frame())
    assert feats.iloc[-1].notna().all()


def test_prediction_contract():
    df = make_frame(1200)
    res = predict(df, timeframe_label="1 hour", horizon_bars=4)
    assert res.direction in {"bullish", "bearish", "neutral", "no_signal"}
    assert 0 <= res.prob_up <= 1 and 0 <= res.prob_down <= 1
    assert pytest.approx(res.prob_up + res.prob_down + res.prob_neutral, abs=1e-3) == 1
    if res.direction == "no_signal":
        assert res.abstain_reason
    else:
        assert res.metrics["sample_size"] > 0


def test_prediction_abstains_on_short_history():
    res = predict(make_frame(120), timeframe_label="1 hour")
    assert res.direction == "no_signal"
    assert "Not enough usable history" in (res.abstain_reason or "")


def test_backtest_has_no_lookahead_and_reports_metrics():
    out = run_backtest(make_frame(1400), BacktestConfig())
    assert "error" not in out
    assert out["period"]["bars"] == 1400
    for t in out["trades"]:
        assert t["entry_time"] <= t["exit_time"]
    assert out["model_strategy"]["trades"] >= 0
    assert "assumptions" in out and "limitations" in out


def test_position_size_maths():
    r = position_size(balance=10000, risk_pct=1, entry=1.1000, stop=1.0950, target=1.1100,
                      spread_bps=1, commission_bps=0.5, slippage_bps=1, pip_size=0.0001)
    assert r["risk_amount"] == pytest.approx(100)
    assert r["position_size_units"] > 0
    assert r["risk_reward_ratio"] == pytest.approx(2.0, abs=0.05)
    assert any("stop-loss" in w.lower() for w in r["warnings"])


def test_position_size_rejects_bad_levels():
    with pytest.raises(ValueError):
        position_size(10000, 1, 1.10, 1.20, side="long")
    with pytest.raises(ValueError):
        position_size(0, 1, 1.10, 1.00)


def test_propose_levels_respects_direction():
    long_levels = propose_levels(100.0, 1.0, "bullish")
    assert long_levels["stop_loss"] < 100 < long_levels["take_profit"]
    short_levels = propose_levels(100.0, 1.0, "bearish")
    assert short_levels["take_profit"] < 100 < short_levels["stop_loss"]
    assert propose_levels(100.0, 1.0, "neutral")["available"] is False


def test_support_resistance_sorted_by_distance():
    sr = support_resistance(make_frame())
    price = float(make_frame()["close"].iloc[-1])
    supports = [s["level"] for s in sr["support"]]
    assert all(s <= price * 1.01 for s in supports)
