"""
Irrigation rule engine.

This is the only place that decides to put water on the ground. It runs on the
Raspberry Pi beside the database, but it is deliberately NOT the last line of
defence: the ESP8266 firmware enforces its own maximum run time, so a fault
here cannot hold a valve open.

Decision order matters and is fixed:
    1. rule disabled            -> stop
    2. rain lockout             -> defer   (the farmer's own requirement)
    3. outside daylight window  -> defer   (the pump is 6 V solar)
    4. moisture above threshold -> stop
    5. cooldown not elapsed     -> suppress
    6. forecast says rain soon  -> defer
    7. otherwise                -> irrigate, bounded
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from zoneinfo import ZoneInfo


class Decision(str, Enum):
    IRRIGATE = "irrigate"
    HOLD_IN_RANGE = "hold_in_range"
    HOLD_DISABLED = "hold_disabled"
    DEFER_RAIN = "defer_rain"
    DEFER_DARK = "defer_dark"
    DEFER_FORECAST = "defer_forecast"
    SUPPRESS_COOLDOWN = "suppress_cooldown"


@dataclass(frozen=True)
class RuleInput:
    moisture_pct: float | None
    rain_detected: bool
    now: datetime
    last_event_ended_at: datetime | None
    rain_forecast_pct: int | None = None


@dataclass(frozen=True)
class RuleConfig:
    enabled: bool = True
    moisture_threshold_pct: float = 30.0
    stop_above_pct: float = 45.0
    max_duration_ms: int = 90_000
    cooldown_minutes: int = 30
    rain_lockout: bool = True
    daylight_only: bool = True
    daylight_start_h: int = 6
    daylight_end_h: int = 17
    forecast_defer_pct: int | None = 70
    # The daylight window is in the FARM's local time, not the server's: the
    # API runs in Docker (UTC), where 06-17 would mean 13:00-24:00 in Cambodia.
    farm_tz: str = "Asia/Phnom_Penh"


@dataclass(frozen=True)
class RuleOutput:
    decision: Decision
    duration_ms: int = 0
    reason: str = ""

    @property
    def should_irrigate(self) -> bool:
        return self.decision is Decision.IRRIGATE


# Deficit below threshold -> run time. Bounded by the rule, then bounded again
# by firmware. Linear is deliberate: it is explainable to the farmer.
_MS_PER_DEFICIT_POINT = 4_000
_MIN_RUN_MS = 5_000


def evaluate(cfg: RuleConfig, sig: RuleInput) -> RuleOutput:
    if not cfg.enabled:
        return RuleOutput(Decision.HOLD_DISABLED, reason="rule_disabled")

    if sig.moisture_pct is None:
        return RuleOutput(Decision.HOLD_IN_RANGE, reason="no_reading")

    # 2 — rain lockout. A wet sensor beats every other consideration.
    if cfg.rain_lockout and sig.rain_detected:
        return RuleOutput(Decision.DEFER_RAIN, reason="rain_lockout")

    # 3 — the pump is solar; running it after dark drains the battery.
    if cfg.daylight_only:
        hour = sig.now.astimezone(ZoneInfo(cfg.farm_tz)).hour
        if not (cfg.daylight_start_h <= hour < cfg.daylight_end_h):
            return RuleOutput(Decision.DEFER_DARK, reason="outside_daylight_window")

    # 4 — already wet enough.
    if sig.moisture_pct >= cfg.moisture_threshold_pct:
        return RuleOutput(Decision.HOLD_IN_RANGE, reason="within_range")

    # 5 — do not oscillate around the threshold.
    if sig.last_event_ended_at is not None:
        elapsed = sig.now - sig.last_event_ended_at
        if elapsed < timedelta(minutes=cfg.cooldown_minutes):
            return RuleOutput(Decision.SUPPRESS_COOLDOWN, reason="cooldown_active")

    # 6 — advisory only; an unreachable forecast never blocks watering.
    if (
        cfg.forecast_defer_pct is not None
        and sig.rain_forecast_pct is not None
        and sig.rain_forecast_pct >= cfg.forecast_defer_pct
    ):
        return RuleOutput(Decision.DEFER_FORECAST, reason="rain_forecast")

    deficit = cfg.moisture_threshold_pct - sig.moisture_pct
    duration = int(max(_MIN_RUN_MS, deficit * _MS_PER_DEFICIT_POINT))
    duration = min(duration, cfg.max_duration_ms)
    return RuleOutput(Decision.IRRIGATE, duration_ms=duration, reason="auto_threshold")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
