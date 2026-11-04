"""Per-zone decisions for the day.

Glue between stored data and the rule engine. The engine stays the only thing
that decides; this module only gathers its inputs and words its output.

The decision is taken at the farm's 06:00 (local), so the daily message is
about the coming day. Moisture is the newest reading for the zone.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import Farm, IrrigationEvent, IrrigationRule, SensorReading, Zone
from app.services.rule_engine import Decision, RuleConfig, RuleInput, evaluate

DECISION_HOUR_LOCAL = 6


@dataclass(frozen=True)
class ZoneDecision:
    zone: str
    decision: Decision
    duration_ms: int
    reason: str
    moisture_pct: float | None
    decision_at: datetime

    @property
    def text(self) -> str:
        """The line the farmer reads: 'zone-b: water 40 s' or 'zone-c: skip (reason)'."""
        if self.decision is Decision.IRRIGATE:
            return f"{self.zone}: water {round(self.duration_ms / 1000)} s"
        return f"{self.zone}: skip ({self.reason})"


def decision_instant(farm_tz: str, now: datetime) -> datetime:
    """Today's DECISION_HOUR_LOCAL in the farm's timezone, as an aware UTC datetime."""
    tz = ZoneInfo(farm_tz)
    local_today: date = now.astimezone(tz).date()
    return datetime.combine(local_today, time(DECISION_HOUR_LOCAL), tzinfo=tz).astimezone(timezone.utc)


def config_from_rule(rule: IrrigationRule, farm_tz: str) -> RuleConfig:
    return RuleConfig(
        enabled=rule.enabled,
        moisture_threshold_pct=float(rule.moisture_threshold_pct),
        stop_above_pct=float(rule.stop_above_pct),
        max_duration_ms=int(rule.max_duration_ms),
        cooldown_minutes=int(rule.cooldown_minutes),
        rain_lockout=rule.rain_lockout,
        daylight_only=rule.daylight_only,
        daylight_start_h=int(rule.daylight_start_h),
        daylight_end_h=int(rule.daylight_end_h),
        farm_tz=farm_tz,
    )


def latest_signal(rows: Iterable[tuple[str, float, datetime]]) -> tuple[float | None, bool]:
    """(moisture %, rain now?) from (metric, value, recorded_at) rows of one zone."""
    latest: dict[str, tuple[float, datetime]] = {}
    for metric, value, at in rows:
        if metric not in latest or at > latest[metric][1]:
            latest[metric] = (float(value), at)
    moisture = latest.get("soil_moisture", (None, None))[0]
    rain = bool(latest.get("rain", (0, None))[0])
    return moisture, rain


def decide(zone: str, cfg: RuleConfig, *, moisture: float | None, rain: bool,
           now: datetime, last_event_ended_at: datetime | None) -> ZoneDecision:
    out = evaluate(cfg, RuleInput(moisture_pct=moisture, rain_detected=rain, now=now,
                                  last_event_ended_at=last_event_ended_at))
    return ZoneDecision(zone=zone, decision=out.decision, duration_ms=out.duration_ms,
                        reason=out.reason, moisture_pct=moisture, decision_at=now)


async def newest_readings(session: AsyncSession, zone_ids: list) -> dict:
    """{zone_id: [(metric, value, recorded_at), ...]} with the newest reading per metric."""
    if not zone_ids:
        return {}
    rows = (await session.execute(
        select(SensorReading.zone_id, SensorReading.metric, SensorReading.value, SensorReading.recorded_at)
        .where(SensorReading.zone_id.in_(zone_ids))
        .distinct(SensorReading.zone_id, SensorReading.metric)          # Postgres DISTINCT ON
        .order_by(SensorReading.zone_id, SensorReading.metric, SensorReading.recorded_at.desc())
    )).all()
    out: dict = {}
    for zone_id, metric, value, at in rows:
        out.setdefault(zone_id, []).append((metric.value, float(value), at))
    return out


async def decisions_for_farm(session: AsyncSession, farm_name: str,
                             now: datetime | None = None) -> list[ZoneDecision]:
    now = now or datetime.now(timezone.utc)
    farm = (await session.execute(select(Farm).where(Farm.name == farm_name))).scalar_one_or_none()
    if farm is None:
        return []
    at = decision_instant(farm.timezone, now)

    zones = (await session.execute(
        select(Zone).where(Zone.farm_id == farm.id).options(selectinload(Zone.rule))
        .order_by(Zone.name))).scalars().all()
    zone_ids = [z.id for z in zones]

    by_zone = await newest_readings(session, zone_ids)

    out: list[ZoneDecision] = []
    for z in zones:
        last_end = (await session.execute(
            select(IrrigationEvent.ended_at).where(IrrigationEvent.zone_id == z.id,
                                                   IrrigationEvent.ended_at.is_not(None))
            .order_by(IrrigationEvent.ended_at.desc()).limit(1))).scalar_one_or_none()
        cfg = config_from_rule(z.rule, farm.timezone) if z.rule else RuleConfig(farm_tz=farm.timezone)
        moisture, rain = latest_signal(by_zone.get(z.id, []))
        out.append(decide(z.name, cfg, moisture=moisture, rain=rain, now=at,
                          last_event_ended_at=last_end))
    return out
