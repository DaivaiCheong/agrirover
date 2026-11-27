import json
import uuid
from typing import Literal

import aiomqtt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import settings
from app.core.db import get_db
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


@router.get("/live")
async def get_live():
    return live.snapshot()


@router.get("/live/frames/{row}/{col}")
async def get_frame(row: int, col: int):
    return {"frame": live.frames.get((row, col))}


@router.post("/estop")
async def estop(body: EstopIn):
    live.estop = body.engaged
    return {"estop": live.estop}


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_mission(body: MissionIn):
    if live.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "The rover is already on a round.")
    if live.estop:
        raise HTTPException(status.HTTP_409_CONFLICT, "E-stop is engaged.")
    mission_id = str(uuid.uuid4())
    row_m = body.row_m or body.cell_m
    payload = {
        "missionId": mission_id,
        "zoneId": body.zone_id,
        "rows": body.rows,
        "cols": body.cols,
        "cellM": body.cell_m,
        "rowM": row_m,
    }
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            username=settings.mqtt_username or None,
            password=settings.mqtt_password or None,
        ) as client:
            await client.publish("devices/rover-01/mission/set", json.dumps(payload), qos=1)
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"farm broker unreachable ({exc})") from exc
    live.queued(mission_id, body.zone_id, body.rows, body.cols, body.cell_m, row_m, body.simulate)
    return {"missionId": mission_id, "status": "queued"}


@router.get("")
async def list_surveys(farm: str | None = None, db=Depends(get_db)):
    fname = farm or settings.farm_name
    docs = await db.surveys.find(
        {"farmName": fname},
        {"_id": 0, "cells": 0, "farmName": 0},
    ).sort("startedAt", -1).limit(100).to_list(length=100)
    return docs


@router.get("/{mission_id}")
async def get_survey(mission_id: str, farm: str | None = None, db=Depends(get_db)):
    doc = await db.surveys.find_one({"farmName": farm or settings.farm_name, "id": mission_id}, {"_id": 0, "farmName": 0})
    if doc is None:
        raise NotFound(f"unknown round {mission_id!r}")
    return doc
