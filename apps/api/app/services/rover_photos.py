"""Plants the rover photographed on a round: keep the photo, check it, and show the answer on that plant.

When the rover finds yellow leaves at a plant (or on a Plant Inspection round, at every plant) it sends a photo with that
stop. The server saves it in the photo library (Health › Photos, for an expert to confirm), asks the photo check what it
shows, and puts the answer on that plant in the live round, so the Rover map can say what to go and look at. Without a
photo model the photo is still kept, and the answer says no model is set up.

Only a real rover's photos are checked: a simulated round's camera draws coloured squares, which would waste the model
and fill the library with pictures that are not plants. CHECK_SIMULATED_PHOTOS=true lets them through for a test.
One photo is checked at a time, so a round with many yellow plants does not flood the model.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import logging
from typing import Any

from app.core.config import settings
from app.services import photo_check, photo_store
from app.services.errors import NotFound
from app.services.rover_service import RoverLiveState, live as rover_live

log = logging.getLogger("rover.photos")
NOTE = "Rover photo: yellow leaves flagged on the round"
NOTE_INSPECTION = "Rover photo: Plant Inspection round"
_lock: asyncio.Lock | None = None


def _one_at_a_time() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


def wanted(payload: object, *, simulated_too: bool | None = None) -> bool:
    """A stop that came with a photo: a plant the rover flagged, or any plant on a Plant Inspection round."""
    if not isinstance(payload, dict) or payload.get("status") != "running" or not isinstance(payload.get("photo"), str):
        return False
    seen = payload.get("observation")
    if not isinstance(seen, dict) or (seen.get("flagged") is not True and payload.get("inspect") is not True):
        return False
    if not isinstance(seen.get("row"), int) or not isinstance(seen.get("col"), int) or not payload.get("zoneId"):
        return False
    allow_sim = settings.check_simulated_photos if simulated_too is None else simulated_too
    return payload.get("simulated") is False or payload.get("photosReal") is True or allow_sim


def _image(text: str) -> bytes | None:
    try:
        data = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError):
        return None
    return data if data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n") else None


async def keep_and_check(db: Any, payload: dict, *, classifier: photo_check.Classifier | None,
                         farm_name: str | None = None, live: RoverLiveState = rover_live) -> dict | None:
    """Save the stop's photo, check it, and put the answer on the plant in the live round. Returns the answer."""
    farm_name = farm_name or settings.farm_name
    seen = payload["observation"]
    row, col, zone = seen["row"], seen["col"], str(payload["zoneId"])
    data = _image(payload["photo"])
    if data is None:
        log.warning("rover photo for %s R%s T%s is not a JPEG or PNG; dropped", zone, row + 1, col + 1)
        return None
    guide = photo_check.TOMATO
    result, problem = None, None
    if classifier is None:
        problem = photo_check.NO_MODEL
    else:
        async with _one_at_a_time():
            try:
                result = await asyncio.to_thread(classifier.classify, data, guide)
            except photo_check.ModelUnavailable as exc:
                problem = str(exc)
    label = result.label if result else None
    also = result.also if result and result.also in guide.by_id else None
    try:
        saved = await photo_store.save_photo(
            db, farm_name, data, zone=zone, part="leaf", row=row, col=col,
            note=NOTE if seen.get("flagged") else NOTE_INSPECTION, model_label=label,
            model_seen=result.seen if result else None, model_also=also, mission_id=str(payload.get("missionId") or "") or None,
            readings={"values": seen.get("readings") or {}, "simulated": payload.get("simulated") is not False} if seen.get("readings") else None,
        )
    except NotFound:
        log.warning("rover photo for unknown block %s; not kept", zone)
        saved = None
    check = photo_check.finding(guide, label, also, result.seen if result else None, saved["id"] if saved else None,
                                status="unavailable" if problem else "ok" if result else "uncertain", problem=problem)
    live.set_check(str(payload.get("missionId")), (row, col), check)
    log.info("rover photo %s R%s T%s: %s", zone, row + 1, col + 1, problem or check["title"])
    return check
