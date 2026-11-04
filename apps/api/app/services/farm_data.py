"""Loaders shared by routers and services."""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import CropProfile, Farm, FarmSetting, Planting, Zone
from app.services.crop_guide import stage_of
from app.services.crops import water_data
from app.services.errors import NotFound
from app.services.water_plan import crop_day


def as_uuid(value: str, what: str = "record") -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise NotFound(f"{what} not found") from None


async def farm_settings(session: AsyncSession, farm: Farm) -> FarmSetting:
    row = await session.get(FarmSetting, farm.id)
    if row is None:
        row = FarmSetting(farm_id=farm.id)
        session.add(row)
        await session.flush()
    return row


async def load_cycle(session: AsyncSession, farm: Farm, cycle_id: str):
    """(Planting, Zone, CropProfile) of one of this farm's cycles."""
    row = (await session.execute(
        select(Planting, Zone, CropProfile)
        .join(Zone, Planting.zone_id == Zone.id).join(CropProfile, Planting.crop_id == CropProfile.id)
        .where(Planting.id == as_uuid(cycle_id, "cycle"), Zone.farm_id == farm.id))).first()
    if row is None:
        raise NotFound("cycle not found")
    return row


def cycle_dict(p: Planting, zone: Zone, crop: CropProfile, today: date) -> dict:
    day = crop_day(p.planted_on, today) if p.ended_on is None else None
    cw = water_data(crop)
    stage = stage_of(cw, day) if cw else None
    return {
        "id": str(p.id), "zone": zone.name, "bedLabel": zone.label or zone.name,
        "trialArm": zone.trial_arm.value if zone.trial_arm else None,
        "crop": crop.slug, "cropName": crop.common_name, "variety": p.variety,
        "plantedOn": p.planted_on.isoformat(), "endedOn": p.ended_on.isoformat() if p.ended_on else None,
        "status": "active" if p.ended_on is None else "closed",
        "day": day, "stage": stage[0] if stage else None, "stageTitle": stage[1] if stage else None,
        "plantCount": p.plant_count, "areaM2": float(p.area_m2) if p.area_m2 is not None else None,
    }
