"""Pydantic request/response schemas."""
from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, EmailStr, Field, field_validator


# ------------------------------------------------------------------ auth
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=120)

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        if v.isdigit() or v.isalpha():
            raise ValueError("Password must contain both letters and numbers.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    base_currency: str
    risk_per_trade_pct: float
    max_daily_loss_pct: float
    default_timeframe: str
    default_symbol: str
    email_alerts: bool
    paper_balance: float
    paper_equity: float
    paper_starting_balance: float
    created_at: dt.datetime

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    base_currency: str | None = Field(default=None, max_length=8)
    risk_per_trade_pct: float | None = Field(default=None, ge=0.1, le=10)
    max_daily_loss_pct: float | None = Field(default=None, ge=0.5, le=50)
    default_timeframe: str | None = None
    default_symbol: str | None = None
    email_alerts: bool | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ------------------------------------------------------------------ watchlist
class WatchlistIn(BaseModel):
    symbol: str
    note: str = Field(default="", max_length=255)


class WatchlistOut(BaseModel):
    id: int
    symbol: str
    note: str
    created_at: dt.datetime

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------ alerts
class AlertIn(BaseModel):
    symbol: str
    condition: str = Field(pattern="^(above|below|pct_change|rsi_above|rsi_below)$")
    threshold: float
    timeframe: str = "1h"
    note: str = Field(default="", max_length=255)


class AlertOut(BaseModel):
    id: int
    symbol: str
    condition: str
    threshold: float
    timeframe: str
    note: str
    is_active: bool
    triggered_at: dt.datetime | None
    last_checked_at: dt.datetime | None
    last_value: float | None
    created_at: dt.datetime

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------ analysis
class AnalysisIn(BaseModel):
    title: str = Field(default="", max_length=160)


# ------------------------------------------------------------------ paper trading
class TradeOpenIn(BaseModel):
    symbol: str
    side: str = Field(pattern="^(long|short)$")
    quantity: float = Field(gt=0)
    stop_loss: float | None = None
    take_profit: float | None = None
    note: str = Field(default="", max_length=255)


class TradeCloseIn(BaseModel):
    note: str = Field(default="", max_length=255)


class TradeOut(BaseModel):
    id: int
    symbol: str
    side: str
    quantity: float
    entry_price: float
    stop_loss: float | None
    take_profit: float | None
    exit_price: float | None
    status: str
    realized_pnl: float | None
    fees_paid: float
    note: str
    opened_at: dt.datetime
    closed_at: dt.datetime | None

    model_config = {"from_attributes": True}


class WalletReset(BaseModel):
    starting_balance: float = Field(gt=0, le=10_000_000)


# ------------------------------------------------------------------ assistant
class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    symbol: str | None = None
    timeframe: str | None = None


TokenOut.model_rebuild()
