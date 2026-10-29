"""Authentication routes: register, login, token, profile, password."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import get_current_user, rate_limit
from ..models import User
from ..schemas import LoginIn, PasswordChange, ProfileUpdate, RegisterIn, TokenOut, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

STARTER_WATCHLIST = ["EUR/USD", "XAU/USD", "BTC/USD", "SPY"]


def _issue(user: User) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(str(user.id)),
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(request, settings.rate_limit_auth_per_minute)
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(
        email=email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    from ..models import WatchlistItem

    for sym in STARTER_WATCHLIST:
        db.add(WatchlistItem(user_id=user.id, symbol=sym))
    db.commit()
    return _issue(user)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(request, settings.rate_limit_auth_per_minute)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return _issue(user)


@router.post("/token", response_model=TokenOut, include_in_schema=False)
def token_form(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    rate_limit(request, settings.rate_limit_auth_per_minute)
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return _issue(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_profile(payload: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..symbols import TIMEFRAMES, resolve_symbol

    data = payload.model_dump(exclude_none=True)
    if "default_symbol" in data and resolve_symbol(data["default_symbol"]) is None:
        raise HTTPException(status_code=422, detail="Unsupported default symbol.")
    if "default_timeframe" in data and data["default_timeframe"] not in TIMEFRAMES:
        raise HTTPException(status_code=422, detail="Unsupported timeframe.")
    for k, v in data.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/password")
def change_password(payload: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if payload.new_password.isdigit() or payload.new_password.isalpha():
        raise HTTPException(status_code=422, detail="New password must contain both letters and numbers.")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}
