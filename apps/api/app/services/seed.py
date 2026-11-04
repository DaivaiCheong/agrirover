"""Idempotent Stage 1 seed: one farm, its zones with default rules, its field node.

Run on every start (docker-compose) and safe to repeat. Only creates what is
missing; never overwrites a rule someone has changed.

    python -m app.services.seed
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.entities import Device, DeviceKind, Farm, IrrigationRule, Role, User, Zone

DEFAULT_ZONES = ("zone-a", "zone-b", "zone-c")
DEFAULT_DEVICE = "ESP-FIELD-01"


async def seed_stage1(session: AsyncSession, farm_name: str | None = None,
                      zones: tuple[str, ...] = DEFAULT_ZONES,
                      device_code: str = DEFAULT_DEVICE) -> None:
    farm_name = farm_name or settings.farm_name

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

    existing = {z.name: z for z in (await session.execute(
        select(Zone).where(Zone.farm_id == farm.id))).scalars()}
    for name in zones:
        if name in existing:
            continue
        zone = Zone(farm_id=farm.id, name=name)
        session.add(zone)
        await session.flush()
        session.add(IrrigationRule(zone_id=zone.id))            # engine defaults

    if (await session.execute(select(Device).where(Device.code == device_code))).scalar_one_or_none() is None:
        session.add(Device(farm_id=farm.id, code=device_code, kind=DeviceKind.field_node))

    await session.commit()


async def _main() -> None:
    async with SessionLocal() as session:
        await seed_stage1(session)
    print(f"seeded farm {settings.farm_name!r}")


if __name__ == "__main__":
    asyncio.run(_main())
