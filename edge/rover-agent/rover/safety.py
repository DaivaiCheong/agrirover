"""Rover safety. The same idea as the farm's irrigation control: each layer is
simpler than the one above it and can stop it.

1. Motor-controller firmware  bounds every run in time, stops on a lost serial
                              link or a bumper hit. Nothing on the Pi can override it.
2. Command clamps (here)      bound speed, step length and segment duration
                              before a command leaves the Pi.
3. Mission guards (here)      checked before every move and every photo:
                              e-stop, rain, low battery, lost farm link.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from rover.config import DriveLimits, GuardLimits


class SafetyStop(Exception):
    """Raised to end a mission. The rover is always stopped afterwards."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def clamp_speed(requested_mps: float, limits: DriveLimits) -> float:
    return max(0.0, min(requested_mps, limits.max_speed_mps))


def check_step(metres: float, limits: DriveLimits) -> None:
    if metres <= 0 or metres > limits.max_step_m:
        raise SafetyStop("step_out_of_bounds")


def split_duration(total_ms: int, max_segment_ms: int) -> list[int]:
    """Split a run into segments the firmware accepts (each <= max_segment_ms),
    as even as possible so the rover does not jerk on a short final segment."""
    if total_ms <= 0:
        return []
    n = math.ceil(total_ms / max_segment_ms)
    base, rem = divmod(total_ms, n)
    return [base + (1 if i < rem else 0) for i in range(n)]


@dataclass
class Guards:
    """Live abort conditions. Written by the MQTT link (or a test), read by the
    mission runner. Plain attribute writes; the runner only ever reads them."""
    estop: bool = False
    rain: bool = False
    link_ok: bool = True
    battery_v: float | None = None

    def check(self, limits: GuardLimits) -> None:
        if self.estop:
            raise SafetyStop("estop")
        if not self.link_ok:
            raise SafetyStop("link_lost")
        if self.rain:
            raise SafetyStop("rain")         # wet soil compacts; keep the electronics dry
        if self.battery_v is not None and self.battery_v < limits.battery_min_v:
            raise SafetyStop("battery_low")
