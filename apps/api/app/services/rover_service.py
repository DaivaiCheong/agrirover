"""The rover as the server sees it: its live state (in memory) and the rounds it reports (in MongoDB).

The rover agent (edge/rover-agent) talks MQTT:
    devices/rover-01/status          {"status": "online"|"offline", "estop": bool}   retained, last will = offline
    devices/rover-01/mission/state   progress after every plant (with what it saw there), then its summary   retained
    devices/rover-01/mission/result  the full report: summary + grid + cells
Nothing here pretends: until the rover says something its status is "unknown", a round it never answers is marked
"lost" instead of staying "queued" for ever, and a rover that drops off the broker mid-round loses its round.
Live state stays in memory on purpose: it is rebuilt from the rover's own messages (the retained ones restore it after a
restart), and the photos are only worth keeping while someone is looking. A finished round goes to MongoDB.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from app.services.tomato import PARAM_META, cell_advice

ROVER_CODE = "ROVER-01"
RUNNING = {"queued", "running"}
FINAL = {"completed", "aborted", "failed", "rejected", "lost"}
CORNERS = ("sw", "se", "nw", "ne")            # the route's start corner and lanes, as rover/planner.py names them
ALONG = ("rows", "across")
SUMMARY_FIELDS = ("cellsScanned", "cellsTotal", "plantsDetected", "cellsFlagged", "distanceM", "estDurationS", "startedAt", "finishedAt")
QUEUED_TIMEOUT_S = 25.0      # the rover answers a new round within seconds when it is on
RUNNING_TIMEOUT_S = 180.0    # a running round reports after every plant


def _now() -> float:
    return time.monotonic()


def _cell_key(cell: dict) -> tuple[int, int] | None:
    row, col = cell.get("row"), cell.get("col")
    return (row, col) if isinstance(row, int) and isinstance(col, int) else None


class RoverLiveState:
    def __init__(self) -> None:
        self.code = ROVER_CODE
        self.status = "unknown"            # online | offline | unknown (never heard from)
        self.estop = False
        self.last_seen_at: str | None = None
        self.mission: dict | None = None
        self.cells: dict[tuple[int, int], dict] = {}     # what the rover saw at each plant of the current round
        self.frames: dict[tuple[int, int], str] = {}
        self._mission_touched = 0.0

    @property
    def running(self) -> bool:
        self._expire()
        return bool(self.mission and self.mission.get("status") in RUNNING)

    def heard(self) -> None:
        self.last_seen_at = datetime.now(timezone.utc).isoformat()

    def queued(self, mission_id: str, zone_id: str, rows: int, cols: int, cell_m: float, row_m: float, simulate: str | None,
               start: str = "sw", along: str = "rows", stops: list[list[int]] | None = None, *, inspect: bool = False,
               look: str | None = None) -> None:
        self.cells, self.frames = {}, {}
        self.mission = {
            "missionId": mission_id, "zoneId": zone_id, "rows": rows, "cols": cols, "cellM": cell_m, "rowM": row_m,
            "start": start, "along": along, "stops": stops, "inspect": inspect, "look": look,
            "status": "queued", "reason": None, "cell": None, "battery": None, "frame": None,
            "cellsScanned": 0, "cellsTotal": len(stops) if stops else rows * cols, "simulate": simulate, "simulated": None,
        }
        self._mission_touched = _now()

    # ---- what the rover says --------------------------------------------------------------------------------------
    def on_status(self, payload: object) -> None:
        status = payload.get("status") if isinstance(payload, dict) else None
        if status not in ("online", "offline"):
            return
        self.status = status
        if isinstance(payload.get("estop"), bool):    # the rover's word beats what this server last asked for
            self.estop = payload["estop"]
        self.heard()
        if status == "offline" and self.mission and self.mission.get("status") in RUNNING:
            self.mission.update(status="lost", reason="link_lost")

    def on_state(self, payload: object) -> None:
        if not isinstance(payload, dict):
            return
        mission_id, status = payload.get("missionId"), payload.get("status")
        ours = self.mission is not None and self.mission.get("missionId") == mission_id
        self.heard()
        if status == "rejected":
            if ours:                                 # a refusal of another request must not end this round
                self.mission.update(status="rejected", reason=payload.get("reason"))
                self._mission_touched = _now()
            return
        if not ours:
            # after a server restart a round still in progress is adopted; a finished one is only shown as the last round
            if status == "running" and isinstance(payload.get("rows"), int) and isinstance(payload.get("cols"), int):
                start, along, stops = payload.get("start"), payload.get("along"), payload.get("stops")
                stops = [s for s in stops if isinstance(s, list) and len(s) == 2 and all(isinstance(v, int) for v in s)] \
                    if isinstance(stops, list) else None
                self.queued(str(mission_id), str(payload.get("zoneId", "")), payload["rows"], payload["cols"],
                            float(payload.get("cellM", 3.0)), float(payload.get("rowM", 3.0)), None,
                            start if start in CORNERS else "sw", along if along in ALONG else "rows", stops or None,
                            inspect=payload.get("inspect") is True,
                            look=payload.get("look") if payload.get("look") in ("left", "right") else None)
            elif status in FINAL and (self.mission is None or self.mission.get("status") not in RUNNING):
                self.cells, self.frames = {}, {}
                self.mission = {k: v for k, v in payload.items() if k not in ("photo", "frame", "observation")}
                self.mission.setdefault("reason", payload.get("abortReason"))
                return
            else:
                return
        m = self.mission
        if status == "running":
            m["status"] = "running"
            for key in ("cell", "cellsScanned", "cellsTotal", "battery", "simulated", "rows", "cols", "cellM", "rowM"):
                if key in payload:
                    m[key] = payload[key]
            seen = payload.get("observation")
            key = _cell_key(seen) if isinstance(seen, dict) else None
            if key is not None:
                old = self.cells.get(key) or {}
                self.cells[key] = {**seen, "check": old["check"]} if "check" in old else seen
            cell = payload.get("cell")
            frame_key = key or (tuple(cell) if isinstance(cell, list) and len(cell) == 2 else None)
            if isinstance(payload.get("frame"), str) and frame_key is not None:
                self.frames[frame_key] = payload["frame"]
                m["frame"] = payload["frame"]
        elif status in FINAL:
            m.update(status=status, reason=payload.get("abortReason") or payload.get("reason"))
            m.update({k: payload[k] for k in SUMMARY_FIELDS if k in payload})
        self._mission_touched = _now()

    def on_result(self, report: object) -> None:
        """The full report is the authority: it fills in anything lost on the way. A photo check already made stays."""
        if not isinstance(report, dict) or self.mission is None or self.mission.get("missionId") != report.get("missionId"):
            return
        for cell in report.get("cells") or []:
            if isinstance(cell, dict) and (key := _cell_key(cell)) is not None:
                old = self.cells.get(key) or {}
                self.cells[key] = {**cell, "check": old["check"]} if "check" in old else cell
        for key in ("status", *SUMMARY_FIELDS):
            if key in report:
                self.mission[key] = report[key]
        if report.get("abortReason"):
            self.mission["reason"] = report["abortReason"]

    def set_check(self, mission_id: str, key: tuple[int, int], check: dict) -> None:
        """What the photo check said about a plant on this round (services/rover_photos.py)."""
        if self.mission is None or self.mission.get("missionId") != mission_id:
            return
        self.cells[key] = {**self.cells.get(key, {"row": key[0], "col": key[1]}), "check": check}

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
        mission = None
        if self.mission is not None:
            mission = {**self.mission, "cells": [dict(self.cells[k]) for k in sorted(self.cells)]}
        return {
            "rover": {"code": self.code, "status": self.status, "estop": self.estop, "lastSeenAt": self.last_seen_at},
            "mission": mission,
        }


live = RoverLiveState()


def _grid(report: dict, key: str, default: Any = None) -> Any:
    if report.get(key) is not None:
        return report[key]
    return (report.get("grid") or {}).get(key, default)


def bed_means(cells: list[dict]) -> dict[str, float]:
    """The average of each reading over the plants that gave one."""
    known = {m[0] for m in PARAM_META}
    totals: dict[str, list[float]] = {}
    for cell in cells:
        for metric, value in (cell.get("readings") or {}).items():
            if metric in known and isinstance(value, (int, float)) and not isinstance(value, bool):
                totals.setdefault(metric, []).append(float(value))
    return {m: sum(v) / len(v) for m, v in totals.items()}


async def store_survey_report(db: Any, farm_name: str, report: dict) -> str:
    """Save a round the rover reported, and put the bed's averages into the telemetry history (so the rover feeds the
    bed's charts). Accepts the agent's report (summary + grid + cells)."""
    now = datetime.now(timezone.utc).isoformat()
    sid = report.get("missionId") or f"round-{report['zoneId']}-{int(datetime.now().timestamp())}"
    zone_name = report["zoneId"]
    z_doc = await db.zones.find_one({"farmName": farm_name, "zone": zone_name}, {"_id": 0})
    cells = []
    for c in report.get("cells") or []:
        if not isinstance(c, dict) or _cell_key(c) is None:
            continue
        cell = {
            "row": int(c["row"]), "col": int(c["col"]), "plant": bool(c.get("plant")), "flagged": bool(c.get("flagged")),
            "readings": c.get("readings") or {}, "canopy": c.get("canopy"), "chlorosis": c.get("chlorosis"),
            "disease": c.get("disease"), "disease_confidence": c.get("disease_confidence"),
        }
        cell["advice"] = c.get("advice") or cell_advice(cell)
        cells.append(cell)
    cell_m = float(_grid(report, "cellM", 3.0) or 3.0)
    finished = report.get("finishedAt", now)
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
        "stops": report.get("stops"),
        "inspect": bool(report.get("inspect")),
        "cellsScanned": len(cells),
        "plantsDetected": sum(1 for c in cells if c["plant"]),
        "cellsFlagged": sum(1 for c in cells if c["flagged"]),
        "distanceM": report.get("distanceM", round(len(cells) * cell_m, 1)),
        "estDurationS": report.get("estDurationS", len(cells) * 15),
        "startedAt": report.get("startedAt", now),
        "finishedAt": finished,
        "cells": cells,
    }
    await db.surveys.update_one({"id": sid}, {"$set": doc}, upsert=True)
    if z_doc is not None:
        means = bed_means(cells)
        await db.telemetry.delete_many({"farmName": farm_name, "missionId": sid})     # a report sent twice counts once
        if means:
            await db.telemetry.insert_many([
                {"farmName": farm_name, "zone": zone_name, "metric": m, "ts": finished, "value": round(v, 3),
                 "quality": "valid", "source": "rover", "missionId": sid}
                for m, v in means.items()
            ])
    return sid
