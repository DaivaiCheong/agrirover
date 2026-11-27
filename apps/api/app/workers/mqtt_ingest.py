"""MQTT ingest worker storing field telemetry and rover scans directly into MongoDB."""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import math
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

import aiomqtt

from app.core.config import settings
from app.core.db import get_database
from app.services.metrics import Refused, clean
from app.services.rover_service import live, store_survey_report

log = logging.getLogger("ingest")

TOPIC_TELEMETRY = "farm/+/zone/+/telemetry"
TOPIC_MISSION_STATE = "devices/+/mission/state"
TOPIC_MISSION_RESULT = "devices/+/mission/result"
TOPIC_ROVER_STATUS = "devices/+/status"


def _valid(payload: dict) -> bool:
    if not isinstance(payload, dict) or "metric" not in payload or "value" not in payload:
        return False
    try:
        return math.isfinite(float(payload["value"]))
    except (TypeError, ValueError):
        return False


def extract_readings(payload: object) -> list[dict]:
    items = payload["measurements"] if isinstance(payload, dict) and isinstance(payload.get("measurements"), list) else [payload]
    return [m for m in items if _valid(m)]


async def store_telemetry(db: Any, topic: str, payload: object, now: datetime | None = None) -> int:
    parts = topic.split("/")
    if len(parts) != 5 or not isinstance(payload, dict):
        return 0
    farm_name, zone_name = parts[1], parts[3]
    z_doc = await db.zones.find_one({"farmName": farm_name, "zone": zone_name})
    if z_doc is None:
        return 0
    ts = (now or datetime.now(timezone.utc)).isoformat()
    docs: list[dict] = []
    for item in extract_readings(payload):
        try:
            c = clean(item)
        except Refused as why:
            log.warning("dropped telemetry %s: %s", topic, why)
            continue
        docs.append({
            "farmName": farm_name,
            "zone": zone_name,
            "metric": c.metric.value,
            "ts": ts,
            "value": c.value,
            "unit": c.unit,
            "quality": c.quality.value,
        })
    if docs:
        await db.telemetry.insert_many(docs)
    return len(docs)


async def _mqtt_loop() -> None:
    while True:
        try:
            async with aiomqtt.Client(
                hostname=settings.mqtt_host,
                port=settings.mqtt_port,
                username=settings.mqtt_username or None,
                password=settings.mqtt_password or None,
            ) as client:
                for topic in (TOPIC_TELEMETRY, TOPIC_MISSION_STATE, TOPIC_MISSION_RESULT, TOPIC_ROVER_STATUS):
                    await client.subscribe(topic)
                db = get_database()
                async for msg in client.messages:
                    topic = str(msg.topic)
                    try:
                        payload = json.loads(msg.payload.decode())
                    except Exception:
                        continue
                    if topic.endswith("/telemetry"):
                        await store_telemetry(db, topic, payload)
                    elif topic.endswith("/status") and isinstance(payload, dict):
                        live.status = str(payload.get("status", "unknown"))
                    elif topic.endswith("/mission/state") and isinstance(payload, dict):
                        live.mission = {**(live.mission or {}), **payload}
                        if isinstance(payload.get("cell"), list) and len(payload["cell"]) == 2 and payload.get("frame"):
                            live.frames[(payload["cell"][0], payload["cell"][1])] = payload["frame"]
                    elif topic.endswith("/mission/result") and isinstance(payload, dict):
                        await store_survey_report(db, settings.farm_name, payload)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.debug("mqtt ingest retry in 10s (%s)", exc)
            await asyncio.sleep(10)


@contextlib.asynccontextmanager
async def ingest_lifespan() -> AsyncIterator[None]:
    task = asyncio.create_task(_mqtt_loop())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
