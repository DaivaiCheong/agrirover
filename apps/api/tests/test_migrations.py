"""The migration chain must build the schema the models describe, and undo it
cleanly. Runs against a throwaway database on a real Postgres; skipped when none
is reachable (CI provides one via TEST_DATABASE_URL)."""
import asyncio
import os

import asyncpg
import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from app.core.config import settings
from app.core.db import Base
import app.models.entities  # noqa: F401

ADMIN_URL = os.getenv("TEST_DATABASE_URL", "postgresql://aaf:change-me@127.0.0.1:5432/postgres")
TEST_DB = "aaf_migration_test"


def _dsn(db: str) -> str:
    return ADMIN_URL.rsplit("/", 1)[0] + "/" + db


async def _recreate_db() -> None:
    conn = await asyncpg.connect(ADMIN_URL.replace("+asyncpg", ""), timeout=3)
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}"')
        await conn.execute(f'CREATE DATABASE "{TEST_DB}"')
    finally:
        await conn.close()


@pytest.fixture()
def pg(monkeypatch):
    try:
        asyncio.run(_recreate_db())
    except (OSError, asyncpg.PostgresError, asyncio.TimeoutError) as exc:
        pytest.skip(f"no Postgres reachable ({exc.__class__.__name__})")
    monkeypatch.setattr(settings, "database_url", _dsn(TEST_DB).replace("postgresql://", "postgresql+asyncpg://"))


def _cfg() -> Config:
    return Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))


def _inspect(sql: str):
    async def go():
        conn = await asyncpg.connect(_dsn(TEST_DB).replace("+asyncpg", ""))
        try:
            return [r[0] for r in await conn.fetch(sql)]
        finally:
            await conn.close()
    return asyncio.run(go())


TABLES = "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
ENUMS = "SELECT typname FROM pg_type WHERE typtype='e'"


def test_upgrade_creates_every_model_table(pg):
    command.upgrade(_cfg(), "head")
    have = set(_inspect(TABLES)) - {"alembic_version"}
    assert have == set(Base.metadata.tables)


def test_no_drift_between_models_and_migration(pg):
    command.upgrade(_cfg(), "head")

    from sqlalchemy.ext.asyncio import create_async_engine

    async def run():
        eng = create_async_engine(settings.database_url)
        async with eng.connect() as c:
            def cmp(sync_conn):
                ctx = MigrationContext.configure(sync_conn, opts={"compare_type": True})
                return compare_metadata(ctx, Base.metadata)
            result = await c.run_sync(cmp)
        await eng.dispose()
        return result
    assert asyncio.run(run()) == []


def test_downgrade_one_step_restores_the_0001_tables_and_goes_forward_again(pg):
    command.upgrade(_cfg(), "head")
    command.downgrade(_cfg(), "0001")
    have = set(_inspect(TABLES)) - {"alembic_version"}
    assert {"alert", "growth_record"} <= have
    assert not ({"daily_decision", "planting", "sensor", "contact"} & have)
    assert "trial_arm" not in _inspect(ENUMS)
    command.upgrade(_cfg(), "head")
    assert set(_inspect(TABLES)) - {"alembic_version"} == set(Base.metadata.tables)


def test_downgrade_removes_tables_and_enum_types(pg):
    command.upgrade(_cfg(), "head")
    command.downgrade(_cfg(), "base")
    assert set(_inspect(TABLES)) <= {"alembic_version"}
    assert _inspect(ENUMS) == []
