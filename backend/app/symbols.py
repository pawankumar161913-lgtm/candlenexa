"""Symbol catalogue.

Every symbol is validated against this catalogue before any provider call, so
users cannot force arbitrary (or billable) upstream requests.

`plan_note` documents which Twelve Data plan we observed to be required. The
API itself is the source of truth at runtime: if the provider answers 403/404
for a symbol, the UI shows that explicitly instead of inventing data.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SymbolInfo:
    symbol: str          # provider symbol (Twelve Data format)
    name: str
    category: str        # forex | metals | crypto | indices | stocks
    pip_size: float      # smallest conventional price increment used for stops
    quote_currency: str
    exchange: str = ""
    aliases: tuple[str, ...] = ()
    plan_note: str = ""


SYMBOLS: list[SymbolInfo] = [
    # ---------------- Forex majors ----------------
    SymbolInfo("EUR/USD", "Euro / US Dollar", "forex", 0.0001, "USD", aliases=("eurusd", "eur usd", "euro")),
    SymbolInfo("GBP/USD", "British Pound / US Dollar", "forex", 0.0001, "USD", aliases=("gbpusd", "cable", "pound")),
    SymbolInfo("USD/JPY", "US Dollar / Japanese Yen", "forex", 0.01, "JPY", aliases=("usdjpy", "yen")),
    SymbolInfo("AUD/USD", "Australian Dollar / US Dollar", "forex", 0.0001, "USD", aliases=("audusd", "aussie")),
    SymbolInfo("USD/CAD", "US Dollar / Canadian Dollar", "forex", 0.0001, "CAD", aliases=("usdcad", "loonie")),
    SymbolInfo("USD/CHF", "US Dollar / Swiss Franc", "forex", 0.0001, "CHF", aliases=("usdchf", "swissy")),
    SymbolInfo("NZD/USD", "New Zealand Dollar / US Dollar", "forex", 0.0001, "USD", aliases=("nzdusd", "kiwi")),
    # ---------------- Forex crosses ----------------
    SymbolInfo("EUR/GBP", "Euro / British Pound", "forex", 0.0001, "GBP", aliases=("eurgbp",)),
    SymbolInfo("EUR/JPY", "Euro / Japanese Yen", "forex", 0.01, "JPY", aliases=("eurjpy",)),
    SymbolInfo("GBP/JPY", "British Pound / Japanese Yen", "forex", 0.01, "JPY", aliases=("gbpjpy",)),
    SymbolInfo("AUD/JPY", "Australian Dollar / Japanese Yen", "forex", 0.01, "JPY", aliases=("audjpy",)),
    SymbolInfo("EUR/CHF", "Euro / Swiss Franc", "forex", 0.0001, "CHF", aliases=("eurchf",)),
    SymbolInfo("GBP/CHF", "British Pound / Swiss Franc", "forex", 0.0001, "CHF", aliases=("gbpchf",)),
    SymbolInfo("EUR/AUD", "Euro / Australian Dollar", "forex", 0.0001, "AUD", aliases=("euraud",)),
    SymbolInfo("USD/INR", "US Dollar / Indian Rupee", "forex", 0.01, "INR", aliases=("usdinr", "rupee")),
    # ---------------- Metals ----------------
    SymbolInfo("XAU/USD", "Gold Spot / US Dollar", "metals", 0.01, "USD", aliases=("gold", "xauusd", "xau")),
    SymbolInfo("XAG/USD", "Silver Spot / US Dollar", "metals", 0.001, "USD", aliases=("silver", "xagusd", "xag"),
               plan_note="Silver spot requires a Twelve Data Grow/Venture plan; on the free plan the API returns an upgrade error and the UI shows it."),
    # ---------------- Crypto ----------------
    SymbolInfo("BTC/USD", "Bitcoin / US Dollar", "crypto", 0.5, "USD", exchange="Binance", aliases=("btc", "bitcoin", "btcusd")),
    SymbolInfo("ETH/USD", "Ethereum / US Dollar", "crypto", 0.05, "USD", exchange="Binance", aliases=("eth", "ethereum", "ethusd")),
    SymbolInfo("SOL/USD", "Solana / US Dollar", "crypto", 0.01, "USD", exchange="Binance", aliases=("sol", "solana")),
    SymbolInfo("XRP/USD", "XRP / US Dollar", "crypto", 0.0001, "USD", exchange="Binance", aliases=("xrp", "ripple")),
    SymbolInfo("ADA/USD", "Cardano / US Dollar", "crypto", 0.0001, "USD", exchange="Binance", aliases=("ada", "cardano")),
    SymbolInfo("DOGE/USD", "Dogecoin / US Dollar", "crypto", 0.00001, "USD", exchange="Binance", aliases=("doge",)),
    SymbolInfo("BNB/USD", "BNB / US Dollar", "crypto", 0.01, "USD", exchange="Binance", aliases=("bnb",)),
    SymbolInfo("LTC/USD", "Litecoin / US Dollar", "crypto", 0.01, "USD", exchange="Binance", aliases=("ltc",)),
    # ---------------- Indices (via liquid ETFs / index symbols) ----------------
    SymbolInfo("SPY", "S&P 500 ETF Trust (SPY)", "indices", 0.01, "USD", exchange="NYSE",
               aliases=("spx", "sp500", "s&p500", "s&p 500"), plan_note="Index symbol SPX needs a paid plan; SPY ETF tracks the same index and works on the free plan."),
    SymbolInfo("QQQ", "Nasdaq 100 ETF (QQQ)", "indices", 0.01, "USD", exchange="NASDAQ",
               aliases=("nasdaq", "ndx", "nasdaq100")),
    SymbolInfo("DIA", "Dow Jones ETF (DIA)", "indices", 0.01, "USD", exchange="NYSE", aliases=("dow", "dji")),
    SymbolInfo("IWM", "Russell 2000 ETF (IWM)", "indices", 0.01, "USD", exchange="NYSE", aliases=("russell",)),
    # ---------------- Large-cap stocks ----------------
    SymbolInfo("AAPL", "Apple Inc.", "stocks", 0.01, "USD", exchange="NASDAQ", aliases=("apple",)),
    SymbolInfo("MSFT", "Microsoft Corp.", "stocks", 0.01, "USD", exchange="NASDAQ", aliases=("microsoft",)),
    SymbolInfo("NVDA", "NVIDIA Corp.", "stocks", 0.01, "USD", exchange="NASDAQ", aliases=("nvidia",)),
    SymbolInfo("TSLA", "Tesla Inc.", "stocks", 0.01, "USD", exchange="NASDAQ", aliases=("tesla",)),
    SymbolInfo("AMZN", "Amazon.com Inc.", "stocks", 0.01, "USD", exchange="NASDAQ", aliases=("amazon",)),
    SymbolInfo("GOOGL", "Alphabet Inc. Class A", "stocks", 0.01, "USD", exchange="NASDAQ", aliases=("google", "alphabet")),
    SymbolInfo("META", "Meta Platforms Inc.", "stocks", 0.01, "USD", exchange="NASDAQ", aliases=("facebook",)),
]

BY_SYMBOL: dict[str, SymbolInfo] = {s.symbol.upper(): s for s in SYMBOLS}
_ALIAS_MAP: dict[str, str] = {}
for _s in SYMBOLS:
    _ALIAS_MAP[_s.symbol.upper().replace("/", "")] = _s.symbol
    _ALIAS_MAP[_s.symbol.upper()] = _s.symbol
    _ALIAS_MAP[_s.name.upper()] = _s.symbol
    for _a in _s.aliases:
        _ALIAS_MAP[_a.upper()] = _s.symbol

CATEGORIES = ["forex", "metals", "crypto", "indices", "stocks"]

# Timeframes supported by the platform and how they map onto the provider.
TIMEFRAMES: dict[str, dict] = {
    "1m": {"label": "1 minute", "interval": "1min", "minutes": 1, "outputsize": 600},
    "5m": {"label": "5 minutes", "interval": "5min", "minutes": 5, "outputsize": 700},
    "15m": {"label": "15 minutes", "interval": "15min", "minutes": 15, "outputsize": 700},
    "1h": {"label": "1 hour", "interval": "1h", "minutes": 60, "outputsize": 900},
    "4h": {"label": "4 hours", "interval": "4h", "minutes": 240, "outputsize": 900},
    "1d": {"label": "1 day", "interval": "1day", "minutes": 1440, "outputsize": 1200},
}


def resolve_symbol(raw: str) -> SymbolInfo | None:
    if not raw:
        return None
    key = raw.strip().upper().replace(" ", "").replace("-", "/")
    if key in BY_SYMBOL:
        return BY_SYMBOL[key]
    if key.replace("/", "") in BY_SYMBOL:
        return BY_SYMBOL[key.replace("/", "")]
    alias = _ALIAS_MAP.get(key) or _ALIAS_MAP.get(key.replace("/", ""))
    return BY_SYMBOL.get(alias) if alias else None


def search_symbols(query: str, limit: int = 20) -> list[SymbolInfo]:
    q = (query or "").strip().upper()
    if not q:
        return SYMBOLS[:limit]
    scored: list[tuple[int, SymbolInfo]] = []
    for s in SYMBOLS:
        haystacks = [s.symbol.upper(), s.name.upper(), *[a.upper() for a in s.aliases]]
        best = 0
        for h in haystacks:
            if h == q:
                best = max(best, 100)
            elif h.startswith(q):
                best = max(best, 80)
            elif q in h:
                best = max(best, 50)
        if best:
            scored.append((best, s))
    scored.sort(key=lambda x: (-x[0], x[1].symbol))
    return [s for _, s in scored[:limit]]
