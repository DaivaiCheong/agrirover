"""The rover's daily round (ROVER-01).

POST queues a round by publishing it to the rover. Like a valve command, it returns 202: the rover itself reports
what happened. Its messages feed services/rover_live.py, which GET /missions/live reads; a finished round is stored,
read back through GET /missions, and turned into the day's advice by services/advice.py.
"""
import json
import uuid
import zlib
from collections.abc import Awaitable, Callable
from typing import Literal

import aiomqtt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.entities import Planting, SurveyFinding, SurveyMission, Zone
from app.services import advice, guava
from app.services.clock import farm_today
from app.services.demo_orchard import readings_for
from app.services.rover_live import live

router = APIRouter(prefix="/missions", tags=["rover"])

ROVER = "rover-01"
TOPIC_MISSION_SET = f"devices/{ROVER}/mission/set"
TOPIC_ESTOP = f"devices/{ROVER}/estop"
MAX_CELLS = 400          # same limits the rover enforces on its side

# Must match the rover: SimDrive drains this per metre, and the guard stops it at this voltage.
SIM_DRAIN_V_PER_M = 0.005
SIM_STOP_V = 11.1
SIM_SPEEDUP = 40         # forty times faster than the real rover would work


class MissionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    zone_id: str = Field(alias="zoneId", min_length=1, max_length=64)
    rows: int = Field(ge=1, le=40)
    cols: int = Field(ge=1, le=40)                                      # trees in a row
    cell_m: float = Field(default=3.0, alias="cellM", ge=0.2, le=10.0)  # from tree to tree
    row_m: float | None = Field(default=None, alias="rowM", ge=0.2, le=10.0)
    simulate: Literal["normal", "rain", "low_battery"] | None = None    # what a simulated rover meets; a real one ignores it

    @model_validator(mode="after")
    def _not_too_big(self) -> "MissionIn":
        if self.rows * self.cols > MAX_CELLS:
            raise ValueError(f"at most {MAX_CELLS} trees a round")
        return self


class EstopIn(BaseModel):
    engaged: bool


def sim_options(body: MissionIn, base: dict | None, spread: float | None) -> dict:
    """What the simulated rover should meet, set about 40 % of the way along so the map shows both parts."""
    cells = body.rows * body.cols
    # the same block always has the same trees; the day's readings vary around the base
    sim: dict = {"seed": zlib.crc32(body.zone_id.encode()) % 1_000_000, "speedup": SIM_SPEEDUP}
    if base:
        sim["base"], sim["moistureSpread"] = base, spread
    if body.simulate == "rain":
        sim["rainAtCell"] = max(2, round(cells * 0.4))
    elif body.simulate == "low_battery":
        sim["batteryV"] = round(SIM_STOP_V + SIM_DRAIN_V_PER_M * body.cell_m * max(1, round(cells * 0.4)), 3)
    return sim


async def _sim_base(session: AsyncSession, zone_name: str) -> tuple[dict | None, float | None]:
    """The readings a simulated round of this bed should find today, so it agrees with the rounds before it."""
    p = await session.scalar(select(Planting).join(Zone, Planting.zone_id == Zone.id)
                             .where(Zone.name == zone_name, Planting.ended_on.is_(None)))
    if p is None:
        return None, None
    day = max(1, guava.days_between(p.planted_on, farm_today()))
    stress = p.regulation == "withhold"
    low, high = guava.moisture_band(guava.stage_of(day), stress)
    return readings_for(day, stress), max(3.0, (high - low) * 0.9)


Publisher = Callable[[str, dict], Awaitable[None]]


async def mqtt_publish(topic: str, payload: dict) -> None:
    async with aiomqtt.Client(hostname=settings.mqtt_host, port=settings.mqtt_port,
                              username=settings.mqtt_username or None,
                              password=settings.mqtt_password or None) as client:
        await client.publish(topic, json.dumps(payload), qos=1)


def get_publisher() -> Publisher:
    return mqtt_publish


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_mission(body: MissionIn, publish: Publisher = Depends(get_publisher), session: AsyncSession = Depends(get_db)):
    if live.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "The rover is already on a round.")
    if live.estop:
        raise HTTPException(status.HTTP_409_CONFLICT, "E-stop is engaged. Release it first.")
    if live.status == "offline":
        raise HTTPException(status.HTTP_409_CONFLICT, "The rover is offline.")
    mission_id = str(uuid.uuid4())
    row_m = body.row_m or body.cell_m
    payload = {"missionId": mission_id, "zoneId": body.zone_id, "rows": body.rows, "cols": body.cols, "cellM": body.cell_m, "rowM": row_m}
    if body.simulate is not None:
        payload["sim"] = sim_options(body, *await _sim_base(session, body.zone_id))
    try:
        await publish(TOPIC_MISSION_SET, payload)
    except Exception as exc:                          # noqa: BLE001
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "farm broker unreachable; round not sent") from exc
    live.queued(mission_id, body.zone_id, body.rows, body.cols, body.cell_m, row_m, body.simulate)
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
async def mission_live(session: AsyncSession = Depends(get_db)):
    """The rover and its current round, with today's advice for each tree seen so far."""
    snap = live.snapshot()
    m = snap["mission"]
    if m and m["cells"]:
        rows = await advice.advise_live_trees(session, settings.farm_name, m["zoneId"], m["cells"])
        if rows:
            for cell in m["cells"]:
                cell["advice"] = rows.get((cell["row"], cell["col"]))
    return snap


@router.get("/live/frames/{row}/{col}")
async def mission_frame(row: int, col: int):
    """The photo of one tree of the current round. Photos are not stored, so this ends with the next round."""
    return {"frame": live.frames.get((row, col))}


def _summary(m: SurveyMission, zone: Zone) -> dict:
    return {
        "id": str(m.id), "zone": zone.name, "bedLabel": zone.label or zone.name, "status": m.status,
        "abortReason": m.abort_reason, "simulated": m.simulated, "rows": m.rows, "cols": m.cols,
        "cellM": None if m.cell_m is None else float(m.cell_m), "cellsScanned": m.cells_scanned,
        "plantsDetected": m.plants_detected, "cellsFlagged": m.cells_flagged,
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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such round.")
    found = await session.scalars(select(SurveyFinding).where(SurveyFinding.mission_id == mission_id))
    cells = [{"row": f.cell_row, "col": f.cell_col, "plant": f.plant_present, "flagged": f.flagged,
              "chlorosis": None if f.yellowing is None else float(f.yellowing), "canopy": None if f.canopy is None else float(f.canopy),
              "readings": f.readings or {}, "disease": f.disease_code, "disease_confidence": None if f.confidence is None else float(f.confidence)}
             for f in found]
    return {**_summary(*row), "cells": cells}
