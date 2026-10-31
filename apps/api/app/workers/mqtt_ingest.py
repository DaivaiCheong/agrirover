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

import aiomqtt

from app.core.config import settings

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
                        # TODO(sprint-2): persist SensorReading, then call
                        # rule_engine.evaluate() and publish valve/set if needed.
                        log.info("telemetry %s %s", topic, good)
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
