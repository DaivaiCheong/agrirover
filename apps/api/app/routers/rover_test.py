"""Rover › Test: check the real rover's wheels and camera from the page (services/rover_test.py).

The API talks to the rover's ESP32 boards over MQTT and the camera over HTTP, without the rover's Pi. Every limit still
lives in the firmware: a test move is short and slow, and the ESP32 caps any move whatever it is sent.
"""
from collections.abc import Awaitable, Callable
from typing import Literal

import aiomqtt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from app.core.config import settings
from app.services.rover_service import live
from app.services.rover_test import NotNow, tester

router = APIRouter(prefix="/rover/test", tags=["rover"])

RawSender = Callable[[str, str], Awaitable[None]]
CameraGet = Callable[[str], Awaitable[bytes]]


async def mqtt_send_raw(topic: str, text: str) -> None:
    """A drive frame: QoS 0 and never retained, so a stale command can never replay."""
    async with aiomqtt.Client(hostname=settings.mqtt_host, port=settings.mqtt_port,
                              username=settings.mqtt_username or None,
                              password=settings.mqtt_password or None, timeout=5) as client:
        await client.publish(topic, text, qos=0, retain=False)


async def http_get_photo(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url)
    if r.status_code != 200 or not r.content.startswith(b"\xff\xd8\xff"):
        raise NotNow(f"The camera answered {r.status_code}: {r.text[:80] if r.status_code != 200 else 'not a JPEG'}")
    return r.content


def get_sender() -> RawSender:
    return mqtt_send_raw


def get_camera() -> CameraGet:
    return http_get_photo


class MoveIn(BaseModel):
    move: Literal["forward", "back", "left", "right"]


@router.get("")
async def rover_test_status():
    return tester.snapshot()


@router.post("/move")
async def test_move(body: MoveIn, send: RawSender = Depends(get_sender)):
    try:
        return await tester.move(body.move, send, round_running=live.running, estop=live.estop)
    except NotNow as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except (OSError, aiomqtt.MqttError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Farm broker unreachable: move not sent.") from exc


@router.post("/stop")
async def test_stop(send: RawSender = Depends(get_sender)):
    try:
        await tester.stop(send)
    except (OSError, aiomqtt.MqttError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Farm broker unreachable: stop NOT sent. Use the power switch on the rover.") from exc
    return {"stopped": True}


@router.get("/photo", response_class=Response)
async def test_photo(get: CameraGet = Depends(get_camera)):
    try:
        data = await get(tester.camera_url(settings.rover_camera_url or None))
    except NotNow as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT,
                            f"No photo from the camera ({type(exc).__name__}): is it on Wi-Fi?") from exc
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
