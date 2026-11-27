"""Plants the rover flagged on a round: keep the photo, check it against the block's crop, and show the answer.

When the rover finds yellow leaves at a plant it sends a photo with that stop. The server saves it in the photo library
(Health › Photo library, for an expert to confirm), asks the photo check what it shows using the block's disease guide
(tomato on a tomato block), and puts the answer on that plant in the live round, so the Rover map can say what to go
and look at. Triage, not diagnosis: the same rules as a farmer's own photo check.

Only a real rover's photos: a simulated round's camera draws coloured squares, which would waste the online model's
quota and fill the library with pictures that are not plants. CHECK_SIMULATED_PHOTOS=true lets them through for a test.
One photo is checked at a time, so a round with many yellow plants does not flood the model.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import logging
from collections.abc import Callable

from app.core.config import settings
from app.core.db import SessionLocal
from app.services import photo_library
from app.services.crop_guides import Guide, crop_of_zone, guide_for
from app.services.disease import HEALTHY, PROBLEM, Classifier, ModelUnavailable
from app.services.errors import NotFound
from app.services.rover_live import RoverLive, live as rover_live

log = logging.getLogger("rover.photos")
NOTE = "Rover photo: yellow leaves flagged on the round"
_lock: asyncio.Lock | None = None


def _one_at_a_time() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


def wanted(payload: object, *, simulated_too: bool | None = None) -> bool:
    """A stop the rover flagged, with a photo, from a real rover (or a simulated one when allowed)."""
    if not isinstance(payload, dict) or payload.get("status") != "running" or not isinstance(payload.get("photo"), str):
        return False
    seen = payload.get("observation")
    if not isinstance(seen, dict) or seen.get("flagged") is not True:
        return False
    if not isinstance(seen.get("row"), int) or not isinstance(seen.get("col"), int) or not payload.get("zoneId"):
        return False
    allow_sim = settings.check_simulated_photos if simulated_too is None else simulated_too
    return payload.get("simulated") is False or allow_sim


def title_of(guide: Guide, label: str | None) -> str:
    if label is None:
        return "Not sure: go and look"
    if label == HEALTHY:
        return "Looks healthy"
    if label == PROBLEM:
        return "A problem: go and look"
    entry = guide.by_id.get(label)
    return f"Possible {entry.title.lower()}" if entry else label


def _image(text: str) -> bytes | None:
    try:
        data = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError):
        return None
    return data if data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n") else None


async def keep_and_check(payload: dict, *, classifier: Classifier | None, session_factory: Callable = SessionLocal,
                         farm_name: str | None = None, live: RoverLive = rover_live) -> dict | None:
    """Save the flagged stop's photo, check it, and put the answer on the plant in the live round. Returns the answer."""
    farm_name = farm_name or settings.farm_name
    seen = payload["observation"]
    row, col, zone = seen["row"], seen["col"], str(payload["zoneId"])
    data = _image(payload["photo"])
    if data is None:
        log.warning("rover photo for %s R%s T%s is not a JPEG or PNG; dropped", zone, row + 1, col + 1)
        return None
    async with session_factory() as session:
        guide = guide_for(await crop_of_zone(session, farm_name, zone))

    result, problem = None, None
    if classifier is None:
        problem = "No photo model is set up (OLLAMA_MODEL)."
    else:
        async with _one_at_a_time():
            try:
                result = await asyncio.to_thread(classifier.classify, data, guide)
            except ModelUnavailable as exc:
                problem = str(exc)
    label = result.label if result else None

    try:
        async with session_factory() as session:
            saved = await photo_library.save(session, data, zone_name=zone, part="leaf", row=row, col=col, note=NOTE,
                                             model_name=settings.ollama_model if result else None, model_label=label,
                                             model_seen=result.seen if result else None)
    except NotFound:
        log.warning("rover photo for unknown block %s; not kept", zone)
        saved = None

    also = result.also if result and result.also in guide.by_id else None
    check = {"status": "unavailable" if problem else "ok" if result else "uncertain", "label": label, "title": title_of(guide, label),
             "seen": result.seen if result else None, "also": guide.by_id[also].title if also else None, "crop": guide.crop,
             "photoId": saved["id"] if saved else None, "problem": problem}
    live.set_check(str(payload.get("missionId")), (row, col), check)
    log.info("rover photo %s R%s T%s: %s", zone, row + 1, col + 1, check["title"] if not problem else problem)
    return check
