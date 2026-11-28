"""Publishing to the farm's MQTT broker (Mosquitto): rounds and the e-stop go to the rover this way."""
from __future__ import annotations

import json

import aiomqtt

from app.core.config import settings


class BrokerDown(Exception):
    """The farm broker could not be reached, so the message did not leave the server."""


def rover_topic(code: str, leaf: str) -> str:
    return f"devices/{code.lower()}/{leaf}"


async def publish(topic: str, payload: dict, *, retain: bool = False) -> None:
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            username=settings.mqtt_username or None,
            password=settings.mqtt_password or None,
            timeout=5,
        ) as client:
            await client.publish(topic, json.dumps(payload), qos=1, retain=retain)
    except Exception as exc:  # aiomqtt raises MqttError, the OS raises OSError: both mean "not sent"
        raise BrokerDown(f"farm broker unreachable at {settings.mqtt_host}:{settings.mqtt_port} ({exc})") from exc
