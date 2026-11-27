from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

_client: Any = None


def create_client(url: str) -> Any:
    """Connect to live MongoDB (Docker mongo:7 / host) or mongomock:// in isolated tests."""
    if url.startswith("mongomock://"):
        from mongomock_motor import AsyncMongoMockClient

        return AsyncMongoMockClient()
    return AsyncIOMotorClient(url, serverSelectionTimeoutMS=5000)


def get_client() -> Any:
    global _client
    if _client is None:
        _client = create_client(settings.mongodb_url)
    return _client


def set_client(client: Any) -> None:
    global _client
    _client = client


def get_database() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongodb_db]


async def ensure_indexes(db: Any) -> None:
    """Create MongoDB collection indexes idempotently."""
    await db.farms.create_index("name", unique=True)
    await db.zones.create_index([("farmName", 1), ("zone", 1)], unique=True)
    await db.cycles.create_index("id", unique=True)
    await db.cycles.create_index([("farmName", 1), ("zone", 1), ("status", 1)])
    await db.surveys.create_index("id", unique=True)
    await db.surveys.create_index([("farmName", 1), ("zone", 1), ("startedAt", -1)])
    await db.telemetry.create_index([("farmName", 1), ("zone", 1), ("metric", 1), ("ts", -1)])
    await db.costs.create_index("id", unique=True)
    await db.harvests.create_index("id", unique=True)
    await db.sales.create_index("id", unique=True)
    await db.stock_items.create_index("id", unique=True)
    await db.stock_moves.create_index("id", unique=True)
    await db.assets.create_index("id", unique=True)
    await db.devices.create_index([("farmName", 1), ("code", 1)], unique=True)
    await db.leaf_tests.create_index("id", unique=True)
    await db.photos.create_index("id", unique=True)
    await db.finance_workbooks.create_index("farmName", unique=True)


async def get_db() -> AsyncGenerator[Any, None]:
    yield get_database()
