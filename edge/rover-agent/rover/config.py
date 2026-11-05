"""Rover configuration. Defaults suit the prototype; deployment overrides come
from the environment (ROVER_*, MQTT_*), never from code."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default, cast=str):
    raw = os.environ.get(name)
    return default if raw in (None, "") else cast(raw)


@dataclass(frozen=True)
class DriveLimits:
    max_speed_mps: float = 0.30      # hard cap, whatever a mission asks for
    cruise_speed_mps: float = 0.20
    turn_rate_dps: float = 45.0
    max_segment_ms: int = 1500       # mirrors MAX_RUN_MS in the motor-controller firmware
    max_step_m: float = 1.0          # longest single move the agent will send


@dataclass(frozen=True)
class GuardLimits:
    battery_min_v: float = 11.1      # 3S pack: stop well before deep discharge
    mqtt_keepalive_s: int = 5        # a dead link is noticed within ~1.5x this


@dataclass(frozen=True)
class RoverConfig:
    device_code: str = "ROVER-01"
    farm_id: str = "farm-01"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    serial_port: str = "/dev/ttyUSB0"
    serial_baud: int = 115200
    capture_s: float = 1.0           # settle + photograph + analyse, per tree
    probe_s: float = 40.0            # lower the probe, let it settle, read, raise: an estimate until the arm is built
    report_dir: str = "reports"
    drive: DriveLimits = field(default_factory=DriveLimits)
    guard: GuardLimits = field(default_factory=GuardLimits)

    # ---- MQTT topics (the API and the dashboard use the same names) ----
    @property
    def _dev(self) -> str:
        return f"devices/{self.device_code.lower()}"

    @property
    def topic_mission_set(self) -> str:
        return f"{self._dev}/mission/set"

    @property
    def topic_mission_state(self) -> str:
        return f"{self._dev}/mission/state"

    @property
    def topic_mission_result(self) -> str:
        return f"{self._dev}/mission/result"

    @property
    def topic_estop(self) -> str:
        return f"{self._dev}/estop"

    @property
    def topic_status(self) -> str:
        return f"{self._dev}/status"

    @property
    def topic_farm_telemetry(self) -> str:
        return f"farm/{self.farm_id}/zone/+/telemetry"

    @classmethod
    def from_env(cls) -> "RoverConfig":
        return cls(
            device_code=_env("ROVER_DEVICE_CODE", "ROVER-01"),
            farm_id=_env("ROVER_FARM_ID", "farm-01"),
            mqtt_host=_env("MQTT_HOST", "localhost"),
            mqtt_port=_env("MQTT_PORT", 1883, int),
            mqtt_username=_env("MQTT_USERNAME", None),
            mqtt_password=_env("MQTT_PASSWORD", None),
            serial_port=_env("ROVER_SERIAL_PORT", "/dev/ttyUSB0"),
            serial_baud=_env("ROVER_SERIAL_BAUD", 115200, int),
            report_dir=_env("ROVER_REPORT_DIR", "reports"),
        )
