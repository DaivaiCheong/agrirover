import uuid
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


class MissionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    zone_id: str = Field(alias="zoneId", min_length=1, max_length=64)
    rows: int = Field(ge=1, le=40)
    cols: int = Field(ge=1, le=40)
    cell_m: float = Field(default=3.0, alias="cellM", ge=0.2, le=10.0)
    row_m: float | None = Field(default=None, alias="rowM", ge=0.2, le=10.0)
    simulate: Literal["normal", "rain", "low_battery"] | None = None

    @model_validator(mode="after")
    def _not_too_big(self) -> "MissionIn":
        if self.rows * self.cols > MAX_CELLS:
            raise ValueError(f"at most {MAX_CELLS} plants per round")
        return self


class EstopIn(BaseModel):
    engaged: bool


def sim_options(simulate: str | None, cells: int) -> dict | None:
    """What the simulated rover meets. The real rover ignores this; the simulator reads it."""
    if simulate == "rain":
        return {"rainAtCell": max(1, cells // 2)}
    if simulate == "low_battery":
        return {"batteryV": 11.25}
    return None


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
        "missionId": mission_id,
        "zoneId": body.zone_id,
        "rows": body.rows,
        "cols": body.cols,
        "cellM": body.cell_m,
        "rowM": row_m,
    }
    sim = sim_options(body.simulate, body.rows * body.cols)
    if sim:
        payload["sim"] = sim
    try:
        await publish(rover_topic(live.code, "mission/set"), payload)
    except BrokerDown as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    live.queued(mission_id, body.zone_id, body.rows, body.cols, body.cell_m, row_m, body.simulate)
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
