"""Authenticated user features: watchlist, alerts, saved analyses, paper trading."""
from __future__ import annotations

import datetime as dt
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import PaperTrade, PriceAlert, SavedAnalysis, User, WatchlistItem
from ..schemas import (
    AlertIn,
    AlertOut,
    AnalysisIn,
    TradeCloseIn,
    TradeOpenIn,
    TradeOut,
    WalletReset,
    WatchlistIn,
    WatchlistOut,
)
from ..services.analysis import analyse, quick_quote
from ..services.market_data import get_series
from ..services.indicators import snapshot
from ..symbols import resolve_symbol

router = APIRouter(prefix="/api", tags=["user"])

DEFAULT_FEE_BPS = 2.0


def _require_symbol(raw: str):
    info = resolve_symbol(raw)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{raw}' is not supported.")
    return info


def _price(info) -> float:
    series = get_series(info, "1h", min_bars=5)
    return float(series.frame["close"].iloc[-1])


# ------------------------------------------------------------------ watchlist
@router.get("/watchlist", response_model=list[WatchlistOut])
def get_watchlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(WatchlistItem).where(WatchlistItem.user_id == user.id)).all()
    return [WatchlistOut.model_validate(r) for r in rows]


@router.post("/watchlist", response_model=WatchlistOut, status_code=201)
def add_watchlist(payload: WatchlistIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    info = _require_symbol(payload.symbol)
    existing = db.scalar(
        select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.symbol == info.symbol)
    )
    if existing:
        return WatchlistOut.model_validate(existing)
    item = WatchlistItem(user_id=user.id, symbol=info.symbol, note=payload.note)
    db.add(item)
    db.commit()
    db.refresh(item)
    return WatchlistOut.model_validate(item)


@router.delete("/watchlist/{item_id}", status_code=204)
def remove_watchlist(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(WatchlistItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist item not found.")
    db.delete(item)
    db.commit()


@router.get("/watchlist/quotes")
def watchlist_quotes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(WatchlistItem).where(WatchlistItem.user_id == user.id)).all()
    out = []
    for r in rows:
        info = resolve_symbol(r.symbol)
        if not info:
            continue
        q = quick_quote(info, user.default_timeframe or "1h")
        q["item_id"] = r.id
        q["note"] = r.note
        out.append(q)
    return {"items": out}


# ------------------------------------------------------------------ alerts
@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(PriceAlert).where(PriceAlert.user_id == user.id).order_by(PriceAlert.id.desc())).all()
    return [AlertOut.model_validate(r) for r in rows]


@router.post("/alerts", response_model=AlertOut, status_code=201)
def create_alert(payload: AlertIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    info = _require_symbol(payload.symbol)
    alert = PriceAlert(
        user_id=user.id,
        symbol=info.symbol,
        condition=payload.condition,
        threshold=payload.threshold,
        timeframe=payload.timeframe,
        note=payload.note,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return AlertOut.model_validate(alert)


@router.delete("/alerts/{alert_id}", status_code=204)
def delete_alert(alert_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.get(PriceAlert, alert_id)
    if not alert or alert.user_id != user.id:
        raise HTTPException(status_code=404, detail="Alert not found.")
    db.delete(alert)
    db.commit()


@router.post("/alerts/{alert_id}/toggle", response_model=AlertOut)
def toggle_alert(alert_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.get(PriceAlert, alert_id)
    if not alert or alert.user_id != user.id:
        raise HTTPException(status_code=404, detail="Alert not found.")
    alert.is_active = not alert.is_active
    if alert.is_active:
        alert.triggered_at = None
    db.commit()
    db.refresh(alert)
    return AlertOut.model_validate(alert)


def evaluate_alerts(db: Session, user: User) -> list[dict]:
    """Check the user's alerts against fresh data; returns newly triggered ones.

    Notifications are delivered in-app (polling this endpoint) - no email is
    sent unless an email provider is configured by the operator.
    """
    rows = db.scalars(
        select(PriceAlert).where(PriceAlert.user_id == user.id, PriceAlert.is_active.is_(True))
    ).all()
    triggered = []
    now = dt.datetime.now(dt.timezone.utc)
    for a in rows:
        info = resolve_symbol(a.symbol)
        if not info:
            continue
        try:
            series = get_series(info, a.timeframe, allow_demo=True, min_bars=30)
        except Exception:  # noqa: BLE001
            continue
        df = series.frame
        price = float(df["close"].iloc[-1])
        value = price
        hit = False
        if a.condition == "above":
            hit = price >= a.threshold
        elif a.condition == "below":
            hit = price <= a.threshold
        elif a.condition == "pct_change":
            prev = float(df["close"].iloc[-2]) if len(df) > 1 else price
            value = (price - prev) / prev * 100 if prev else 0.0
            hit = abs(value) >= abs(a.threshold)
        elif a.condition in ("rsi_above", "rsi_below"):
            rsi_val = snapshot(df).get("rsi_14")
            if rsi_val is not None:
                value = float(rsi_val)
                hit = value >= a.threshold if a.condition == "rsi_above" else value <= a.threshold
        a.last_checked_at = now
        a.last_value = value
        if hit and not a.triggered_at:
            a.triggered_at = now
            triggered.append({
                "id": a.id, "symbol": a.symbol, "condition": a.condition,
                "threshold": a.threshold, "value": round(value, 6),
                "note": a.note, "at": now.isoformat(),
                "is_demo": series.is_demo,
            })
    db.commit()
    return triggered


@router.get("/alerts/check")
def check_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"triggered": evaluate_alerts(db, user)}


# ------------------------------------------------------------------ saved analyses
@router.get("/analyses")
def list_saved(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(SavedAnalysis).where(SavedAnalysis.user_id == user.id).order_by(SavedAnalysis.id.desc())
    ).all()
    return [
        {"id": r.id, "symbol": r.symbol, "timeframe": r.timeframe, "title": r.title, "created_at": r.created_at}
        for r in rows
    ]


@router.post("/analyses", status_code=201)
def save_analysis(payload: AnalysisIn, symbol: str, timeframe: str = "1h",
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    info = _require_symbol(symbol)
    snapshot_data = analyse(info, timeframe)
    row = SavedAnalysis(
        user_id=user.id,
        symbol=info.symbol,
        timeframe=timeframe,
        title=payload.title or f"{info.symbol} {timeframe}",
        payload=json.dumps(snapshot_data),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "title": row.title}


@router.get("/analyses/{analysis_id}")
def get_saved(analysis_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(SavedAnalysis, analysis_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Saved analysis not found.")
    return {
        "id": row.id, "title": row.title, "symbol": row.symbol, "timeframe": row.timeframe,
        "created_at": row.created_at, "data": json.loads(row.payload),
    }


@router.delete("/analyses/{analysis_id}", status_code=204)
def delete_saved(analysis_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(SavedAnalysis, analysis_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Saved analysis not found.")
    db.delete(row)
    db.commit()


# ------------------------------------------------------------------ paper trading
@router.get("/paper/wallet")
def wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    open_trades = db.scalars(
        select(PaperTrade).where(PaperTrade.user_id == user.id, PaperTrade.status == "open")
    ).all()
    unrealized = 0.0
    positions = []
    for t in open_trades:
        info = resolve_symbol(t.symbol)
        if not info:
            continue
        try:
            price = _price(info)
        except Exception:  # noqa: BLE001
            price = t.entry_price
        direction = 1 if t.side == "long" else -1
        pnl = direction * (price - t.entry_price) * t.quantity
        unrealized += pnl
        positions.append({
            **TradeOut.model_validate(t).model_dump(),
            "current_price": price,
            "unrealized_pnl": round(pnl, 2),
        })
    return {
        "starting_balance": user.paper_starting_balance,
        "balance": round(user.paper_balance, 2),
        "equity": round(user.paper_balance + unrealized, 2),
        "unrealized_pnl": round(unrealized, 2),
        "return_pct": round((user.paper_balance + unrealized - user.paper_starting_balance)
                            / user.paper_starting_balance * 100, 2) if user.paper_starting_balance else 0.0,
        "open_positions": positions,
        "daily_loss_limit_pct": user.max_daily_loss_pct,
    }


@router.get("/paper/trades", response_model=list[TradeOut])
def list_trades(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(PaperTrade).where(PaperTrade.user_id == user.id).order_by(PaperTrade.id.desc())
    ).all()
    return [TradeOut.model_validate(r) for r in rows]


@router.post("/paper/trades", status_code=201)
def open_trade(payload: TradeOpenIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    info = _require_symbol(payload.symbol)
    price = _price(info)
    notional = price * payload.quantity
    if notional > user.paper_balance * 5:
        raise HTTPException(
            status_code=422,
            detail="Paper position notional exceeds 5x the virtual balance. Reduce the quantity.",
        )
    if payload.side == "long" and payload.stop_loss and payload.stop_loss >= price:
        raise HTTPException(status_code=422, detail="Long stop-loss must be below the current price.")
    if payload.side == "short" and payload.stop_loss and payload.stop_loss <= price:
        raise HTTPException(status_code=422, detail="Short stop-loss must be above the current price.")

    fees = notional * DEFAULT_FEE_BPS / 10000
    trade = PaperTrade(
        user_id=user.id,
        symbol=info.symbol,
        side=payload.side,
        quantity=payload.quantity,
        entry_price=price,
        stop_loss=payload.stop_loss,
        take_profit=payload.take_profit,
        fees_paid=fees,
        note=payload.note,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return TradeOut.model_validate(trade)


@router.post("/paper/trades/{trade_id}/close", response_model=TradeOut)
def close_trade(trade_id: int, payload: TradeCloseIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    trade = db.get(PaperTrade, trade_id)
    if not trade or trade.user_id != user.id:
        raise HTTPException(status_code=404, detail="Trade not found.")
    if trade.status != "open":
        raise HTTPException(status_code=422, detail="Trade is already closed.")
    info = _require_symbol(trade.symbol)
    price = _price(info)
    direction = 1 if trade.side == "long" else -1
    gross = direction * (price - trade.entry_price) * trade.quantity
    exit_fee = price * trade.quantity * DEFAULT_FEE_BPS / 10000
    pnl = gross - exit_fee
    trade.exit_price = price
    trade.status = "closed"
    trade.realized_pnl = round(pnl, 2)
    trade.fees_paid = round(trade.fees_paid + exit_fee, 2)
    trade.closed_at = dt.datetime.now(dt.timezone.utc)
    if payload.note:
        trade.note = (trade.note + " | " + payload.note).strip(" |")
    user.paper_balance = round(user.paper_balance + pnl, 2)
    user.paper_equity = user.paper_balance
    db.commit()
    db.refresh(trade)
    return TradeOut.model_validate(trade)


@router.get("/paper/stats")
def paper_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    closed = db.scalars(
        select(PaperTrade).where(PaperTrade.user_id == user.id, PaperTrade.status == "closed")
    ).all()
    if not closed:
        return {"trades": 0, "note": "No closed paper trades yet."}
    pnls = [t.realized_pnl or 0.0 for t in closed]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    equity = user.paper_starting_balance
    peak = equity
    max_dd = 0.0
    for p in pnls:
        equity += p
        peak = max(peak, equity)
        max_dd = min(max_dd, (equity - peak) / peak * 100)
    return {
        "trades": len(closed),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate_pct": round(len(wins) / len(closed) * 100, 2),
        "avg_win": round(sum(wins) / len(wins), 2) if wins else 0.0,
        "avg_loss": round(sum(losses) / len(losses), 2) if losses else 0.0,
        "net_pnl": round(sum(pnls), 2),
        "profit_factor": round(sum(wins) / abs(sum(losses)), 2) if losses and sum(losses) != 0 else None,
        "max_drawdown_pct": round(max_dd, 2),
        "balance": round(user.paper_balance, 2),
        "starting_balance": user.paper_starting_balance,
    }


@router.post("/paper/reset")
def reset_wallet(payload: WalletReset, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    open_trades = db.scalars(
        select(PaperTrade).where(PaperTrade.user_id == user.id, PaperTrade.status == "open")
    ).all()
    for t in open_trades:
        t.status = "closed"
        t.exit_price = t.entry_price
        t.realized_pnl = 0.0
        t.closed_at = dt.datetime.now(dt.timezone.utc)
        t.note = (t.note + " | reset").strip(" |")
    user.paper_balance = payload.starting_balance
    user.paper_equity = payload.starting_balance
    user.paper_starting_balance = payload.starting_balance
    db.commit()
    return {"ok": True, "starting_balance": payload.starting_balance}
