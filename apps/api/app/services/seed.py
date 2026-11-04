"""Idempotent Stage 1 seed: a tomato farm with two beds, probes at two depths, one field node.

Run on every start (docker-compose) and safe to repeat. Only creates what is
missing and only fills blanks; it never overwrites something someone has changed.

    python -m app.services.seed

The numbers here are placeholders to be calibrated on site: the 30-45 % moisture
band is the rule engine's default, not agronomy advice for tomato.
"""
from __future__ import annotations

import asyncio
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.entities import (CropProfile, Device, DeviceKind, Farm, IrrigationRule, Planting, Role,
                                 Sensor, TrialArm, User, Zone)

DEFAULT_DEVICE = "ESP-FIELD-01"
# (zone id, label, trial arm, letter used in probe codes)
BEDS = (
    ("zone-a", "Tomato bed A", TrialArm.guided, "A"),    # gets the daily message
    ("zone-b", "Tomato bed B", TrialArm.usual, "B"),     # watered the usual way; we only record what we would say
)
PROBE_DEPTHS_CM = (10, 25)
DECIDING_DEPTH_CM = 25                                    # the deeper probe decides; the grower should confirm
DEFAULT_DAYS_SINCE_PLANTING = 21


async def seed_stage1(session: AsyncSession, farm_name: str | None = None,
                      device_code: str = DEFAULT_DEVICE, planted_on: date | None = None) -> None:
    farm_name = farm_name or settings.farm_name
    planted_on = planted_on or date.today() - timedelta(days=DEFAULT_DAYS_SINCE_PLANTING)

    owner = (await session.execute(
        select(User).where(User.email == settings.admin_email))).scalar_one_or_none()
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

    tomato = (await session.execute(
        select(CropProfile).where(CropProfile.common_name == "Tomato"))).scalar_one_or_none()
    if tomato is None:
        tomato = CropProfile(common_name="Tomato", scientific_name="Solanum lycopersicum",
                             opt_moisture_min_pct=30, opt_moisture_max_pct=45)
        session.add(tomato)
        await session.flush()

    device = (await session.execute(select(Device).where(Device.code == device_code))).scalar_one_or_none()
    if device is None:
        device = Device(farm_id=farm.id, code=device_code, kind=DeviceKind.field_node)
        session.add(device)
        await session.flush()
    if (await session.execute(select(Device).where(Device.code == "ROVER-01"))).scalar_one_or_none() is None:
        session.add(Device(farm_id=farm.id, code="ROVER-01", kind=DeviceKind.rover, commissioned=False))

    zones = {z.name: z for z in (await session.execute(
        select(Zone).where(Zone.farm_id == farm.id))).scalars()}
    for name, label, arm, letter in BEDS:
        zone = zones.get(name)
        if zone is None:
            zone = Zone(farm_id=farm.id, name=name)
            session.add(zone)
            await session.flush()
            session.add(IrrigationRule(zone_id=zone.id))            # engine defaults
        if zone.label is None:
            zone.label = label
        if zone.trial_arm is None:
            zone.trial_arm = arm
        if zone.crop_id is None:
            zone.crop_id = tomato.id

        if (await session.execute(select(Planting).where(
                Planting.zone_id == zone.id, Planting.ended_on.is_(None)))).first() is None:
            session.add(Planting(zone_id=zone.id, crop_id=tomato.id, planted_on=planted_on))

        for depth in PROBE_DEPTHS_CM:
            code = f"S-{letter}-{depth}"
            if (await session.execute(select(Sensor).where(Sensor.code == code))).scalar_one_or_none() is None:
                session.add(Sensor(device_id=device.id, zone_id=zone.id, code=code, depth_cm=depth,
                                   used_for_decision=(depth == DECIDING_DEPTH_CM)))

    await session.commit()


async def _main() -> None:
    async with SessionLocal() as session:
        await seed_stage1(session)
    print(f"seeded farm {settings.farm_name!r}")


if __name__ == "__main__":
    asyncio.run(_main())
