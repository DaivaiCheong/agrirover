from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import CropProfile, Farm, Planting, Zone
from app.routers._deps import farm_dep
from app.services import crops as crop_svc
from app.services.clock import farm_today
from app.services.errors import Conflict, Invalid, NotFound
from app.services.water_plan import crop_day

router = APIRouter(prefix="/cycles", tags=["cycles"])


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CycleIn(_Camel):
    zone: str
    crop: str
    planted_on: date
    plant_count: int | None = Field(None, gt=0, le=1_000_000)
    area_m2: float | None = Field(None, gt=0, le=1_000_000)
    variety: str | None = Field(None, max_length=80)


class CyclePatch(_Camel):
    planted_on: date | None = None
    plant_count: int | None = Field(None, gt=0, le=1_000_000)
    area_m2: float | None = Field(None, gt=0, le=1_000_000)
    variety: str | None = Field(None, max_length=80)


class CloseIn(_Camel):
    ended_on: date | None = None


def cycle_dict(p: Planting, zone: Zone, crop: CropProfile, today: date) -> dict:
    return {
        "id": str(p.id), "zone": zone.name, "bedLabel": zone.label or zone.name,
        "trialArm": zone.trial_arm.value if zone.trial_arm else None,
        "crop": crop.slug, "cropName": crop.common_name, "variety": p.variety,
        "plantedOn": p.planted_on.isoformat(), "endedOn": p.ended_on.isoformat() if p.ended_on else None,
        "status": "active" if p.ended_on is None else "closed",
        "day": crop_day(p.planted_on, today) if p.ended_on is None else None,
        "plantCount": p.plant_count, "areaM2": float(p.area_m2) if p.area_m2 is not None else None,
    }


async def load_cycle(session: AsyncSession, farm: Farm, cycle_id: str):
    try:
        row = (await session.execute(
            select(Planting, Zone, CropProfile)
            .join(Zone, Planting.zone_id == Zone.id).join(CropProfile, Planting.crop_id == CropProfile.id)
            .where(Planting.id == cycle_id, Zone.farm_id == farm.id))).first()
    except Exception:                                  # a malformed id
        raise NotFound("cycle not found") from None
    if row is None:
        raise NotFound("cycle not found")
    return row


@router.get("")
async def list_cycles(today: date | None = None, farm: Farm = Depends(farm_dep),
                      session: AsyncSession = Depends(get_db)):
    today = today or farm_today()
    rows = (await session.execute(
        select(Planting, Zone, CropProfile)
        .join(Zone, Planting.zone_id == Zone.id).join(CropProfile, Planting.crop_id == CropProfile.id)
        .where(Zone.farm_id == farm.id).order_by(Planting.planted_on.desc(), Zone.name))).all()
    return [cycle_dict(p, z, c, today) for p, z, c in rows]


@router.post("", status_code=201)
async def create_cycle(body: CycleIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    zone = (await session.execute(select(Zone).where(Zone.farm_id == farm.id, Zone.name == body.zone))).scalar_one_or_none()
    if zone is None:
        raise NotFound(f"unknown bed {body.zone!r}")
    crop = await crop_svc.get_crop(session, body.crop)
    open_one = (await session.execute(select(Planting).where(
        Planting.zone_id == zone.id, Planting.ended_on.is_(None)))).first()
    if open_one:
        raise Conflict(f"{zone.label or zone.name} already has an open cycle; close it first")
    p = Planting(zone_id=zone.id, crop_id=crop.id, planted_on=body.planted_on, plant_count=body.plant_count,
                 area_m2=body.area_m2, variety=body.variety)
    session.add(p)
    if zone.crop_id is None:
        zone.crop_id = crop.id
    await session.commit()
    return cycle_dict(p, zone, crop, farm_today())


@router.patch("/{cycle_id}")
async def update_cycle(cycle_id: str, body: CyclePatch, farm: Farm = Depends(farm_dep),
                       session: AsyncSession = Depends(get_db)):
    p, zone, crop = await load_cycle(session, farm, cycle_id)
    for name in body.model_fields_set:
        value = getattr(body, name)
        if value is not None:
            setattr(p, name, value)
    await session.commit()
    return cycle_dict(p, zone, crop, farm_today())


@router.post("/{cycle_id}/close")
async def close_cycle(cycle_id: str, body: CloseIn, farm: Farm = Depends(farm_dep),
                      session: AsyncSession = Depends(get_db)):
    p, zone, crop = await load_cycle(session, farm, cycle_id)
    if p.ended_on is not None:
        raise Conflict("this cycle is already closed")
    ended = body.ended_on or farm_today()
    if ended < p.planted_on:
        raise Invalid("a cycle cannot end before it was planted")
    p.ended_on = ended
    await session.commit()
    return cycle_dict(p, zone, crop, farm_today())
