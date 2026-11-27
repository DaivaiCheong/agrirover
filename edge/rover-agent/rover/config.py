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
class Calibration:
    """How fast this chassis moves at pwm_cruise, measured on the floor with `python -m rover jog`.
    The rover drives by time, so these numbers are what make it stop at the right spot."""
    pwm_cruise: int = 150            # 0-255; the firmware never runs above 200
    mps_at_cruise: float = 0.20      # metres a second, driving straight
    dps_at_cruise: float = 45.0      # degrees a second, turning on the spot


def load_env_file(path: str = ".env") -> list[str]:
    """Read KEY=value lines into the environment, without overriding what is already set. For the rover's own
    settings file on the Pi; no extra package needed. Returns the keys it set."""
    if not os.path.isfile(path):
        return []
    added = []
    with open(path, encoding="utf-8-sig") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = (part.strip() for part in line.split("=", 1))
            value = value.split(" #", 1)[0].strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
                added.append(key)
    return added


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
    calibration: Calibration = field(default_factory=Calibration)

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
        # This program's own status. devices/rover-01/status belongs to the rover's ESP32 (its last will says offline
        # when the rover itself goes), so the brain never writes there: docs/architecture/rover-esp32.md
        return f"{self._dev}/brain/status"

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
            # 11.1 V suits a 3S pack; 6.6 a 2S pack. 0 turns the battery stop off: only when no divider is wired.
            guard=GuardLimits(battery_min_v=_env("ROVER_BATTERY_MIN_V", 11.1, float)),
            calibration=Calibration(pwm_cruise=_env("ROVER_PWM_CRUISE", 150, int),
                                    mps_at_cruise=_env("ROVER_MPS_AT_CRUISE", 0.20, float),
                                    dps_at_cruise=_env("ROVER_DPS_AT_CRUISE", 45.0, float)),
        )
