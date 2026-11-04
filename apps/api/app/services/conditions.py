"""What each bed's soil and air look like right now, rated against its crop's stage.

Glue between stored data and the pure engine in agronomy.py, the way decisions.py is glue for the
irrigation engine. Nothing is stored: a rating is worked out from the newest readings every time, so
there is no alert table to go stale and the readings stay the single source of truth.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CropProfile, Farm, Planting, Zone
from app.services import agronomy
from app.services.agronomy import Assessment, Reading
from app.services.decisions import newest_readings
from app.services.errors import NotFound
from app.services.farm_data import active_plantings
from app.services.rule_engine import utcnow
from app.services.water_plan import crop_day


@dataclass(frozen=True)
class BedSnapshot:
    zone: Zone
    readings: dict[str, Reading]              # newest reading of each metric
    planting: Planting | None
    crop: CropProfile | None
    day: int | None                           # crop day, planting day = 1; None with no open cycle
    farm_tz: str

    def assess(self, now: datetime) -> Assessment:
        # a crop row with no slug has no stage table either: unrated, not "nothing planted"
        crop = (self.crop.slug or "unknown") if self.crop else None
        return agronomy.assess(self.readings, crop=crop, day=self.day, now=now, farm_tz=self.farm_tz)


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

    out = []
    for z in zones:
        planting, crop = plantings.get(z.id, (None, None))
        out.append(BedSnapshot(
            zone=z, readings=newest_per_metric(by_zone.get(z.id, [])), planting=planting, crop=crop,
            day=crop_day(planting.planted_on, today) if planting else None, farm_tz=farm.timezone))
    return out


async def bed_conditions(session: AsyncSession, farm_name: str, now: datetime | None = None) -> list[dict]:
    now = now or utcnow()
    out = []
    for s in await load_snapshots(session, farm_name, now):
        newest = max((r.at for r in s.readings.values()), default=None)
        out.append({
            "zone": s.zone.name, "label": s.zone.label, "areaM2": float(s.zone.area_m2) if s.zone.area_m2 else None,
            "crop": s.crop.slug if s.crop else None, "cropName": s.crop.common_name if s.crop else None,
            "variety": s.planting.variety if s.planting else None, "day": s.day,
            "recordedAt": newest.isoformat() if newest else None,
            **s.assess(now).to_dict(),
        })
    return out
