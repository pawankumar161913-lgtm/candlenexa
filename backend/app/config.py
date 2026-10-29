"""Application configuration.

All secrets are read from environment variables (optionally a .env file that
lives NEXT TO the backend, never inside the frontend build). Nothing in this
module is ever shipped to the browser.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- app ---
    app_name: str = "CandleNexa"
    env: str = "development"
    debug: bool = False

    # --- security ---
    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    access_token_expire_minutes: int = 60 * 24 * 7
    algorithm: str = "HS256"

    # --- database ---
    # Default is SQLite for zero-setup local runs. Set DATABASE_URL to a
    # PostgreSQL DSN for production, e.g.
    #   postgresql+psycopg://user:pass@localhost:5432/user-file
    database_url: str = f"sqlite:///{(BASE_DIR / 'candlenexa.db').as_posix()}"

    # --- market data (Twelve Data) ---
    twelve_data_api_key: str = ""
    twelve_data_base_url: str = "https://api.twelvedata.com"
    market_data_provider: str = "twelve_data"  # or "demo"
    http_timeout_seconds: float = 20.0
    # Twelve Data free plan allows ~8 credits/minute; we stay well under it.
    provider_min_interval_seconds: float = 8.0
    provider_daily_credit_budget: int = 700  # of 800/day on the free plan

    # --- caching ---
    cache_ttl_seconds: int = 60          # quotes / latest candles
    series_cache_ttl_seconds: int = 300  # historical series
    analysis_cache_ttl_seconds: int = 180

    # --- rate limiting (per client IP) ---
    rate_limit_per_minute: int = 120
    rate_limit_auth_per_minute: int = 20

    # --- CORS ---
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
