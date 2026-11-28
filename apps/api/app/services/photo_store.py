"""The photo library on disk and in MongoDB: a farmer's photos (Health › Photos) and the rover's (a round's flagged or
inspected plants) go to the same place, so an expert confirms them in one list."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.clock import farm_today
from app.services.errors import NotFound
from app.services.tomato import cycle_public_dict


def image_suffix(data: bytes, filename: str | None = None) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    suffix = Path(filename or "").suffix.lower()
    return suffix if suffix in (".jpg", ".jpeg", ".png", ".webp") else ".jpg"


async def latest_cell(db: Any, farm_name: str, zone: str, row: int, col: int) -> tuple[dict | None, dict | None]:
    survey = await db.surveys.find_one({"farmName": farm_name, "zone": zone, "status": {"$in": ["completed", "aborted"]}},
                                       {"_id": 0}, sort=[("startedAt", -1)])
    cell = next((c for c in (survey or {}).get("cells", []) if c["row"] == row and c["col"] == col), None)
    return survey, cell


async def save_photo(db: Any, farm_name: str, data: bytes, *, zone: str, part: str = "leaf", row: int | None = None,
                     col: int | None = None, label: str | None = None, note: str | None = None, filename: str | None = None,
                     model_label: str | None = None, model_seen: str | None = None, model_also: str | None = None,
                     mission_id: str | None = None, readings: dict | None = None) -> dict:
    """Write the image and its record. Returns the record as the API shows it (no file path)."""
    z = await db.zones.find_one({"farmName": farm_name, "zone": zone}, {"_id": 0})
    if z is None:
        raise NotFound(f"unknown bed {zone!r}")
    pid = str(uuid.uuid4())
    folder = Path(settings.photo_dir)
    folder.mkdir(parents=True, exist_ok=True)
    fpath = folder / f"{pid}{image_suffix(data, filename)}"
    fpath.write_bytes(data)

    cyc = await db.cycles.find_one({"farmName": farm_name, "zone": zone, "status": "active"}, {"_id": 0})
    pub = cycle_public_dict(cyc, farm_today()) if cyc else None
    if readings is None and row is not None and col is not None:
        survey, cell = await latest_cell(db, farm_name, zone, row, col)
        if cell and cell.get("readings"):
            readings = {"values": cell["readings"], "simulated": bool((survey or {}).get("simulated"))}
    doc = {
        "id": pid,
        "shortId": pid[:8],
        "farmName": farm_name,
        "zone": zone,
        "zoneLabel": z.get("label") or zone.upper(),
        "tree": f"R{row + 1} T{col + 1}" if row is not None and col is not None else None,
        "treeRow": row,
        "treeCol": col,
        "part": part,
        "takenAt": datetime.now(timezone.utc).isoformat(),
        "takenOn": farm_today().isoformat(),
        "cropDay": pub["day"] if pub else None,
        "readings": readings,
        "modelName": settings.ollama_model if model_label else None,
        "modelLabel": model_label,
        "modelSeen": model_seen,
        "modelAlso": model_also,
        "missionId": mission_id,
        "farmerLabel": label,
        "note": note,
        "expertLabel": None,
        "expertName": None,
        "expertNote": None,
        "expertAt": None,
        "filePath": str(fpath),
    }
    await db.photos.insert_one(dict(doc))
    return {k: v for k, v in doc.items() if k not in ("farmName", "filePath")}
