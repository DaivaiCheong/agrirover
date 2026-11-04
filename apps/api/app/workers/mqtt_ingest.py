"""
MQTT ingest worker.

Subscribes to the field node's telemetry, validates it, stores it, and asks the
rule engine what to do. Runs inside the API process; on the Pi that keeps the
whole control loop in one supervised service.

Topics (farm/{farm}/zone/{zone}/...):
    telemetry     device -> server   soil moisture, water pH, rain, supply V
    valve/set     server -> device   {command, channel, maxOnMs, requestId}
    valve/state   device -> server   actual relay position + reason   (retained)
Rover (devices/rover-01/...):
    mission/state   rover -> server  progress, then the final summary   (retained)
    mission/result  rover -> server  full survey report with watering targets
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone

import aiomqtt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.models.entities import Device, Farm, Metric, Quality, SensorReading, Zone

log = logging.getLogger("ingest")      # not "mqtt": aiomqtt owns that logger and pins it to WARNING

TOPIC_TELEMETRY = "farm/+/zone/+/telemetry"
TOPIC_VALVE_STATE = "farm/+/zone/+/valve/state"
TOPIC_MISSION_STATE = "devices/+/mission/state"
TOPIC_MISSION_RESULT = "devices/+/mission/result"


def _valid(payload: dict) -> bool:
    """Reject anything malformed rather than storing a null that poisons a chart."""
    if not isinstance(payload, dict):
        return False
    if "metric" not in payload or "value" not in payload:
        return False
    try:
        float(payload["value"])
    except (TypeError, ValueError):
        return False
    return True


def readings(payload: object) -> list[dict]:
    """The field node publishes a batch — {"device", "fw", "measurements": [...]}
    (see esp8266_field_node.ino). A single {metric, value} reading is accepted
    too. Bad entries are dropped one by one; good ones in the batch survive."""
    if isinstance(payload, dict) and isinstance(payload.get("measurements"), list):
        items = payload["measurements"]
    else:
        items = [payload]
    return [m for m in items if _valid(m)]


def _quality(raw: object) -> Quality:
    try:
        return Quality(raw)
    except ValueError:
        return Quality.suspect


async def store_telemetry(session: AsyncSession, topic: str, payload: object,
                           now: datetime | None = None) -> int:
    """Persist one telemetry batch. The zone comes from the topic, the device from
    the payload. Unknown zone, unknown device or unknown metric -> nothing stored.
    Returns the number of readings written."""
    parts = topic.split("/")                 # farm/{farm}/zone/{zone}/telemetry
    if len(parts) != 5 or not isinstance(payload, dict):
        return 0
    farm_name, zone_name = parts[1], parts[3]
    device_code = payload.get("device")

    zone = (await session.execute(
        select(Zone).join(Zone.farm).where(Zone.name == zone_name,
                                           Zone.farm.has(name=farm_name)))).scalar_one_or_none()
    device = (await session.execute(
        select(Device).where(Device.code == device_code))).scalar_one_or_none()
    if zone is None or device is None:
        log.warning("telemetry for unknown zone %s/%s or device %s dropped",
                    farm_name, zone_name, device_code)
        return 0

    at = now or datetime.now(timezone.utc)
    rows = []
    for m in readings(payload):
        try:
            metric = Metric(m["metric"])
        except ValueError:
            continue
        quality = m.get("quality", "valid")
        rows.append(SensorReading(
            device_id=device.id, zone_id=zone.id, metric=metric, value=float(m["value"]),
            unit=str(m.get("unit", "")), quality=_quality(quality),
            sample_count=payload.get("sampleCount"), recorded_at=at))
    session.add_all(rows)
    await session.commit()
    return len(rows)


async def _consume() -> None:
    while True:
        try:
            async with aiomqtt.Client(
                hostname=settings.mqtt_host,
                port=settings.mqtt_port,
                username=settings.mqtt_username or None,
                password=settings.mqtt_password or None,
            ) as client:
                for topic in (TOPIC_TELEMETRY, TOPIC_VALVE_STATE,
                              TOPIC_MISSION_STATE, TOPIC_MISSION_RESULT):
                    await client.subscribe(topic, qos=1)
                log.info("mqtt connected, subscribed")
                async for msg in client.messages:
                    try:
                        payload = json.loads(msg.payload.decode())
                    except json.JSONDecodeError:
                        log.warning("dropped non-json payload on %s", msg.topic)
                        continue

                    topic = str(msg.topic)
                    if topic.endswith("/telemetry"):
                        good = readings(payload)
                        if not good:
                            log.warning("dropped invalid telemetry on %s", topic)
                            continue
                        try:
                            async with SessionLocal() as session:
                                stored = await store_telemetry(session, topic, payload)
                            log.info("stored %d readings from %s", stored, topic)
                        except Exception:                 # noqa: BLE001 — keep the loop alive
                            log.exception("could not store telemetry from %s", topic)
                    elif topic.endswith("/valve/state"):
                        # Authoritative actuator position — always recorded as
                        # reported, never as commanded.
                        log.info("valve state %s %s", topic, payload)
                    elif topic.endswith("/mission/state"):
                        # TODO: upsert survey_mission from the summary fields.
                        log.info("rover mission state %s", payload)
                    elif topic.endswith("/mission/result"):
                        # TODO: store crop_image / findings; turn wateringTargets into
                        # action_proposal rows (trigger vision_target) for approval.
                        r = payload if isinstance(payload, dict) else {}
                        log.info("rover mission result %s: %s cells, %s need water",
                                 r.get("missionId"), r.get("cellsScanned"),
                                 r.get("plantsNeedingWater"))
        except Exception as exc:                      # noqa: BLE001
            log.warning("mqtt loop error (%s); retrying in 5 s", exc)
            await asyncio.sleep(5)


@contextlib.asynccontextmanager
async def ingest_lifespan() -> AsyncIterator[None]:
    task = asyncio.create_task(_consume())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
