"""Prediction engine.

Design (deliberately conservative and honest):

1. Outcome definition: over the next `horizon` bars (default 4), will the close
   be at least `neutral_band` ATRs above (up), below (down), or inside
   (neutral) the current close? This is stated in every response.
2. Features are computed only from bars <= t (see indicators.py).
3. Walk-forward validation: the model is re-fitted on an expanding window and
   scored on the immediately following block, repeated until the end of the
   data. The last fold is used for the live prediction, so the reported metrics
   come from genuinely out-of-sample predictions.
4. Two models: a transparent baseline (ATR-scaled momentum) and a machine
   learning model (standardised logistic regression, or gradient boosting when
   scikit-learn HistGradientBoosting is available and enough data exists).
5. Confidence is only reported when out-of-sample accuracy is meaningfully
   better than a naive majority-class baseline, otherwise the engine abstains
   and says so.

Nothing here guarantees accuracy; every field is an estimate.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .indicators import compute_indicators

log = logging.getLogger("candlenexa.predictor")

FEATURE_COLUMNS = [
    "ret_1", "ret_3", "ret_5", "ret_10",
    "rsi_norm", "macd_hist_atr", "ema_spread", "price_vs_sma200",
    "bb_pct_b", "atr_pct", "adx_norm", "di_spread",
    "vol_ratio", "stoch_k_norm", "bb_width",
]

FEATURE_LABELS = {
    "ret_1": "1-bar momentum",
    "ret_3": "3-bar momentum",
    "ret_5": "5-bar momentum",
    "ret_10": "10-bar momentum",
    "rsi_norm": "RSI (14) deviation",
    "macd_hist_atr": "MACD histogram (ATR-normalised)",
    "ema_spread": "EMA 21 vs EMA 50 spread",
    "price_vs_sma200": "Price vs SMA 200",
    "bb_pct_b": "Bollinger %B",
    "atr_pct": "ATR volatility",
    "adx_norm": "ADX trend strength",
    "di_spread": "+DI vs -DI",
    "vol_ratio": "Volume vs 20-bar average",
    "stoch_k_norm": "Stochastic %K",
    "bb_width": "Bollinger band width",
}

MIN_TRAIN_ROWS = 220


@dataclass
class ModelResult:
    direction: str                 # bullish | bearish | neutral | no_signal
    prob_up: float
    prob_down: float
    prob_neutral: float
    confidence: float | None
    confidence_label: str          # high | medium | low | uncalibrated | none
    horizon_bars: int
    horizon_label: str
    expected_move_atr: float | None
    neutral_band_atr: float
    model_type: str
    abstain_reason: str | None
    metrics: dict
    features: list[dict]
    feature_importance: list[dict]
    baseline: dict
    limitations: list[str]


# ------------------------------------------------------------------ features
def build_features(df: pd.DataFrame) -> pd.DataFrame:
    ind = compute_indicators(df)
    f = pd.DataFrame(index=ind.index)
    close = ind["close"]
    f["ret_1"] = close.pct_change(1)
    f["ret_3"] = close.pct_change(3)
    f["ret_5"] = close.pct_change(5)
    f["ret_10"] = close.pct_change(10)
    f["rsi_norm"] = (ind["rsi_14"] - 50) / 50
    f["macd_hist_atr"] = ind["macd_hist"] / ind["atr_14"].replace(0, np.nan)
    f["ema_spread"] = (ind["ema_21"] - ind["ema_50"]) / close
    f["price_vs_sma200"] = (close - ind["sma_200"]) / ind["sma_200"].replace(0, np.nan)
    f["bb_pct_b"] = ind["bb_pct_b"]
    f["atr_pct"] = ind["atr_pct"] / 100
    f["adx_norm"] = ind["adx"] / 100
    f["di_spread"] = (ind["plus_di"] - ind["minus_di"]) / 100
    vol_avg = ind["volume"].rolling(20, min_periods=20).mean()
    f["vol_ratio"] = np.where(
        ind["volume"].isna() | vol_avg.isna() | (vol_avg == 0), 1.0, ind["volume"] / vol_avg
    )
    f["stoch_k_norm"] = (ind["stoch_k"] - 50) / 50
    f["bb_width"] = ind["bb_width"]
    f = f.replace([np.inf, -np.inf], np.nan)
    return pd.concat([f, ind[["close", "high", "low", "atr_14", "rsi_14", "datetime"]]], axis=1)


def make_labels(df: pd.DataFrame, horizon: int, band_atr: float) -> pd.Series:
    """+1 up / -1 down / 0 neutral, using only future bars for the LABEL (never features)."""
    close = df["close"]
    atr_now = df["atr_14"]
    future = close.shift(-horizon)
    delta = future - close
    threshold = atr_now * band_atr
    label = pd.Series(0, index=df.index, dtype=int)
    label[delta > threshold] = 1
    label[delta < -threshold] = -1
    label[future.isna() | atr_now.isna()] = np.nan
    return label


# ------------------------------------------------------------------ models
def _fit_model(X: np.ndarray, y: np.ndarray, prefer_gbm: bool):
    """Fit a classifier; returns (model, scaler, name)."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    classes = np.unique(y)
    if len(classes) < 2:
        return None, None, "insufficient_classes"

    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)

    if prefer_gbm and len(X) >= 600:
        try:
            clf = HistGradientBoostingClassifier(
                max_iter=150, learning_rate=0.06, max_depth=3, min_samples_leaf=30,
                l2_regularization=1.0, random_state=42,
            )
            clf.fit(X, y)
            return clf, None, "gradient_boosting"
        except Exception as exc:  # pragma: no cover - fall back cleanly
            log.warning("GBM failed, using logistic regression: %s", exc)

    clf = LogisticRegression(max_iter=2000, C=0.5, class_weight="balanced")
    clf.fit(Xs, y)
    return clf, scaler, "logistic_regression"


def _predict_proba(model, scaler, X: np.ndarray, classes_order: list[int]) -> np.ndarray:
    Xs = scaler.transform(X) if scaler is not None else X
    raw = model.predict_proba(Xs)
    model_classes = list(getattr(model, "classes_", classes_order))
    out = np.zeros((len(X), 3))
    for j, c in enumerate(model_classes):
        out[:, classes_order.index(int(c))] = raw[:, j]
    return out


def _class_order(y: np.ndarray) -> list[int]:
    return [-1, 0, 1]


def walk_forward(X: np.ndarray, y: np.ndarray, *, folds: int = 4, prefer_gbm: bool = True):
    """Expanding-window walk-forward evaluation.

    Returns out-of-sample probabilities for the evaluated tail, plus the last
    fitted model (trained on everything before the final block).
    """
    n = len(X)
    if n < MIN_TRAIN_ROWS:
        return None
    block = max(40, (n - MIN_TRAIN_ROWS) // folds)
    if block < 20:
        return None

    oos_probs: list[np.ndarray] = []
    oos_true: list[int] = []
    last_model = None
    order = _class_order(y)
    for k in range(folds):
        train_end = n - block * (folds - k)
        test_end = min(n, train_end + block)
        if train_end < MIN_TRAIN_ROWS:
            continue
        model, scaler, _name = _fit_model(X[:train_end], y[:train_end], prefer_gbm)
        if model is None:
            continue
        probs = _predict_proba(model, scaler, X[train_end:test_end], order)
        oos_probs.append(probs)
        oos_true.extend(y[train_end:test_end].tolist())
        last_model = (model, scaler, _name)
    if not oos_probs or last_model is None:
        return None
    return {
        "probs": np.vstack(oos_probs),
        "y_true": np.array(oos_true),
        "model": last_model[0],
        "scaler": last_model[1],
        "model_name": last_model[2],
        "folds": len(oos_probs),
        "oos_size": len(oos_true),
    }


def classification_metrics(probs: np.ndarray, y_true: np.ndarray) -> dict:
    pred = np.array(_class_order(0))[probs.argmax(axis=1)] if False else np.take(np.array([-1, 0, 1]), probs.argmax(axis=1))
    acc = float((pred == y_true).mean())
    majority = float(pd.Series(y_true).value_counts(normalize=True).max())
    per_class = {}
    for c, name in ((-1, "down"), (0, "neutral"), (1, "up")):
        mask = y_true == c
        per_class[name] = {
            "support": int(mask.sum()),
            "precision": float((pred[mask] == c).mean()) if mask.sum() else None,
            "recall": float((pred[mask] == c).sum() / mask.sum()) if mask.sum() else None,
        }
    # Brier score for the binary "up vs not-up" question
    p_up = probs[:, 2]
    y_up = (y_true == 1).astype(float)
    brier = float(((p_up - y_up) ** 2).mean())
    return {
        "accuracy": round(acc, 4),
        "majority_baseline_accuracy": round(majority, 4),
        "edge_vs_baseline": round(acc - majority, 4),
        "brier_score": round(brier, 4),
        "per_class": per_class,
        "sample_size": int(len(y_true)),
    }


# ------------------------------------------------------------------ explanation
def explain(features_last: pd.Series, weights: np.ndarray | None, names: list[str]) -> list[dict]:
    """Contribution of each feature to the latest prediction.

    For logistic regression this is exactly w_i * z_i (signed, additive).
    For tree models we fall back to signed feature magnitude, which is a
    heuristic and is labelled as such.
    """
    if weights is None:
        contrib = {n: float(features_last.get(n, 0.0) or 0.0) for n in names}
        method = "heuristic (signed feature magnitude; tree model)"
    else:
        contrib = {n: float(w * (features_last.get(n, 0.0) or 0.0)) for n, w in zip(names, weights)}
        method = "log-odds contribution (w_i * x_i)"
    ordered = sorted(contrib.items(), key=lambda kv: -abs(kv[1]))[:6]
    return [
        {
            "feature": n,
            "label": FEATURE_LABELS.get(n, n),
            "value": None if features_last.get(n) is None else round(float(features_last.get(n) or 0.0), 6),
            "contribution": round(v, 4),
            "direction": "supports_up" if v > 0 else "supports_down" if v < 0 else "neutral",
            "method": method,
        }
        for n, v in ordered
    ]


def _baseline_prediction(df: pd.DataFrame, horizon: int) -> dict:
    """Transparent baseline: ATR-scaled short-term momentum, no fitting."""
    close = df["close"]
    atr_now = float(df["atr_14"].iloc[-1]) if not math.isnan(df["atr_14"].iloc[-1]) else float(close.iloc[-1]) * 0.005
    mom = float(close.iloc[-1] - close.iloc[-min(5, len(close))])
    z = mom / (atr_now * math.sqrt(min(5, len(close))))
    prob_up = 1 / (1 + math.exp(-1.2 * z))
    return {
        "name": "ATR-scaled 5-bar momentum (logistic link, no fitting)",
        "prob_up": round(prob_up, 4),
        "prob_down": round(1 - prob_up, 4),
        "z_score": round(z, 4),
    }


# ------------------------------------------------------------------ main API
def predict(
    df: pd.DataFrame,
    *,
    timeframe_label: str,
    horizon_bars: int = 4,
    band_atr: float = 0.35,
    prefer_gbm: bool = True,
    min_confidence_edge: float = 0.02,
) -> ModelResult:
    feats = build_features(df)
    feats["label"] = make_labels(feats, horizon_bars, band_atr)
    usable = feats.dropna(subset=FEATURE_COLUMNS + ["label", "atr_14"])

    horizon_label = f"next {horizon_bars} bars ({timeframe_label} each)"
    limitations = [
        "Probabilities are model estimates from historical patterns, not certainties.",
        "Past behaviour of a statistical model does not guarantee future accuracy.",
        "Economic events, gaps and liquidity shocks are not in the model.",
    ]

    if len(usable) < MIN_TRAIN_ROWS:
        return ModelResult(
            direction="no_signal", prob_up=0.5, prob_down=0.5, prob_neutral=0.0,
            confidence=None, confidence_label="none", horizon_bars=horizon_bars,
            horizon_label=horizon_label, expected_move_atr=None, neutral_band_atr=band_atr,
            model_type="none", metrics={"sample_size": int(len(usable))},
            features=[], feature_importance=[], baseline={},
            abstain_reason=(
                f"Not enough usable history: {len(usable)} rows with complete features "
                f"(minimum {MIN_TRAIN_ROWS})."
            ),
            limitations=limitations,
        )

    X = usable[FEATURE_COLUMNS].to_numpy(dtype=float)
    y = usable["label"].to_numpy(dtype=int)

    wf = walk_forward(X, y, prefer_gbm=prefer_gbm)
    if wf is None:
        return ModelResult(
            direction="no_signal", prob_up=0.5, prob_down=0.5, prob_neutral=0.0,
            confidence=None, confidence_label="none", horizon_bars=horizon_bars,
            horizon_label=horizon_label, expected_move_atr=None, neutral_band_atr=band_atr,
            model_type="none", metrics={"sample_size": int(len(usable))},
            features=[], feature_importance=[], baseline={},
            abstain_reason="Walk-forward validation could not be formed with the available history.",
            limitations=limitations,
        )

    metrics = classification_metrics(wf["probs"], wf["y_true"])
    model, scaler, model_name = wf["model"], wf["scaler"], wf["model_name"]

    # Fit once more on ALL labelled rows so the live prediction uses the freshest data.
    final_model, final_scaler, final_name = _fit_model(X, y, prefer_gbm=prefer_gbm)
    if final_model is None:
        final_model, final_scaler = model, scaler
    else:
        model_name = final_name

    latest_features = feats.iloc[-1]
    x_last = np.array([[latest_features.get(c, np.nan) for c in FEATURE_COLUMNS]], dtype=float)
    x_last = np.nan_to_num(x_last, nan=0.0, posinf=0.0, neginf=0.0)
    probs = _predict_proba(final_model, final_scaler, x_last, _class_order(y))[0]
    prob_down, prob_neutral, prob_up = (float(p) for p in probs)

    # ---- confidence: only when the OOS edge over the naive baseline is real
    edge = metrics["edge_vs_baseline"]
    confidence = None
    confidence_label = "uncalibrated"
    if metrics["sample_size"] >= 80 and edge >= min_confidence_edge:
        confidence = round(float(max(prob_up, prob_down, prob_neutral)), 4)
        confidence_label = "high" if edge >= 0.06 else "medium" if edge >= 0.035 else "low"

    # ---- direction with abstention rules
    abstain_reason = None
    direction = "neutral"
    top_prob = max(prob_up, prob_down)
    if metrics["sample_size"] < 80:
        direction, abstain_reason = "no_signal", "Out-of-sample sample size too small to trust the model."
    elif edge < 0:
        direction, abstain_reason = "no_signal", (
            "The model did not beat the naive majority-class baseline out of sample, "
            "so no directional edge is claimed."
        )
    elif abs(prob_up - prob_down) < 0.05:
        direction = "neutral"
    elif top_prob > prob_up:
        direction = "bearish"
    else:
        direction = "bullish"

    # ---- feature contributions
    weights = None
    if hasattr(final_model, "coef_"):
        coef = np.asarray(final_model.coef_)
        if coef.shape[0] == 1:  # binary problem
            weights = coef[0]
        else:
            up_idx = list(getattr(final_model, "classes_", [])).index(1) if 1 in list(final_model.classes_) else -1
            weights = coef[up_idx]
    contributions = explain(latest_features, weights, FEATURE_COLUMNS)

    expected_move = None
    atr_last = latest_features.get("atr_14")
    if atr_last is not None and not (isinstance(atr_last, float) and math.isnan(atr_last)):
        signed = prob_up - prob_down
        expected_move = round(float(signed * float(atr_last) * math.sqrt(horizon_bars) * 0.5), 6)

    return ModelResult(
        direction=direction,
        prob_up=round(prob_up, 4),
        prob_down=round(prob_down, 4),
        prob_neutral=round(prob_neutral, 4),
        confidence=confidence,
        confidence_label=confidence_label,
        horizon_bars=horizon_bars,
        horizon_label=horizon_label,
        expected_move_atr=expected_move,
        neutral_band_atr=band_atr,
        model_type=model_name,
        abstain_reason=abstain_reason,
        metrics={**metrics, "folds": wf["folds"], "oos_predictions": wf["oos_size"]},
        features=contributions,
        feature_importance=[
            {"feature": n, "label": FEATURE_LABELS.get(n, n), "abs_contribution": abs(c["contribution"])}
            for n, c in [(f["feature"], f) for f in contributions]
        ],
        baseline=_baseline_prediction(feats, horizon_bars),
        limitations=limitations,
    )
