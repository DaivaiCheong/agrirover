"""What the rover is doing right now, and storing what it finished.

Live state is in memory on purpose: it is rebuilt from the rover's own messages, the photos are only worth
keeping while someone is looking, and the rover's retained messages restore its status after a restart.
A finished survey goes to the database, and only if its bed exists: a survey of a sample-data bed is not saved.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Device, SurveyFinding, SurveyMission, Zone

log = logging.getLogger("rover")

ROVER_CODE = "ROVER-01"
RUNNING = {"queued", "running"}
FINAL = {"completed", "aborted", "failed", "rejected", "lost"}
SUMMARY_FIELDS = ("cellsScanned", "cellsTotal", "plantsDetected", "plantsNeedingWater", "cellsFlagged", "distanceM",
                  "estDurationS", "startedAt", "finishedAt")


def _cell_key(cell: dict) -> tuple[int, int] | None:
    row, col = cell.get("row"), cell.get("col")
    return (row, col) if isinstance(row, int) and isinstance(col, int) else None


@dataclass
class RoverLive:
    status: str = "unknown"                     # online | offline | unknown
    estop: bool = False
    mission: dict | None = None
    cells: dict[tuple[int, int], dict] = field(default_factory=dict)
    frames: dict[tuple[int, int], str] = field(default_factory=dict)

    def reset(self) -> None:
        self.status, self.estop, self.mission = "unknown", False, None
        self.cells, self.frames = {}, {}

    @property
    def running(self) -> bool:
        return self.mission is not None and self.mission["status"] in RUNNING

    def queued(self, mission_id: str, zone_id: str, rows: int, cols: int, cell_m: float, simulate: str | None) -> None:
        self.cells, self.frames = {}, {}
        self.mission = {"missionId": mission_id, "zoneId": zone_id, "rows": rows, "cols": cols, "cellM": cell_m,
                        "status": "queued", "reason": None, "cell": None, "battery": None, "frame": None,
                        "cellsScanned": 0, "cellsTotal": rows * cols, "simulate": simulate, "simulated": None}

    def on_status(self, payload: object) -> None:
        status = payload.get("status") if isinstance(payload, dict) else None
        if status not in ("online", "offline"):
            return
        self.status = status
        if isinstance(payload.get("estop"), bool):    # the rover's word beats what this server last asked for
            self.estop = payload["estop"]
        if status == "offline" and self.running:     # it went away mid-survey: nothing more is coming
            self.mission.update(status="lost", reason="link_lost")

    def on_state(self, payload: object) -> None:
        if not isinstance(payload, dict):
            return
        mission_id, status = payload.get("missionId"), payload.get("status")
        ours = self.mission is not None and self.mission["missionId"] == mission_id
        if status == "rejected":
            if ours:                                 # a refusal of another request must not end this survey
                self.mission.update(status="rejected", reason=payload.get("reason"))
            return
        if not ours:
            # After a server restart a survey still in progress is adopted; a finished one is only history.
            if status != "running" or not isinstance(payload.get("rows"), int) or not isinstance(payload.get("cols"), int):
                return
            self.queued(str(mission_id), str(payload.get("zoneId", "")), payload["rows"], payload["cols"],
                        float(payload.get("cellM", 0.5)), None)
        m = self.mission
        if status == "running":
            m["status"] = "running"
            for key in ("cell", "cellsScanned", "cellsTotal", "battery", "simulated"):
                if key in payload:
                    m[key] = payload[key]
            seen = payload.get("observation")
            if isinstance(seen, dict) and (key := _cell_key(seen)) is not None:
                self.cells[key] = seen
                if isinstance(payload.get("frame"), str):
                    self.frames[key] = payload["frame"]
                    m["frame"] = payload["frame"]
        elif status in FINAL:
            m.update(status=status, reason=payload.get("abortReason") or payload.get("reason"))
            m.update({k: payload[k] for k in SUMMARY_FIELDS if k in payload})

    def on_result(self, report: object) -> None:
        """The full report is the authority: it fills in anything lost on the way."""
        if not isinstance(report, dict) or self.mission is None or self.mission["missionId"] != report.get("missionId"):
            return
        for cell in report.get("cells") or []:
            if isinstance(cell, dict) and (key := _cell_key(cell)) is not None:
                self.cells[key] = cell

    def snapshot(self) -> dict:
        m = None
        if self.mission is not None:
            m = {**self.mission, "cells": [self.cells[k] for k in sorted(self.cells)]}
        return {"rover": {"code": ROVER_CODE, "status": self.status, "estop": self.estop}, "mission": m}


live = RoverLive()


def _when(text: object) -> datetime | None:
    try:
        return datetime.fromisoformat(str(text))
    except ValueError:
        return None


async def store_report(session: AsyncSession, report: object) -> bool:
    """Save one finished survey. False when it cannot belong to this farm (an unknown bed or a foreign id)."""
    if not isinstance(report, dict):
        return False
    try:
        mission_id = uuid.UUID(str(report.get("missionId")))
    except ValueError:
        return False
    zone = await session.scalar(select(Zone).where(Zone.name == str(report.get("zoneId"))))
    device = await session.scalar(select(Device).where(Device.code == ROVER_CODE))
    if zone is None or device is None or await session.get(SurveyMission, mission_id) is not None:
        return False
    grid = report.get("grid") if isinstance(report.get("grid"), dict) else {}
    session.add(SurveyMission(
        id=mission_id, zone_id=zone.id, device_id=device.id, status=str(report.get("status"))[:16],
        rows=grid.get("rows"), cols=grid.get("cols"), cell_m=grid.get("cellM"),
        abort_reason=(str(report["abortReason"])[:48] if report.get("abortReason") else None),
        cells_scanned=report.get("cellsScanned"), plants_detected=report.get("plantsDetected"),
        plants_needing_water=report.get("plantsNeedingWater"), cells_flagged=report.get("cellsFlagged"),
        distance_m=report.get("distanceM"), est_duration_s=report.get("estDurationS"),
        simulated=bool(report.get("simulated")),
        started_at=_when(report.get("startedAt")), completed_at=_when(report.get("finishedAt")),
    ))
    await session.flush()
    for cell in report.get("cells") or []:
        if not isinstance(cell, dict) or _cell_key(cell) is None:
            continue
        session.add(SurveyFinding(
            mission_id=mission_id, cell_row=cell["row"], cell_col=cell["col"],
            plant_present=bool(cell.get("plant")), needs_water=bool(cell.get("needs_water")),
            flagged=bool(cell.get("flagged")), yellowing=cell.get("chlorosis"), canopy=cell.get("canopy"),
            dryness=cell.get("dryness"), suggested_ml=cell.get("suggested_ml"),
            disease_code=cell.get("disease"), confidence=cell.get("disease_confidence"),
        ))
    await session.commit()
    return True
