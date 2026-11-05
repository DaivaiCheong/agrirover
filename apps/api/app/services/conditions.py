"""What each bed's soil and air look like now, rated against guava's stage. Glue for the pure rules in guava.py.

Nothing is stored: a rating is worked out from the newest readings every time, so there is no alert table to go stale.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CropProfile, Farm, Metric, OrchardJobDone, Planting, SensorReading, Zone
from app.services import guava
from app.services.decisions import newest_readings
from app.services.errors import NotFound
from app.services.farm_data import active_plantings
from app.services.guava import Reading
from app.services.rule_engine import utcnow


@dataclass(frozen=True)
class BedSnapshot:
    zone: Zone
    readings: dict[str, Reading]              # newest reading of each metric
    planting: Planting | None
    crop: CropProfile | None
    day: int | None                           # cycle day, start day = 1; None with no open cycle
    farm_tz: str
    recent_min: float | None = None           # lowest moisture in the last 3 days: a jump from it splits fruit
    bagged: bool = False

    @property
    def stress(self) -> bool:
        return bool(self.planting and self.planting.regulation == "withhold")

    def assess(self, now: datetime) -> dict:
        fruit = float(self.planting.fruit_mm) if self.planting and self.planting.fruit_mm is not None else None
        return guava.rate_bed(self.readings, self.day, now=now, stress=self.stress, recent_min=self.recent_min,
                              fruit_mm=fruit, bagged=self.bagged)


def newest_per_metric(rows: list[tuple[str, float, datetime]]) -> dict[str, Reading]:
    """(metric, value, at) rows, possibly several per metric, to the newest Reading of each."""
    out: dict[str, Reading] = {}
    for metric, value, at in rows:
        if metric not in out or at > out[metric].at:
            out[metric] = Reading(float(value), at)
    return out


async def load_snapshots(session: AsyncSession, farm_name: str, now: datetime,
                         zone_name: str | None = None) -> list[BedSnapshot]:
    """One snapshot per bed of the farm (or just `zone_name`), in name order. Unknown farm -> none."""
    farm = (await session.execute(select(Farm).where(Farm.name == farm_name))).scalar_one_or_none()
    if farm is None:
        if zone_name is not None:
            raise NotFound(f"unknown bed {zone_name!r}")
        return []
    query = select(Zone).where(Zone.farm_id == farm.id).order_by(Zone.name)
    if zone_name is not None:
        query = query.where(Zone.name == zone_name)
    zones = (await session.execute(query)).scalars().all()
    if zone_name is not None and not zones:
        raise NotFound(f"unknown bed {zone_name!r}")
    ids = [z.id for z in zones]
    by_zone = await newest_readings(session, ids)
    plantings = await active_plantings(session, ids)
    today = now.astimezone(ZoneInfo(farm.timezone)).date()

    lows = dict((await session.execute(
        select(SensorReading.zone_id, func.min(SensorReading.value))
        .where(SensorReading.zone_id.in_(ids), SensorReading.metric == Metric.soil_moisture,
               SensorReading.recorded_at >= now - timedelta(days=3))
        .group_by(SensorReading.zone_id))).all()) if ids else {}
    bagged = set((await session.scalars(select(OrchardJobDone.planting_id).where(OrchardJobDone.job_id == "bag"))).all())

    out = []
    for z in zones:
        planting, crop = plantings.get(z.id, (None, None))
        low = lows.get(z.id)
        out.append(BedSnapshot(
            zone=z, readings=newest_per_metric(by_zone.get(z.id, [])), planting=planting, crop=crop,
            day=guava.days_between(planting.planted_on, today) if planting else None, farm_tz=farm.timezone,
            recent_min=None if low is None else float(low), bagged=bool(planting and planting.id in bagged)))
    return out


async def bed_conditions(session: AsyncSession, farm_name: str, now: datetime | None = None) -> list[dict]:
    now = now or utcnow()
    out = []
    for s in await load_snapshots(session, farm_name, now):
        known = [r.at for m, r in s.readings.items() if m in guava.META]
        out.append({
            "zone": s.zone.name, "label": s.zone.label, "areaM2": float(s.zone.area_m2) if s.zone.area_m2 else None,
            "crop": s.crop.slug if s.crop else None, "cropName": s.crop.common_name if s.crop else None,
            "variety": s.planting.variety if s.planting else None, "day": s.day,
            "recordedAt": max(known).isoformat() if known else None,
            **s.assess(now),
        })
    return out
