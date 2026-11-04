"""Per-zone decisions for the day.

Glue between stored data and the rule engine. The engine stays the only thing
that decides; this module only gathers its inputs, words its output, and keeps a
record of what it said.

The decision is taken at the farm's 06:00 (local), so the daily message is
about the coming day. Moisture comes from the zone's deciding probe (the deeper
one); other depths are recorded but never trigger watering.
"""
from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import Boolean, Enum as SAEnum, column, or_, select, true, values
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import (DailyDecision, Farm, IrrigationEvent, IrrigationRule, Metric, Sensor,
                                 SensorReading, Zone)
from app.services.farm_data import active_plantings
from app.services.metrics import SOIL_PROBE_METRICS
from app.services.rule_engine import Decision, RuleConfig, RuleInput, evaluate
from app.services.water_plan import crop_day

DECISION_HOUR_LOCAL = 6

# What a farmer reads instead of an engine code.
REASON_TEXT = {
    "within_range": "soil is wet enough",
    "rain_lockout": "it is raining",
    "outside_daylight_window": "too dark to run the pump",
    "cooldown_active": "watered recently",
    "rain_forecast": "rain is forecast",
    "no_reading": "no sensor reading",
    "rule_disabled": "rule is switched off",
}


@dataclass(frozen=True)
class ZoneDecision:
    zone: str
    decision: Decision
    duration_ms: int
    reason: str
    moisture_pct: float | None
    decision_at: datetime
    label: str | None = None          # "Tomato bed A"
    planting_day: int | None = None   # day 21 of the crop
    arm: str | None = None            # trial arm: guided | usual | None
    zone_id: object = None
    day: date | None = None           # farm-local date of the decision
    inputs: dict = field(default_factory=dict)

    @property
    def name(self) -> str:
        base = self.label or self.zone
        if self.planting_day is None:
            return base
        return f"{base} (day {self.planting_day})" if self.planting_day >= 1 else f"{base} (not planted yet)"

    @property
    def text(self) -> str:
        """The line the farmer reads: 'Tomato bed A (day 21): water 40 s' or '...: skip, it is raining'."""
        if self.decision is Decision.IRRIGATE:
            return f"{self.name}: water {round(self.duration_ms / 1000)} s"
        return f"{self.name}: skip, {REASON_TEXT.get(self.reason, self.reason.replace('_', ' '))}"


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
           now: datetime, last_event_ended_at: datetime | None, **extra) -> ZoneDecision:
    out = evaluate(cfg, RuleInput(moisture_pct=moisture, rain_detected=rain, now=now,
                                  last_event_ended_at=last_event_ended_at))
    return ZoneDecision(zone=zone, decision=out.decision, duration_ms=out.duration_ms,
                        reason=out.reason, moisture_pct=moisture, decision_at=now, **extra)


async def deciding_sensors(session: AsyncSession, zone_ids: list) -> dict:
    """{zone_id: (sensor_id, code)} for each zone's deciding probe."""
    if not zone_ids:
        return {}
    rows = (await session.execute(
        select(Sensor.zone_id, Sensor.id, Sensor.code)
        .where(Sensor.zone_id.in_(zone_ids), Sensor.used_for_decision.is_(True)))).all()
    return {zone_id: (sid, code) for zone_id, sid, code in rows}


async def newest_readings(session: AsyncSession, zone_ids: list) -> dict:
    """{zone_id: [(metric, value, recorded_at), ...]}: the newest reading of each metric of each zone.
    What the soil probe measures (moisture, pH, EC, temperature, N, P, K) is taken only from the zone's
    deciding probe, when it has one; air, rain and supply readings belong to the node.

    One index lookup per (zone, metric), newest first, stops at the first row: the cost does not grow with
    the history. (A DISTINCT ON over the whole table took 5 s with a week of simulator data.)"""
    if not zone_ids:
        return {}
    deciding = await deciding_sensors(session, zone_ids)
    zones = values(column("zone_id", PGUUID(as_uuid=True)), column("deciding_id", PGUUID(as_uuid=True)), name="zs").data(
        [(z, deciding[z][0] if z in deciding else None) for z in zone_ids])
    kinds = values(column("metric", SAEnum(Metric, name="metric_type", create_type=False)),
                   column("is_probe", Boolean), name="mt").data([(m, m in SOIL_PROBE_METRICS) for m in Metric])
    newest = (select(SensorReading.value.label("value"), SensorReading.recorded_at.label("recorded_at"))
              .where(SensorReading.zone_id == zones.c.zone_id, SensorReading.metric == kinds.c.metric,
                     or_(kinds.c.is_probe.is_(False), zones.c.deciding_id.is_(None),
                         SensorReading.sensor_id == zones.c.deciding_id))
              .order_by(SensorReading.recorded_at.desc()).limit(1).lateral("newest"))
    rows = (await session.execute(
        select(zones.c.zone_id, kinds.c.metric, newest.c.value, newest.c.recorded_at)
        .select_from(zones).join(kinds, true()).join(newest, true()))).all()
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
    today = at.astimezone(ZoneInfo(farm.timezone)).date()

    zones = (await session.execute(
        select(Zone).where(Zone.farm_id == farm.id).options(selectinload(Zone.rule))
        .order_by(Zone.name))).scalars().all()
    zone_ids = [z.id for z in zones]
    by_zone = await newest_readings(session, zone_ids)
    sensors = await deciding_sensors(session, zone_ids)

    plantings = await active_plantings(session, zone_ids)

    out: list[ZoneDecision] = []
    for z in zones:
        last_end = (await session.execute(
            select(IrrigationEvent.ended_at).where(IrrigationEvent.zone_id == z.id,
                                                   IrrigationEvent.ended_at.is_not(None))
            .order_by(IrrigationEvent.ended_at.desc()).limit(1))).scalar_one_or_none()
        cfg = config_from_rule(z.rule, farm.timezone) if z.rule else RuleConfig(farm_tz=farm.timezone)
        moisture, rain = latest_signal(by_zone.get(z.id, []))
        planting, crop = plantings.get(z.id, (None, None))
        day = crop_day(planting.planted_on, today) if planting else None      # planting day = day 1
        inputs = {"moisture_pct": moisture, "sensor": sensors[z.id][1] if z.id in sensors else None,
                  "rain": rain, "threshold_pct": cfg.moisture_threshold_pct,
                  "planting_day": day, "crop": crop.common_name if crop else None}
        out.append(decide(z.name, cfg, moisture=moisture, rain=rain, now=at, last_event_ended_at=last_end,
                          label=z.label, planting_day=day, arm=z.trial_arm.value if z.trial_arm else None,
                          zone_id=z.id, day=today, inputs=inputs))
    return out


async def record_decisions(session: AsyncSession, farm_name: str,
                           now: datetime | None = None) -> list[tuple[ZoneDecision, DailyDecision]]:
    """Decide for every zone and keep one DailyDecision row per zone per day (committed).
    Running again the same day refreshes the row, unless a proposal was already sent for it:
    what the farmer saw is not rewritten."""
    out = []
    for d in await decisions_for_farm(session, farm_name, now):
        row = (await session.execute(select(DailyDecision).where(
            DailyDecision.zone_id == d.zone_id, DailyDecision.decision_date == d.day))).scalar_one_or_none()
        if row is None:
            row = DailyDecision(zone_id=d.zone_id, decision_date=d.day, decided_at=d.decision_at,
                                decision=d.decision.value, reason=d.reason,
                                duration_s=round(d.duration_ms / 1000), inputs=json.dumps(d.inputs, default=str))
            session.add(row)
        elif row.proposal_id is None:
            row.decided_at, row.decision, row.reason = d.decision_at, d.decision.value, d.reason
            row.duration_s, row.inputs = round(d.duration_ms / 1000), json.dumps(d.inputs, default=str)
        out.append((d, row))
    await session.commit()
    return out
