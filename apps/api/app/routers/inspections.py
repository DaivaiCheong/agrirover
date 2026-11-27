"""Plant Inspection: a block's newest rover round, plant by plant, with each plant's photo and what the check said.

One report for the Rover screen and Plant health alike. The round in progress if this block has one, otherwise the
newest stored round. A plant's finding comes from the photo the rover took on that round (plant_photo.mission_id),
checked against the block's crop guide; the live answer is used while the round runs, so a model that was down says why.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.entities import Farm, PlantPhoto, SurveyFinding, SurveyMission, Zone
from app.routers._deps import farm_dep
from app.services.crop_guides import crop_of_zone, guide_for
from app.services.errors import NotFound
from app.services.rover_live import RUNNING, live
from app.services.rover_photos import finding

router = APIRouter(prefix="/inspections", tags=["rover"])
KINDS = ("healthy", "disease", "nutrient", "pest", "problem", "unsure")


def _name(row: int, col: int) -> str:
    return f"R{row + 1} T{col + 1}"


def summary(plants: list[dict]) -> dict:
    checked = [p["finding"] for p in plants if p.get("finding")]
    out = {"inspected": len(checked), **{k: 0 for k in KINDS}}
    for f in checked:
        out[f["kind"]] += 1
    out["problems"] = out["disease"] + out["nutrient"] + out["pest"] + out["problem"]
    return out


@router.get("/{zone_name}")
async def latest_inspection(zone_name: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    zone = await session.scalar(select(Zone).where(Zone.farm_id == farm.id, Zone.name == zone_name))
    if zone is None:
        raise NotFound(f"no block named {zone_name!r}")
    guide = guide_for(await crop_of_zone(session, settings.farm_name, zone_name))
    stored = await session.scalar(select(SurveyMission).where(SurveyMission.zone_id == zone.id)
                                  .order_by(SurveyMission.started_at.desc()).limit(1))
    m = live.mission if live.mission and live.mission.get("zoneId") == zone_name else None
    # the round in progress wins; a finished live round is the stored one once its report is saved
    use_live = m is not None and (m["status"] in RUNNING or stored is None or str(stored.id) != m["missionId"])

    if use_live:
        mission_id, status = m["missionId"], m["status"]
        rows, cols, simulated = m["rows"], m["cols"], m.get("simulated")
        started, finished, inspect = None, None, bool(m.get("inspect"))
        cells = {k: v for k, v in live.cells.items()}
    elif stored is not None:
        mission_id, status = str(stored.id), stored.status
        rows, cols, simulated = stored.rows, stored.cols, stored.simulated
        started = stored.started_at.isoformat()
        finished = stored.completed_at.isoformat() if stored.completed_at else None
        inspect = None
        found = (await session.scalars(select(SurveyFinding).where(SurveyFinding.mission_id == stored.id))).all()
        cells = {(f.cell_row, f.cell_col): {"row": f.cell_row, "col": f.cell_col, "plant": f.plant_present, "flagged": f.flagged,
                                             "canopy": None if f.canopy is None else float(f.canopy),
                                             "chlorosis": None if f.yellowing is None else float(f.yellowing),
                                             "readings": f.readings or {}} for f in found}
    else:
        return {"zone": zone.name, "label": zone.label or zone.name, "crop": guide.crop, "missionId": None, "status": None,
                "plants": [], "summary": summary([])}

    photos: dict[tuple[int, int], PlantPhoto] = {}
    try:
        mid = uuid.UUID(mission_id)
    except ValueError:
        mid = None
    if mid is not None:
        for p in (await session.scalars(select(PlantPhoto).where(PlantPhoto.mission_id == mid).order_by(PlantPhoto.taken_at))).all():
            if p.tree_row is not None and p.tree_col is not None:
                photos[(p.tree_row, p.tree_col)] = p                         # the newest photo of each plant

    plants = []
    for key in sorted(set(cells) | set(photos)):
        cell, photo = cells.get(key, {}), photos.get(key)
        check = cell.get("check") if use_live else None
        if check is None and photo is not None:
            check = finding(guide, photo.model_label, photo.model_also, photo.model_seen, str(photo.id),
                            status="ok" if photo.model_label else "uncertain")
        plants.append({"row": key[0], "col": key[1], "name": _name(*key), "plant": cell.get("plant"), "flagged": cell.get("flagged"),
                       "canopy": cell.get("canopy"), "yellow": cell.get("chlorosis"), "readings": cell.get("readings") or {},
                       "finding": check})
    return {"zone": zone.name, "label": zone.label or zone.name, "crop": guide.crop, "missionId": mission_id, "status": status,
            "live": use_live, "inspect": inspect, "simulated": simulated, "rows": rows, "cols": cols, "startedAt": started,
            "finishedAt": finished, "plants": plants, "summary": summary(plants)}
