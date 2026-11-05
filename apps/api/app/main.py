import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import (assistant, auth, conditions, costs, cycles, decisions, devices, diagnosis, farm, irrigation,
                         missions, photos, plan, reports, setups, telemetry, zones)
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
    title="AgriRover API",
    version="1.0.0",
    description="Smart irrigation, water treatment and crop monitoring for a small vegetable plot.",
    lifespan=lifespan,
)


# Runs inside CORS (middleware added later wraps middleware added earlier). Without this a crash in a route
# leaves as a bare 500 with no CORS header, which a browser reports as "Failed to fetch": the screen then says
# the server cannot be reached when it is up and failing.
@app.middleware("http")
async def _server_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:                                    # noqa: BLE001: the last line of defence
        logging.getLogger("api").exception("%s %s failed", request.method, request.url.path)
        return JSONResponse({"detail": "the farm server had an error; see its log"}, status_code=500)


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
app.include_router(conditions.router, prefix=V1)
app.include_router(irrigation.router, prefix=V1)
app.include_router(devices.router,    prefix=V1)
app.include_router(assistant.router,  prefix=V1)
app.include_router(missions.router,   prefix=V1)
app.include_router(decisions.router,  prefix=V1)
app.include_router(photos.router,     prefix=V1)
app.include_router(diagnosis.router,  prefix=V1)
app.include_router(plan.router,       prefix=V1)
app.include_router(farm.router,       prefix=V1)
app.include_router(cycles.router,     prefix=V1)
app.include_router(setups.router,     prefix=V1)
app.include_router(costs.router,      prefix=V1)
app.include_router(reports.router,    prefix=V1)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}
