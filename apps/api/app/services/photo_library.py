"""Saved plant photos: what they show, who says so, and how close each problem is to enough photos to test a model.

Only an expert's label counts. The farmer's label and the model's answer are kept beside it and are never training data.
The photos must come from several separate days: a model tested on the day it trained on can score well by knowing the
day (docs/GUAVA-RESEARCH.md). TARGET_* are our working figures, not from a study.
"""
from __future__ import annotations

import csv
import io
import os
import tempfile
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import Farm, PlantPhoto, Zone
from app.services import guava
from app.services.advice import latest_round
from app.services.conditions import load_snapshots
from app.services.errors import Invalid, NotFound
from app.services.rule_engine import utcnow

TARGET_PHOTOS, TARGET_DAYS = 100, 3
PARTS = ("leaf", "fruit", "branch", "tree")
LABELS = {"healthy": "Healthy", **{s.id: s.title for s in guava.SYMPTOMS.values()}, "scab": "Fruit scab", "black_mold": "Black mould",
          "insect_damage": "Insect damage", "scorch": "Leaf scorch", "other": "Something else"}
README = ("Guava photos to confirm.\n\nFor each row of photos.csv, open the photo named in `file` and write what it shows in `expert_label`, "
          "using one of these words. Leave it empty if the photo cannot show it.\n\n" + "\n".join(f"{k}: {v}" for k, v in LABELS.items()) + "\n")


def _dir() -> Path:
    path = Path(settings.photo_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _suffix(data: bytes) -> str:
    return ".png" if data.startswith(b"\x89PNG") else ".jpg"


async def _timezone(session: AsyncSession) -> ZoneInfo:
    tz = await session.scalar(select(Farm.timezone).where(Farm.name == settings.farm_name))
    return ZoneInfo(tz or "Asia/Phnom_Penh")


def _label(label: str | None, *, required: bool = False) -> str | None:
    label = (label or "").strip() or None
    if label is None and required:
        raise Invalid("choose what the photo shows")
    if label is not None and label not in LABELS:
        raise Invalid(f"unknown label {label!r}; choose one of {', '.join(LABELS)}")
    return label


def _text(value: str | None) -> str | None:
    return (value or "").strip() or None


def to_dict(p: PlantPhoto, zone: Zone | None, tz: ZoneInfo) -> dict:
    tree = None if p.tree_row is None or p.tree_col is None else f"R{p.tree_row + 1} T{p.tree_col + 1}"
    return {"id": str(p.id), "shortId": str(p.id)[:8], "zone": zone.name if zone else None, "zoneLabel": (zone.label or zone.name) if zone else None,
            "tree": tree, "part": p.part, "takenAt": p.taken_at.isoformat(), "takenOn": p.taken_at.astimezone(tz).date().isoformat(), "cropDay": p.crop_day,
            "readings": p.readings, "modelName": p.model_name, "modelLabel": p.model_label, "modelSeen": p.model_seen,
            "farmerLabel": p.farmer_label, "note": p.note, "expertLabel": p.expert_label, "expertName": p.expert_name,
            "expertNote": p.expert_note, "expertAt": p.expert_at.isoformat() if p.expert_at else None}


async def save(session: AsyncSession, data: bytes, *, zone_name: str, part: str, row: int | None = None, col: int | None = None,
               farmer_label: str | None = None, note: str | None = None, model_name: str | None = None, model_label: str | None = None,
               model_seen: str | None = None, now: datetime | None = None) -> dict:
    """Keep one photo with the soil and air it was taken in. `row` and `col` count from 0, as the rover's do."""
    now = now or utcnow()
    if part not in PARTS:
        raise Invalid(f"part must be one of {', '.join(PARTS)}")
    if (row is None) != (col is None) or (row is not None and (row < 0 or col < 0)):
        raise Invalid("give both the row and the tree, or neither")
    farmer_label = _label(farmer_label)
    snap = (await load_snapshots(session, settings.farm_name, now, zone_name))[0]        # an unknown block raises NotFound
    mission, trees = await latest_round(session, snap.zone.id, now)
    tree = next((t for t in trees if t["row"] == row and t["col"] == col), None)
    values = tree["readings"] if tree and tree.get("readings") else {k: r.value for k, r in snap.readings.items() if now - r.at <= guava.FRESH_FOR}

    photo_id = uuid.uuid4()
    filename = f"{photo_id}{_suffix(data)}"
    path = _dir() / filename
    path.write_bytes(data)
    photo = PlantPhoto(id=photo_id, zone_id=snap.zone.id, planting_id=snap.planting.id if snap.planting else None, crop_day=snap.day, tree_row=row, tree_col=col,
                       part=part, filename=filename, taken_at=now, readings={"values": values, "simulated": bool(mission and mission.simulated)},
                       model_name=model_name, model_label=model_label, model_seen=_text(model_seen), farmer_label=farmer_label, note=_text(note))
    session.add(photo)
    try:
        await session.commit()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return to_dict(photo, snap.zone, await _timezone(session))


async def get(session: AsyncSession, photo_id: uuid.UUID) -> PlantPhoto:
    photo = await session.get(PlantPhoto, photo_id)
    if photo is None:
        raise NotFound("no such photo")
    return photo


async def confirm(session: AsyncSession, photo_id: uuid.UUID, *, label: str, name: str, note: str | None = None, now: datetime | None = None) -> dict:
    """An expert says what the photo shows. Their name goes with it. Asking again replaces it."""
    photo = await get(session, photo_id)
    label = _label(label, required=True)
    name = _text(name)
    if name is None:
        raise Invalid("say who confirmed this")
    photo.expert_label, photo.expert_name, photo.expert_note, photo.expert_at = label, name[:80], _text(note), now or utcnow()
    await session.commit()
    zone = await session.get(Zone, photo.zone_id) if photo.zone_id else None
    return to_dict(photo, zone, await _timezone(session))


async def delete(session: AsyncSession, photo_id: uuid.UUID) -> None:
    photo = await get(session, photo_id)
    filename = photo.filename
    await session.delete(photo)
    await session.commit()
    (_dir() / filename).unlink(missing_ok=True)


def progress(rows: list[dict]) -> list[dict]:
    """For each label: confirmed photos, the separate days they came from, and whether that is enough to test a model."""
    out = []
    for label, title in LABELS.items():
        mine = [r for r in rows if r["expertLabel"] == label]
        days = len({r["takenOn"] for r in mine})
        out.append({"label": label, "title": title, "photos": len(mine), "days": days,
                    "ready": len(mine) >= TARGET_PHOTOS and days >= TARGET_DAYS})
    return out


async def rows_of(session: AsyncSession) -> list[dict]:
    tz = await _timezone(session)
    found = await session.execute(select(PlantPhoto, Zone).outerjoin(Zone, PlantPhoto.zone_id == Zone.id).order_by(PlantPhoto.taken_at.desc()))
    return [to_dict(p, z, tz) for p, z in found.all()]


async def library(session: AsyncSession, status: str = "all") -> dict:
    rows = await rows_of(session)
    confirmed = [r for r in rows if r["expertLabel"]]
    pick = {"all": rows, "to_confirm": [r for r in rows if not r["expertLabel"]], "confirmed": confirmed}
    if status not in pick:
        raise Invalid("status must be all, to_confirm or confirmed")
    return {"photos": pick[status], "saved": len(rows), "toConfirm": len(rows) - len(confirmed), "confirmed": len(confirmed),
            "progress": progress(rows), "targetPhotos": TARGET_PHOTOS, "targetDays": TARGET_DAYS}


def _safe_cell(value) -> str:
    """Free text is opened in a spreadsheet, which would run a leading = as a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


async def export_zip(session: AsyncSession, status: str) -> str:
    """A zip on disk, for the caller to send and delete. `confirmed`: one folder per expert label, ready for scripts/eval_photo_check.py.
    `to_confirm`: the photos, a sheet to fill in, and the words to use, for an expert who is not at the farm."""
    photos = (await library(session, status))["photos"]
    fd, zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    sheet = io.StringIO()
    writer = csv.writer(sheet)
    writer.writerow(["file", "id", "block", "tree", "part", "taken_on", "crop_day", "farmer_label", "model_label", "model_seen", "note", "expert_label", "expert_name", "readings"])
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as z:
        for r in photos:
            photo = await get(session, uuid.UUID(r["id"]))
            source = _dir() / photo.filename
            if not source.exists():
                continue
            folder = r["expertLabel"] if status == "confirmed" else "photos"
            name = f"{folder}/{r['takenOn']}_{r['zone'] or 'none'}_{r['shortId']}{source.suffix}"
            z.write(source, name)
            writer.writerow([name, r["id"], r["zoneLabel"], r["tree"], r["part"], r["takenOn"], r["cropDay"], _safe_cell(r["farmerLabel"]), r["modelLabel"], _safe_cell(r["modelSeen"]),
                             _safe_cell(r["note"]), r["expertLabel"], _safe_cell(r["expertName"]), (r["readings"] or {}).get("values")])
        z.writestr("photos.csv", sheet.getvalue())
        if status == "to_confirm":
            z.writestr("README.txt", README)
    return zip_path
