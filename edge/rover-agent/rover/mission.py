"""Survey mission: drive the serpentine path, photograph and analyse every cell,
report.

The runner never waters anything. Cells that need water become watering
*targets* in the report; the farm server turns them into proposals (trigger
`vision_target`) that a person approves, and execution then goes through the
same rule engine and firmware limits as every other irrigation.
"""
from __future__ import annotations

import logging
import re
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from rover.config import DriveLimits, RoverConfig
from rover.planner import Cell, path_stats, plan, serpentine
from rover.safety import Guards, SafetyStop
from rover.vision import DEFAULT_CALIBRATION, Calibration, Observation, analyze, with_disease

log = logging.getLogger("rover.mission")

MAX_CELLS = 400
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")     # also used as a folder name for reports


def _int(value, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    return value


@dataclass(frozen=True)
class MissionSpec:
    mission_id: str
    zone_id: str
    rows: int
    cols: int
    cell_m: float = 0.5

    @classmethod
    def from_payload(cls, payload: object, limits: DriveLimits) -> "MissionSpec":
        """Build and validate a spec from the JSON sent on mission/set."""
        if not isinstance(payload, dict):
            raise ValueError("mission must be a JSON object")
        try:
            cell = payload.get("cellM", 0.5)
            if isinstance(cell, bool) or not isinstance(cell, (int, float)):
                raise ValueError("cellM must be a number")
            spec = cls(mission_id=str(payload["missionId"]), zone_id=str(payload["zoneId"]),
                       rows=_int(payload["rows"], "rows"), cols=_int(payload["cols"], "cols"),
                       cell_m=float(cell))
        except KeyError as exc:
            raise ValueError(f"missing field {exc}") from None
        spec.validate(limits)
        return spec

    def validate(self, limits: DriveLimits) -> None:
        if not _ID.match(self.mission_id):
            raise ValueError("missionId must be 1-64 letters, digits, '-' or '_'")
        if not (1 <= len(self.zone_id) <= 64):
            raise ValueError("zoneId must be 1-64 characters")
        if not (1 <= self.rows <= 40 and 1 <= self.cols <= 40):
            raise ValueError("rows and cols must each be 1-40")
        if self.rows * self.cols > MAX_CELLS:
            raise ValueError(f"at most {MAX_CELLS} cells per mission")
        if not (0.2 <= self.cell_m <= limits.max_step_m):
            raise ValueError(f"cellM must be between 0.2 and {limits.max_step_m} m")


@dataclass(frozen=True)
class CellResult:
    row: int
    col: int
    obs: Observation

    def to_dict(self) -> dict:
        return {"row": self.row, "col": self.col, **asdict(self.obs)}


@dataclass
class MissionReport:
    mission_id: str
    zone_id: str
    device: str
    rows: int
    cols: int
    cell_m: float
    status: str                       # completed | aborted | failed
    abort_reason: str | None
    started_at: str
    finished_at: str
    distance_m: float
    drive_time_s: float
    est_duration_s: float
    path: list[tuple[int, int]]
    results: list[CellResult] = field(default_factory=list)

    @property
    def cells_scanned(self) -> int:
        return len(self.results)

    @property
    def plants_detected(self) -> int:
        return sum(r.obs.plant for r in self.results)

    @property
    def plants_needing_water(self) -> int:
        return sum(r.obs.needs_water for r in self.results)

    @property
    def cells_flagged(self) -> int:
        return sum(r.obs.flagged for r in self.results)

    @property
    def watering_targets(self) -> list[dict]:
        return [{"row": r.row, "col": r.col, "ml": r.obs.suggested_ml, "dryness": r.obs.dryness}
                for r in self.results if r.obs.needs_water]

    def summary(self) -> dict:
        """The fields the farm server stores in survey_mission."""
        return {
            "missionId": self.mission_id, "zoneId": self.zone_id, "status": self.status,
            "abortReason": self.abort_reason,
            "cellsScanned": self.cells_scanned, "cellsTotal": self.rows * self.cols,
            "plantsDetected": self.plants_detected,
            "plantsNeedingWater": self.plants_needing_water,
            "cellsFlagged": self.cells_flagged,
            "distanceM": round(self.distance_m, 2), "estDurationS": round(self.est_duration_s, 1),
            "startedAt": self.started_at, "finishedAt": self.finished_at,
        }

    def to_dict(self) -> dict:
        return {
            **self.summary(),
            "device": self.device,
            "grid": {"rows": self.rows, "cols": self.cols, "cellM": self.cell_m},
            "driveTimeS": round(self.drive_time_s, 1),
            "wateringTargets": self.watering_targets,
            "path": [list(p) for p in self.path],
            "cells": [r.to_dict() for r in self.results],
        }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class MissionRunner:
    def __init__(self, cfg: RoverConfig, drive, camera, guards: Guards | None = None,
                 cal: Calibration = DEFAULT_CALIBRATION, classifier=None,
                 on_frame: Callable | None = None):
        self.cfg, self.drive, self.camera = cfg, drive, camera
        self.guards = guards or Guards()
        self.cal, self.classifier, self.on_frame = cal, classifier, on_frame

    def _check(self) -> None:
        battery = self.drive.battery_v()
        if battery is not None:
            self.guards.battery_v = battery
        self.guards.check(self.cfg.guard)

    def run(self, spec: MissionSpec, on_progress: Callable[[dict], None] | None = None) -> MissionReport:
        path = serpentine(spec.rows, spec.cols)
        legs = plan(path, spec.cell_m)
        started = _now()
        # The real drive lives across missions: report this mission's share only.
        dist0 = float(getattr(self.drive, "distance_m", 0.0))
        time0 = float(getattr(self.drive, "elapsed_s", 0.0))
        results: list[CellResult] = []
        status, reason = "completed", None

        def progress(cell: Cell | None) -> None:
            if on_progress is None:
                return
            try:
                on_progress({"missionId": spec.mission_id, "status": "running",
                             "cell": None if cell is None else [cell.row, cell.col],
                             "cellsScanned": len(results), "cellsTotal": len(path)})
            except Exception:                  # noqa: BLE001 — a failed status message must not end the mission
                log.exception("progress callback failed")

        progress(None)
        try:
            for cell, leg in zip(path, legs):
                for move in leg:
                    self._check()
                    if move.kind == "turn":
                        self.drive.turn(move.value)
                    else:
                        self.drive.forward(move.value)
                self._check()
                img = self.camera.capture(cell)
                if self.on_frame is not None:
                    self.on_frame(cell, img)
                obs = analyze(img, self.cal)
                if obs.flagged and self.classifier is not None:
                    hit = self.classifier.classify(img)
                    if hit:
                        obs = with_disease(obs, *hit)
                results.append(CellResult(cell.row, cell.col, obs))
                progress(cell)
        except SafetyStop as stop:
            status, reason = "aborted", stop.reason
            log.warning("mission %s aborted: %s", spec.mission_id, stop.reason)
        except Exception as exc:               # noqa: BLE001 — camera / serial faults
            status, reason = "failed", f"error:{type(exc).__name__}"
            log.exception("mission %s failed", spec.mission_id)
        finally:
            self.drive.stop()                  # always end stopped

        drive_time = float(getattr(self.drive, "elapsed_s", 0.0)) - time0
        return MissionReport(
            mission_id=spec.mission_id, zone_id=spec.zone_id, device=self.cfg.device_code,
            rows=spec.rows, cols=spec.cols, cell_m=spec.cell_m,
            status=status, abort_reason=reason, started_at=started, finished_at=_now(),
            distance_m=float(getattr(self.drive, "distance_m", 0.0)) - dist0,
            drive_time_s=drive_time,
            est_duration_s=drive_time + len(results) * self.cfg.capture_s,
            path=[(c.row, c.col) for c in path], results=results,
        )


def planned_stats(spec: MissionSpec) -> dict:
    return path_stats(plan(serpentine(spec.rows, spec.cols), spec.cell_m))
