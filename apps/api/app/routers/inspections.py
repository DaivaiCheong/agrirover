"""Plant Inspection: a block's newest rover round, plant by plant, with each plant's photo and what the check said.

One report for the Rover screen and Plant health alike: the round in progress if this block has one, otherwise the newest
stored round. A plant's finding comes from the photo the rover took on that round (photos.missionId); while the round runs
the live answer is used, so a model that was down says why.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.db import get_db
from app.services import photo_check
from app.services.errors import NotFound
from app.services.rover_service import RUNNING, live

router = APIRouter(prefix="/inspections", tags=["rover"])
KINDS = ("healthy", "disease", "nutrient", "pest", "problem", "unsure")


def _name(row: int, col: int) -> str:
    return f"R{row + 1} T{col + 1}"


def summary(plants: list[dict]) -> dict:
    checked = [p["finding"] for p in plants if p.get("finding")]
    out = {"inspected": len(checked), **{k: 0 for k in KINDS}}
    for f in checked:
        out[f["kind"]] = out.get(f["kind"], 0) + 1
    out["problems"] = out["disease"] + out["nutrient"] + out["pest"] + out["problem"]
    return out


@router.get("/{zone_name}")
async def latest_inspection(zone_name: str, farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    zone = await db.zones.find_one({"farmName": fname, "zone": zone_name}, {"_id": 0})
    if zone is None:
        raise NotFound(f"no block named {zone_name!r}")
    guide = photo_check.TOMATO
    label = zone.get("label") or zone_name
    stored = await db.surveys.find_one({"farmName": fname, "zone": zone_name}, {"_id": 0}, sort=[("startedAt", -1)])
    m = live.mission if live.mission and live.mission.get("zoneId") == zone_name else None
    # the round in progress wins; a finished live round is the stored one once its report is saved
    use_live = m is not None and (m.get("status") in RUNNING or stored is None or stored["id"] != m.get("missionId"))

    if use_live:
        mission_id, status = m.get("missionId"), m.get("status")
        rows, cols, simulated = m.get("rows"), m.get("cols"), m.get("simulated")
        started, finished, inspect = m.get("startedAt"), m.get("finishedAt"), bool(m.get("inspect"))
        cells = dict(live.cells)
    elif stored is not None:
        mission_id, status = stored["id"], stored.get("status")
        rows, cols, simulated = stored.get("rows"), stored.get("cols"), stored.get("simulated")
        started, finished, inspect = stored.get("startedAt"), stored.get("finishedAt"), stored.get("inspect")
        cells = {(c["row"], c["col"]): c for c in stored.get("cells", [])}
    else:
        return {"zone": zone_name, "label": label, "crop": guide.crop, "missionId": None, "status": None,
                "plants": [], "summary": summary([])}

    photos: dict[tuple[int, int], dict] = {}
    if mission_id:
        for p in await db.photos.find({"farmName": fname, "missionId": mission_id}, {"_id": 0, "filePath": 0}) \
                .sort("takenAt", 1).to_list(length=1000):
            if p.get("treeRow") is not None and p.get("treeCol") is not None:
                photos[(p["treeRow"], p["treeCol"])] = p                      # the newest photo of each plant

    plants = []
    for key in sorted(set(cells) | set(photos)):
        cell, photo = cells.get(key, {}), photos.get(key)
        check = cell.get("check") if use_live else None
        if check is None and photo is not None:
            check = photo_check.finding(guide, photo.get("modelLabel"), photo.get("modelAlso"), photo.get("modelSeen"), photo["id"],
                                        status="ok" if photo.get("modelLabel") else "uncertain",
                                        problem=None if photo.get("modelLabel") else photo_check.NO_MODEL if not settings.ollama_model else None)
        plants.append({"row": key[0], "col": key[1], "name": _name(*key), "plant": cell.get("plant"), "flagged": cell.get("flagged"),
                       "canopy": cell.get("canopy"), "yellow": cell.get("chlorosis"), "readings": cell.get("readings") or {},
                       "finding": check})
    return {"zone": zone_name, "label": label, "crop": guide.crop, "missionId": mission_id, "status": status,
            "live": use_live, "inspect": inspect, "simulated": simulated, "rows": rows, "cols": cols, "startedAt": started,
            "finishedAt": finished, "plants": plants, "summary": summary(plants)}
