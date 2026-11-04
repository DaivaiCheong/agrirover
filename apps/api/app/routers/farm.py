from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import CropProfile, Farm
from app.routers._deps import farm_dep, farm_settings
from app.services import crops as crop_svc

router = APIRouter(tags=["farm"])


class SettingsIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    khr_per_usd: float | None = Field(None, gt=0, le=100_000)
    family_wage_usd_per_day: float | None = Field(None, ge=0, le=10_000)
    water_cost_per_m3_usd: float | None = Field(None, ge=0, le=1_000)
    land_rent_usd_per_ha_year: float | None = Field(None, ge=0, le=1_000_000)
    irrigation_efficiency: float | None = Field(None, gt=0, le=1)


def _num(v):
    return None if v is None else float(v)


def _settings_dict(s) -> dict:
    return {"khrPerUsd": _num(s.khr_per_usd), "rateConfirmed": s.rate_confirmed,
            "familyWageUsdPerDay": _num(s.family_wage_usd_per_day),
            "waterCostPerM3Usd": _num(s.water_cost_per_m3_usd),
            "landRentUsdPerHaYear": _num(s.land_rent_usd_per_ha_year),
            "irrigationEfficiency": _num(s.irrigation_efficiency)}


@router.get("/farm/settings")
async def get_settings(farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    row = await farm_settings(session, farm)
    await session.commit()
    return _settings_dict(row)


@router.put("/farm/settings")
async def put_settings(body: SettingsIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    """Only the fields sent are changed. Saving the exchange rate marks it as confirmed."""
    row = await farm_settings(session, farm)
    for name in body.model_fields_set:
        value = getattr(body, name)
        if value is not None:
            setattr(row, name, value)
    if body.khr_per_usd is not None:
        row.rate_confirmed = True
    await session.commit()
    return _settings_dict(row)


class KcIn(BaseModel):
    ini: float = Field(gt=0, le=2)
    mid: float = Field(gt=0, le=2)
    end: float = Field(gt=0, le=2)


class CropIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(min_length=2, max_length=80)
    kc: KcIn
    stage_days: list[int] = Field(min_length=4, max_length=4)
    source: str | None = Field(None, max_length=200)


@router.get("/crops")
async def list_crops(session: AsyncSession = Depends(get_db)):
    rows = (await session.execute(select(CropProfile).order_by(CropProfile.common_name))).scalars().all()
    return [crop_svc.crop_dict(r) for r in rows if r.slug]


@router.post("/crops", status_code=201)
async def add_crop(body: CropIn, session: AsyncSession = Depends(get_db)):
    row = await crop_svc.create_crop(session, body.name, body.kc.model_dump(), body.stage_days, body.source)
    return crop_svc.crop_dict(row)
