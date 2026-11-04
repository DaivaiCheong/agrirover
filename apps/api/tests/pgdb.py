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
