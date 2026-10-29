"""API tests with the TestClient (demo mode, no provider calls)."""
from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient

# Force demo mode + a throwaway database before the app is imported.
os.environ["MARKET_DATA_PROVIDER"] = "demo"
os.environ["TWELVE_DATA_API_KEY"] = ""
os.environ["DATABASE_URL"] = "sqlite:///./test_candlenexa.db"

from app.main import app  # noqa: E402
from app.services.market_data import cache  # noqa: E402

client = TestClient(app)


@pytest.fixture(scope="module")
def auth_headers():
    cache.clear()
    email = f"test-{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/auth/register", json={"email": email, "password": "Passw0rd123", "full_name": "Test User"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_markets_catalogue():
    r = client.get("/api/markets")
    assert r.status_code == 200
    body = r.json()
    assert any(s["symbol"] == "EUR/USD" for s in body["symbols"])
    assert "disclaimer" in body


def test_search_resolves_aliases():
    r = client.get("/api/markets/search?q=gold")
    assert r.status_code == 200
    assert r.json()["results"][0]["symbol"] == "XAU/USD"


def test_unknown_symbol_is_404():
    r = client.get("/api/markets/NOTREAL/analysis")
    assert r.status_code == 404


def test_candles_and_analysis_are_labelled_demo():
    r = client.get("/api/markets/EUR/USD/candles?timeframe=1h&limit=100")
    assert r.status_code == 200
    body = r.json()
    assert body["is_demo"] is True and len(body["candles"]) == 100

    a = client.get("/api/markets/EUR/USD/analysis?timeframe=1h")
    assert a.status_code == 200
    ab = a.json()
    assert ab["data"]["is_demo"] is True
    assert ab["prediction"]["direction"] in {"bullish", "bearish", "neutral", "no_signal"}
    assert "disclaimer" in ab


def test_risk_calculation_endpoint():
    r = client.post("/api/risk/calculate", json={
        "balance": 5000, "risk_pct": 1, "entry": 1.2, "stop": 1.19, "target": 1.22, "side": "long",
    })
    assert r.status_code == 200
    assert r.json()["position_size_units"] > 0


def test_auth_requires_token():
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/watchlist").status_code == 401


def test_watchlist_roundtrip(auth_headers):
    r = client.post("/api/watchlist", json={"symbol": "BTC/USD"}, headers=auth_headers)
    assert r.status_code == 201
    item_id = r.json()["id"]
    assert any(x["symbol"] == "BTC/USD" for x in client.get("/api/watchlist", headers=auth_headers).json())
    assert client.delete(f"/api/watchlist/{item_id}", headers=auth_headers).status_code == 204


def test_alert_roundtrip(auth_headers):
    r = client.post("/api/alerts", json={"symbol": "XAU/USD", "condition": "above", "threshold": 1, "timeframe": "1h"},
                    headers=auth_headers)
    assert r.status_code == 201
    alert_id = r.json()["id"]
    check = client.get("/api/alerts/check", headers=auth_headers)
    assert check.status_code == 200
    assert "triggered" in check.json()
    assert client.delete(f"/api/alerts/{alert_id}", headers=auth_headers).status_code == 204


def test_paper_trading_flow(auth_headers):
    wallet = client.get("/api/paper/wallet", headers=auth_headers).json()
    assert wallet["starting_balance"] > 0
    opened = client.post("/api/paper/trades", json={"symbol": "EUR/USD", "side": "long", "quantity": 100},
                         headers=auth_headers)
    assert opened.status_code == 201, opened.text
    trade_id = opened.json()["id"]
    closed = client.post(f"/api/paper/trades/{trade_id}/close", json={"note": "test"},
                         headers=auth_headers)
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    assert closed.json()["realized_pnl"] is not None


def test_backtest_endpoint_demo():
    r = client.get("/api/backtest?symbol=EUR/USD&timeframe=1h&horizon=4")
    assert r.status_code == 200
    body = r.json()["result"]
    assert "model_strategy" in body and "rule_baseline" in body
    assert body["period"]["bars"] > 500


def test_assistant_is_grounded():
    r = client.post("/api/assistant/ask", json={"question": "What would invalidate this forecast for gold?"})
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "XAU/USD"
    assert body["used_data"]
    assert "invalidate" in body["answer"].lower() or "invalid" in body["answer"].lower()


def test_password_login_and_profile_update(auth_headers):
    me = client.get("/api/auth/me", headers=auth_headers).json()
    upd = client.patch("/api/auth/me", json={"risk_per_trade_pct": 1.5}, headers=auth_headers)
    assert upd.status_code == 200 and upd.json()["risk_per_trade_pct"] == 1.5
    login = client.post("/api/auth/login", json={"email": me["email"], "password": "Passw0rd123"})
    assert login.status_code == 200
    bad = client.post("/api/auth/login", json={"email": me["email"], "password": "wrongpass1"})
    assert bad.status_code == 401
