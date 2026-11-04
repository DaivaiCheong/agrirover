"""Throwaway Postgres databases for integration tests.

Skips the calling test when no Postgres is reachable. Locally this is the compose
`db` service on 127.0.0.1 (not `localhost`: on Windows that resolves to IPv6 first
and times out); in CI it is the service container.
"""
import asyncio
import os

import asyncpg
import pytest

HOST = os.getenv("TEST_PG_HOST", "127.0.0.1")
CREDS = os.getenv("TEST_PG_CREDS", "aaf:change-me")


def async_url(db: str) -> str:
    return f"postgresql+asyncpg://{CREDS}@{HOST}:5432/{db}"


async def _recreate(db: str) -> None:
    conn = await asyncpg.connect(f"postgresql://{CREDS}@{HOST}:5432/postgres", timeout=3)
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{db}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{db}"')
    finally:
        await conn.close()


def require(db: str) -> str:
    """Create an empty database `db` and return its SQLAlchemy URL, or skip the test."""
    try:
        asyncio.run(_recreate(db))
    except (OSError, asyncpg.PostgresError, asyncio.TimeoutError) as exc:
        pytest.skip(f"no Postgres reachable ({exc.__class__.__name__})")
    return async_url(db)


def with_db(db_name: str):
    """Decorator: run an async test body `fn(Session)` against a fresh, empty database
    that already has every table (created from the models)."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.db import Base

    def wrap(fn):
        def test():
            url = require(db_name)

            async def go():
                engine = create_async_engine(url)
                async with engine.begin() as conn:
                    await conn.run_sync(Base.metadata.create_all)
                try:
                    await fn(async_sessionmaker(engine, expire_on_commit=False))
                finally:
                    await engine.dispose()

            asyncio.run(go())

        test.__name__ = fn.__name__
        return test

    return wrap


import contextlib  # noqa: E402


@contextlib.asynccontextmanager
async def api(Session):
    """An HTTP client for the real app, wired to the test database (same event loop, so asyncpg is happy).
    The app's lifespan (MQTT, Telegram) is not started."""
    import httpx

    from app.core.db import get_db
    from app.main import app

    async def override():
        async with Session() as s:
            yield s

    app.dependency_overrides[get_db] = override
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
