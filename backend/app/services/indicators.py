"""Technical indicators and market-structure helpers.

All functions are vectorised and causal: the value at bar *i* uses only bars
<= i. That is what keeps the backtester free of look-ahead bias.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


# ------------------------------------------------------------------ moving averages
def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    delta = s.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    avg_loss = loss.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    return out.fillna(100.0).where(avg_loss.notna(), np.nan)


def macd(s: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    fast_ema = ema(s, fast)
    slow_ema = ema(s, slow)
    line = fast_ema - slow_ema
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return pd.DataFrame({"macd": line, "signal": sig, "hist": line - sig})


def bollinger(s: pd.Series, n: int = 20, k: float = 2.0) -> pd.DataFrame:
    mid = sma(s, n)
    sd = s.rolling(n, min_periods=n).std(ddof=0)
    upper = mid + k * sd
    lower = mid - k * sd
    width = (upper - lower) / mid.replace(0, np.nan)
    pct_b = (s - lower) / (upper - lower).replace(0, np.nan)
    return pd.DataFrame({"mid": mid, "upper": upper, "lower": lower, "width": width, "pct_b": pct_b})


def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    return true_range(df).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def adx(df: pd.DataFrame, n: int = 14) -> pd.DataFrame:
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    tr = true_range(df)
    atr_n = tr.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    plus_di = 100 * pd.Series(plus_dm, index=df.index).ewm(alpha=1 / n, adjust=False, min_periods=n).mean() / atr_n
    minus_di = 100 * pd.Series(minus_dm, index=df.index).ewm(alpha=1 / n, adjust=False, min_periods=n).mean() / atr_n
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return pd.DataFrame({"adx": dx.ewm(alpha=1 / n, adjust=False, min_periods=n).mean(), "plus_di": plus_di, "minus_di": minus_di})


def stochastic(df: pd.DataFrame, n: int = 14, d: int = 3) -> pd.DataFrame:
    low_n = df["low"].rolling(n, min_periods=n).min()
    high_n = df["high"].rolling(n, min_periods=n).max()
    k = 100 * (df["close"] - low_n) / (high_n - low_n).replace(0, np.nan)
    return pd.DataFrame({"k": k, "d": k.rolling(d, min_periods=d).mean()})


def obv(df: pd.DataFrame) -> pd.Series:
    direction = np.sign(df["close"].diff().fillna(0.0))
    return (direction * df["volume"].fillna(0.0)).cumsum()


def vwap(df: pd.DataFrame) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    vol = df["volume"].fillna(0.0)
    cum_v = vol.cumsum().replace(0, np.nan)
    return (tp * vol).cumsum() / cum_v


def roc(s: pd.Series, n: int = 10) -> pd.Series:
    return s.pct_change(n) * 100


# ------------------------------------------------------------------ structure
def swing_points(df: pd.DataFrame, left: int = 3, right: int = 3) -> tuple[list[tuple[int, float]], list[tuple[int, float]]]:
    highs, lows = [], []
    h = df["high"].to_numpy()
    low = df["low"].to_numpy()
    for i in range(left, len(df) - right):
        if h[i] == h[i - left : i + right + 1].max():
            highs.append((i, float(h[i])))
        if low[i] == low[i - left : i + right + 1].min():
            lows.append((i, float(low[i])))
    return highs, lows


def support_resistance(df: pd.DataFrame, lookback: int = 200, max_levels: int = 4) -> dict:
    """Cluster recent swing highs/lows into support and resistance zones."""
    window = df.tail(lookback)
    if len(window) < 30:
        return {"support": [], "resistance": []}
    highs, lows = swing_points(window)
    price = float(window["close"].iloc[-1])
    atr_val = float(atr(window).iloc[-1]) if len(window) > 15 else price * 0.005
    tol = max(atr_val * 0.75, price * 0.0015)

    def cluster(points: list[float], above: bool) -> list[dict]:
        pts = sorted([p for p in points if (p > price) == above], reverse=not above)
        clusters: list[list[float]] = []
        for p in pts:
            if clusters and abs(clusters[-1][-1] - p) <= tol:
                clusters[-1].append(p)
            else:
                clusters.append([p])
        out = [{"level": float(np.mean(c)), "touches": len(c), "strength": min(100, 25 + 15 * len(c))} for c in clusters]
        out.sort(key=lambda x: abs(x["level"] - price))
        return out[:max_levels]

    return {
        "support": cluster([p for _, p in lows], above=False),
        "resistance": cluster([p for _, p in highs], above=True),
        "nearest_support": (lambda s: s[0]["level"] if s else None)(cluster([p for _, p in lows], above=False)),
        "nearest_resistance": (lambda r: r[0]["level"] if r else None)(cluster([p for _, p in highs], above=True)),
    }


def detect_patterns(df: pd.DataFrame, n: int = 6) -> list[dict]:
    """Detect classic candlestick patterns on the last n bars."""
    if len(df) < n + 2:
        return []
    found: list[dict] = []
    tail = df.tail(n + 1).reset_index(drop=True)
    body = (tail["close"] - tail["open"]).abs()
    rng = (tail["high"] - tail["low"]).replace(0, np.nan)
    upper = tail["high"] - tail[["open", "close"]].max(axis=1)
    lower = tail[["open", "close"]].min(axis=1) - tail["low"]
    avg_body = float(body.tail(n).mean()) or 1e-9

    for i in range(1, len(tail)):
        o, c, h, l = (float(tail.loc[i, k]) for k in ("open", "close", "high", "low"))
        po, pc = float(tail.loc[i - 1, "open"]), float(tail.loc[i - 1, "close"])
        b = abs(c - o)
        bar_time = tail.loc[i, "datetime"]
        if b <= 0.1 * float(rng.iloc[i]) and float(rng.iloc[i]) > 0:
            if float(lower.iloc[i]) > 2 * b and float(upper.iloc[i]) < b:
                found.append({"name": "Hammer", "bias": "bullish", "index": i, "time": str(bar_time)})
            elif float(upper.iloc[i]) > 2 * b and float(lower.iloc[i]) < b:
                found.append({"name": "Shooting Star", "bias": "bearish", "index": i, "time": str(bar_time)})
        if c > o and pc < po and c >= po and o <= pc:
            found.append({"name": "Bullish Engulfing", "bias": "bullish", "index": i, "time": str(bar_time)})
        if c < o and pc > po and c <= po and o >= pc:
            found.append({"name": "Bearish Engulfing", "bias": "bearish", "index": i, "time": str(bar_time)})
        if b < 0.15 * avg_body and float(rng.iloc[i]) < 0.3 * avg_body:
            found.append({"name": "Doji", "bias": "neutral", "index": i, "time": str(bar_time)})
        prev_body = abs(pc - po)
        if prev_body < 0.3 * avg_body and b > 1.5 * avg_body:
            found.append(
                {"name": "Bullish Marubozu" if c > o else "Bearish Marubozu", "bias": "bullish" if c > o else "bearish",
                 "index": i, "time": str(bar_time)}
            )
        if float(tail.loc[i, "high"]) > float(tail.loc[i - 1, "high"]) and float(tail.loc[i, "low"]) < float(tail.loc[i - 1, "low"]):
            found.append({"name": "Outside Bar", "bias": "bullish" if c > o else "bearish", "index": i, "time": str(bar_time)})
    # keep the freshest 6 unique patterns
    seen, out = set(), []
    for p in reversed(found):
        if p["name"] in seen:
            continue
        seen.add(p["name"])
        out.append(p)
    return out[:6]


# ------------------------------------------------------------------ bundle
def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with every indicator column attached (causal)."""
    out = df.copy()
    close = out["close"]
    for n in (9, 20, 21, 50, 100, 200):
        out[f"sma_{n}"] = sma(close, n)
    for n in (9, 21, 50, 200):
        out[f"ema_{n}"] = ema(close, n)
    out["rsi_14"] = rsi(close, 14)
    macd_df = macd(close)
    out[["macd", "macd_signal", "macd_hist"]] = macd_df[["macd", "signal", "hist"]]
    bb = bollinger(close)
    out[["bb_mid", "bb_upper", "bb_lower", "bb_width", "bb_pct_b"]] = bb[["mid", "upper", "lower", "width", "pct_b"]]
    out["atr_14"] = atr(out, 14)
    out["atr_pct"] = out["atr_14"] / close * 100
    adx_df = adx(out)
    out[["adx", "plus_di", "minus_di"]] = adx_df[["adx", "plus_di", "minus_di"]]
    st = stochastic(out)
    out[["stoch_k", "stoch_d"]] = st[["k", "d"]]
    out["obv"] = obv(out)
    out["roc_10"] = roc(close, 10)
    out["ret_1"] = close.pct_change(1)
    out["vol_20"] = out["ret_1"].rolling(20, min_periods=20).std()
    return out


def snapshot(df: pd.DataFrame) -> dict:
    """Latest-value indicator snapshot with human-readable interpretations."""
    ind = compute_indicators(df) if "rsi_14" not in df.columns else df
    last = ind.iloc[-1]
    price = float(last["close"])

    def f(col: str):
        v = last.get(col)
        return None if v is None or (isinstance(v, float) and np.isnan(v)) else float(v)

    rsi_v = f("rsi_14")
    trend = "neutral"
    if f("ema_21") and f("ema_50") and f("sma_200"):
        if price > f("ema_21") > f("ema_50") and price > f("sma_200"):
            trend = "bullish"
        elif price < f("ema_21") < f("ema_50") and price < f("sma_200"):
            trend = "bearish"

    macd_hist = f("macd_hist")
    bb = {
        "upper": f("bb_upper"), "mid": f("bb_mid"), "lower": f("bb_lower"),
        "width_pct": round(f("bb_width") * 100, 4) if f("bb_width") is not None else None,
        "percent_b": round(f("bb_pct_b"), 3) if f("bb_pct_b") is not None else None,
    }
    atr_pct = f("atr_pct")
    vol_level = "unknown"
    if atr_pct is not None:
        hist = ind["atr_pct"].dropna()
        if len(hist) > 30:
            pct = float((hist < atr_pct).mean())
            vol_level = "low" if pct < 0.33 else "normal" if pct < 0.66 else "high"

    return {
        "price": price,
        "ma": {"ema_9": f("ema_9"), "ema_21": f("ema_21"), "ema_50": f("ema_50"), "ema_200": f("ema_200"),
               "sma_20": f("sma_20"), "sma_50": f("sma_50"), "sma_200": f("sma_200")},
        "rsi_14": rsi_v,
        "rsi_state": None if rsi_v is None else (
            "overbought" if rsi_v >= 70 else "oversold" if rsi_v <= 30 else "neutral"),
        "macd": {"line": f("macd"), "signal": f("macd_signal"), "histogram": macd_hist,
                 "state": None if macd_hist is None else ("bullish" if macd_hist > 0 else "bearish")},
        "bollinger": bb,
        "atr_14": f("atr_14"),
        "atr_pct": atr_pct,
        "volatility_level": vol_level,
        "adx": f("adx"),
        "di": {"plus": f("plus_di"), "minus": f("minus_di")},
        "stochastic": {"k": f("stoch_k"), "d": f("stoch_d")},
        "roc_10": f("roc_10"),
        "trend": trend,
        "candle_patterns": detect_patterns(df),
        "support_resistance": support_resistance(df),
        "volume": {
            "last": f("volume"),
            "avg_20": None if df["volume"].isna().all() else float(df["volume"].tail(20).mean()),
        },
    }
