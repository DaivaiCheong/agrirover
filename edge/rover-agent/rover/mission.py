"""The daily round: drive to every tree, photograph it, read the soil probe and the air sensor, report.

The runner never waters or feeds anything, and it does not decide what a tree needs. It reports what it found; the
farm server works out the day's advice from the crop's stage, and a person acts on it.
"""
from __future__ import annotations

import logging
import re
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from rover.config import DriveLimits, RoverConfig
from rover.planner import ALONG, CORNERS, Cell, path_stats, plan, route, through_stops
from rover.probe import NoProbe
from rover.report import photo_jpeg, thumbnail
from rover.safety import Guards, SafetyStop
from rover.vision import DEFAULT_CALIBRATION, Calibration, Observation, analyze, with_disease

log = logging.getLogger("rover.mission")

MAX_CELLS = 400
MIN_SPACING_M, MAX_SPACING_M = 0.2, 10.0
LOOK = (None, "left", "right")
LOOK_TURN = {"left": 90.0, "right": -90.0}        # positive = left, counter-clockwise (planner)
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")     # also used as a folder name for reports


def _int(value, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    return value


@dataclass(frozen=True)
class SimOptions:
    """What a simulated rover meets. Only `run --sim-hardware` reads these; on the real rover they do nothing."""
    seed: int | None = None
    battery_v: float | None = None
    rain_at_cell: int | None = None     # rain starts as this many trees have been photographed
    speedup: float | None = None
    base: dict | None = None            # the readings the simulated trees vary around
    moisture_spread: float | None = None

    @classmethod
    def from_payload(cls, payload: object) -> "SimOptions | None":
        if payload is None:
            return None
        if not isinstance(payload, dict):
            raise ValueError("sim must be a JSON object")
        seed, rain = payload.get("seed"), payload.get("rainAtCell")
        battery, speedup = payload.get("batteryV"), payload.get("speedup")
        if seed is not None and _int(seed, "seed") < 0:
            raise ValueError("seed must not be negative")
        if rain is not None and not (1 <= _int(rain, "rainAtCell") <= MAX_CELLS):
            raise ValueError(f"rainAtCell must be 1-{MAX_CELLS}")
        for value, name, low, high in ((battery, "batteryV", 9.0, 13.0), (speedup, "speedup", 0.5, 100.0)):
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not (low <= value <= high):
                raise ValueError(f"{name} must be a number from {low} to {high}")
        base, spread = payload.get("base"), payload.get("moistureSpread")
        if base is not None and (not isinstance(base, dict) or not all(
                isinstance(k, str) and isinstance(v, (int, float)) and not isinstance(v, bool) for k, v in base.items())):
            raise ValueError("base must map reading names to numbers")
        if spread is not None and (isinstance(spread, bool) or not isinstance(spread, (int, float)) or not 0 <= spread <= 100):
            raise ValueError("moistureSpread must be a number from 0 to 100")
        return cls(seed, None if battery is None else float(battery), rain, None if speedup is None else float(speedup),
                   base, None if spread is None else float(spread))


@dataclass(frozen=True)
class MissionSpec:
    mission_id: str
    zone_id: str
    rows: int
    cols: int                           # trees in a row
    cell_m: float = 3.0                 # from tree to tree
    sim: SimOptions | None = None
    row_m: float | None = None          # between rows; the same as cell_m if not given
    start: str = "sw"                   # start corner: sw = row 1, tree 1 (planner.CORNERS)
    along: str = "rows"                 # lanes along the rows, or "across" them
    # The spots that hold a plant (a plant map): the rover stops at these only. None: every spot.
    stops: frozenset[Cell] | None = None
    inspect: bool = False               # send a photo of every plant, not only the yellowing ones
    # The camera faces forward. "left" / "right": the plants stand beside the lane, so at each stop the rover turns
    # 90 degrees toward the plant, photographs it and turns back. None: the camera sees the plant ahead / below.
    look: str | None = None

    @property
    def row_spacing(self) -> float:
        return self.row_m or self.cell_m

    def path(self) -> list[Cell]:
        """Every spot the rover drives through, in order: the whole route, or from the first plant to the last."""
        full = route(self.rows, self.cols, self.start, self.along)
        return full if self.stops is None else through_stops(full, self.stops)

    def stops_at(self, cell: Cell) -> bool:
        return self.stops is None or cell in self.stops

    @property
    def stop_count(self) -> int:
        return self.rows * self.cols if self.stops is None else len(self.stops)

    @classmethod
    def from_payload(cls, payload: object, limits: DriveLimits) -> "MissionSpec":
        """Build and validate a spec from the JSON sent on mission/set."""
        if not isinstance(payload, dict):
            raise ValueError("mission must be a JSON object")
        try:
            cell, row = payload.get("cellM", 3.0), payload.get("rowM")
            if isinstance(cell, bool) or not isinstance(cell, (int, float)):
                raise ValueError("cellM must be a number")
            if row is not None and (isinstance(row, bool) or not isinstance(row, (int, float))):
                raise ValueError("rowM must be a number")
            start, along = payload.get("start", "sw"), payload.get("along", "rows")
            stops = payload.get("stops")
            if stops is not None:
                if not isinstance(stops, list) or not all(isinstance(s, list) and len(s) == 2 for s in stops):
                    raise ValueError("stops must be a list of [row, col]")
                stops = frozenset(Cell(_int(r, "stop row"), _int(c, "stop col")) for r, c in stops)
            spec = cls(mission_id=str(payload["missionId"]), zone_id=str(payload["zoneId"]),
                       rows=_int(payload["rows"], "rows"), cols=_int(payload["cols"], "cols"),
                       cell_m=float(cell), sim=SimOptions.from_payload(payload.get("sim")),
                       row_m=None if row is None else float(row),
                       start=start if isinstance(start, str) else repr(start),
                       along=along if isinstance(along, str) else repr(along), stops=stops,
                       inspect=payload.get("inspect", False), look=payload.get("look"))
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
        for name, value in (("cellM", self.cell_m), ("rowM", self.row_spacing)):
            if not (MIN_SPACING_M <= value <= MAX_SPACING_M):
                raise ValueError(f"{name} must be between {MIN_SPACING_M} and {MAX_SPACING_M} m")
        if self.start not in CORNERS:
            raise ValueError(f"start must be one of {', '.join(CORNERS)}")
        if self.along not in ALONG:
            raise ValueError(f"along must be one of {', '.join(ALONG)}")
        if not isinstance(self.inspect, bool):
            raise ValueError("inspect must be true or false")
        if self.look not in LOOK:
            raise ValueError("look must be left, right or left out")
        if self.stops is not None:
            if not self.stops:
                raise ValueError("stops must name at least one spot")
            if any(not (0 <= s.row < self.rows and 0 <= s.col < self.cols) for s in self.stops):
                raise ValueError("every stop must be on the grid")


@dataclass(frozen=True)
class CellResult:
    row: int
    col: int
    obs: Observation
    readings: dict = field(default_factory=dict)      # the soil probe and the air sensor at this tree

    def to_dict(self) -> dict:
        o = asdict(self.obs)
        return {"row": self.row, "col": self.col, "plant": o["plant"], "canopy": o["canopy"], "chlorosis": o["chlorosis"],
                "flagged": o["flagged"], "disease": o["disease"], "disease_confidence": o["disease_confidence"],
                "readings": self.readings}


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
    simulated: bool = False
    row_m: float | None = None
    start: str = "sw"
    along: str = "rows"
    stops: list[tuple[int, int]] | None = None
    cells_total: int | None = None

    @property
    def cells_scanned(self) -> int:
        return len(self.results)

    @property
    def plants_detected(self) -> int:
        return sum(r.obs.plant for r in self.results)

    @property
    def cells_flagged(self) -> int:
        return sum(r.obs.flagged for r in self.results)

    def summary(self) -> dict:
        """The fields the farm server stores in survey_mission."""
        return {
            "missionId": self.mission_id, "zoneId": self.zone_id, "status": self.status,
            "abortReason": self.abort_reason, "simulated": self.simulated,
            "cellsScanned": self.cells_scanned, "cellsTotal": self.cells_total or self.rows * self.cols,
            "plantsDetected": self.plants_detected,
            "cellsFlagged": self.cells_flagged,
            "distanceM": round(self.distance_m, 2), "estDurationS": round(self.est_duration_s, 1),
            "startedAt": self.started_at, "finishedAt": self.finished_at,
        }

    def to_dict(self) -> dict:
        return {
            **self.summary(),
            "device": self.device,
            "grid": {"rows": self.rows, "cols": self.cols, "cellM": self.cell_m, "rowM": self.row_m or self.cell_m,
                     "start": self.start, "along": self.along,
                     "stops": None if self.stops is None else [list(s) for s in self.stops]},
            "driveTimeS": round(self.drive_time_s, 1),
            "path": [list(p) for p in self.path],
            "cells": [r.to_dict() for r in self.results],
        }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class MissionRunner:
    def __init__(self, cfg: RoverConfig, drive, camera, guards: Guards | None = None,
                 cal: Calibration = DEFAULT_CALIBRATION, classifier=None,
                 on_frame: Callable | None = None, simulated: bool = False, probe=None, photos_real: bool = False):
        """`photos_real`: the camera's pictures are real plants even though the rover is simulated (rehearsing with
        a folder of leaf photos), so the farm server should check them."""
        self.cfg, self.drive, self.camera = cfg, drive, camera
        self.probe = probe or NoProbe()
        self.guards = guards or Guards()
        self.cal, self.classifier, self.on_frame = cal, classifier, on_frame
        self.simulated = simulated
        self.photos_real = photos_real

    def _check(self) -> None:
        battery = self.drive.battery_v()
        if battery is not None:
            self.guards.battery_v = battery
        self.guards.check(self.cfg.guard)

    def run(self, spec: MissionSpec, on_progress: Callable[[dict], None] | None = None) -> MissionReport:
        path = spec.path()
        legs = plan(path, spec.cell_m, row_m=spec.row_spacing, max_step_m=self.cfg.drive.max_step_m)
        started = _now()
        # The real drive lives across missions: report this mission's share only.
        dist0 = float(getattr(self.drive, "distance_m", 0.0))
        time0 = float(getattr(self.drive, "elapsed_s", 0.0))
        results: list[CellResult] = []
        status, reason = "completed", None

        stops = None if spec.stops is None else [[c.row, c.col] for c in path if c in spec.stops]

        def progress(cell: Cell | None, img=None, seen: bool = False) -> None:
            if on_progress is None:
                return
            try:
                state = {"missionId": spec.mission_id, "status": "running", "zoneId": spec.zone_id,
                         "rows": spec.rows, "cols": spec.cols, "cellM": spec.cell_m, "rowM": spec.row_spacing,
                         "start": spec.start, "along": spec.along, "stops": stops, "simulated": self.simulated,
                         "photosReal": self.photos_real, "inspect": spec.inspect, "look": spec.look,
                         "cell": None if cell is None else [cell.row, cell.col],
                         "cellsScanned": len(results), "cellsTotal": spec.stop_count, "battery": self.drive.battery_v()}
                if seen and results and cell is not None:      # what the camera just saw, for whoever is watching
                    state["observation"] = results[-1].to_dict()
                    state["frame"] = thumbnail(img)
                    # every plant on an inspection round, else yellow leaves only: a photo the farm server can check
                    if spec.inspect or results[-1].obs.flagged:
                        state["photo"] = photo_jpeg(img)
                on_progress(state)
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
                if not spec.stops_at(cell):    # an empty spot on the way to the next plant: drive on, no photo
                    progress(cell)
                    continue
                self._check()
                if spec.look:                  # the camera faces forward: face the plant beside the lane
                    self.drive.turn(LOOK_TURN[spec.look])
                img = self.camera.capture(cell)
                if self.on_frame is not None:
                    self.on_frame(cell, img)
                if spec.look:                  # and back along the lane, in place, before the next leg
                    self.drive.turn(-LOOK_TURN[spec.look])
                obs = analyze(img, self.cal)
                if obs.flagged and self.classifier is not None:
                    hit = self.classifier.classify(img)
                    if hit:
                        obs = with_disease(obs, *hit)
                # no tree, nothing to read: the probe stays up
                readings = self.probe.read(cell) if obs.plant else {}
                results.append(CellResult(cell.row, cell.col, obs, readings))
                progress(cell, img, seen=True)
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
            est_duration_s=drive_time + sum(self.cfg.capture_s + (self.cfg.probe_s if r.obs.plant else 0) for r in results),
            path=[(c.row, c.col) for c in path], results=results, simulated=self.simulated, row_m=spec.row_spacing,
            start=spec.start, along=spec.along, stops=stops and [tuple(s) for s in stops], cells_total=spec.stop_count,
        )


def planned_stats(spec: MissionSpec) -> dict:
    return path_stats(plan(spec.path(), spec.cell_m, row_m=spec.row_spacing))
