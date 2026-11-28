import uuid
import zlib
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import settings
from app.core.db import get_db
from app.services.broker import BrokerDown, publish, rover_topic
from app.services.errors import NotFound
from app.services.rover_service import live

router = APIRouter(prefix="/missions", tags=["rover"])
MAX_CELLS = 400


# Must match the rover: SimDrive drains this per metre, and the guard stops it at this voltage.
SIM_DRAIN_V_PER_M = 0.005
SIM_STOP_V = 11.1
SIM_SPEEDUP = 40         # forty times faster than the real rover would work


class MissionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    zone_id: str = Field(alias="zoneId", min_length=1, max_length=64)
    rows: int = Field(ge=1, le=40)
    cols: int = Field(ge=1, le=40)                                      # plants in a row
    cell_m: float = Field(default=3.0, alias="cellM", ge=0.2, le=10.0)  # from plant to plant
    row_m: float | None = Field(default=None, alias="rowM", ge=0.2, le=10.0)
    # The route, set on Rover › Setup: the start corner (sw = row 1, plant 1) and lanes along the rows or across.
    start: Literal["sw", "se", "nw", "ne"] = "sw"
    along: Literal["rows", "across"] = "rows"
    # The spots that hold a plant (from the block's plant map), [row, col] from 0: the rover stops at these only.
    stops: list[tuple[int, int]] | None = Field(default=None, min_length=1, max_length=MAX_CELLS)
    # Plant Inspection: a photo of every plant goes to the photo check, not only the yellow ones.
    inspect: bool = False
    # The camera faces forward: at each plant the rover turns this way to look at it. None: it does not turn.
    look: Literal["left", "right"] | None = None
    simulate: Literal["normal", "rain", "low_battery"] | None = None    # what a simulated rover meets; a real one ignores it

    @model_validator(mode="after")
    def _not_too_big(self) -> "MissionIn":
        if self.rows * self.cols > MAX_CELLS:
            raise ValueError(f"at most {MAX_CELLS} plants per round")
        if self.stops is not None:
            for r, c in self.stops:
                if not (0 <= r < self.rows and 0 <= c < self.cols):
                    raise ValueError(f"stop at row {r + 1}, spot {c + 1} is outside the {self.rows} x {self.cols} grid")
            self.stops = sorted(set(self.stops))
        return self


class EstopIn(BaseModel):
    engaged: bool


def sim_options(body: MissionIn) -> dict:
    """What the simulated rover meets, set about 40 % of the way along so the map shows both parts. The same block always
    gets the same plants (the seed); a real rover ignores all of this."""
    cells = len(body.stops) if body.stops else body.rows * body.cols
    sim: dict = {"seed": zlib.crc32(body.zone_id.encode()) % 1_000_000, "speedup": SIM_SPEEDUP}
    if body.simulate == "rain":
        sim["rainAtCell"] = max(2, round(cells * 0.4))
    elif body.simulate == "low_battery":
        sim["batteryV"] = round(SIM_STOP_V + SIM_DRAIN_V_PER_M * body.cell_m * max(1, round(cells * 0.4)), 3)
    return sim


@router.get("/live")
async def get_live():
    return live.snapshot()


@router.get("/live/frames/{row}/{col}")
async def get_frame(row: int, col: int):
    return {"frame": live.frames.get((row, col))}


@router.post("/estop")
async def estop(body: EstopIn):
    """Engage or release the e-stop on the rover itself. Retained, so a rover that reconnects stays stopped."""
    try:
        await publish(rover_topic(live.code, "estop"), {"estop": body.engaged}, retain=True)
    except BrokerDown as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"{exc}. The rover did not get this: use the red button on the rover.",
        ) from exc
    live.estop = body.engaged
    return {"estop": live.estop}


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_mission(body: MissionIn, db=Depends(get_db)):
    if live.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "The rover is already on a round.")
    if live.estop:
        raise HTTPException(status.HTTP_409_CONFLICT, "The e-stop is engaged. Release it first.")
    if live.status == "offline":
        raise HTTPException(status.HTTP_409_CONFLICT, "The rover is offline. Switch it on and wait for it to connect.")
    if await db.zones.find_one({"farmName": settings.farm_name, "zone": body.zone_id}) is None:
        raise NotFound(f"unknown bed {body.zone_id!r}")
    mission_id = str(uuid.uuid4())
    row_m = body.row_m or body.cell_m
    payload: dict = {
        "missionId": mission_id, "zoneId": body.zone_id, "rows": body.rows, "cols": body.cols,
        "cellM": body.cell_m, "rowM": row_m, "start": body.start, "along": body.along,
    }
    stops = [list(s) for s in body.stops] if body.stops is not None else None
    if stops is not None:
        payload["stops"] = stops
    if body.inspect:
        payload["inspect"] = True
    if body.look:
        payload["look"] = body.look
    if body.simulate is not None:
        payload["sim"] = sim_options(body)
    try:
        await publish(rover_topic(live.code, "mission/set"), payload)
    except BrokerDown as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    live.queued(mission_id, body.zone_id, body.rows, body.cols, body.cell_m, row_m, body.simulate,
                body.start, body.along, stops, inspect=body.inspect, look=body.look)
    return {"missionId": mission_id, "status": "queued"}


@router.get("")
async def list_surveys(zone: str | None = None, limit: int = 100, farm: str | None = None, db=Depends(get_db)):
    q: dict = {"farmName": farm or settings.farm_name}
    if zone:
        q["zone"] = zone
    limit = max(1, min(limit, 500))
    return await db.surveys.find(q, {"_id": 0, "cells": 0, "farmName": 0}).sort("startedAt", -1).limit(limit).to_list(length=limit)


@router.get("/{mission_id}")
async def get_survey(mission_id: str, farm: str | None = None, db=Depends(get_db)):
    doc = await db.surveys.find_one({"farmName": farm or settings.farm_name, "id": mission_id}, {"_id": 0, "farmName": 0})
    if doc is None:
        raise NotFound(f"unknown round {mission_id!r}")
    return doc
