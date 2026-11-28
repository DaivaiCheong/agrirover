"""The rover as the server sees it: its live state (in memory) and the rounds it reports (in MongoDB).

The rover agent (edge/rover-agent) talks MQTT:
    devices/rover-01/status          {"status": "online"|"offline", "estop": bool}   retained, last will = offline
    devices/rover-01/mission/state   progress while a round runs, then its summary   retained
    devices/rover-01/mission/result  the full report: summary + grid + cells
Nothing here pretends: until the rover says something its status is "unknown", and a round it never
answers is marked "lost" instead of staying "queued" for ever.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from app.services.tomato import cell_advice

QUEUED_TIMEOUT_S = 25.0      # the rover answers a new round within seconds when it is on
RUNNING_TIMEOUT_S = 180.0    # a running round reports after every tree


def _now() -> float:
    return time.monotonic()


class RoverLiveState:
    def __init__(self) -> None:
        self.code = "ROVER-01"
        self.status = "unknown"            # online | offline | unknown (never heard from)
        self.estop = False
        self.last_seen_at: str | None = None
        self.mission: dict | None = None
        self.frames: dict[tuple[int, int], str] = {}
        self._mission_touched = 0.0

    @property
    def running(self) -> bool:
        self._expire()
        return bool(self.mission and self.mission.get("status") in ("queued", "running"))

    def heard(self) -> None:
        self.last_seen_at = datetime.now(timezone.utc).isoformat()

    def queued(self, mission_id: str, zone_id: str, rows: int, cols: int, cell_m: float, row_m: float,
               simulate: str | None) -> None:
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
            "battery": None,
            "frame": None,
            "cellsScanned": 0,
            "cellsTotal": rows * cols,
            "simulate": simulate,
            "simulated": None,
            "cells": [],
        }
        self._mission_touched = _now()

    def update_mission(self, state: dict) -> None:
        """A mission/state message: progress, a rejection, or the final summary."""
        mission_id = state.get("missionId")
        if self.mission and mission_id and self.mission.get("missionId") not in (None, mission_id):
            # a retained state from an older round, delivered when we subscribe: keep it only if nothing is newer
            if self.mission.get("status") in ("queued", "running"):
                return
            self.mission = {"cells": []}
        merged = {**(self.mission or {"cells": []}), **state}
        if state.get("abortReason") and not merged.get("reason"):
            merged["reason"] = state["abortReason"]
        cell = state.get("cell")
        if isinstance(cell, list) and len(cell) == 2:
            if state.get("frame"):
                self.frames[(int(cell[0]), int(cell[1]))] = state["frame"]
        self.mission = merged
        self._mission_touched = _now()
        self.heard()

    def add_result_cells(self, report: dict) -> None:
        """The full report: keep its cells so the live view shows the whole block at the end."""
        if not self.mission or self.mission.get("missionId") != report.get("missionId"):
            return
        self.mission["cells"] = report.get("cells") or []
        for key in ("status", "cellsScanned", "plantsDetected", "cellsFlagged", "finishedAt"):
            if key in report:
                self.mission[key] = report[key]
        if report.get("abortReason"):
            self.mission["reason"] = report["abortReason"]

    def _expire(self) -> None:
        m = self.mission
        if not m:
            return
        idle = _now() - self._mission_touched
        if m.get("status") == "queued" and idle > QUEUED_TIMEOUT_S:
            m["status"] = "lost"
            m["reason"] = "no answer from the rover: is it switched on and connected to the farm Wi-Fi?"
        elif m.get("status") == "running" and idle > RUNNING_TIMEOUT_S:
            m["status"] = "lost"
            m["reason"] = "the rover stopped reporting during the round"

    def snapshot(self) -> dict:
        self._expire()
        return {
            "rover": {"code": self.code, "status": self.status, "estop": self.estop, "lastSeenAt": self.last_seen_at},
            "mission": self.mission,
        }


live = RoverLiveState()


def _grid(report: dict, key: str, default: Any = None) -> Any:
    if report.get(key) is not None:
        return report[key]
    return (report.get("grid") or {}).get(key, default)


async def store_survey_report(db: Any, farm_name: str, report: dict) -> str:
    """Save a round the rover reported. Accepts the agent's report (summary + grid + cells)."""
    now = datetime.now(timezone.utc).isoformat()
    sid = report.get("missionId") or f"round-{report['zoneId']}-{int(datetime.now().timestamp())}"
    zone_name = report["zoneId"]
    z_doc = await db.zones.find_one({"farmName": farm_name, "zone": zone_name}, {"_id": 0})
    cells = []
    for c in report.get("cells") or []:
        cell = {
            "row": int(c["row"]), "col": int(c["col"]), "plant": bool(c.get("plant")), "flagged": bool(c.get("flagged")),
            "readings": c.get("readings") or {}, "canopy": c.get("canopy"), "chlorosis": c.get("chlorosis"),
            "disease": c.get("disease"), "disease_confidence": c.get("disease_confidence"),
        }
        cell["advice"] = c.get("advice") or cell_advice(cell)
        cells.append(cell)
    cell_m = float(_grid(report, "cellM", 3.0) or 3.0)
    doc = {
        "id": sid,
        "farmName": farm_name,
        "zone": zone_name,
        "bedLabel": (z_doc or {}).get("label") or zone_name.upper(),
        "status": report.get("status", "completed"),
        "abortReason": report.get("abortReason") or report.get("reason"),
        "simulated": bool(report.get("simulated", False)),
        "rows": _grid(report, "rows"),
        "cols": _grid(report, "cols"),
        "cellM": cell_m,
        "rowM": _grid(report, "rowM", cell_m),
        "cellsScanned": len(cells),
        "plantsDetected": sum(1 for c in cells if c["plant"]),
        "cellsFlagged": sum(1 for c in cells if c["flagged"]),
        "distanceM": report.get("distanceM", round(len(cells) * cell_m, 1)),
        "estDurationS": report.get("estDurationS", len(cells) * 15),
        "startedAt": report.get("startedAt", now),
        "finishedAt": report.get("finishedAt", now),
        "cells": cells,
    }
    await db.surveys.update_one({"id": sid}, {"$set": doc}, upsert=True)
    return sid
