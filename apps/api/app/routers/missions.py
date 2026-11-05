"""Survey missions for the rover (ROVER-01).

POST queues a mission by publishing it to the rover. Like a valve command, it returns 202: the rover itself
reports what happened. Its messages feed services/rover_live.py, which GET /missions/live reads; a finished
survey is stored and read back through GET /missions.
"""
import json
import random
import uuid
from collections.abc import Awaitable, Callable
from typing import Literal

import aiomqtt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.entities import SurveyFinding, SurveyMission, Zone
from app.services.rover_live import live

router = APIRouter(prefix="/missions", tags=["rover"])

ROVER = "rover-01"
TOPIC_MISSION_SET = f"devices/{ROVER}/mission/set"
TOPIC_ESTOP = f"devices/{ROVER}/estop"
MAX_CELLS = 400          # same limits the rover enforces on its side

# Must match the rover: SimDrive drains this per metre, and the guard stops it at this voltage.
SIM_DRAIN_V_PER_M = 0.02
SIM_STOP_V = 11.1
SIM_SPEEDUP = 10         # ten times faster than the real rover would drive


class MissionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    zone_id: str = Field(alias="zoneId", min_length=1, max_length=64)
    rows: int = Field(ge=1, le=40)
    cols: int = Field(ge=1, le=40)
    cell_m: float = Field(default=0.5, alias="cellM", ge=0.2, le=1.0)
    simulate: Literal["normal", "rain", "low_battery"] | None = None   # what a simulated rover meets; a real one ignores it

    @model_validator(mode="after")
    def _not_too_big(self) -> "MissionIn":
        if self.rows * self.cols > MAX_CELLS:
            raise ValueError(f"at most {MAX_CELLS} cells per mission")
        return self


class EstopIn(BaseModel):
    engaged: bool


def sim_options(body: MissionIn) -> dict:
    """What the simulated rover should meet, set about 40 % of the way along the bed so the map shows both parts."""
    cells = body.rows * body.cols
    sim: dict = {"seed": random.randrange(1_000_000), "speedup": SIM_SPEEDUP}
    if body.simulate == "rain":
        sim["rainAtCell"] = max(2, round(cells * 0.4))
    elif body.simulate == "low_battery":
        sim["batteryV"] = round(SIM_STOP_V + SIM_DRAIN_V_PER_M * body.cell_m * max(1, round(cells * 0.4)), 3)
    return sim


Publisher = Callable[[str, dict], Awaitable[None]]


async def mqtt_publish(topic: str, payload: dict) -> None:
    async with aiomqtt.Client(hostname=settings.mqtt_host, port=settings.mqtt_port,
                              username=settings.mqtt_username or None,
                              password=settings.mqtt_password or None) as client:
        await client.publish(topic, json.dumps(payload), qos=1)


def get_publisher() -> Publisher:
    return mqtt_publish


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_mission(body: MissionIn, publish: Publisher = Depends(get_publisher)):
    if live.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "The rover is already on a survey.")
    if live.estop:
        raise HTTPException(status.HTTP_409_CONFLICT, "E-stop is engaged. Release it first.")
    if live.status == "offline":
        raise HTTPException(status.HTTP_409_CONFLICT, "The rover is offline.")
    mission_id = str(uuid.uuid4())
    payload = {"missionId": mission_id, "zoneId": body.zone_id,
               "rows": body.rows, "cols": body.cols, "cellM": body.cell_m}
    if body.simulate is not None:
        payload["sim"] = sim_options(body)
    try:
        await publish(TOPIC_MISSION_SET, payload)
    except Exception as exc:                          # noqa: BLE001
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "farm broker unreachable; mission not sent") from exc
    live.queued(mission_id, body.zone_id, body.rows, body.cols, body.cell_m, body.simulate)
    return {"missionId": mission_id, "status": "queued"}


@router.post("/estop")
async def set_estop(body: EstopIn, publish: Publisher = Depends(get_publisher)):
    try:
        await publish(TOPIC_ESTOP, {"estop": body.engaged})
    except Exception as exc:                          # noqa: BLE001
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Farm broker unreachable: e-stop NOT sent. Go to the rover and cut its power.") from exc
    live.estop = body.engaged
    return {"estop": live.estop}


@router.get("/live")
async def mission_live():
    return live.snapshot()


@router.get("/live/frames/{row}/{col}")
async def mission_frame(row: int, col: int):
    """The photo of one cell of the current survey. Photos are not stored, so this ends with the next survey."""
    return {"frame": live.frames.get((row, col))}


def _summary(m: SurveyMission, zone: Zone) -> dict:
    return {
        "id": str(m.id), "zone": zone.name, "bedLabel": zone.label or zone.name, "status": m.status,
        "abortReason": m.abort_reason, "simulated": m.simulated, "rows": m.rows, "cols": m.cols,
        "cellM": None if m.cell_m is None else float(m.cell_m), "cellsScanned": m.cells_scanned,
        "plantsDetected": m.plants_detected, "plantsNeedingWater": m.plants_needing_water, "cellsFlagged": m.cells_flagged,
        "distanceM": None if m.distance_m is None else float(m.distance_m),
        "estDurationS": None if m.est_duration_s is None else float(m.est_duration_s),
        "startedAt": m.started_at.isoformat(), "finishedAt": m.completed_at.isoformat() if m.completed_at else None,
    }


@router.get("")
async def list_missions(session: AsyncSession = Depends(get_db)):
    rows = await session.execute(select(SurveyMission, Zone).join(Zone, SurveyMission.zone_id == Zone.id)
                                 .order_by(SurveyMission.started_at.desc()).limit(50))
    return [_summary(m, z) for m, z in rows.all()]


@router.get("/{mission_id}")
async def get_mission(mission_id: uuid.UUID, session: AsyncSession = Depends(get_db)):
    row = (await session.execute(select(SurveyMission, Zone).join(Zone, SurveyMission.zone_id == Zone.id)
                                 .where(SurveyMission.id == mission_id))).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such survey.")
    found = await session.scalars(select(SurveyFinding).where(SurveyFinding.mission_id == mission_id))
    cells = [{"row": f.cell_row, "col": f.cell_col, "plant": f.plant_present, "needs_water": f.needs_water,
              "flagged": f.flagged, "suggested_ml": f.suggested_ml,
              "chlorosis": None if f.yellowing is None else float(f.yellowing),
              "canopy": None if f.canopy is None else float(f.canopy),
              "dryness": None if f.dryness is None else float(f.dryness),
              "disease": f.disease_code, "disease_confidence": None if f.confidence is None else float(f.confidence)}
             for f in found]
    return {**_summary(*row), "cells": cells}
