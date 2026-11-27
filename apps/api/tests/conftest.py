import os
import uuid
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.db import create_client, get_database, set_client
from app.main import app
from app.services.seed import seed_farm


@pytest_asyncio.fixture
async def api_client():
    # Use real Docker / CI MongoDB when MONGODB_URL=mongodb://... is provided; otherwise use mongomock-motor
    url = os.environ.get("MONGODB_URL", "mongomock://localhost")
    db_name = f"agrirover_test_{uuid.uuid4().hex[:8]}"
    os.environ["MONGODB_DB"] = db_name
    from app.core.config import settings

    settings.mongodb_url = url
    settings.mongodb_db = db_name
    client = create_client(url)
    set_client(client)
    db = get_database()
    await seed_farm(db)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    try:
        await client.drop_database(db_name)
    except Exception:
        pass
    client.close()
    set_client(None)
