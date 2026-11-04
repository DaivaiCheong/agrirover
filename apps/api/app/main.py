import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import (assistant, auth, costs, cycles, decisions, devices, farm, irrigation, missions, photos,
                         plan, reports, telemetry, zones)
from app.services.errors import Conflict, Invalid, NotFound
from app.workers.mqtt_ingest import ingest_lifespan
from app.workers.telegram_worker import telegram_lifespan

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
# httpx logs each request URL at INFO, and a Telegram URL contains the bot token.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with ingest_lifespan(), telegram_lifespan():
        yield


app = FastAPI(
    title="AI Auto Farm API",
    version="1.0.0",
    description="Smart irrigation, water treatment and crop monitoring for a small vegetable plot.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

V1 = "/api/v1"


@app.exception_handler(NotFound)
async def _not_found(_, exc: NotFound):
    return JSONResponse({"detail": str(exc)}, status_code=404)


@app.exception_handler(Conflict)
async def _conflict(_, exc: Conflict):
    return JSONResponse({"detail": str(exc)}, status_code=409)


@app.exception_handler(Invalid)
async def _invalid(_, exc: Invalid):
    return JSONResponse({"detail": str(exc)}, status_code=422)

app.include_router(auth.router,       prefix=V1)
app.include_router(zones.router,      prefix=V1)
app.include_router(telemetry.router,  prefix=V1)
app.include_router(irrigation.router, prefix=V1)
app.include_router(devices.router,    prefix=V1)
app.include_router(assistant.router,  prefix=V1)
app.include_router(missions.router,   prefix=V1)
app.include_router(decisions.router,  prefix=V1)
app.include_router(photos.router,     prefix=V1)
app.include_router(plan.router,       prefix=V1)
app.include_router(farm.router,       prefix=V1)
app.include_router(cycles.router,     prefix=V1)
app.include_router(costs.router,      prefix=V1)
app.include_router(reports.router,    prefix=V1)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}
