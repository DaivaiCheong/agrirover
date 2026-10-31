"""MQTT link between the rover and the farm server (Raspberry Pi core).

Subscribes
    devices/rover-01/mission/set     start a survey  {missionId, zoneId, rows, cols, cellM}
    devices/rover-01/estop           {"estop": true} engages, {"estop": false} releases
    farm/<farm>/zone/+/telemetry     field-node readings; rain aborts a survey
Publishes
    devices/rover-01/mission/state   progress, then the final summary   (retained)
    devices/rover-01/mission/result  full report
    devices/rover-01/status          online / offline (last will)        (retained)

Losing the broker connection mid-mission stops the rover at its next check
(guard `link_lost`). Every report is also written to disk, so nothing is lost
when the link is down.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable

import aiomqtt

from rover.config import RoverConfig
from rover.mission import MissionRunner, MissionSpec
from rover.report import save_report
from rover.safety import Guards

log = logging.getLogger("rover.link")


def decode(payload: bytes | bytearray | str) -> object:
    text = payload.decode("utf-8", "replace") if isinstance(payload, (bytes, bytearray)) else payload
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return text


def estop_requested(data: object) -> bool:
    """Fail safe: anything on the e-stop topic engages it, except an explicit release."""
    if isinstance(data, dict):
        return bool(data.get("estop", True))
    if isinstance(data, bool):
        return data
    if isinstance(data, str):
        return data.strip().lower() not in ("0", "false", "off", "release")
    return True


def rain_from_telemetry(data: object) -> bool | None:
    """Accepts the field node's batch format ({"measurements": [...]}) or a single reading."""
    if not isinstance(data, dict):
        return None
    items = data["measurements"] if isinstance(data.get("measurements"), list) else [data]
    for m in items:
        if isinstance(m, dict) and m.get("metric") == "rain":
            try:
                return float(m.get("value")) >= 1
            except (TypeError, ValueError):
                return None
    return None


class RoverLink:
    def __init__(self, cfg: RoverConfig, runner_for: Callable[[MissionSpec], MissionRunner],
                 guards: Guards):
        self.cfg, self.runner_for, self.guards = cfg, runner_for, guards
        self._client: aiomqtt.Client | None = None
        self._task: asyncio.Task | None = None
        self._rain: dict[str, bool] = {}

    @property
    def busy(self) -> bool:
        return self._task is not None and not self._task.done()

    async def run_forever(self) -> None:
        while True:
            try:
                await self._session()
            except aiomqtt.MqttError as exc:
                log.warning("mqtt link down (%s); retrying in 5 s", exc)
            self.guards.link_ok = False
            self._client = None
            await asyncio.sleep(5)

    async def _session(self) -> None:
        will = aiomqtt.Will(self.cfg.topic_status, json.dumps({"status": "offline"}), qos=1, retain=True)
        async with aiomqtt.Client(hostname=self.cfg.mqtt_host, port=self.cfg.mqtt_port,
                                  username=self.cfg.mqtt_username, password=self.cfg.mqtt_password,
                                  keepalive=self.cfg.guard.mqtt_keepalive_s, will=will) as client:
            self._client = client
            self.guards.link_ok = True
            await client.publish(self.cfg.topic_status,
                                 json.dumps({"status": "online", "device": self.cfg.device_code}),
                                 qos=1, retain=True)
            for topic in (self.cfg.topic_mission_set, self.cfg.topic_estop, self.cfg.topic_farm_telemetry):
                await client.subscribe(topic, qos=1)
            log.info("connected to %s:%s", self.cfg.mqtt_host, self.cfg.mqtt_port)
            async for msg in client.messages:
                await self.handle(str(msg.topic), msg.payload)

    async def handle(self, topic: str, payload) -> None:
        data = decode(payload)
        if topic == self.cfg.topic_estop:
            self.guards.estop = estop_requested(data)
            log.warning("e-stop %s", "ENGAGED" if self.guards.estop else "released")
        elif topic == self.cfg.topic_mission_set:
            await self._start(data)
        elif topic.endswith("/telemetry"):
            rain = rain_from_telemetry(data)
            if rain is not None:
                self._rain[topic] = rain
                self.guards.rain = any(self._rain.values())

    async def _start(self, data: object) -> None:
        mission_id = data.get("missionId") if isinstance(data, dict) else None
        try:
            spec = MissionSpec.from_payload(data, self.cfg.drive)
        except ValueError as exc:
            await self._publish_state({"missionId": mission_id, "status": "rejected", "reason": str(exc)})
            return
        if self.busy:
            await self._publish_state({"missionId": spec.mission_id, "status": "rejected", "reason": "busy"})
            return
        if self.guards.estop:
            await self._publish_state({"missionId": spec.mission_id, "status": "rejected",
                                       "reason": "estop_engaged"})
            return
        self._task = asyncio.create_task(self._run(spec))

    async def _run(self, spec: MissionSpec) -> None:
        # Progress goes out through one queue, in order, and is fully drained
        # before the final state — mission/state is retained, so a late
        # "running" must never overwrite "completed".
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def on_progress(state: dict) -> None:          # called from the mission thread
            loop.call_soon_threadsafe(queue.put_nowait, state)

        async def drain() -> None:
            while (state := await queue.get()) is not None:
                await self._publish_state(state)

        drainer = asyncio.create_task(drain())
        report = None
        try:
            runner = self.runner_for(spec)
            report = await asyncio.to_thread(runner.run, spec, on_progress)
        except Exception:                              # noqa: BLE001
            log.exception("mission %s failed to run", spec.mission_id)
        finally:
            queue.put_nowait(None)
            await drainer

        if report is None:
            await self._publish_state({"missionId": spec.mission_id, "status": "failed"})
            return
        paths = save_report(report, self.cfg.report_dir)
        log.info("mission %s %s; report at %s", spec.mission_id, report.status, paths["json"])
        await self._publish(self.cfg.topic_mission_result, report.to_dict())
        await self._publish_state(report.summary())

    async def _publish_state(self, state: dict) -> None:
        await self._publish(self.cfg.topic_mission_state, state, retain=True)

    async def _publish(self, topic: str, payload: dict, retain: bool = False) -> None:
        if self._client is None:
            log.info("link down; not published to %s (report kept on disk)", topic)
            return
        try:
            await self._client.publish(topic, json.dumps(payload), qos=1, retain=retain)
        except aiomqtt.MqttError as exc:
            log.warning("publish to %s failed: %s", topic, exc)
