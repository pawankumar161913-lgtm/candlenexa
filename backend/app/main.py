"""CandleNexa API application."""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from . import models  # noqa: F401  (registers tables on Base.metadata)
from .db import Base, engine
from .routers import analytics, auth, markets, user

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
# httpx logs full request URLs, which include the provider key in the query string.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
log = logging.getLogger("candlenexa")

# Ensure tables exist even when lifespan startup does not run (TestClient, CLI).
Base.metadata.create_all(bind=engine)

DISCLAIMER = (
    "Market predictions are uncertain and losses are possible. This platform provides "
    "analytical information, not guaranteed profits or personalized financial advice."
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    log.info("database ready (%s)", settings.database_url.split("://")[0])
    if not settings.twelve_data_api_key:
        log.warning("TWELVE_DATA_API_KEY is not set - market endpoints will serve DEMO data.")
    yield


app = FastAPI(
    title="CandleNexa API",
    description="AI-assisted market analysis: live candles, indicators, walk-forward "
                "predictions, backtesting and risk tools. Estimates only - not advice.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error. The failure has been logged.", "error": exc.__class__.__name__},
        )
    response.headers["X-Process-Time-ms"] = f"{(time.perf_counter() - start) * 1000:.1f}"
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "path": request.url.path},
        headers=exc.headers,
    )


app.include_router(auth.router)
app.include_router(markets.router)
app.include_router(analytics.router)
app.include_router(user.router)


@app.get("/api/disclaimer")
def disclaimer():
    return {"disclaimer": DISCLAIMER}


@app.get("/")
def root():
    return {
        "name": "CandleNexa API",
        "docs": "/docs",
        "health": "/api/health",
        "disclaimer": DISCLAIMER,
    }
