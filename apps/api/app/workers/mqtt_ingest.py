"""MQTT ingest worker: field telemetry and the rover's messages, into MongoDB and the live rover state.

    farm/{farm}/zone/{zone}/telemetry   field node -> server   soil probe and air readings (services/metrics.py)
    devices/rover-01/status             rover -> server        online / offline, e-stop                  (retained)
    devices/rover-01/mission/state      rover -> server        progress (with a photo at a flagged plant), then the summary
    devices/rover-01/mission/result     rover -> server        the full report, stored in `surveys`
    devices/rover-01/camera/status      ESP32-CAM -> server    online / offline, photo URL              (retained)
    devices/rover-01/drive/evt          ESP32 -> server        answers to a test move (plain frames, not JSON)
"""
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
from app.services import photo_check, rover_photos
from app.services.metrics import Refused, clean
from app.services.rover_service import live, store_survey_report
from app.services.rover_test import TOPIC_CAMERA_STATUS, TOPIC_EVT, tester

log = logging.getLogger("ingest")

TOPIC_TELEMETRY = "farm/+/zone/+/telemetry"
TOPIC_MISSION_STATE = "devices/+/mission/state"
TOPIC_MISSION_RESULT = "devices/+/mission/result"
TOPIC_ROVER_STATUS = "devices/+/status"


class BrokerState:
    """Whether the server is connected to the farm broker right now. Read by GET /status."""
    connected = False
    since: str | None = None
    last_error: str | None = None


broker = BrokerState()


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


async def touch_device(db: Any, farm_name: str, *, code: str | None = None, zone: str | None = None,
                       kind: str | None = None, firmware: str | None = None) -> None:
    """A device spoke: remember when. Found by its code, or by the zone its field node serves."""
    query: dict = {"farmName": farm_name}
    if code:
        query["code"] = code
    elif zone and kind:
        query.update({"zone": zone, "kind": kind})
    else:
        return
    update: dict = {"lastSeenAt": datetime.now(timezone.utc).isoformat()}
    if firmware:
        update["firmwareVersion"] = firmware
    await db.devices.update_one(query, {"$set": update})


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
        device = payload.get("device")
        await touch_device(db, farm_name, code=str(device) if device else None, zone=zone_name, kind="field_node",
                           firmware=payload.get("firmware"))
    return len(docs)


_background: set[asyncio.Task] = set()


def _spawn(job) -> asyncio.Task:
    """Run a slow job (a photo check takes seconds) beside the loop; keep a reference so it is not collected."""
    async def guarded() -> None:
        try:
            await job
        except Exception:                                 # noqa: BLE001: a failed check must not touch the round
            log.exception("rover photo check failed")
    task = asyncio.create_task(guarded())
    _background.add(task)
    task.add_done_callback(_background.discard)
    return task


async def handle_message(db: Any, topic: str, payload: object) -> asyncio.Task | None:
    """One MQTT message. Separate from the loop so tests can drive it without a broker. Returns the photo-check task
    when the message started one."""
    if topic.endswith("/telemetry"):
        await store_telemetry(db, topic, payload)
    elif topic == TOPIC_CAMERA_STATUS:
        tester.on_camera_status(payload)
    elif topic.endswith("/status") and isinstance(payload, dict):
        live.on_status(payload)
        tester.on_rover_status(payload)
        if payload.get("status") == "online":
            await touch_device(db, settings.farm_name, code=str(payload.get("device") or live.code), firmware=payload.get("fw"))
    elif topic.endswith("/mission/state") and isinstance(payload, dict):
        live.on_state(payload)
        if rover_photos.wanted(payload):
            return _spawn(rover_photos.keep_and_check(db, payload, classifier=photo_check.get_classifier()))
    elif topic.endswith("/mission/result") and isinstance(payload, dict) and payload.get("zoneId"):
        await store_survey_report(db, settings.farm_name, payload)
        live.on_result(payload)
        await touch_device(db, settings.farm_name, code=str(payload.get("device") or live.code))
    return None


async def _mqtt_loop() -> None:
    while True:
        try:
            async with aiomqtt.Client(
                hostname=settings.mqtt_host,
                port=settings.mqtt_port,
                username=settings.mqtt_username or None,
                password=settings.mqtt_password or None,
            ) as client:
                for topic in (TOPIC_TELEMETRY, TOPIC_MISSION_STATE, TOPIC_MISSION_RESULT, TOPIC_ROVER_STATUS, TOPIC_CAMERA_STATUS):
                    await client.subscribe(topic, qos=1)
                await client.subscribe(TOPIC_EVT, qos=0)
                broker.connected, broker.since, broker.last_error = True, datetime.now(timezone.utc).isoformat(), None
                log.info("connected to the farm broker at %s:%s", settings.mqtt_host, settings.mqtt_port)
                db = get_database()
                async for msg in client.messages:
                    if str(msg.topic) == TOPIC_EVT:                  # the motor controller's own frames, not JSON
                        tester.on_evt(msg.payload.decode("ascii", "replace"))
                        continue
                    try:
                        payload = json.loads(msg.payload.decode())
                    except Exception:
                        continue
                    try:
                        await handle_message(db, str(msg.topic), payload)
                    except Exception:
                        log.exception("could not handle %s", msg.topic)
        except asyncio.CancelledError:
            broker.connected = False
            raise
        except Exception as exc:
            if broker.connected or broker.last_error is None:
                log.warning("farm broker unreachable (%s); retrying every 10 s", exc)
            broker.connected, broker.last_error = False, str(exc)
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
