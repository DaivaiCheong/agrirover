import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.db import get_database
from app.routers import cycles_routes, farm_routes, finance_routes, health_routes, missions_routes
from app.services.errors import Conflict, Invalid, NotFound
from app.services.seed import seed_farm
from app.workers.mqtt_ingest import ingest_lifespan

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = get_database()
    await seed_farm(db)
    async with ingest_lifespan():
        yield


app = FastAPI(
    title="AgriRover API",
    version="2.0.0",
    description="Tomato Precision Farming API powered by FastAPI and MongoDB (NoSQL).",
    lifespan=lifespan,
)


@app.middleware("http")
async def _server_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
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


app.include_router(farm_routes.router, prefix=V1)
app.include_router(cycles_routes.router, prefix=V1)
app.include_router(missions_routes.router, prefix=V1)
app.include_router(finance_routes.router, prefix=V1)
app.include_router(health_routes.router, prefix=V1)


@app.get("/health", tags=["system"])
async def health():
    db = get_database()
    zones_count = await db.zones.count_documents({})
    return {"status": "ok", "db": "mongodb", "zones": zones_count}
