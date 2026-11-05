"""Drive back-ends. The mission runner only ever calls forward / turn / stop.

SimDrive     kinematic simulation with the same limits as the real rover, so a
             mission that passes in simulation asks the hardware for nothing
             it would refuse.
SerialDrive  the real rover, through the motor controller over USB serial
             (protocol in rover/protocol.py). Dead reckoning for now; wheel
             encoders / IMU are on the roadmap.
"""
from __future__ import annotations

import itertools
import math
import time
from collections.abc import Callable
from dataclasses import dataclass

from rover import protocol
from rover.config import DriveLimits
from rover.planner import wrap_deg
from rover.safety import SafetyStop, check_step, clamp_speed, split_duration


@dataclass(frozen=True)
class Pose:
    x: float
    y: float
    heading: float = 0.0


class SimDrive:
    def __init__(self, limits: DriveLimits, start: Pose,
                 fence: tuple[float, float] | None = None,
                 battery_v: float = 12.6,
                 drain_v_per_m: float = 0.005,   # invented: the real drain is unknown until the chassis runs
                 drain_v_per_90deg: float = 0.002,
                 sleep: Callable[[float], None] | None = None):
        self.limits = limits
        self._sleep = sleep          # e.g. time.sleep for a real-time demo; None = instant
        self.pose = start
        self.fence = fence            # (width_m, length_m) the rover centre must stay inside
        self._battery = battery_v
        self._drain_m = drain_v_per_m
        self._drain_turn = drain_v_per_90deg
        self.elapsed_s = 0.0
        self.distance_m = 0.0
        self.stops = 0

    def forward(self, metres: float) -> None:
        check_step(metres, self.limits)
        speed = clamp_speed(self.limits.cruise_speed_mps, self.limits)
        rad = math.radians(self.pose.heading)
        x = self.pose.x + metres * math.cos(rad)
        y = self.pose.y + metres * math.sin(rad)
        if self.fence is not None:
            width, length = self.fence
            eps = 1e-6
            if not (-eps <= x <= width + eps and -eps <= y <= length + eps):
                raise SafetyStop("geofence")      # refuse the move; do not make it
        self._wait(metres / speed)
        self.pose = Pose(x, y, self.pose.heading)
        self.distance_m += metres
        self._battery -= self._drain_m * metres

    def turn(self, degrees: float) -> None:
        self._wait(abs(degrees) / self.limits.turn_rate_dps)
        self.pose = Pose(self.pose.x, self.pose.y, wrap_deg(self.pose.heading + degrees))
        self._battery -= self._drain_turn * abs(degrees) / 90.0

    def _wait(self, seconds: float) -> None:
        self.elapsed_s += seconds
        if self._sleep is not None:
            self._sleep(seconds)

    def stop(self) -> None:
        self.stops += 1

    def battery_v(self) -> float | None:
        return self._battery


class SerialDrive:
    """Talks to edge/rover-motor-controller. Every run is split into segments
    the firmware will accept, and each segment must be acknowledged and then
    reported finished; anything else ends the mission."""

    NORMAL_END = {"elapsed"}

    def __init__(self, limits: DriveLimits, port: str | None = None, baud: int = 115200,
                 ser=None, pwm_cruise: int = 150, mps_at_cruise: float = 0.20,
                 dps_at_cruise: float = 45.0, clock=time.monotonic):
        if ser is None:
            import serial                      # pyserial — only needed on the rover
            ser = serial.Serial(port, baud, timeout=0.05)
            time.sleep(2.0)                    # opening the port resets an Arduino Nano/Uno
            ser.reset_input_buffer()
        self._ser = ser
        self._clock = clock
        self._seq = itertools.count(1)
        self.limits = limits
        # Calibrate once on the bed: measure metres/second and degrees/second at pwm_cruise.
        self._pwm, self._mps, self._dps = pwm_cruise, mps_at_cruise, dps_at_cruise
        if self._mps > limits.max_speed_mps:   # never faster than the cap
            self._pwm = int(self._pwm * limits.max_speed_mps / self._mps)
            self._dps *= limits.max_speed_mps / self._mps
            self._mps = limits.max_speed_mps
        self._battery: float | None = None
        self.elapsed_s = 0.0
        self.distance_m = 0.0

    # ---- transport ----
    def _send(self, line: str) -> None:
        self._ser.write(line.encode("ascii"))

    def _await(self, seq: int, want: str, timeout_s: float) -> None:
        deadline = self._clock() + timeout_s
        while self._clock() < deadline:
            raw = self._ser.readline()
            if not raw:
                continue
            try:
                f = protocol.parse(raw.decode("ascii", "replace"))
            except protocol.FrameError:
                continue                       # line noise; the firmware still bounds the run
            if f[0] == "BAT" and len(f) == 2 and f[1].isdigit():
                self._battery = int(f[1]) / 1000.0
                continue
            if len(f) < 2 or f[1] != str(seq):
                continue
            if f[0] == "NAK":
                raise SafetyStop(f"controller_nak:{f[2] if len(f) > 2 else 'unknown'}")
            if f[0] == "DONE" and want == "DONE":
                reason = f[2] if len(f) > 2 else "unknown"
                if reason not in self.NORMAL_END:
                    raise SafetyStop(f"controller_{reason}")
                return
            if f[0] == want:
                return
        raise SafetyStop("controller_timeout")

    def _run(self, left: int, right: int, ms: int) -> None:
        for segment in split_duration(ms, self.limits.max_segment_ms):
            seq = next(self._seq)
            self._send(protocol.drv(seq, left, right, segment))
            self._await(seq, "ACK", 0.5)
            self._await(seq, "DONE", segment / 1000 + 1.0)
            self.elapsed_s += segment / 1000

    # ---- drive interface ----
    def forward(self, metres: float) -> None:
        check_step(metres, self.limits)
        self._run(self._pwm, self._pwm, round(metres / self._mps * 1000))
        self.distance_m += metres

    def turn(self, degrees: float) -> None:
        ms = round(abs(degrees) / self._dps * 1000)
        if ms == 0:
            return
        left = -self._pwm if degrees > 0 else self._pwm   # left turn: left wheel back
        self._run(left, -left, ms)

    def stop(self) -> None:
        try:
            self._send(protocol.stop(next(self._seq)))
        except Exception:                      # noqa: BLE001 — best effort; firmware stops by itself
            pass

    def battery_v(self) -> float | None:
        return self._battery
