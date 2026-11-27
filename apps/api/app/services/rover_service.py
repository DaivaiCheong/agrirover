"""In-memory live mission progress + MongoDB survey storage."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


class RoverLiveState:
    def __init__(self) -> None:
        self.code = "ROVER-01"
        self.status = "online"
        self.estop = False
        self.mission: dict | None = None
        self.frames: dict[tuple[int, int], str] = {}

    @property
    def running(self) -> bool:
        return bool(self.mission and self.mission.get("status") in ("queued", "running"))

    def queued(self, mission_id: str, zone_id: str, rows: int, cols: int, cell_m: float, row_m: float, simulate: str | None) -> None:
        self.frames.clear()
        self.mission = {
            "missionId": mission_id,
            "zoneId": zone_id,
            "rows": rows,
            "cols": cols,
            "cellM": cell_m,
            "rowM": row_m,
            "status": "queued",
            "reason": None,
            "cell": None,
            "battery": 12.6,
            "frame": None,
            "cellsScanned": 0,
            "cellsTotal": rows * cols,
            "simulate": simulate,
            "simulated": simulate is not None,
            "cells": [],
        }

    def snapshot(self) -> dict:
        return {
            "rover": {"code": self.code, "status": self.status, "estop": self.estop},
            "mission": self.mission,
        }


live = RoverLiveState()


async def store_survey_report(db: Any, farm_name: str, report: dict) -> str:
    now = datetime.now(timezone.utc).isoformat()
    sid = report.get("missionId") or f"round-{report['zoneId']}-{int(datetime.now().timestamp())}"
    zone_name = report["zoneId"]
    z_doc = await db.zones.find_one({"farmName": farm_name, "zone": zone_name}, {"_id": 0})
    cells = report.get("cells", [])
    doc = {
        "id": sid,
        "farmName": farm_name,
        "zone": zone_name,
        "bedLabel": z_doc.get("label") if z_doc else zone_name.upper(),
        "status": report.get("status", "completed"),
        "abortReason": report.get("reason"),
        "simulated": bool(report.get("simulated", False)),
        "rows": report.get("rows"),
        "cols": report.get("cols"),
        "cellM": report.get("cellM", 3.0),
        "cellsScanned": len(cells),
        "plantsDetected": sum(1 for c in cells if c.get("plant")),
        "cellsFlagged": sum(1 for c in cells if c.get("flagged")),
        "distanceM": report.get("distanceM", round(len(cells) * float(report.get("cellM", 3.0)), 1)),
        "estDurationS": report.get("estDurationS", len(cells) * 15),
        "startedAt": report.get("startedAt", now),
        "finishedAt": report.get("finishedAt", now),
        "cells": cells,
    }
    await db.surveys.update_one({"id": sid}, {"$set": doc}, upsert=True)
    return sid
