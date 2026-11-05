"""
MQTT ingest worker.

Subscribes to the field node's telemetry, validates it, stores it, and asks the
rule engine what to do. Runs inside the API process; on the Pi that keeps the
whole control loop in one supervised service.

Topics (farm/{farm}/zone/{zone}/...):
    telemetry     device -> server   soil probe (moisture, pH, EC, temperature, N, P, K), air temperature
                                     and humidity, water pH, rain, supply V  (services/metrics.py)
    valve/set     server -> device   {command, channel, maxOnMs, requestId}
    valve/state   device -> server   actual relay position + reason   (retained)
Rover (devices/rover-01/...):
    status          rover -> server  online / offline                   (retained)
    mission/state   rover -> server  progress, then the final summary   (retained)
    mission/result  rover -> server  full survey report, stored in survey_mission and survey_finding
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import math
from collections.abc import AsyncIterator
from datetime import datetime, timezone

import aiomqtt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.models.entities import Device, Farm, Sensor, SensorReading, Zone
from app.services.metrics import SOIL_PROBE_METRICS, Refused, clean
from app.services.rover_live import live as rover_live, store_report

log = logging.getLogger("ingest")      # not "mqtt": aiomqtt owns that logger and pins it to WARNING

TOPIC_TELEMETRY = "farm/+/zone/+/telemetry"
TOPIC_VALVE_STATE = "farm/+/zone/+/valve/state"
TOPIC_MISSION_STATE = "devices/+/mission/state"
TOPIC_MISSION_RESULT = "devices/+/mission/result"
TOPIC_ROVER_STATUS = "devices/+/status"


def _valid(payload: dict) -> bool:
    """Reject anything malformed rather than storing a null that poisons a chart."""
    if not isinstance(payload, dict):
        return False
    if "metric" not in payload or "value" not in payload:
        return False
    try:
        return math.isfinite(float(payload["value"]))       # json.loads accepts NaN and Infinity
    except (TypeError, ValueError):
        return False


def readings(payload: object) -> list[dict]:
    """The field node publishes a batch — {"device", "fw", "measurements": [...]}
    (see esp8266_field_node.ino). A single {metric, value} reading is accepted
    too. Bad entries are dropped one by one; good ones in the batch survive."""
    if isinstance(payload, dict) and isinstance(payload.get("measurements"), list):
        items = payload["measurements"]
    else:
        items = [payload]
    return [m for m in items if _valid(m)]


async def store_telemetry(session: AsyncSession, topic: str, payload: object,
                           now: datetime | None = None) -> int:
    """Persist one telemetry batch. The zone comes from the topic, the device from the payload.
    Unknown zone or device, or a payload that names a different zone than its topic -> nothing stored.
    Within a batch each reading stands alone: an unknown metric, a unit we do not understand or an
    impossible value (a dead RS485 link reads 655.35 pH) drops that reading and keeps the rest.
    Returns the number of readings written."""
    parts = topic.split("/")                 # farm/{farm}/zone/{zone}/telemetry
    if len(parts) != 5 or not isinstance(payload, dict):
        return 0
    farm_name, zone_name = parts[1], parts[3]
    device_code = payload.get("device")
    named_zone = payload.get("zone")
    if named_zone is not None and str(named_zone) != zone_name:      # a node set up for another bed
        log.warning("telemetry on %s says it is for zone %r; dropped", topic, named_zone)
        return 0

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
    probes = {p.code: p for p in (await session.execute(
        select(Sensor).where(Sensor.zone_id == zone.id, Sensor.device_id == device.id))).scalars()}
    deciding = next((p for p in probes.values() if p.used_for_decision), None)

    rows = []
    refused: list[str] = []
    for m in readings(payload):
        try:
            c = clean(m)
        except Refused as why:
            refused.append(str(why))
            continue
        sensor = None
        if c.metric in SOIL_PROBE_METRICS:                 # everything the soil probe measures belongs to a probe
            if c.sensor is not None:                       # the node named the probe
                sensor = probes.get(c.sensor)
                if sensor is None:
                    refused.append(f"{c.metric.value}: unknown probe {c.sensor!r}")
                    continue
            else:                                          # one probe on the node: the deciding one
                sensor = deciding
        rows.append(SensorReading(
            device_id=device.id, zone_id=zone.id, sensor_id=sensor.id if sensor else None,
            metric=c.metric, value=c.value, unit=c.unit, quality=c.quality,
            sample_count=payload.get("sampleCount"), recorded_at=at))
    if refused:
        log.warning("dropped %d reading(s) on %s: %s", len(refused), topic, "; ".join(refused[:6]))
    session.add_all(rows)
    device.last_seen_at = at
    if payload.get("fw"):
        device.firmware_version = str(payload["fw"])[:32]
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
                              TOPIC_MISSION_STATE, TOPIC_MISSION_RESULT, TOPIC_ROVER_STATUS):
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
                    elif topic.endswith("/status"):
                        rover_live.on_status(payload)
                    elif topic.endswith("/mission/state"):
                        rover_live.on_state(payload)
                    elif topic.endswith("/mission/result"):
                        # Watering targets are shown for a person to act on; they do not become proposals yet.
                        rover_live.on_result(payload)
                        r = payload if isinstance(payload, dict) else {}
                        try:
                            async with SessionLocal() as session:
                                saved = await store_report(session, payload)
                            log.info("rover survey %s: %s cells, %s need water, %s",
                                     r.get("missionId"), r.get("cellsScanned"), r.get("plantsNeedingWater"),
                                     "saved" if saved else "not saved (unknown bed or already stored)")
                        except Exception:             # noqa: BLE001 — keep the loop alive
                            log.exception("could not store rover survey %s", r.get("missionId"))
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
