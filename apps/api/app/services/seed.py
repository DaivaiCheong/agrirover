"""Idempotent seed: a guava orchard of six beds, one field node for rain, and the rover.

Run on every start (docker-compose) and safe to repeat. It only creates what is missing and only fills blanks; it
never overwrites something someone has changed.

    python -m app.services.seed

The first start also adds two weeks of simulated rover rounds (services/demo_orchard.py), marked as simulated, so
there is something to read until a real rover runs.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.entities import (CropProfile, Device, DeviceKind, Farm, FarmSetting, IrrigationRule, OrchardJobDone, Planting,
                                 Role, Sensor, TrialArm, User, Zone)
from app.services import guava
from app.services.clock import farm_today

DEFAULT_DEVICE = "ESP-FIELD-01"
PROBE_DEPTHS_CM = (10, 25)
DECIDING_DEPTH_CM = 25                 # the rover's reading of a bed is filed under this probe


@dataclass(frozen=True)
class Bed:
    name: str
    label: str
    letter: str
    area: float
    arm: TrialArm | None = None
    setup: str | None = None
    trees: int | None = None
    variety: str | None = None
    day: int = 1
    age_years: float = 3
    regulation: str = "pruning"
    price: float | None = None
    fruit_mm: float | None = None
    leave_open: tuple[str, ...] = ()


BEDS = (
    Bed("g1", "G1 Wide orchard", "A", 400, TrialArm.guided, "wide", 16, "Local Khmer", 30, 6, "withhold", 0.75),
    Bed("g2", "G2 Kimju block", "B", 105, TrialArm.usual, "commercial", 10, "Kimju", 60, 3, "pruning", 1.15),
    Bed("g3", "G3 Hedgerow", "C", 60, None, "hedgerow", 10, "Crystal Guava", 90, 2.5, "pruning", 1.15, None, ("zn_b",)),
    Bed("g4", "G4 Meadow pilot", "D", 50, None, "meadow", 25, "Dwarf Kimju", 120, 1.5, "pruning", 1.1, 34),
    Bed("g5", "G5 Pearl block", "E", 105, None, "commercial", 10, "Taiwan Pearl", 165, 4, "bending", 1.15, 42),
    Bed("g6", "G6 Free plot", "F", 50),
)


async def seed_stage1(session: AsyncSession, farm_name: str | None = None, device_code: str = DEFAULT_DEVICE,
                      planted_on: date | None = None) -> None:
    """`planted_on` makes every cycle start on that date, for tests. Otherwise each bed is on its own day."""
    farm_name = farm_name or settings.farm_name
    today = farm_today()

    owner = (await session.execute(select(User).where(User.email == settings.admin_email))).scalar_one_or_none()
    if owner is None:
        owner = User(email=settings.admin_email, password_hash=hash_password(settings.admin_password),
                     full_name="Farm admin", role=Role.admin)
        session.add(owner)
        await session.flush()

    farm = (await session.execute(select(Farm).where(Farm.name == farm_name))).scalar_one_or_none()
    if farm is None:
        farm = Farm(owner_id=owner.id, name=farm_name, timezone="Asia/Phnom_Penh")
        session.add(farm)
        await session.flush()

    crop = (await session.execute(select(CropProfile).where(CropProfile.slug == guava.SLUG))).scalar_one_or_none()
    if crop is None:
        crop = CropProfile(common_name="Guava", scientific_name="Psidium guajava", slug=guava.SLUG, opt_moisture_min_pct=55, opt_moisture_max_pct=75,
                           kc_ini=0.75, kc_mid=0.93, kc_end=1.1, stage_ini_days=45, stage_dev_days=30, stage_mid_days=70, stage_late_days=35,
                           kc_source=guava.SOURCE, growth_duration_days=guava.CYCLE_DAYS)
        session.add(crop)
        await session.flush()
    if await session.get(FarmSetting, farm.id) is None:
        session.add(FarmSetting(farm_id=farm.id))

    device = (await session.execute(select(Device).where(Device.code == device_code))).scalar_one_or_none()
    if device is None:
        device = Device(farm_id=farm.id, code=device_code, kind=DeviceKind.field_node)
        session.add(device)
        await session.flush()
    if (await session.execute(select(Device).where(Device.code == "ROVER-01"))).scalar_one_or_none() is None:
        session.add(Device(farm_id=farm.id, code="ROVER-01", kind=DeviceKind.rover, commissioned=False))

    zones = {z.name: z for z in (await session.execute(select(Zone).where(Zone.farm_id == farm.id))).scalars()}
    for bed in BEDS:
        if bed.name in zones:
            continue
        zone = Zone(farm_id=farm.id, name=bed.name, label=bed.label, area_m2=bed.area, trial_arm=bed.arm, crop_id=crop.id)
        session.add(zone)
        await session.flush()
        session.add(IrrigationRule(zone_id=zone.id))            # engine defaults
        for depth in PROBE_DEPTHS_CM:
            session.add(Sensor(device_id=device.id, zone_id=zone.id, code=f"S-{bed.letter}-{depth}", depth_cm=depth,
                               used_for_decision=(depth == DECIDING_DEPTH_CM)))
        if not bed.trees:
            continue
        started = planted_on or today - timedelta(days=bed.day - 1)
        planting = Planting(zone_id=zone.id, crop_id=crop.id, planted_on=started, plant_count=bed.trees, area_m2=bed.area,
                            variety=bed.variety, setup=bed.setup, expected_price_usd_per_kg=bed.price, regulation=bed.regulation if planted_on is None else "pruning",
                            trees_planted_on=started - timedelta(days=round(bed.age_years * 365)), fruit_mm=bed.fruit_mm)
        session.add(planting)
        await session.flush()
        if planted_on is None:                                  # what a farmer would already have done by this day
            for job in guava.JOBS:
                if job.last_day < bed.day and (not job.only or job.only == bed.regulation) and job.id not in bed.leave_open:
                    session.add(OrchardJobDone(planting_id=planting.id, job_id=job.id))
    await session.commit()


async def _main() -> None:
    from app.services.demo_orchard import backfill_rounds
    async with SessionLocal() as session:
        await seed_stage1(session)
    async with SessionLocal() as session:
        added = await backfill_rounds(session, settings.farm_name)
    print(f"seeded farm {settings.farm_name!r}; {added} simulated rover rounds added")


if __name__ == "__main__":
    asyncio.run(_main())
