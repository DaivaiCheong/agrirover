from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.entities import CropProfile, Farm, Harvest, Planting, Sale, Zone
from app.routers._deps import farm_dep
from app.services import cost
from app.services import crops as crop_svc
from app.services import guava
from app.services.clock import farm_today
from app.services.cop_report import build_cop
from app.services.errors import Conflict, Invalid, NotFound
from app.services.farm_data import as_uuid, cycle_dict, farm_settings, load_cycle

router = APIRouter(tags=["cycles"])
Currency = Literal["USD", "KHR"]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


METHOD_IDS = tuple(m["id"] for m in guava.METHODS)


def _check_setup(setup_id: str | None) -> None:
    if setup_id is not None and setup_id not in guava.SETUP_BY_ID:
        raise Invalid(f"unknown setup {setup_id!r}; choose one of {', '.join(guava.SETUP_BY_ID)}")


class CycleIn(_Camel):
    zone: str
    crop: str = guava.SLUG
    planted_on: date                                                               # the day this cycle starts
    trees_planted_on: date | None = None
    regulation: str | None = Field("pruning", max_length=16)
    plant_count: int | None = Field(None, gt=0, le=1_000_000)
    area_m2: float | None = Field(None, gt=0, le=1_000_000)
    variety: str | None = Field(None, max_length=80)
    setup: str | None = Field(None, max_length=24)                                 # services/setups.py
    expected_price_usd_per_kg: float | None = Field(None, ge=0, le=1_000)         # for the revenue forecast


class CyclePatch(_Camel):
    planted_on: date | None = None
    plant_count: int | None = Field(None, gt=0, le=1_000_000)
    area_m2: float | None = Field(None, gt=0, le=1_000_000)
    variety: str | None = Field(None, max_length=80)
    setup: str | None = Field(None, max_length=24)
    expected_price_usd_per_kg: float | None = Field(None, ge=0, le=1_000)


class CloseIn(_Camel):
    ended_on: date | None = None


@router.get("/cycles")
async def list_cycles(today: date | None = None, farm: Farm = Depends(farm_dep),
                      session: AsyncSession = Depends(get_db)):
    today = today or farm_today()
    rows = (await session.execute(
        select(Planting, Zone, CropProfile)
        .join(Zone, Planting.zone_id == Zone.id).join(CropProfile, Planting.crop_id == CropProfile.id)
        .where(Zone.farm_id == farm.id).order_by(Planting.planted_on.desc(), Zone.name))).all()
    return [cycle_dict(p, z, c, today) for p, z, c in rows]


@router.post("/cycles", status_code=201)
async def create_cycle(body: CycleIn, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    zone = (await session.execute(select(Zone).where(Zone.farm_id == farm.id, Zone.name == body.zone))).scalar_one_or_none()
    if zone is None:
        raise NotFound(f"unknown bed {body.zone!r}")
    crop = await crop_svc.get_crop(session, body.crop)
    _check_setup(body.setup)
    if body.regulation not in METHOD_IDS:
        raise Invalid(f"unknown way to start a cycle {body.regulation!r}")
    if (await session.execute(select(Planting).where(Planting.zone_id == zone.id, Planting.ended_on.is_(None)))).first():
        raise Conflict(f"{zone.label or zone.name} already has an open cycle; close it first")
    p = Planting(zone_id=zone.id, crop_id=crop.id, planted_on=body.planted_on, plant_count=body.plant_count,
                 area_m2=body.area_m2, variety=body.variety, setup=body.setup,
                 expected_price_usd_per_kg=body.expected_price_usd_per_kg, regulation=body.regulation,
                 trees_planted_on=body.trees_planted_on or body.planted_on)
    session.add(p)
    if zone.crop_id is None:
        zone.crop_id = crop.id
    await session.commit()
    return cycle_dict(p, zone, crop, farm_today())


@router.patch("/cycles/{cycle_id}")
async def update_cycle(cycle_id: str, body: CyclePatch, farm: Farm = Depends(farm_dep),
                       session: AsyncSession = Depends(get_db)):
    p, zone, crop = await load_cycle(session, farm, cycle_id)
    _check_setup(body.setup)
    for name in body.model_fields_set:
        value = getattr(body, name)
        if value is not None:
            setattr(p, name, value)
    await session.commit()
    return cycle_dict(p, zone, crop, farm_today())


@router.post("/cycles/{cycle_id}/close")
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


@router.get("/cycles/{cycle_id}/cop")
async def cycle_cop(cycle_id: str, today: date | None = None, farm: Farm = Depends(farm_dep),
                    session: AsyncSession = Depends(get_db)):
    """Cost of production for one cycle: lines, totals, COP per kg, margin, and what is missing."""
    report = await build_cop(session, farm, cycle_id, today or farm_today())
    await session.commit()
    return report


# ---------------------------------------------------------------- harvest

class HarvestIn(_Camel):
    harvest_date: date = Field(alias="date")
    kg_total: float = Field(ge=0)
    kg_marketable: float = Field(ge=0)
    kg_home: float = Field(0, ge=0)
    note: str | None = Field(None, max_length=160)


def _harvest_dict(h: Harvest) -> dict:
    total, mk, home = float(h.kg_total), float(h.kg_marketable), float(h.kg_home)
    return {"id": str(h.id), "date": h.harvest_date.isoformat(), "kgTotal": total, "kgMarketable": mk,
            "kgHome": home, "kgLost": round(max(0.0, total - mk - home), 2), "note": h.note}


@router.get("/cycles/{cycle_id}/harvests")
async def list_harvests(cycle_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    p = (await load_cycle(session, farm, cycle_id))[0]
    rows = (await session.execute(select(Harvest).where(Harvest.planting_id == p.id)
                                  .order_by(Harvest.harvest_date.desc()))).scalars()
    return [_harvest_dict(h) for h in rows]


@router.post("/cycles/{cycle_id}/harvests", status_code=201)
async def add_harvest(cycle_id: str, body: HarvestIn, farm: Farm = Depends(farm_dep),
                      session: AsyncSession = Depends(get_db)):
    p = (await load_cycle(session, farm, cycle_id))[0]
    if body.kg_marketable + body.kg_home > body.kg_total + 1e-9:
        raise Invalid("marketable kg plus kg kept at home cannot be more than the kg harvested")
    h = Harvest(planting_id=p.id, harvest_date=body.harvest_date, kg_total=body.kg_total,
                kg_marketable=body.kg_marketable, kg_home=body.kg_home, note=body.note)
    session.add(h)
    await session.commit()
    return _harvest_dict(h)


@router.delete("/harvests/{harvest_id}", status_code=204)
async def delete_harvest(harvest_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    h = await session.get(Harvest, as_uuid(harvest_id, "harvest"))
    if h is None:
        raise NotFound("harvest not found")
    await load_cycle(session, farm, str(h.planting_id))               # it must belong to this farm
    await session.delete(h)
    await session.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ sales

class SaleIn(_Camel):
    sale_date: date = Field(alias="date")
    kg: float = Field(gt=0)
    price_per_kg: float = Field(ge=0)
    currency: Currency = "USD"
    buyer: str | None = Field(None, max_length=120)


def _sale_dict(s: Sale) -> dict:
    return {"id": str(s.id), "date": s.sale_date.isoformat(), "kg": float(s.kg), "pricePerKg": float(s.price_per_kg),
            "currency": s.currency, "amountUsd": float(s.amount_usd), "buyer": s.buyer}


@router.get("/cycles/{cycle_id}/sales")
async def list_sales(cycle_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    p = (await load_cycle(session, farm, cycle_id))[0]
    rows = (await session.execute(select(Sale).where(Sale.planting_id == p.id).order_by(Sale.sale_date.desc()))).scalars()
    return [_sale_dict(s) for s in rows]


@router.post("/cycles/{cycle_id}/sales", status_code=201)
async def add_sale(cycle_id: str, body: SaleIn, farm: Farm = Depends(farm_dep),
                   session: AsyncSession = Depends(get_db)):
    p = (await load_cycle(session, farm, cycle_id))[0]
    st = await farm_settings(session, farm)
    amount_usd = cost.to_usd(body.kg * body.price_per_kg, body.currency,
                             None if st.khr_per_usd is None else float(st.khr_per_usd))
    s = Sale(planting_id=p.id, sale_date=body.sale_date, kg=body.kg, price_per_kg=body.price_per_kg,
             currency=body.currency, amount_usd=round(amount_usd, 2), buyer=body.buyer)
    session.add(s)
    await session.commit()
    return _sale_dict(s)


@router.delete("/sales/{sale_id}", status_code=204)
async def delete_sale(sale_id: str, farm: Farm = Depends(farm_dep), session: AsyncSession = Depends(get_db)):
    s = await session.get(Sale, as_uuid(sale_id, "sale"))
    if s is None:
        raise NotFound("sale not found")
    await load_cycle(session, farm, str(s.planting_id))
    await session.delete(s)
    await session.commit()
    return Response(status_code=204)
