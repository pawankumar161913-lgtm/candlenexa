"""Market data access layer.

Rules this module enforces:

* Live data comes only from the configured provider (Twelve Data by default).
* Responses are cached to respect provider rate limits.
* A minimum interval between upstream calls is enforced process-wide.
* When live data cannot be fetched, the caller gets an explicit error or a
  clearly-labelled synthetic DEMO series - never a silent fake.
* API keys never leave this process.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import logging
import math
import threading
import time
from dataclasses import dataclass, field

import httpx
import numpy as np
import pandas as pd

from ..config import settings
from ..symbols import TIMEFRAMES, SymbolInfo

log = logging.getLogger("candlenexa.market_data")

REQUIRED_COLUMNS = ["open", "high", "low", "close", "volume"]


class ProviderError(Exception):
    """Upstream provider failure (network, rate limit, plan restriction...)."""

    def __init__(self, message: str, kind: str = "provider_error", status: int = 502):
        super().__init__(message)
        self.kind = kind
        self.status = status


@dataclass
class CandleSeries:
    symbol: str
    timeframe: str
    interval: str
    frame: pd.DataFrame
    source: str                      # "twelve_data" | "demo"
    provider_name: str
    fetched_at: dt.datetime
    last_bar_time: dt.datetime | None
    meta: dict = field(default_factory=dict)
    warning: str | None = None

    @property
    def is_demo(self) -> bool:
        return self.source != "twelve_data"

    def last_close(self) -> float | None:
        if self.frame.empty:
            return None
        return float(self.frame["close"].iloc[-1])


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires, value = item
            if time.time() > expires:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value, ttl: float) -> None:
        with self._lock:
            self._store[key] = (time.time() + ttl, value)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


cache = TTLCache()


class TwelveDataClient:
    """Thin, throttled, cached client for the Twelve Data REST API."""

    def __init__(self) -> None:
        self._last_call = 0.0
        self._lock = threading.Lock()
        self._daily_credits = 0
        self._credit_day = dt.date.today()
        self.last_error: str | None = None

    # ------------------------------------------------------------------ utils
    @property
    def configured(self) -> bool:
        return bool(settings.twelve_data_api_key) and settings.market_data_provider == "twelve_data"

    def _throttle(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = settings.provider_min_interval_seconds - (now - self._last_call)
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()

    def _count_credit(self, n: int = 1) -> None:
        today = dt.date.today()
        if today != self._credit_day:
            self._credit_day = today
            self._daily_credits = 0
        self._daily_credits += n

    def credits_used_today(self) -> int:
        return self._daily_credits

    def _get(self, path: str, params: dict) -> dict:
        if not settings.twelve_data_api_key:
            raise ProviderError(
                "Twelve Data API key is not configured on the server.", kind="not_configured", status=503
            )
        if self._daily_credits >= settings.provider_daily_credit_budget:
            raise ProviderError(
                "Daily market-data credit budget reached; serving cached data only.",
                kind="rate_limited",
                status=429,
            )
        self._throttle()
        q = {**params, "apikey": settings.twelve_data_api_key}
        url = f"{settings.twelve_data_base_url.rstrip('/')}{path}"
        try:
            with httpx.Client(timeout=settings.http_timeout_seconds) as client:
                resp = client.get(url, params=q)
        except httpx.HTTPError as exc:  # network problems
            self.last_error = exc.__class__.__name__
            # Never surface the request URL: it carries the API key in the query string.
            raise ProviderError(f"Market data provider unreachable ({exc.__class__.__name__}).") from None
        finally:
            self._count_credit()

        try:
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001
            raise ProviderError("Market data provider returned a non-JSON response.") from exc

        if isinstance(payload, dict) and payload.get("status") == "error":
            code = payload.get("code")
            msg = str(payload.get("message", "Unknown provider error"))
            self.last_error = msg
            if code in (429, "429"):
                raise ProviderError("Provider rate limit hit. Please retry shortly.", kind="rate_limited", status=429)
            if code in (403, 404, "403", "404") or "plan" in msg.lower():
                raise ProviderError(msg, kind="plan_restricted", status=422)
            raise ProviderError(msg, kind="provider_error", status=502)
        if resp.status_code >= 400:
            raise ProviderError(f"Provider HTTP {resp.status_code}", kind="provider_error", status=502)
        return payload

    # ------------------------------------------------------------- endpoints
    def time_series(self, symbol: str, interval: str, outputsize: int) -> tuple[pd.DataFrame, dict]:
        payload = self._get(
            "/time_series",
            {
                "symbol": symbol,
                "interval": interval,
                "outputsize": min(int(outputsize), 5000),
                "order": "ASC",
                "timezone": "UTC",
            },
        )
        values = payload.get("values") or []
        if not values:
            raise ProviderError(f"No candles returned for {symbol}.", kind="empty", status=404)
        df = pd.DataFrame(values)
        for col in ["open", "high", "low", "close"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        if "volume" in df.columns:
            df["volume"] = pd.to_numeric(df["volume"], errors="coerce")
        else:
            df["volume"] = np.nan
        df["datetime"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
        df = df.dropna(subset=["datetime", "close"]).sort_values("datetime").reset_index(drop=True)
        return df, payload.get("meta", {})

    def quote(self, symbol: str) -> dict:
        return self._get("/quote", {"symbol": symbol})


provider = TwelveDataClient()


# --------------------------------------------------------------------- demo
def _demo_series(symbol: str, timeframe: str, bars: int) -> pd.DataFrame:
    """Deterministic synthetic series for DEMO MODE only.

    It is seeded from the symbol/timeframe so it is stable across calls, and it
    is always labelled `demo` in every API response.
    """
    seed = int(hashlib.sha256(f"{symbol}:{timeframe}".encode()).hexdigest()[:8], 16) % (2**31)
    rng = np.random.default_rng(seed)
    minutes = TIMEFRAMES[timeframe]["minutes"]
    start = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0) - dt.timedelta(minutes=minutes * bars)
    idx = pd.date_range(start=start, periods=bars, freq=f"{minutes}min", tz="UTC")

    base = 100.0
    if symbol.startswith("XAU"):
        base = 2400.0
    elif symbol.startswith("XAG"):
        base = 30.0
    elif symbol in ("BTC/USD", "ETH/USD"):
        base = 60000.0 if symbol.startswith("BTC") else 3000.0
    elif "/" in symbol:
        base = 1.10 if symbol.startswith("EUR") else 1.28 if symbol.startswith("GBP") else 150.0
    elif symbol in ("SPY", "QQQ", "DIA", "IWM"):
        base = 500.0
    elif symbol == "AAPL":
        base = 220.0

    drift = rng.normal(0, 1e-5)
    vol = base * 0.0015
    prices = [base]
    for _ in range(bars - 1):
        prices.append(prices[-1] * (1 + drift) + rng.normal(0, vol))
    close = np.array(prices)
    spread = np.abs(rng.normal(0, vol * 0.6, bars))
    open_ = np.concatenate([[close[0]], close[:-1]])
    high = np.maximum(open_, close) + spread
    low = np.minimum(open_, close) - spread
    volume = np.abs(rng.normal(1000, 250, bars))
    return pd.DataFrame(
        {"datetime": idx, "open": open_, "high": high, "low": low, "close": close, "volume": volume}
    )


# ------------------------------------------------------------------ facade
def get_series(
    info: SymbolInfo,
    timeframe: str,
    *,
    force_refresh: bool = False,
    allow_demo: bool = True,
    min_bars: int = 120,
) -> CandleSeries:
    """Return candles for a symbol/timeframe, from cache, provider, or demo."""
    if timeframe not in TIMEFRAMES:
        raise ProviderError(f"Unsupported timeframe '{timeframe}'.", kind="bad_request", status=400)
    tf = TIMEFRAMES[timeframe]
    cache_key = f"series:{info.symbol}:{timeframe}"
    if not force_refresh:
        cached: CandleSeries | None = cache.get(cache_key)
        if cached is not None:
            return cached

    now = dt.datetime.now(dt.timezone.utc)
    if provider.configured:
        try:
            df, meta = provider.time_series(info.symbol, tf["interval"], tf["outputsize"])
            if len(df) < min_bars:
                raise ProviderError(
                    f"Only {len(df)} candles available for {info.symbol} at {timeframe}; "
                    f"at least {min_bars} are needed for analysis.",
                    kind="insufficient_data",
                    status=422,
                )
            series = CandleSeries(
                symbol=info.symbol,
                timeframe=timeframe,
                interval=tf["interval"],
                frame=df,
                source="twelve_data",
                provider_name="Twelve Data",
                fetched_at=now,
                last_bar_time=df["datetime"].iloc[-1].to_pydatetime(),
                meta=meta,
            )
            cache.set(cache_key, series, settings.series_cache_ttl_seconds)
            return series
        except ProviderError as exc:
            log.warning("live fetch failed for %s %s: %s", info.symbol, timeframe, exc)
            if not allow_demo:
                raise
            demo_reason = str(exc)
    else:
        demo_reason = "Live market data provider is not configured on the server."

    df = _demo_series(info.symbol, timeframe, tf["outputsize"])
    series = CandleSeries(
        symbol=info.symbol,
        timeframe=timeframe,
        interval=tf["interval"],
        frame=df,
        source="demo",
        provider_name="DEMO (synthetic, not real market data)",
        fetched_at=now,
        last_bar_time=df["datetime"].iloc[-1].to_pydatetime(),
        warning=demo_reason,
    )
    cache.set(cache_key, series, settings.cache_ttl_seconds)
    return series


def provider_status() -> dict:
    return {
        "provider": "Twelve Data" if settings.market_data_provider == "twelve_data" else settings.market_data_provider,
        "configured": provider.configured,
        "base_url": settings.twelve_data_base_url,
        "min_interval_seconds": settings.provider_min_interval_seconds,
        "credits_used_today": provider.credits_used_today(),
        "credit_budget": settings.provider_daily_credit_budget,
        "last_error": provider.last_error,
        "demo_mode_available": True,
    }
